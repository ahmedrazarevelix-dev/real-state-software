/**
 * Payment Reconciliation Job
 * Runs daily to reconcile payments with Stripe
 */

const prisma = require('../config/prisma.client');
const stripeService = require('../services/stripe.service');

class PaymentReconciliationJob {
  constructor() {
    this.name = 'PaymentReconciliation';
    this.schedule = '0 2 * * *'; // Run at 2 AM daily
  }

  /**
   * Execute reconciliation job
   */
  async execute() {
    try {
      console.log(`[${this.name}] Starting payment reconciliation...`);

      const startTime = Date.now();
      const results = {
        checked: 0,
        fixed: 0,
        errors: 0
      };

      // Get all pending/processing payments older than 24 hours
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const pendingPayments = await prisma.payment.findMany({
        where: {
          status: {
            in: ['pending', 'processing']
          },
          createdAt: {
            lt: oneDayAgo
          },
          provider: 'stripe',
          providerPaymentId: {
            not: null
          }
        },
        take: 100 // Process in batches
      });

      console.log(`[${this.name}] Found ${pendingPayments.length} payments to reconcile`);

      for (const payment of pendingPayments) {
        try {
          results.checked++;

          // Fetch latest status from Stripe
          const stripePayment = await stripeService.retrievePaymentIntent(
            payment.providerPaymentId
          );

          // Check if status mismatch
          if (this._shouldUpdateStatus(payment.status, stripePayment.status)) {
            const newStatus = this._mapStripeStatus(stripePayment.status);

            await prisma.payment.update({
              where: { id: payment.id },
              data: {
                status: newStatus,
                paidAt: stripePayment.status === 'succeeded' ? new Date() : null
              }
            });

            console.log(`[${this.name}] Fixed payment ${payment.id}: ${payment.status} -> ${newStatus}`);
            results.fixed++;

            // If payment succeeded, trigger webhook processing
            if (newStatus === 'completed') {
              await this._triggerSuccessProcessing(payment);
            }
          }
        } catch (error) {
          console.error(`[${this.name}] Error reconciling payment ${payment.id}:`, error.message);
          results.errors++;
        }
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`[${this.name}] Completed in ${duration}s:`, results);

      // Log to audit
      await prisma.auditLog.create({
        data: {
          action: 'PAYMENT_RECONCILIATION',
          entity: 'payment',
          metadata: {
            ...results,
            duration: `${duration}s`
          },
          success: true
        }
      });

      return results;
    } catch (error) {
      console.error(`[${this.name}] Job failed:`, error);
      
      // Log error
      await prisma.auditLog.create({
        data: {
          action: 'PAYMENT_RECONCILIATION',
          entity: 'payment',
          success: false,
          errorMessage: error.message
        }
      });

      throw error;
    }
  }

  /**
   * Check if status should be updated
   * @private
   */
  _shouldUpdateStatus(currentStatus, stripeStatus) {
    const statusMap = {
      'succeeded': 'completed',
      'processing': 'processing',
      'canceled': 'failed',
      'requires_payment_method': 'failed',
      'requires_confirmation': 'pending',
      'requires_action': 'pending'
    };

    const mappedStatus = statusMap[stripeStatus];
    return mappedStatus && mappedStatus !== currentStatus;
  }

  /**
   * Map Stripe status to our payment status
   * @private
   */
  _mapStripeStatus(stripeStatus) {
    const statusMap = {
      'succeeded': 'completed',
      'processing': 'processing',
      'canceled': 'failed',
      'requires_payment_method': 'failed',
      'requires_confirmation': 'pending',
      'requires_action': 'pending'
    };

    return statusMap[stripeStatus] || 'pending';
  }

  /**
   * Trigger success processing for missed webhooks
   * @private
   */
  async _triggerSuccessProcessing(payment) {
    try {
      const webhookService = require('../services/webhook.service');
      
      // Create mock event
      const mockEvent = {
        id: `evt_reconciliation_${Date.now()}`,
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: payment.providerPaymentId,
            amount: payment.amount * 100,
            currency: payment.currency.toLowerCase(),
            status: 'succeeded',
            metadata: payment.metadata
          }
        }
      };

      await webhookService.processWebhook(mockEvent);
      console.log(`[${this.name}] Triggered success processing for payment ${payment.id}`);
    } catch (error) {
      console.error(`[${this.name}] Failed to trigger success processing:`, error);
    }
  }

  /**
   * Manual execution (for testing)
   */
  async run() {
    return await this.execute();
  }
}

module.exports = new PaymentReconciliationJob();
