/**
 * Refund Service
 * Handles payment refunds
 */

const prisma = require('../config/prisma.client');
const stripeService = require('./stripe.service');

class RefundService {
  /**
   * Process a refund
   * @param {Object} params - Refund parameters
   * @returns {Promise<Object>} Refund result
   */
  async processRefund({
    paymentId,
    amount = null,
    reason = 'requested_by_customer',
    adminId = null
  }) {
    try {
      // Get payment
      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        include: { user: true }
      });

      if (!payment) {
        throw new Error('Payment not found');
      }

      // Validate payment status
      if (payment.status !== 'completed') {
        throw new Error('Can only refund completed payments');
      }

      if (payment.refundedAmount && payment.refundedAmount > 0) {
        throw new Error('Payment has already been refunded');
      }

      // Default to full refund if amount not specified
      const refundAmount = amount || payment.amount;

      // Validate refund amount
      if (refundAmount > payment.amount) {
        throw new Error('Refund amount cannot exceed payment amount');
      }

      // Process refund with Stripe
      const stripeRefund = await stripeService.createRefund({
        paymentIntentId: payment.providerPaymentId,
        amount: refundAmount,
        reason,
        metadata: {
          paymentId: payment.id,
          userId: payment.userId,
          adminId: adminId || 'system'
        }
      });

      // Update payment status
      const newStatus = refundAmount >= payment.amount ? 'refunded' : 'partially_refunded';

      await prisma.payment.update({
        where: { id: paymentId },
        data: {
          status: newStatus,
          refundedAmount: refundAmount,
          refundReason: reason,
          refundedAt: new Date()
        }
      });

      // Handle refund side effects based on payment type
      await this._handleRefundSideEffects(payment, refundAmount);

      // Create notification
      await prisma.notification.create({
        data: {
          userId: payment.userId,
          type: 'EMAIL',
          priority: 'HIGH',
          status: 'PENDING',
          title: 'Refund Processed',
          message: `A refund of ${payment.currency} ${refundAmount} has been processed for your payment.`,
          category: 'payment',
          entityType: 'payment',
          entityId: payment.id
        }
      });

      // Log audit
      await prisma.auditLog.create({
        data: {
          userId: adminId,
          action: 'REFUND_PROCESSED',
          entity: 'payment',
          entityId: payment.id,
          metadata: {
            refundAmount,
            reason,
            stripeRefundId: stripeRefund.id
          }
        }
      });

      return {
        success: true,
        refund: {
          id: stripeRefund.id,
          amount: refundAmount,
          currency: payment.currency,
          status: stripeRefund.status,
          paymentId: payment.id
        }
      };
    } catch (error) {
      console.error('Refund processing error:', error);
      throw error;
    }
  }

  /**
   * Handle side effects of refund based on payment type
   * @private
   */
  async _handleRefundSideEffects(payment, refundAmount) {
    try {
      switch (payment.paymentType) {
        case 'subscription':
          await this._handleSubscriptionRefund(payment);
          break;

        case 'listing_promotion':
          await this._handlePromotionRefund(payment);
          break;

        case 'lead_purchase':
          await this._handleLeadCreditRefund(payment);
          break;

        default:
          break;
      }
    } catch (error) {
      console.error('Refund side effects error:', error);
      // Don't throw - refund already processed
    }
  }

  /**
   * Handle subscription refund
   * @private
   */
  async _handleSubscriptionRefund(payment) {
    // Cancel active subscription
    const subscription = await prisma.agentSubscription.findUnique({
      where: { userId: payment.userId }
    });

    if (subscription && subscription.status === 'active') {
      await prisma.agentSubscription.update({
        where: { userId: payment.userId },
        data: {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancellationReason: 'Payment refunded'
        }
      });

      // If has Stripe subscription, cancel it too
      if (subscription.stripeSubscriptionId) {
        try {
          await stripeService.cancelSubscription(subscription.stripeSubscriptionId, true);
        } catch (error) {
          console.error('Failed to cancel Stripe subscription:', error);
        }
      }
    }
  }

  /**
   * Handle promotion refund
   * @private
   */
  async _handlePromotionRefund(payment) {
    // Remove promotion from listing
    if (payment.relatedListingId) {
      // This depends on how you track promotions
      // You might need to update listing metadata or a promotions table
      console.log(`Promotion refunded for listing ${payment.relatedListingId}`);
    }
  }

  /**
   * Handle lead credit refund
   * @private
   */
  async _handleLeadCreditRefund(payment) {
    const { quantity } = payment.metadata;

    // Deduct lead credits if subscription exists
    const subscription = await prisma.agentSubscription.findUnique({
      where: { userId: payment.userId }
    });

    if (subscription && subscription.leadCredits >= quantity) {
      await prisma.agentSubscription.update({
        where: { userId: payment.userId },
        data: {
          leadCredits: { decrement: quantity }
        }
      });
    }
  }

  /**
   * Get refund details
   * @param {string} paymentId - Payment ID
   * @returns {Promise<Object>} Refund information
   */
  async getRefundDetails(paymentId) {
    try {
      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });

      if (!payment) {
        throw new Error('Payment not found');
      }

      return {
        paymentId: payment.id,
        originalAmount: payment.amount,
        refundedAmount: payment.refundedAmount || 0,
        refundReason: payment.refundReason,
        refundedAt: payment.refundedAt,
        status: payment.status,
        canRefund: payment.status === 'completed' && !payment.refundedAmount,
        user: payment.user
      };
    } catch (error) {
      console.error('Get refund details error:', error);
      throw error;
    }
  }

  /**
   * List all refunds (admin)
   * @param {Object} filters - Filter options
   * @returns {Promise<Array>} List of refunds
   */
  async listRefunds({ startDate, endDate, limit = 50, offset = 0 } = {}) {
    try {
      const where = {
        status: {
          in: ['refunded', 'partially_refunded']
        }
      };

      if (startDate || endDate) {
        where.refundedAt = {};
        if (startDate) where.refundedAt.gte = new Date(startDate);
        if (endDate) where.refundedAt.lte = new Date(endDate);
      }

      const refunds = await prisma.payment.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        },
        orderBy: { refundedAt: 'desc' },
        take: limit,
        skip: offset
      });

      const total = await prisma.payment.count({ where });

      return {
        refunds,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total
        }
      };
    } catch (error) {
      console.error('List refunds error:', error);
      throw error;
    }
  }

  /**
   * Get refund statistics
   * @param {Object} filters - Date range filters
   * @returns {Promise<Object>} Refund stats
   */
  async getRefundStatistics({ startDate, endDate } = {}) {
    try {
      const where = {
        status: {
          in: ['refunded', 'partially_refunded']
        }
      };

      if (startDate || endDate) {
        where.refundedAt = {};
        if (startDate) where.refundedAt.gte = new Date(startDate);
        if (endDate) where.refundedAt.lte = new Date(endDate);
      }

      const stats = await prisma.payment.aggregate({
        where,
        _sum: { refundedAmount: true },
        _count: true
      });

      // By payment type
      const byType = await prisma.payment.groupBy({
        by: ['paymentType'],
        where,
        _sum: { refundedAmount: true },
        _count: true
      });

      return {
        totalRefunded: stats._sum.refundedAmount || 0,
        totalCount: stats._count,
        byType,
        period: { startDate, endDate }
      };
    } catch (error) {
      console.error('Get refund statistics error:', error);
      throw error;
    }
  }
}

module.exports = new RefundService();
