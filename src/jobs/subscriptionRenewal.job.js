/**
 * Subscription Renewal Job
 * Handles subscription renewals and expiry
 */

const prisma = require('../config/prisma.client');
const stripeService = require('../services/stripe.service');
const paymentService = require('../services/payment.service');

class SubscriptionRenewalJob {
  constructor() {
    this.name = 'SubscriptionRenewal';
    this.schedule = '0 0 * * *'; // Run at midnight daily
  }

  /**
   * Execute subscription renewal job
   */
  async execute() {
    try {
      console.log(`[${this.name}] Starting subscription renewal check...`);

      const startTime = Date.now();
      const results = {
        checked: 0,
        renewed: 0,
        expired: 0,
        reminders: 0,
        errors: 0
      };

      // Process subscriptions expiring today
      await this._processExpiringSubscriptions(results);

      // Send renewal reminders (7 days before expiry)
      await this._sendRenewalReminders(results);

      // Clean up expired subscriptions
      await this._cleanupExpiredSubscriptions(results);

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`[${this.name}] Completed in ${duration}s:`, results);

      // Log to audit
      await prisma.auditLog.create({
        data: {
          action: 'SUBSCRIPTION_RENEWAL',
          entity: 'subscription',
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
      
      await prisma.auditLog.create({
        data: {
          action: 'SUBSCRIPTION_RENEWAL',
          entity: 'subscription',
          success: false,
          errorMessage: error.message
        }
      });

      throw error;
    }
  }

  /**
   * Process subscriptions expiring today
   * @private
   */
  async _processExpiringSubscriptions(results) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const expiringSubscriptions = await prisma.agentSubscription.findMany({
        where: {
          status: 'active',
          nextBillingDate: {
            gte: today,
            lt: tomorrow
          }
        },
        include: {
          user: true
        }
      });

      console.log(`[${this.name}] Found ${expiringSubscriptions.length} subscriptions expiring today`);

      for (const subscription of expiringSubscriptions) {
        try {
          results.checked++;

          // If has Stripe subscription ID, let Stripe handle auto-renewal
          if (subscription.stripeSubscriptionId) {
            const stripeSubscriptions = await stripeService.listCustomerSubscriptions(
              subscription.stripeCustomerId
            );

            const activeSub = stripeSubscriptions.find(
              sub => sub.id === subscription.stripeSubscriptionId && sub.status === 'active'
            );

            if (activeSub) {
              // Update next billing date
              await prisma.agentSubscription.update({
                where: { id: subscription.id },
                data: {
                  nextBillingDate: new Date(activeSub.current_period_end * 1000)
                }
              });

              results.renewed++;
              console.log(`[${this.name}] Auto-renewed subscription ${subscription.id}`);
              continue;
            }
          }

          // No Stripe subscription or inactive - expire it
          await prisma.agentSubscription.update({
            where: { id: subscription.id },
            data: {
              status: 'expired',
              endDate: new Date()
            }
          });

          // Notify user
          await prisma.notification.create({
            data: {
              userId: subscription.userId,
              type: 'EMAIL',
              priority: 'HIGH',
              status: 'PENDING',
              title: 'Subscription Expired',
              message: `Your ${subscription.plan.toUpperCase()} plan has expired. Renew now to continue enjoying premium features.`,
              category: 'subscription',
              entityType: 'subscription',
              entityId: subscription.id,
              actionUrl: '/subscription/renew',
              actionLabel: 'Renew Now'
            }
          });

          results.expired++;
          console.log(`[${this.name}] Expired subscription ${subscription.id}`);

        } catch (error) {
          console.error(`[${this.name}] Error processing subscription ${subscription.id}:`, error.message);
          results.errors++;
        }
      }
    } catch (error) {
      console.error(`[${this.name}] Error processing expiring subscriptions:`, error);
      throw error;
    }
  }

  /**
   * Send renewal reminders
   * @private
   */
  async _sendRenewalReminders(results) {
    try {
      const sevenDaysFromNow = new Date();
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
      sevenDaysFromNow.setHours(0, 0, 0, 0);

      const eightDaysFromNow = new Date(sevenDaysFromNow);
      eightDaysFromNow.setDate(eightDaysFromNow.getDate() + 1);

      const subscriptionsNearExpiry = await prisma.agentSubscription.findMany({
        where: {
          status: 'active',
          nextBillingDate: {
            gte: sevenDaysFromNow,
            lt: eightDaysFromNow
          }
        },
        include: {
          user: true
        }
      });

      console.log(`[${this.name}] Found ${subscriptionsNearExpiry.length} subscriptions expiring in 7 days`);

      for (const subscription of subscriptionsNearExpiry) {
        try {
          // Check if reminder already sent today
          const existingReminder = await prisma.notification.findFirst({
            where: {
              userId: subscription.userId,
              category: 'subscription',
              entityId: subscription.id,
              title: 'Subscription Expiring Soon',
              createdAt: {
                gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
              }
            }
          });

          if (existingReminder) {
            continue; // Already sent
          }

          // Send reminder
          await prisma.notification.create({
            data: {
              userId: subscription.userId,
              type: 'EMAIL',
              priority: 'MEDIUM',
              status: 'PENDING',
              title: 'Subscription Expiring Soon',
              message: `Your ${subscription.plan.toUpperCase()} plan will expire in 7 days. Renew now to avoid service interruption.`,
              category: 'subscription',
              entityType: 'subscription',
              entityId: subscription.id,
              actionUrl: '/subscription/renew',
              actionLabel: 'Renew Now'
            }
          });

          results.reminders++;
          console.log(`[${this.name}] Sent reminder for subscription ${subscription.id}`);

        } catch (error) {
          console.error(`[${this.name}] Error sending reminder for ${subscription.id}:`, error.message);
        }
      }
    } catch (error) {
      console.error(`[${this.name}] Error sending renewal reminders:`, error);
      throw error;
    }
  }

  /**
   * Clean up expired subscriptions
   * @private
   */
  async _cleanupExpiredSubscriptions(results) {
    try {
      // Find subscriptions that expired more than 30 days ago
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const oldExpiredSubs = await prisma.agentSubscription.findMany({
        where: {
          status: 'expired',
          endDate: {
            lt: thirtyDaysAgo
          }
        }
      });

      // Optionally: Archive or delete these
      // For now, just log them
      if (oldExpiredSubs.length > 0) {
        console.log(`[${this.name}] Found ${oldExpiredSubs.length} old expired subscriptions (30+ days)`);
      }
    } catch (error) {
      console.error(`[${this.name}] Error cleaning up expired subscriptions:`, error);
    }
  }

  /**
   * Check subscription status with Stripe (manual sync)
   */
  async syncWithStripe(subscriptionId) {
    try {
      const subscription = await prisma.agentSubscription.findUnique({
        where: { id: subscriptionId }
      });

      if (!subscription || !subscription.stripeSubscriptionId) {
        throw new Error('Subscription not found or not linked to Stripe');
      }

      const stripeSubscriptions = await stripeService.listCustomerSubscriptions(
        subscription.stripeCustomerId
      );

      const stripeSub = stripeSubscriptions.find(
        sub => sub.id === subscription.stripeSubscriptionId
      );

      if (!stripeSub) {
        throw new Error('Subscription not found in Stripe');
      }

      // Update local subscription
      const updates = {
        status: this._mapStripeSubscriptionStatus(stripeSub.status),
        nextBillingDate: new Date(stripeSub.current_period_end * 1000)
      };

      if (stripeSub.canceled_at) {
        updates.cancelledAt = new Date(stripeSub.canceled_at * 1000);
      }

      await prisma.agentSubscription.update({
        where: { id: subscriptionId },
        data: updates
      });

      return updates;
    } catch (error) {
      console.error(`[${this.name}] Stripe sync error:`, error);
      throw error;
    }
  }

  /**
   * Map Stripe subscription status to our status
   * @private
   */
  _mapStripeSubscriptionStatus(stripeStatus) {
    const statusMap = {
      'active': 'active',
      'canceled': 'cancelled',
      'past_due': 'past_due',
      'unpaid': 'expired',
      'incomplete': 'expired',
      'incomplete_expired': 'expired',
      'trialing': 'active'
    };

    return statusMap[stripeStatus] || 'expired';
  }

  /**
   * Manual execution (for testing)
   */
  async run() {
    return await this.execute();
  }
}

module.exports = new SubscriptionRenewalJob();
