const Joi = require("joi");

const createAgentVerificationSchema = Joi.object({
    agencyName: Joi.string().trim().min(2).max(160).required(),
    licenseNumber: Joi.string().trim().max(100).optional().allow("", null),
    licenseExpiresAt: Joi.date().iso().greater("now").optional().allow(null),
});

const agentDocumentSchema = Joi.object({
    documentType: Joi.string().valid(
        "identity_front",
        "identity_back",
        "agency_registration",
        "broker_license",
        "office_address_proof"
    ).required(),
});

const agentReviewSchema = Joi.object({
    status: Joi.string().valid("approved", "rejected").required(),
    rejectionReason: Joi.string().trim().min(5).max(2000).when("status", {
        is: "rejected",
        then: Joi.required(),
        otherwise: Joi.optional().allow("", null),
    }),
});

module.exports = { createAgentVerificationSchema, agentDocumentSchema, agentReviewSchema };
