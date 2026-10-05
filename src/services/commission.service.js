/**
 * Commission Service
 * Calculates platform fees and commissions
 */

const prisma = require('../config/prisma.client');

// Commission rates and pricing (PKR)
const PRICING = {
  // Lead generation fees
  leadPurchase: {
    verifiedBuyer: 500,
    tourRequest: 300,
    inquiry: 200
  },

  // Listing promotion fees
  listingPromotion: {
    featured: 5000,      // Per month
    hot: 3000,          // Per listing
    premium: 10000      // Per month
  },

  // Agent subscription plans (monthly)
  agentSubscription: {
    basic: 0,           // Free (5 listings limit)
    silver: 15000,      // 25 listings
    gold: 30000,        // Unlimited listings
    platinum: 50000     // Unlimited + priority support + featured
  },

  // Seller subscription plans (monthly)
  sellerSubscription: {
    basic: 0,           // Free (3 listings limit)
    premium: 5000,      // 10 listings + 1 featured
    pro: 10000          // 20 listings + 3 featured
  },

  // Transaction success fee
  successFee: {
    percentage: 3,      // 3% of agent's commission
    minimum: 10000,     // PKR minimum fee
    maximum: 50000      // PKR maximum fee
  }
};

class CommissionService {
  /**
   * Calculate success fee when property is sold/rented
   * @param {Object} params - Calculation parameters
   * @returns {Promise<Object>} Commission breakdown
   */
  async calculateSuccessFee({
    listingId,
    salePrice,
    agentCommissionRate = 2 // Default 2% in Pakistan
  }) {
    try {
      // Get listing details
      const listing = await prisma.propertyListing.findUnique({
        where: { id: listingId },
        include: {
          listedBy: {
            include: {
              subscription: true
            }
          }
        }
      });

      if (!listing) {
        throw new Error('Listing not found');
      }

      // Calculate agent's commission
      const agentCommission = salePrice * (agentCommissionRate / 100);

      // Calculate platform fee (3% of agent commission)
      let platformFee = agentCommission * (PRICING.successFee.percentage / 100);

      // Apply min/max caps
      if (platformFee < PRICING.successFee.minimum) {
        platformFee = PRICING.successFee.minimum;
      }
      if (platformFee > PRICING.successFee.maximum) {
        platformFee = PRICING.successFee.maximum;
      }

      // Check if agent has platinum subscription (reduced fee)
      const hasPlatinumPlan = listing.listedBy.subscription?.plan === 'platinum';
      if (hasPlatinumPlan) {
        platformFee = platformFee * 0.8; // 20% discount for platinum
      }

      return {
        listingId,
        salePrice,
        agentCommissionRate,
        agentCommission,
        platformFee,
        platformRate: PRICING.successFee.percentage,
        breakdown: {
          toAgent: agentCommission - platformFee,
          toPlatform: platformFee
        },
        discount: hasPlatinumPlan ? 20 : 0,
        appliedCaps: {
          minimum: platformFee === PRICING.successFee.minimum,
          maximum: platformFee === PRICING.successFee.maximum
        }
      };
    } catch (error) {
      console.error('Commission calculation error:', error);
      throw error;
    }
  }

  /**
   * Get agent subscription plan pricing
   * @param {string} plan - Plan name (basic, silver, gold, platinum)
   * @returns {Object} Plan details
   */
  getAgentSubscriptionPricing(plan) {
    const planDetails = {
      basic: {
        price: PRICING.agentSubscription.basic,
        listingLimit: 5,
        featuredSlots: 0,
        leadCredits: 0,
        features: ['5 active listings', 'Basic support']
      },
      silver: {
        price: PRICING.agentSubscription.silver,
        listingLimit: 25,
        featuredSlots: 1,
        leadCredits: 10,
        features: ['25 active listings', '1 featured slot', '10 lead credits/month', 'Email support']
      },
      gold: {
        price: PRICING.agentSubscription.gold,
        listingLimit: null, // Unlimited
        featuredSlots: 3,
        leadCredits: 50,
        features: ['Unlimited listings', '3 featured slots', '50 lead credits/month', 'Priority support']
      },
      platinum: {
        price: PRICING.agentSubscription.platinum,
        listingLimit: null, // Unlimited
        featuredSlots: 10,
        leadCredits: 200,
        features: [
          'Unlimited listings',
          '10 featured slots',
          '200 lead credits/month',
          '24/7 priority support',
          '20% discount on success fees',
          'Featured agency profile',
          'Advanced analytics'
        ]
      }
    };

    return planDetails[plan] || null;
  }

  /**
   * Get seller subscription plan pricing
   * @param {string} plan - Plan name (basic, premium, pro)
   * @returns {Object} Plan details
   */
  getSellerSubscriptionPricing(plan) {
    const planDetails = {
      basic: {
        price: PRICING.sellerSubscription.basic,
        listingLimit: 3,
        featuredSlots: 0,
        features: ['3 active listings', 'Basic support']
      },
      premium: {
        price: PRICING.sellerSubscription.premium,
        listingLimit: 10,
        featuredSlots: 1,
        features: ['10 active listings', '1 featured slot', 'Email support', 'Agent assignment']
      },
      pro: {
        price: PRICING.sellerSubscription.pro,
        listingLimit: 20,
        featuredSlots: 3,
        features: ['20 active listings', '3 featured slots', 'Priority support', 'Agent assignment', 'Advanced analytics']
      }
    };

    return planDetails[plan] || null;
  }

  /**
   * Get subscription pricing (backwards compatible)
   */
  getSubscriptionPricing(plan) {
    // Try agent plans first, then seller plans
    return this.getAgentSubscriptionPricing(plan) || this.getSellerSubscriptionPricing(plan);
  }

  /**
   * Calculate lead purchase cost
   * @param {string} leadType - Type of lead (inquiry, tour, verifiedBuyer)
   * @param {number} quantity - Number of leads
   * @returns {Object} Cost breakdown
   */
  calculateLeadCost(leadType, quantity = 1) {
    const prices = PRICING.leadPurchase;
    
    if (!prices[leadType]) {
      throw new Error(`Invalid lead type: ${leadType}`);
    }

    const unitPrice = prices[leadType];
    const total = unitPrice * quantity;

    // Bulk discount (10% for 10+ leads)
    let discount = 0;
    if (quantity >= 10) {
      discount = total * 0.1;
    }

    return {
      leadType,
      quantity,
      unitPrice,
      subtotal: total,
      discount,
      total: total - discount
    };
  }

  /**
   * Calculate listing promotion cost
   * @param {string} promotionType - Type of promotion (featured, hot, premium)
   * @param {number} duration - Duration in months (for featured/premium)
   * @returns {Object} Cost breakdown
   */
  calculatePromotionCost(promotionType, duration = 1) {
    const prices = PRICING.listingPromotion;
    
    if (!prices[promotionType]) {
      throw new Error(`Invalid promotion type: ${promotionType}`);
    }

    const unitPrice = prices[promotionType];
    let total = unitPrice;

    // For featured/premium, multiply by duration
    if (['featured', 'premium'].includes(promotionType)) {
      total = unitPrice * duration;

      // Long-term discount (15% for 6+ months, 25% for 12+ months)
      if (duration >= 12) {
        total = total * 0.75; // 25% discount
      } else if (duration >= 6) {
        total = total * 0.85; // 15% discount
      }
    }

    return {
      promotionType,
      duration: ['featured', 'premium'].includes(promotionType) ? duration : 1,
      unitPrice,
      total,
      perMonth: total / (duration || 1)
    };
  }

  /**
   * Check if agent can list more properties
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Listing availability
   */
  async checkListingAvailability(userId) {
    try {
      // Get agent's subscription
      const subscription = await prisma.agentSubscription.findUnique({
        where: { userId }
      });

      // Get active listings count
      const activeListingsCount = await prisma.propertyListing.count({
        where: {
          listedById: userId,
          status: {
            in: ['active', 'pending_review', 'approved']
          }
        }
      });

      // No subscription = basic plan
      const plan = subscription?.plan || 'basic';
      const planDetails = this.getSubscriptionPricing(plan);
      const limit = planDetails.listingLimit;

      return {
        currentListings: activeListingsCount,
        limit: limit || 'unlimited',
        available: limit ? (limit - activeListingsCount) : 'unlimited',
        canAddMore: limit ? (activeListingsCount < limit) : true,
        plan
      };
    } catch (error) {
      console.error('Listing availability check error:', error);
      throw error;
    }
  }

  /**
   * Get all pricing information
   * @returns {Object} Complete pricing structure
   */
  getAllPricing() {
    return {
      ...PRICING,
      agentSubscriptionDetails: {
        basic: this.getAgentSubscriptionPricing('basic'),
        silver: this.getAgentSubscriptionPricing('silver'),
        gold: this.getAgentSubscriptionPricing('gold'),
        platinum: this.getAgentSubscriptionPricing('platinum')
      },
      sellerSubscriptionDetails: {
        basic: this.getSellerSubscriptionPricing('basic'),
        premium: this.getSellerSubscriptionPricing('premium'),
        pro: this.getSellerSubscriptionPricing('pro')
      }
    };
  }
}

module.exports = new CommissionService();
