/**
 * Payment Validation Schemas
 * Using Joi for request validation
 */

const Joi = require('joi');

// Subscription payment validation
const createSubscriptionPayment = Joi.object({
  plan: Joi.string()
    .valid('basic', 'silver', 'gold', 'platinum', 'premium', 'pro')
    .required()
    .messages({
      'any.required': 'Plan is required',
      'any.only': 'Plan must be one of: basic, silver, gold, platinum (agent) or premium, pro (seller)'
    })
});

// Promotion payment validation
const createPromotionPayment = Joi.object({
  listingId: Joi.string()
    .uuid()
    .required()
    .messages({
      'any.required': 'Listing ID is required',
      'string.guid': 'Invalid listing ID format'
    }),
  promotionType: Joi.string()
    .valid('featured', 'hot', 'premium')
    .required()
    .messages({
      'any.required': 'Promotion type is required',
      'any.only': 'Promotion type must be one of: featured, hot, premium'
    }),
  duration: Joi.number()
    .integer()
    .min(1)
    .max(12)
    .default(1)
    .messages({
      'number.base': 'Duration must be a number',
      'number.min': 'Duration must be at least 1 month',
      'number.max': 'Duration cannot exceed 12 months'
    })
});

// Lead purchase payment validation
const createLeadPurchasePayment = Joi.object({
  leadType: Joi.string()
    .valid('verifiedBuyer', 'tourRequest', 'inquiry')
    .required()
    .messages({
      'any.required': 'Lead type is required',
      'any.only': 'Lead type must be one of: verifiedBuyer, tourRequest, inquiry'
    }),
  quantity: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(1)
    .messages({
      'number.base': 'Quantity must be a number',
      'number.min': 'Quantity must be at least 1',
      'number.max': 'Quantity cannot exceed 100'
    })
});

// Calculate success fee validation
const calculateSuccessFee = Joi.object({
  listingId: Joi.string()
    .uuid()
    .required()
    .messages({
      'any.required': 'Listing ID is required',
      'string.guid': 'Invalid listing ID format'
    }),
  salePrice: Joi.number()
    .positive()
    .required()
    .messages({
      'any.required': 'Sale price is required',
      'number.positive': 'Sale price must be positive'
    }),
  agentCommissionRate: Joi.number()
    .min(0)
    .max(10)
    .default(2)
    .messages({
      'number.base': 'Agent commission rate must be a number',
      'number.min': 'Commission rate cannot be negative',
      'number.max': 'Commission rate cannot exceed 10%'
    })
});

// Process refund validation (Admin)
const processRefund = Joi.object({
  paymentId: Joi.string()
    .uuid()
    .required()
    .messages({
      'any.required': 'Payment ID is required',
      'string.guid': 'Invalid payment ID format'
    }),
  amount: Joi.number()
    .positive()
    .optional()
    .messages({
      'number.positive': 'Amount must be positive'
    }),
  reason: Joi.string()
    .valid('requested_by_customer', 'duplicate', 'fraudulent', 'other')
    .default('requested_by_customer')
    .messages({
      'any.only': 'Reason must be one of: requested_by_customer, duplicate, fraudulent, other'
    })
});

// Test webhook validation
const testWebhook = Joi.object({
  eventType: Joi.string()
    .optional()
    .default('payment_intent.succeeded'),
  paymentIntentId: Joi.string()
    .optional()
});

module.exports = {
  createSubscriptionPayment,
  createPromotionPayment,
  createLeadPurchasePayment,
  calculateSuccessFee,
  processRefund,
  testWebhook
};
