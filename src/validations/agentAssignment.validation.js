/**
 * Agent Assignment Validation Schemas
 */

const Joi = require('joi');

const createAssignment = Joi.object({
  agentId: Joi.string().uuid().required().messages({
    'string.empty': 'Agent ID is required',
    'string.uuid': 'Agent ID must be a valid UUID'
  }),
  listingId: Joi.string().uuid().required().messages({
    'string.empty': 'Listing ID is required',
    'string.uuid': 'Listing ID must be a valid UUID'
  }),
  commissionRate: Joi.number().min(0).max(10).required().messages({
    'number.base': 'Commission rate must be a number',
    'number.min': 'Commission rate cannot be negative',
    'number.max': 'Commission rate cannot exceed 10%',
    'any.required': 'Commission rate is required'
  }),
  terms: Joi.string().max(1000).optional().messages({
    'string.max': 'Terms cannot exceed 1000 characters'
  }),
  agreementType: Joi.string().valid('exclusive', 'non_exclusive').default('exclusive').messages({
    'any.only': 'Agreement type must be either exclusive or non_exclusive'
  })
});

const rejectAssignment = Joi.object({
  reason: Joi.string().max(500).optional().messages({
    'string.max': 'Reason cannot exceed 500 characters'
  })
});

module.exports = {
  createAssignment,
  rejectAssignment
};
