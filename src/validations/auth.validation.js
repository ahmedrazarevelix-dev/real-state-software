const Joi = require("joi");

const passwordRule = Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&_\-#])[A-Za-z\d@$!%*?&_\-#]+$/)
    .required()
    .messages({
        "string.pattern.base":
            "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&_-#)",
        "string.min": "Password must be at least 8 characters long",
        "string.max": "Password must not exceed 128 characters",
    });

const emailRule = Joi.string().email().max(254).lowercase().trim().required().messages({
    "string.email": "Please provide a valid email address",
});

const otpRule = Joi.string()
    .length(6)
    .pattern(/^\d{6}$/)
    .required()
    .messages({
        "string.length": "OTP must be exactly 6 digits",
        "string.pattern.base": "OTP must contain only digits",
    });

// ── Schemas ──────────────────────────────────────────────────────────────────

const registerSchema = Joi.object({
    name: Joi.string().trim().min(2).max(100).required().messages({
        "string.min": "Name must be at least 2 characters long",
        "string.max": "Name must not exceed 100 characters",
    }),
    email: emailRule,
    password: passwordRule,
    roleName: Joi.string()
        .valid("buyer", "agent", "seller")
        .default("buyer")
        .messages({
            "any.only": "Invalid role. Only 'buyer', 'agent', or 'seller' roles can be self-registered",
        }),
});

const verifyOtpSchema = Joi.object({
    email: emailRule,
    otp: otpRule,
});

const resendOtpSchema = Joi.object({
    email: emailRule,
});

const loginSchema = Joi.object({
    email: emailRule,
    password: Joi.string().required().messages({
        "string.empty": "Password is required",
        "any.required": "Password is required",
    }),
});

const refreshTokenSchema = Joi.object({
    refreshToken: Joi.string().required().messages({
        "any.required": "Refresh token is required",
    }),
});

const forgotPasswordSchema = Joi.object({
    email: emailRule,
});

const verifyResetOtpSchema = Joi.object({
    email: emailRule,
    otp: otpRule,
});

const resetPasswordSchema = Joi.object({
    email: emailRule,
    otp: otpRule,
    newPassword: passwordRule.label("New password"),
});

const changePasswordSchema = Joi.object({
    currentPassword: Joi.string().required().messages({
        "any.required": "Current password is required",
    }),
    newPassword: passwordRule.label("New password"),
});

const assignRoleSchema = Joi.object({
    userId: Joi.string().uuid().required().messages({
        "string.guid": "User ID must be a valid UUID",
        "any.required": "User ID is required",
    }),
    roleName: Joi.string()
        .valid("super_admin", "admin", "agent", "buyer", "seller", "tenant")
        .required()
        .messages({
            "any.only": "Invalid role. Must be super_admin, admin, agent, buyer, seller, or tenant",
            "any.required": "Role name is required",
        }),
});

// ── SPECIAL ADMIN REGISTRATION SCHEMA (Hidden Endpoint) ───────────────────
const registerAdminSchema = Joi.object({
    name: Joi.string().trim().min(2).max(100).required().messages({
        "string.min": "Name must be at least 2 characters long",
        "string.max": "Name must not exceed 100 characters",
    }),
    email: emailRule,
    password: passwordRule,
    roleName: Joi.string()
        .valid("super_admin", "admin")
        .required()
        .messages({
            "any.only": "Invalid role. This endpoint only allows super_admin or admin",
            "any.required": "Role name is required",
        }),
    inviteCode: Joi.string().required().messages({
        "any.required": "Invite code is required for admin registration",
    }),
});

module.exports = {
    registerSchema,
    verifyOtpSchema,
    resendOtpSchema,
    loginSchema,
    refreshTokenSchema,
    forgotPasswordSchema,
    verifyResetOtpSchema,
    resetPasswordSchema,
    changePasswordSchema,
    assignRoleSchema,
    registerAdminSchema,
};

