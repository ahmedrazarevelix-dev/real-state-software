/**
 * Webhook Service
 * Handles Stripe webhook events with idempotency
 */

const prisma = require('../config/prisma.client');
const stripeService = require('./stripe.service');
const invoiceService = require('./invoice.service');

class WebhookService {
  /**
   * Process incoming webhook event
   * @param {Object} event - Stripe event object
   * @returns {Promise<Object>} Processing result
   */
  async processWebhook(event) {
    try {
      console.log(`Processing webhook event: ${event.type} - ${event.id}`);

      // Step 1: Check if event already processed (idempotency)
      const existingEvent = await prisma.paymentWebhookEvent.findUnique({
        where: { eventId: event.id }
      });

      if (existingEvent) {
        if (existingEvent.processed) {
          console.log(`Event ${event.id} already processed`);
          return { status: 'already_processed', eventId: event.id };
        }
        
        // Update attempt count
        await prisma.paymentWebhookEvent.update({
          where: { id: existingEvent.id },
          data: { attempts: existingEvent.attempts + 1 }
        });
      }

      // Step 2: Process in transaction for atomicity
      const result = await prisma.$transaction(async (tx) => {
        // Create or get webhook event record
        const webhookEvent = existingEvent || await tx.paymentWebhookEvent.create({
          data: {
            eventId: event.id,
            eventType: event.type,
            provider: 'stripe',
            rawPayload: event,
            processed: false,
            attempts: 1
          }
        });

        // Step 3: Handle event based on type
        let processingResult;
        switch (event.type) {
          case 'payment_intent.succeeded':
            processingResult = await this.handlePaymentSuccess(event.data.object, tx);
            break;

          case 'payment_intent.payment_failed':
            processingResult = await this.handlePaymentFailure(event.data.object, tx);
            break;

          case 'payment_intent.canceled':
            processingResult = await this.handlePaymentCanceled(event.data.object, tx);
            break;

          case 'charge.refunded':
            processingResult = await this.handleRefund(event.data.object, tx);
            break;

          case 'customer.subscription.created':
          case 'customer.subscription.updated':
            processingResult = await this.handleSubscriptionUpdate(event.data.object, tx);
            break;

          case 'customer.subscription.deleted':
            processingResult = await this.handleSubscriptionDeleted(event.data.object, tx);
            break;

          case 'invoice.paid':
            processingResult = await this.handleInvoicePaid(event.data.object, tx);
            break;

          case 'invoice.payment_failed':
            processingResult = await this.handleInvoicePaymentFailed(event.data.object, tx);
            break;

          default:
            console.log(`Unhandled event type: ${event.type}`);
            processingResult = { handled: false };
        }

        // Step 4: Mark event as processed
        await tx.paymentWebhookEvent.update({
          where: { id: webhookEvent.id },
          data: {
            processed: true,
            processedAt: new Date(),
            paymentId: processingResult.paymentId || null
          }
        });

        return { status: 'success', eventId: event.id, ...processingResult };
      });

      console.log(`Successfully processed event ${event.id}`);
      return result;

    } catch (error) {
      console.error(`Webhook processing error for ${event.id}:`, error);

      // Log error in webhook event
      try {
        await prisma.paymentWebhookEvent.updateMany({
          where: { eventId: event.id },
          data: {
            lastError: error.message,
            attempts: { increment: 1 }
          }
        });
      } catch (logError) {
        console.error('Failed to log webhook error:', logError);
      }

      throw error;
    }
  }

  /**
   * Handle successful payment
   * @private
   */
  async handlePaymentSuccess(paymentIntent, tx) {
    const { id: providerPaymentId, metadata } = paymentIntent;

    // Find payment record
    const payment = await tx.payment.findFirst({
      where: { providerPaymentId },
      include: { user: true }
    });

    if (!payment) {
      console.warn(`Payment not found for payment_intent: ${providerPaymentId}`);
      return { handled: false };
    }

    // Update payment status
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'completed',
        paidAt: new Date()
      }
    });

    // Handle based on payment type
    switch (payment.paymentType) {
      case 'subscription':
        await this.activateSubscription(payment, tx);
        break;

      case 'listing_promotion':
        await this.activatePromotion(payment, tx);
        break;

      case 'lead_purchase':
        await this.addLeadCredits(payment, tx);
        break;

      case 'success_fee':
        // Just record the payment
        break;
    }

    // Generate invoice (async, don't wait)
    invoiceService.generateInvoice(payment.id).catch(err => {
      console.error('Invoice generation failed:', err);
    });

    // Send notification
    await this.sendPaymentSuccessNotification(payment, tx);

    return { handled: true, paymentId: payment.id };
  }

  /**
   * Handle failed payment
   * @private
   */
  async handlePaymentFailure(paymentIntent, tx) {
    const { id: providerPaymentId } = paymentIntent;

    const payment = await tx.payment.findFirst({
      where: { providerPaymentId }
    });

    if (!payment) return { handled: false };

    await tx.payment.update({
      where: { id: payment.id },
      data: { status: 'failed' }
    });

    // Send notification
    await this.sendPaymentFailureNotification(payment, tx);

    return { handled: true, paymentId: payment.id };
  }

  /**
   * Handle canceled payment
   * @private
   */
  async handlePaymentCanceled(paymentIntent, tx) {
    const { id: providerPaymentId } = paymentIntent;

    const payment = await tx.payment.findFirst({
      where: { providerPaymentId }
    });

    if (!payment) return { handled: false };

    await tx.payment.update({
      where: { id: payment.id },
      data: { status: 'failed' }
    });

    return { handled: true, paymentId: payment.id };
  }

  /**
   * Handle refund
   * @private
   */
  async handleRefund(charge, tx) {
    const paymentIntentId = charge.payment_intent;

    const payment = await tx.payment.findFirst({
      where: { providerPaymentId: paymentIntentId }
    });

    if (!payment) return { handled: false };

    const refundAmount = charge.amount_refunded / 100; // Convert from cents

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: refundAmount >= payment.amount ? 'refunded' : 'partially_refunded',
        refundedAmount: refundAmount,
        refundedAt: new Date()
      }
    });

    // If subscription payment, cancel subscription
    if (payment.paymentType === 'subscription') {
      await tx.agentSubscription.updateMany({
        where: { userId: payment.userId },
        data: { status: 'cancelled', cancelledAt: new Date() }
      });
    }

    return { handled: true, paymentId: payment.id };
  }

  /**
   * Handle subscription update
   * @private
   */
  async handleSubscriptionUpdate(subscription, tx) {
    // Implementation depends on how you structure subscriptions
    return { handled: true };
  }

  /**
   * Handle subscription deletion
   * @private
   */
  async handleSubscriptionDeleted(subscription, tx) {
    // Implementation depends on how you structure subscriptions
    return { handled: true };
  }

  /**
   * Handle invoice paid
   * @private
   */
  async handleInvoicePaid(invoice, tx) {
    // Update invoice status if tracked separately
    return { handled: true };
  }

  /**
   * Handle invoice payment failed
   * @private
   */
  async handleInvoicePaymentFailed(invoice, tx) {
    // Handle failed invoice payment
    return { handled: true };
  }

  /**
   * Activate subscription after successful payment
   * @private
   */
  async activateSubscription(payment, tx) {
    const { userId, metadata } = payment;
    const { plan, listingLimit, featuredSlots, leadCredits, subscriptionType } = metadata;

    const now = new Date();
    const nextBilling = new Date(now);
    nextBilling.setMonth(nextBilling.getMonth() + 1);

    // Determine subscription table based on type
    const isAgentSubscription = subscriptionType === 'agent';
    const subscriptionTable = isAgentSubscription ? 'agentSubscription' : 'sellerSubscription';

    // Create or update subscription
    await tx[subscriptionTable].upsert({
      where: { userId },
      create: {
        userId,
        plan,
        status: 'active',
        amount: payment.amount,
        currency: payment.currency,
        listingLimit: listingLimit === 'unlimited' ? null : parseInt(listingLimit),
        featuredSlots: parseInt(featuredSlots) || 0,
        ...(isAgentSubscription && { leadCredits: parseInt(leadCredits) || 0 }),
        startDate: now,
        nextBillingDate: nextBilling
      },
      update: {
        plan,
        status: 'active',
        amount: payment.amount,
        listingLimit: listingLimit === 'unlimited' ? null : parseInt(listingLimit),
        featuredSlots: parseInt(featuredSlots) || 0,
        ...(isAgentSubscription && { leadCredits: parseInt(leadCredits) || 0 }),
        nextBillingDate: nextBilling
      }
    });
  }

  /**
   * Activate listing promotion
   * @private
   */
  async activatePromotion(payment, tx) {
    // Update listing with promotion details
    // This is a placeholder - implement based on your promotion system
    const { relatedListingId, metadata } = payment;
    
    if (relatedListingId) {
      // You might add a promotions table or update listing metadata
      console.log(`Activated ${metadata.promotionType} for listing ${relatedListingId}`);
    }
  }

  /**
   * Add lead credits to subscription
   * @private
   */
  async addLeadCredits(payment, tx) {
    const { userId, metadata } = payment;
    const { quantity } = metadata;

    // Add credits to subscription if exists
    const subscription = await tx.agentSubscription.findUnique({
      where: { userId }
    });

    if (subscription) {
      await tx.agentSubscription.update({
        where: { userId },
        data: {
          leadCredits: { increment: quantity }
        }
      });
    }
  }

  /**
   * Send payment success notification
   * @private
   */
  async sendPaymentSuccessNotification(payment, tx) {
    await tx.notification.create({
      data: {
        userId: payment.userId,
        type: 'EMAIL',
        priority: 'HIGH',
        status: 'PENDING',
        title: 'Payment Successful',
        message: `Your payment of ${payment.currency} ${payment.amount} was successful.`,
        category: 'payment',
        entityType: 'payment',
        entityId: payment.id
      }
    });
  }

  /**
   * Send payment failure notification
   * @private
   */
  async sendPaymentFailureNotification(payment, tx) {
    await tx.notification.create({
      data: {
        userId: payment.userId,
        type: 'EMAIL',
        priority: 'HIGH',
        status: 'PENDING',
        title: 'Payment Failed',
        message: `Your payment of ${payment.currency} ${payment.amount} failed. Please try again.`,
        category: 'payment',
        entityType: 'payment',
        entityId: payment.id
      }
    });
  }
}

module.exports = new WebhookService();
