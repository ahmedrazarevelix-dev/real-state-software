const Joi = require("joi");

const createTourSchema = Joi.object({
    scheduledAt: Joi.date().iso().required(),
    notes: Joi.string().trim().max(500).optional().allow("", null),
});

const updateTourStatusSchema = Joi.object({
    status: Joi.string().valid("requested", "viewed", "confirmed", "completed", "cancelled", "no_show").required(),
});

module.exports = {
    createTourSchema,
    updateTourStatusSchema,
};
