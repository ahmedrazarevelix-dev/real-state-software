const Joi = require("joi");

// ── Reusable Rules ────────────────────────────────────────────────────────

const phoneRule = Joi.string()
    .pattern(/^(\+92|0)?[0-9]{10}$/)
    .messages({
        "string.pattern.base": "Phone number must be a valid Pakistani number (e.g., 03001234567 or +923001234567)",
    });

const cnicRule = Joi.string()
    .pattern(/^\d{5}-\d{7}-\d{1}$/)
    .messages({
        "string.pattern.base": "CNIC must be in format: 12345-1234567-1",
    });

// ── Schemas ──────────────────────────────────────────────────────────────

const submitApplicationSchema = Joi.object({
    listingId: Joi.string().uuid().required().messages({
        "string.guid": "Listing ID must be a valid UUID",
        "any.required": "Listing ID is required",
    }),
    
    // Personal Info
    fullName: Joi.string().trim().min(3).max(100).required().messages({
        "string.min": "Full name must be at least 3 characters",
        "string.max": "Full name must not exceed 100 characters",
    }),
    phone: phoneRule.required(),
    email: Joi.string().email().required(),
    cnic: cnicRule.optional().allow("", null),
    
    // Employment Info
    employmentStatus: Joi.string()
        .valid("employed_full_time", "employed_part_time", "self_employed", "unemployed", "student", "retired")
        .required()
        .messages({
            "any.only": "Invalid employment status",
        }),
    employerName: Joi.string().trim().max(200).optional().allow("", null),
    monthlyIncome: Joi.number().positive().precision(2).optional().allow(null),
    jobTitle: Joi.string().trim().max(100).optional().allow("", null),
    
    // Rental Info
    moveInDate: Joi.date().iso().greater("now").required().messages({
        "date.greater": "Move-in date must be in the future",
        "any.required": "Move-in date is required",
    }),
    leaseDuration: Joi.number().integer().min(1).max(60).optional().messages({
        "number.min": "Lease duration must be at least 1 month",
        "number.max": "Lease duration cannot exceed 60 months (5 years)",
    }),
    numberOfOccupants: Joi.number().integer().min(1).max(20).default(1).messages({
        "number.min": "Number of occupants must be at least 1",
        "number.max": "Number of occupants cannot exceed 20",
    }),
    hasPets: Joi.boolean().default(false),
    petDetails: Joi.when("hasPets", {
        is: true,
        then: Joi.string().trim().max(500).required().messages({
            "any.required": "Pet details are required when hasPets is true",
        }),
        otherwise: Joi.string().optional().allow("", null),
    }),
    
    // References
    emergencyContact: Joi.string().trim().max(100).optional().allow("", null),
    emergencyPhone: phoneRule.optional().allow("", null),
    previousLandlord: Joi.string().trim().max(100).optional().allow("", null),
    previousLandlordPhone: phoneRule.optional().allow("", null),
});

const updateApplicationSchema = Joi.object({
    // Personal Info
    fullName: Joi.string().trim().min(3).max(100).optional(),
    phone: phoneRule.optional(),
    email: Joi.string().email().optional(),
    cnic: cnicRule.optional().allow("", null),
    
    // Employment Info
    employmentStatus: Joi.string()
        .valid("employed_full_time", "employed_part_time", "self_employed", "unemployed", "student", "retired")
        .optional(),
    employerName: Joi.string().trim().max(200).optional().allow("", null),
    monthlyIncome: Joi.number().positive().precision(2).optional().allow(null),
    jobTitle: Joi.string().trim().max(100).optional().allow("", null),
    
    // Rental Info
    moveInDate: Joi.date().iso().greater("now").optional(),
    leaseDuration: Joi.number().integer().min(1).max(60).optional(),
    numberOfOccupants: Joi.number().integer().min(1).max(20).optional(),
    hasPets: Joi.boolean().optional(),
    petDetails: Joi.string().trim().max(500).optional().allow("", null),
    
    // References
    emergencyContact: Joi.string().trim().max(100).optional().allow("", null),
    emergencyPhone: phoneRule.optional().allow("", null),
    previousLandlord: Joi.string().trim().max(100).optional().allow("", null),
    previousLandlordPhone: phoneRule.optional().allow("", null),
}).min(1).messages({
    "object.min": "At least one field must be provided for update",
});

const reviewApplicationSchema = Joi.object({
    status: Joi.string()
        .valid("under_review", "background_check", "approved", "rejected")
        .required()
        .messages({
            "any.only": "Status must be: under_review, background_check, approved, or rejected",
            "any.required": "Status is required",
        }),
    adminNotes: Joi.string().trim().max(1000).optional().allow("", null),
    rejectionReason: Joi.when("status", {
        is: "rejected",
        then: Joi.string().trim().min(10).max(500).required().messages({
            "any.required": "Rejection reason is required when status is rejected",
            "string.min": "Rejection reason must be at least 10 characters",
        }),
        otherwise: Joi.string().optional().allow("", null),
    }),
});

const approveApplicationSchema = Joi.object({
    leaseStartDate: Joi.date().iso().required().messages({
        "any.required": "Lease start date is required",
    }),
    leaseEndDate: Joi.date().iso().greater(Joi.ref("leaseStartDate")).required().messages({
        "any.required": "Lease end date is required",
        "date.greater": "Lease end date must be after lease start date",
    }),
    monthlyRent: Joi.number().positive().precision(2).required().messages({
        "any.required": "Monthly rent is required",
        "number.positive": "Monthly rent must be a positive number",
    }),
    securityDeposit: Joi.number().positive().precision(2).optional().allow(null).messages({
        "number.positive": "Security deposit must be a positive number",
    }),
    adminNotes: Joi.string().trim().max(1000).optional().allow("", null),
});

const terminateLeaseSchema = Joi.object({
    terminationReason: Joi.string().trim().min(10).max(500).required().messages({
        "any.required": "Termination reason is required",
        "string.min": "Termination reason must be at least 10 characters",
    }),
});

const uploadDocumentSchema = Joi.object({
    documentType: Joi.string()
        .valid("identity_card", "employment_letter", "salary_slip", "bank_statement", "previous_rental_agreement", "reference_letter")
        .required()
        .messages({
            "any.only": "Invalid document type",
            "any.required": "Document type is required",
        }),
});

module.exports = {
    submitApplicationSchema,
    updateApplicationSchema,
    reviewApplicationSchema,
    approveApplicationSchema,
    terminateLeaseSchema,
    uploadDocumentSchema,
};
