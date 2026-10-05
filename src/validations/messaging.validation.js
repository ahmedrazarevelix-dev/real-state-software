const Joi = require("joi");

const startConversationSchema = Joi.object({
    recipientId: Joi.string().uuid().required(),
    listingId: Joi.string().uuid().optional(),
    subject: Joi.string().trim().max(160).optional().allow("", null),
    message: Joi.string().trim().min(1).max(5000).required(),
});

const messageSchema = Joi.object({
    body: Joi.string().trim().min(1).max(5000).required(),
});

const blockSchema = Joi.object({
    reason: Joi.string().trim().max(500).optional().allow("", null),
});

module.exports = { startConversationSchema, messageSchema, blockSchema };
