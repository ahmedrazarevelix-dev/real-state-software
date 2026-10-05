/**
 * Payment Service
 * Core payment processing logic
 */

const { v4: uuidv4 } = require('uuid');
const prisma = require('../config/prisma.client');
const stripeService = require('./stripe.service');
const commissionService = require('./commission.service');

class PaymentService {
  /**
   * Create a subscription payment (Agent or Seller)
   * @param {Object} params - Payment parameters
   * @returns {Promise<Object>} Payment details with client secret
   */
  async createSubscriptionPayment({ userId, plan, userRole }) {
    try {
      // Determine if it's agent or seller subscription
      const isAgent = userRole === 'agent';
      const isSeller = userRole === 'seller';

      if (!isAgent && !isSeller) {
        throw new Error('Only agents and sellers can subscribe to plans');
      }

      // Validate plan
      const planDetails = isAgent 
        ? commissionService.getAgentSubscriptionPricing(plan)
        : commissionService.getSellerSubscriptionPricing(plan);

      if (!planDetails) {
        throw new Error(`Invalid subscription plan: ${plan} for ${userRole}`);
      }

      // Check if user already has active subscription
      const subscriptionTable = isAgent ? 'agentSubscription' : 'sellerSubscription';
      const existingSub = await prisma[subscriptionTable].findUnique({
        where: { userId }
      });

      // Allow upgrade/downgrade if existing subscription
      const isUpgrade = existingSub && existingSub.status === 'active' && existingSub.plan !== plan;

      // Get user details
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        throw new Error('User not found');
      }

      // 🧪 TEST MODE: Auto-complete payment without Stripe
      const isTestMode = process.env.NODE_ENV !== 'production' && process.env.AUTO_COMPLETE_PAYMENTS === 'true';

      if (isTestMode) {
        console.log('🧪 TEST MODE: Auto-completing subscription payment');
        
        // Create completed payment record
        const payment = await prisma.payment.create({
          data: {
            userId,
            amount: planDetails.price,
            currency: 'PKR',
            provider: 'stripe',
            paymentType: 'subscription',
            status: 'completed',
            paidAt: new Date(),
            providerPaymentId: `test_pi_${Date.now()}`,
            providerCustomerId: `test_cus_${userId}`,
            idempotencyKey: uuidv4(),
            description: `${plan.toUpperCase()} Plan Subscription (${isAgent ? 'Agent' : 'Seller'}) - TEST MODE`,
            metadata: {
              userRole,
              subscriptionType: isAgent ? 'agent' : 'seller',
              plan,
              listingLimit: planDetails.listingLimit,
              featuredSlots: planDetails.featuredSlots,
              leadCredits: planDetails.leadCredits || 0,
              testMode: true
            }
          }
        });

        // Auto-activate subscription
        const now = new Date();
        const nextBilling = new Date(now);
        nextBilling.setMonth(nextBilling.getMonth() + 1);

        await prisma[subscriptionTable].upsert({
          where: { userId },
          create: {
            userId,
            plan,
            status: 'active',
            amount: payment.amount,
            currency: payment.currency,
            listingLimit: planDetails.listingLimit === 'unlimited' ? null : parseInt(planDetails.listingLimit),
            featuredSlots: parseInt(planDetails.featuredSlots) || 0,
            ...(isAgent && { leadCredits: parseInt(planDetails.leadCredits) || 0 }),
            startDate: now,
            nextBillingDate: nextBilling
          },
          update: {
            plan,
            status: 'active',
            amount: payment.amount,
            listingLimit: planDetails.listingLimit === 'unlimited' ? null : parseInt(planDetails.listingLimit),
            featuredSlots: parseInt(planDetails.featuredSlots) || 0,
            ...(isAgent && { leadCredits: parseInt(planDetails.leadCredits) || 0 }),
            nextBillingDate: nextBilling
          }
        });

        console.log('✅ TEST MODE: Subscription activated automatically');

        return {
          paymentId: payment.id,
          status: 'completed',
          amount: payment.amount,
          currency: payment.currency,
          plan,
          planDetails,
          subscriptionType: isAgent ? 'agent' : 'seller',
          testMode: true,
          message: '🧪 Payment auto-completed in test mode. Subscription is now active!'
        };
      }

      // 💳 PRODUCTION MODE: Use real Stripe payment
      // Create or get Stripe customer
      const customer = await stripeService.createCustomer({
        email: user.email,
        name: user.name,
        phone: user.phone,
        metadata: { userId, userRole }
      });

      // Create idempotency key
      const idempotencyKey = uuidv4();

      // Create payment intent
      const paymentIntent = await stripeService.createPaymentIntent({
        amount: planDetails.price,
        currency: 'PKR',
        customerId: customer.id,
        metadata: {
          userId,
          userRole,
          paymentType: 'subscription',
          subscriptionType: isAgent ? 'agent' : 'seller',
          plan,
          listingLimit: planDetails.listingLimit?.toString() || 'unlimited',
          featuredSlots: planDetails.featuredSlots?.toString() || '0'
        },
        description: `${plan.toUpperCase()} Plan Subscription (${isAgent ? 'Agent' : 'Seller'})`,
        idempotencyKey
      });

      // Save payment to database
      const payment = await prisma.payment.create({
        data: {
          userId,
          amount: planDetails.price,
          currency: 'PKR',
          provider: 'stripe',
          paymentType: 'subscription',
          status: 'pending',
          providerPaymentId: paymentIntent.id,
          providerCustomerId: customer.id,
          idempotencyKey,
          description: `${plan.toUpperCase()} Plan Subscription (${isAgent ? 'Agent' : 'Seller'})`,
          metadata: {
            userRole,
            subscriptionType: isAgent ? 'agent' : 'seller',
            plan,
            listingLimit: planDetails.listingLimit,
            featuredSlots: planDetails.featuredSlots,
            leadCredits: planDetails.leadCredits || 0
          }
        }
      });

      return {
        paymentId: payment.id,
        clientSecret: paymentIntent.clientSecret,
        amount: payment.amount,
        currency: payment.currency,
        plan,
        planDetails,
        subscriptionType: isAgent ? 'agent' : 'seller'
      };
    } catch (error) {
      console.error('Subscription payment creation error:', error);
      throw error;
    }
  }

  /**
   * Create listing promotion payment
   * @param {Object} params - Payment parameters
   * @returns {Promise<Object>} Payment details
   */
  async createPromotionPayment({ userId, listingId, promotionType, duration = 1 }) {
    try {
      // Calculate promotion cost
      const costBreakdown = commissionService.calculatePromotionCost(promotionType, duration);

      // Verify listing ownership or management
      const listing = await prisma.propertyListing.findFirst({
        where: {
          id: listingId,
          OR: [
            { listedById: userId },          // Own listing
            { managedByAgentId: userId }     // Agent managing seller's listing
          ]
        }
      });

      if (!listing) {
        throw new Error('Listing not found or access denied');
      }

      // Get user
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      // Create Stripe customer
      const customer = await stripeService.createCustomer({
        email: user.email,
        name: user.name,
        phone: user.phone,
        metadata: { userId }
      });

      const idempotencyKey = uuidv4();

      // Create payment intent
      const paymentIntent = await stripeService.createPaymentIntent({
        amount: costBreakdown.total,
        currency: 'PKR',
        customerId: customer.id,
        metadata: {
          userId,
          listingId,
          paymentType: 'listing_promotion',
          promotionType,
          duration
        },
        description: `${promotionType.toUpperCase()} promotion for ${listing.title}`,
        idempotencyKey
      });

      // Save payment
      const payment = await prisma.payment.create({
        data: {
          userId,
          amount: costBreakdown.total,
          currency: 'PKR',
          provider: 'stripe',
          paymentType: 'listing_promotion',
          status: 'pending',
          providerPaymentId: paymentIntent.id,
          providerCustomerId: customer.id,
          idempotencyKey,
          relatedListingId: listingId,
          description: `${promotionType.toUpperCase()} promotion`,
          metadata: {
            promotionType,
            duration,
            costBreakdown
          }
        }
      });

      return {
        paymentId: payment.id,
        clientSecret: paymentIntent.clientSecret,
        amount: payment.amount,
        currency: payment.currency,
        promotionType,
        costBreakdown
      };
    } catch (error) {
      console.error('Promotion payment creation error:', error);
      throw error;
    }
  }

  /**
   * Create lead purchase payment
   * @param {Object} params - Payment parameters
   * @returns {Promise<Object>} Payment details
   */
  async createLeadPurchasePayment({ userId, leadType, quantity = 1 }) {
    try {
      // Calculate cost
      const costBreakdown = commissionService.calculateLeadCost(leadType, quantity);

      // Get user
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      // Create customer
      const customer = await stripeService.createCustomer({
        email: user.email,
        name: user.name,
        phone: user.phone,
        metadata: { userId }
      });

      const idempotencyKey = uuidv4();

      // Create payment intent
      const paymentIntent = await stripeService.createPaymentIntent({
        amount: costBreakdown.total,
        currency: 'PKR',
        customerId: customer.id,
        metadata: {
          userId,
          paymentType: 'lead_purchase',
          leadType,
          quantity
        },
        description: `Purchase ${quantity} ${leadType} lead(s)`,
        idempotencyKey
      });

      // Save payment
      const payment = await prisma.payment.create({
        data: {
          userId,
          amount: costBreakdown.total,
          currency: 'PKR',
          provider: 'stripe',
          paymentType: 'lead_purchase',
          status: 'pending',
          providerPaymentId: paymentIntent.id,
          providerCustomerId: customer.id,
          idempotencyKey,
          description: `${quantity} ${leadType} lead(s)`,
          metadata: {
            leadType,
            quantity,
            costBreakdown
          }
        }
      });

      return {
        paymentId: payment.id,
        clientSecret: paymentIntent.clientSecret,
        amount: payment.amount,
        currency: payment.currency,
        leadType,
        quantity,
        costBreakdown
      };
    } catch (error) {
      console.error('Lead purchase payment creation error:', error);
      throw error;
    }
  }

  /**
   * Get payment by ID
   * @param {string} paymentId - Payment ID
   * @returns {Promise<Object>} Payment details
   */
  async getPayment(paymentId) {
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
          },
          invoice: true,
          relatedListing: {
            select: {
              id: true,
              title: true,
              reference: true
            }
          }
        }
      });

      return payment;
    } catch (error) {
      console.error('Get payment error:', error);
      throw error;
    }
  }

  /**
   * Get user payment history
   * @param {string} userId - User ID
   * @param {Object} filters - Filter options
   * @returns {Promise<Array>} List of payments
   */
  async getUserPayments(userId, { status, paymentType, limit = 20, offset = 0 } = {}) {
    try {
      const where = { userId };

      if (status) where.status = status;
      if (paymentType) where.paymentType = paymentType;

      const payments = await prisma.payment.findMany({
        where,
        include: {
          invoice: {
            select: {
              invoiceNumber: true,
              status: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset
      });

      const total = await prisma.payment.count({ where });

      return {
        payments,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total
        }
      };
    } catch (error) {
      console.error('Get user payments error:', error);
      throw error;
    }
  }

  /**
   * Update payment status (internal use)
   * @param {string} paymentId - Payment ID
   * @param {Object} updates - Update data
   * @returns {Promise<Object>} Updated payment
   */
  async updatePaymentStatus(paymentId, { status, paidAt = null, metadata = null }) {
    try {
      const updateData = { status };

      if (paidAt) updateData.paidAt = paidAt;
      if (metadata) updateData.metadata = metadata;

      const payment = await prisma.payment.update({
        where: { id: paymentId },
        data: updateData
      });

      return payment;
    } catch (error) {
      console.error('Update payment status error:', error);
      throw error;
    }
  }

  /**
   * Get payment statistics for admin
   * @param {Object} filters - Date range filters
   * @returns {Promise<Object>} Payment stats
   */
  async getPaymentStatistics({ startDate, endDate } = {}) {
    try {
      const where = {};

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate) where.createdAt.lte = new Date(endDate);
      }

      // Total revenue
      const totalRevenue = await prisma.payment.aggregate({
        where: { ...where, status: 'completed' },
        _sum: { amount: true }
      });

      // By payment type
      const byType = await prisma.payment.groupBy({
        by: ['paymentType'],
        where: { ...where, status: 'completed' },
        _sum: { amount: true },
        _count: true
      });

      // By status
      const byStatus = await prisma.payment.groupBy({
        by: ['status'],
        where,
        _count: true
      });

      return {
        totalRevenue: totalRevenue._sum.amount || 0,
        byType,
        byStatus,
        period: { startDate, endDate }
      };
    } catch (error) {
      console.error('Get payment statistics error:', error);
      throw error;
    }
  }
}

module.exports = new PaymentService();
