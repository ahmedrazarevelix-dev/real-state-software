/**
 * Webhook Controller
 * Handles Stripe webhook events
 */

const webhookService = require('../services/webhook.service');
const stripeService = require('../services/stripe.service');

class WebhookController {
  /**
   * Handle Stripe webhook
   * POST /api/v1/webhooks/stripe
   * 
   * IMPORTANT: This endpoint must receive raw body (not JSON parsed)
   */
  async handleStripeWebhook(req, res) {
    try {
      const signature = req.headers['stripe-signature'];
      const isDevelopment = process.env.NODE_ENV !== 'production';

      let event;

      // In production, signature is REQUIRED
      if (!isDevelopment && !signature) {
        console.error('Missing stripe-signature header in production');
        return res.status(400).json({
          success: false,
          message: 'Missing signature'
        });
      }

      // Verify webhook signature if present
      if (signature) {
        try {
          event = stripeService.verifyWebhookSignature(req.body, signature);
          console.log('✅ Signature verified');
        } catch (error) {
          // In development, signature verification failure is just a warning
          if (isDevelopment) {
            console.warn('⚠️ Signature verification failed in development, accepting anyway');
            event = req.body;
          } else {
            console.error('Webhook signature verification failed:', error.message);
            return res.status(400).json({
              success: false,
              message: 'Invalid signature'
            });
          }
        }
      } else {
        // In development without signature, accept raw JSON body
        console.log('⚠️ Development mode: No signature provided, bypassing verification');
        event = req.body;
      }

      console.log(`Received Stripe webhook: ${event.type} - ${event.id}`);

      // Process webhook asynchronously (don't wait)
      webhookService.processWebhook(event)
        .then(result => {
          console.log(`Webhook ${event.id} processed:`, result.status);
        })
        .catch(error => {
          console.error(`Webhook ${event.id} processing failed:`, error);
        });

      // Immediately return 200 to Stripe
      // This prevents Stripe from retrying while we process
      res.status(200).json({ received: true });

    } catch (error) {
      console.error('Webhook handler error:', error);
      res.status(500).json({
        success: false,
        message: 'Webhook processing failed'
      });
    }
  }

  /**
   * Test webhook endpoint (development only)
   * POST /api/v1/webhooks/test
   */
  async testWebhook(req, res) {
    try {
      // Only allow in development
      if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({
          success: false,
          message: 'Test endpoint not available in production'
        });
      }

      const { eventType, paymentIntentId } = req.body;

      // Create mock event
      const mockEvent = {
        id: `evt_test_${Date.now()}`,
        type: eventType || 'payment_intent.succeeded',
        data: {
          object: {
            id: paymentIntentId || 'pi_test_123',
            amount: 30000,
            currency: 'pkr',
            status: 'succeeded',
            metadata: {}
          }
        }
      };

      const result = await webhookService.processWebhook(mockEvent);

      res.status(200).json({
        success: true,
        message: 'Test webhook processed',
        data: result
      });
    } catch (error) {
      console.error('Test webhook error:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get webhook event status
   * GET /api/v1/webhooks/events/:eventId
   */
  async getWebhookEventStatus(req, res) {
    try {
      const { eventId } = req.params;

      const prisma = require('../config/prisma.client');
      const event = await prisma.paymentWebhookEvent.findUnique({
        where: { eventId },
        include: {
          payment: {
            select: {
              id: true,
              status: true,
              amount: true
            }
          }
        }
      });

      if (!event) {
        return res.status(404).json({
          success: false,
          message: 'Event not found'
        });
      }

      res.status(200).json({
        success: true,
        data: {
          eventId: event.eventId,
          eventType: event.eventType,
          processed: event.processed,
          processedAt: event.processedAt,
          attempts: event.attempts,
          lastError: event.lastError,
          payment: event.payment
        }
      });
    } catch (error) {
      console.error('Get webhook event status error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve event status'
      });
    }
  }

  /**
   * Retry failed webhook (Admin)
   * POST /api/v1/webhooks/retry/:eventId
   */
  async retryWebhook(req, res) {
    try {
      const { eventId } = req.params;

      const prisma = require('../config/prisma.client');
      const event = await prisma.paymentWebhookEvent.findUnique({
        where: { eventId }
      });

      if (!event) {
        return res.status(404).json({
          success: false,
          message: 'Event not found'
        });
      }

      if (event.processed) {
        return res.status(400).json({
          success: false,
          message: 'Event already processed'
        });
      }

      // Retry processing
      const result = await webhookService.processWebhook(event.rawPayload);

      res.status(200).json({
        success: true,
        message: 'Webhook retry completed',
        data: result
      });
    } catch (error) {
      console.error('Retry webhook error:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * List webhook events (Admin)
   * GET /api/v1/webhooks/events
   */
  async listWebhookEvents(req, res) {
    try {
      const { processed, limit = 50, offset = 0 } = req.query;

      const prisma = require('../config/prisma.client');
      const where = {};

      if (processed !== undefined) {
        where.processed = processed === 'true';
      }

      const events = await prisma.paymentWebhookEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit),
        skip: parseInt(offset),
        select: {
          id: true,
          eventId: true,
          eventType: true,
          processed: true,
          processedAt: true,
          attempts: true,
          lastError: true,
          createdAt: true,
          payment: {
            select: {
              id: true,
              status: true,
              amount: true
            }
          }
        }
      });

      const total = await prisma.paymentWebhookEvent.count({ where });

      res.status(200).json({
        success: true,
        data: events,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: parseInt(offset) + parseInt(limit) < total
        }
      });
    } catch (error) {
      console.error('List webhook events error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve events'
      });
    }
  }
}

module.exports = new WebhookController();
