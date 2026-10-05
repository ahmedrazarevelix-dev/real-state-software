const Joi = require("joi");

const propertyDocumentSchema = Joi.object({
    documentType: Joi.string().valid("ownership_proof", "authorization_letter", "property_tax").required(),
});

const listingReviewSchema = Joi.object({
    rejectionReason: Joi.string().trim().min(5).max(2000).when("status", {
        is: "rejected",
        then: Joi.required(),
        otherwise: Joi.optional().allow("", null),
    }),
    status: Joi.string().valid("approved", "rejected").required(),
});

module.exports = { propertyDocumentSchema, listingReviewSchema };
