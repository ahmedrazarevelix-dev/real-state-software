const Joi = require("joi");

const sellerTypeRule = Joi.string().valid("owner", "authorized_agent").required();
const documentTypes = [
    "identity_front",
    "identity_back",
    "ownership_proof",
    "authorization_letter",
    "property_tax",
];

const createVerificationSchema = Joi.object({
    sellerType: sellerTypeRule,
});

const documentSchema = Joi.object({
    documentType: Joi.string().valid(...documentTypes).required(),
});

const reviewSchema = Joi.object({
    rejectionReason: Joi.string().trim().min(5).max(2000).when("status", {
        is: "rejected",
        then: Joi.required(),
        otherwise: Joi.optional().allow("", null),
    }),
    status: Joi.string().valid("approved", "rejected").required(),
});

module.exports = { createVerificationSchema, documentSchema, reviewSchema };
