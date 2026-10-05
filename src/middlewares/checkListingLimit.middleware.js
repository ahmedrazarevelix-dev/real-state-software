const prisma = require('../config/prisma.client');
const { FREE_LISTING_LIMITS } = require('../constants');
const ApiError = require('../utils/ApiError');

/**
 * Middleware to check if user can create more listings based on their subscription
 */
const checkListingLimit = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    // Admin and super_admin have unlimited listings
    if (userRole === 'admin' || userRole === 'super_admin') {
      return next();
    }

    // Get active listings count for the user
    const activeListingsCount = await prisma.propertyListing.count({
      where: {
        listedById: userId,
        status: {
          in: ['active', 'draft', 'pending_review']
        }
      }
    });

    let listingLimit;
    let subscriptionPlan;

    // Check role-based limits
    if (userRole === 'agent') {
      // Check agent subscription
      const agentSubscription = await prisma.agentSubscription.findUnique({
        where: { userId },
        select: { plan: true, status: true, listingLimit: true }
      });

      if (agentSubscription && agentSubscription.status === 'active') {
        subscriptionPlan = agentSubscription.plan;
        listingLimit = agentSubscription.listingLimit || null; // null = unlimited
      } else {
        // No subscription or inactive = basic/free tier
        subscriptionPlan = 'basic';
        listingLimit = FREE_LISTING_LIMITS.AGENT;
      }
    } else if (userRole === 'seller') {
      // Check seller subscription
      const sellerSubscription = await prisma.sellerSubscription.findUnique({
        where: { userId },
        select: { plan: true, status: true, listingLimit: true }
      });

      if (sellerSubscription && sellerSubscription.status === 'active') {
        subscriptionPlan = sellerSubscription.plan;
        listingLimit = sellerSubscription.listingLimit;
      } else {
        // No subscription or inactive = basic/free tier
        subscriptionPlan = 'basic';
        listingLimit = FREE_LISTING_LIMITS.SELLER;
      }
    } else {
      // Other roles (buyer, tenant) should not create listings
      throw new ApiError(403, 'You are not authorized to create listings');
    }

    // Check if limit is reached
    if (listingLimit !== null && activeListingsCount >= listingLimit) {
      throw new ApiError(
        403,
        `Listing limit reached (${listingLimit} listings). Please upgrade your subscription to create more listings.`,
        {
          currentCount: activeListingsCount,
          limit: listingLimit,
          plan: subscriptionPlan,
          role: userRole
        }
      );
    }

    // Attach info to request for logging/analytics
    req.listingInfo = {
      currentCount: activeListingsCount,
      limit: listingLimit,
      remaining: listingLimit ? listingLimit - activeListingsCount : 'unlimited',
      plan: subscriptionPlan
    };

    next();
  } catch (error) {
    if (error instanceof ApiError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
        details: error.details
      });
    }
    
    console.error('Check listing limit error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to check listing limit'
    });
  }
};

module.exports = checkListingLimit;
