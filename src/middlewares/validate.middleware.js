const ApiError = require("../utils/ApiError");

/**
 * Factory that returns an Express middleware which validates
 * req.body against a Joi schema.
 *
 * On failure it passes a 422 ApiError to next() with the full
 * list of Joi validation messages as the `errors` array.
 *
 * @param {import("joi").ObjectSchema} schema
 */
const validate = (schema) => (req, _res, next) => {
    const { error } = schema.validate(req.body, {
        abortEarly: false,   // collect ALL errors, not just the first
        stripUnknown: true,  // silently drop unknown keys
    });

    if (error) {
        const errors = error.details.map((d) => ({
            field: d.context?.key || "unknown",
            message: d.message.replace(/['"]/g, ""),
        }));
        return next(new ApiError(422, "Validation failed", errors));
    }

    next();
};

module.exports = validate;

