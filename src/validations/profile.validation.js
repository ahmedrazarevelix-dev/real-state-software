const Joi = require("joi");

// ═══════════════════════════════════════════════════════════════════════════
// PROFILE VALIDATION SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate update profile request
 * Both name and phone are REQUIRED for first-time profile completion
 * Admin contact fields are optional
 */
const updateProfileSchema = Joi.object({
    name: Joi.string()
        .min(2)
        .max(100)
        .trim()
        .required()
        .messages({
            "string.min": "Name must be at least 2 characters",
            "string.max": "Name cannot exceed 100 characters",
            "any.required": "Name is required to complete your profile",
        }),
    
    phone: Joi.string()
        .pattern(/^[0-9+\-() ]{10,20}$/)
        .required()
        .messages({
            "string.pattern.base": "Phone number must be valid (10-20 characters, numbers, +, -, (, ) allowed)",
            "any.required": "Phone number is required to complete your profile",
        }),
    
    // Admin contact fields (optional)
    agencyName: Joi.string().max(150).trim().optional().allow(""),
    
    officePhone: Joi.string()
        .pattern(/^[0-9+\-() ]{10,20}$/)
        .optional()
        .allow('')
        .messages({
            "string.pattern.base": "Office phone must be valid",
        }),
    
    whatsappNumber: Joi.string()
        .pattern(/^[0-9+\-() ]{10,20}$/)
        .optional()
        .allow('')
        .messages({
            "string.pattern.base": "WhatsApp number must be valid",
        }),
    
    officeAddress: Joi.string()
        .max(500)
        .trim()
        .optional()
        .allow(''),
    
    officeHours: Joi.string()
        .max(100)
        .trim()
        .optional()
        .allow(''),
    
    // Social media (optional)
    facebookUrl: Joi.string()
        .uri()
        .max(255)
        .optional()
        .allow(''),
    
    instagramHandle: Joi.string()
        .max(100)
        .trim()
        .optional()
        .allow(''),
    
    twitterHandle: Joi.string()
        .max(100)
        .trim()
        .optional()
        .allow(''),
    
    linkedinUrl: Joi.string()
        .uri()
        .max(255)
        .optional()
        .allow(''),
    
    websiteUrl: Joi.string()
        .uri()
        .max(255)
        .optional()
        .allow(''),
});

/**
 * Validate update email request
 * Requires OTP verification
 */
const updateEmailSchema = Joi.object({
    newEmail: Joi.string()
        .email()
        .trim()
        .lowercase()
        .required()
        .messages({
            "string.email": "Please provide a valid email address",
            "any.required": "New email is required",
        }),
});

/**
 * Verify new email with OTP
 */
const verifyEmailUpdateSchema = Joi.object({
    newEmail: Joi.string()
        .email()
        .trim()
        .lowercase()
        .required()
        .messages({
            "string.email": "Please provide a valid email address",
            "any.required": "New email is required",
        }), 
    
    otp: Joi.string()
        .length(6)
        .pattern(/^[0-9]{6}$/)
        .required()
        .messages({
            "string.length": "OTP must be exactly 6 digits",
            "string.pattern.base": "OTP must contain only numbers",
            "any.required": "OTP is required",
        }),
});

/**
 * Update password (authenticated user changing their password)
 * Already exists in auth.validation.js as changePasswordSchema
 */
const changePasswordSchema = Joi.object({
    currentPassword: Joi.string()
        .min(6)
        .required()
        .messages({
            "string.min": "Current password must be at least 6 characters",
            "any.required": "Current password is required",
        }),

    newPassword: Joi.string()
        .min(6)
        .max(128)
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .required()
        .messages({
            "string.min": "New password must be at least 6 characters",
            "string.max": "New password cannot exceed 128 characters",
            "string.pattern.base": "New password must contain at least one uppercase, one lowercase, and one digit",
            "any.required": "New password is required",
        }),
});

module.exports = {
    updateProfileSchema,
    updateEmailSchema,
    verifyEmailUpdateSchema,
    changePasswordSchema,
};
