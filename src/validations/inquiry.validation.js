const Joi = require("joi");

const createInquirySchema = Joi.object({
    message: Joi.string().trim().min(10).max(2000).required(),
    phone: Joi.string().pattern(/^[0-9+\-() ]{10,20}$/).optional(),
    email: Joi.string().email().optional(),
});

const updateInquiryStatusSchema = Joi.object({
    status: Joi.string().valid("new", "contacted", "closed").required(),
});

module.exports = {
    createInquirySchema,
    updateInquiryStatusSchema,
};
