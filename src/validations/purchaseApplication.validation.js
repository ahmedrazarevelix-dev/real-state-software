const Joi = require("joi");

// ── Reusable Rules ────────────────────────────────────────────────────────

const phoneRule = Joi.string()
    .pattern(/^(\+92|0)?[0-9]{10}$/)
    .messages({
        "string.pattern.base": "Phone number must be a valid Pakistani number",
    });

const cnicRule = Joi.string()
    .pattern(/^\d{5}-\d{7}-\d{1}$/)
    .messages({
        "string.pattern.base": "CNIC must be in format: 12345-1234567-1",
    });

// ── Schemas ──────────────────────────────────────────────────────────────

const submitApplicationSchema = Joi.object({
    listingId: Joi.string().uuid().required(),
    
    // Personal Info
    fullName: Joi.string().trim().min(3).max(100).required(),
    phone: phoneRule.required(),
    email: Joi.string().email().required(),
    cnic: cnicRule.optional().allow("", null),
    
    // Financial Info
    offerPrice: Joi.number().positive().precision(2).required().messages({
        "any.required": "Offer price is required",
        "number.positive": "Offer price must be positive",
    }),
    downPayment: Joi.number().positive().precision(2).required().messages({
        "any.required": "Down payment is required",
    }),
    financingType: Joi.string()
        .valid("cash", "bank_loan", "installment_plan", "mixed")
        .required(),
    bankName: Joi.when("financingType", {
        is: Joi.string().valid("bank_loan", "mixed"),
        then: Joi.string().trim().max(100).required(),
        otherwise: Joi.string().optional().allow("", null),
    }),
    
    // Payment Plan
    paymentPlanType: Joi.string()
        .valid("full_payment", "installment_3_months", "installment_6_months", 
               "installment_12_months", "installment_24_months", "custom")
        .required(),
    installmentMonths: Joi.when("paymentPlanType", {
        is: "custom",
        then: Joi.number().integer().min(1).max(60).required(),
        otherwise: Joi.number().optional().allow(null),
    }),
    monthlyInstallment: Joi.when("paymentPlanType", {
        is: Joi.string().pattern(/installment/),
        then: Joi.number().positive().precision(2).optional(),
        otherwise: Joi.number().optional().allow(null),
    }),
    
    // Purpose & Background
    purchasePurpose: Joi.string()
        .valid("personal_residence", "investment", "commercial_use", "resale")
        .required(),
    isFirstTimeBuyer: Joi.boolean().default(false),
    currentAddress: Joi.string().trim().max(200).optional().allow("", null),
    occupation: Joi.string().trim().max(100).optional().allow("", null),
    employerName: Joi.string().trim().max(200).optional().allow("", null),
    monthlyIncome: Joi.number().positive().precision(2).optional().allow(null),
    
    // References
    reference1Name: Joi.string().trim().max(100).optional().allow("", null),
    reference1Phone: phoneRule.optional().allow("", null),
    reference2Name: Joi.string().trim().max(100).optional().allow("", null),
    reference2Phone: phoneRule.optional().allow("", null),
});

const updateApplicationSchema = Joi.object({
    fullName: Joi.string().trim().min(3).max(100).optional(),
    phone: phoneRule.optional(),
    email: Joi.string().email().optional(),
    cnic: cnicRule.optional().allow("", null),
    offerPrice: Joi.number().positive().precision(2).optional(),
    downPayment: Joi.number().positive().precision(2).optional(),
    financingType: Joi.string().valid("cash", "bank_loan", "installment_plan", "mixed").optional(),
    bankName: Joi.string().trim().max(100).optional().allow("", null),
    paymentPlanType: Joi.string().valid("full_payment", "installment_3_months", "installment_6_months", "installment_12_months", "installment_24_months", "custom").optional(),
    installmentMonths: Joi.number().integer().min(1).max(60).optional().allow(null),
    monthlyInstallment: Joi.number().positive().precision(2).optional().allow(null),
    purchasePurpose: Joi.string().valid("personal_residence", "investment", "commercial_use", "resale").optional(),
    isFirstTimeBuyer: Joi.boolean().optional(),
    currentAddress: Joi.string().trim().max(200).optional().allow("", null),
    occupation: Joi.string().trim().max(100).optional().allow("", null),
    employerName: Joi.string().trim().max(200).optional().allow("", null),
    monthlyIncome: Joi.number().positive().precision(2).optional().allow(null),
    reference1Name: Joi.string().trim().max(100).optional().allow("", null),
    reference1Phone: phoneRule.optional().allow("", null),
    reference2Name: Joi.string().trim().max(100).optional().allow("", null),
    reference2Phone: phoneRule.optional().allow("", null),
}).min(1);

const reviewApplicationSchema = Joi.object({
    status: Joi.string()
        .valid("under_review", "documents_requested", "approved", "rejected")
        .required(),
    adminNotes: Joi.string().trim().max(1000).optional().allow("", null),
    rejectionReason: Joi.when("status", {
        is: "rejected",
        then: Joi.string().trim().min(10).max(500).required(),
        otherwise: Joi.string().optional().allow("", null),
    }),
});

const approveApplicationSchema = Joi.object({
    agreedPrice: Joi.number().positive().precision(2).required(),
    downPaymentAmount: Joi.number().positive().precision(2).required(),
    downPaymentDate: Joi.date().iso().optional().allow(null),
    paymentPlan: Joi.string()
        .valid("full_payment", "installment_3_months", "installment_6_months", 
               "installment_12_months", "installment_24_months", "custom")
        .required(),
    totalInstallments: Joi.when("paymentPlan", {
        is: Joi.string().pattern(/installment/),
        then: Joi.number().integer().min(1).required(),
        otherwise: Joi.number().optional().allow(null),
    }),
    installmentAmount: Joi.when("paymentPlan", {
        is: Joi.string().pattern(/installment/),
        then: Joi.number().positive().precision(2).required(),
        otherwise: Joi.number().optional().allow(null),
    }),
    installmentStartDate: Joi.when("paymentPlan", {
        is: Joi.string().pattern(/installment/),
        then: Joi.date().iso().required(),
        otherwise: Joi.date().optional().allow(null),
    }),
    finalPaymentDate: Joi.date().iso().optional().allow(null),
    possessionDate: Joi.date().iso().optional().allow(null),
    terms: Joi.string().trim().max(2000).optional().allow("", null),
    specialConditions: Joi.string().trim().max(1000).optional().allow("", null),
    adminNotes: Joi.string().trim().max(1000).optional().allow("", null),
});

const cancelAgreementSchema = Joi.object({
    cancellationReason: Joi.string().trim().min(10).max(500).required(),
});

const recordPaymentSchema = Joi.object({
    paidAmount: Joi.number().positive().precision(2).required(),
    paymentMethod: Joi.string().trim().max(50).optional().allow("", null),
    transactionId: Joi.string().trim().max(100).optional().allow("", null),
    receiptUrl: Joi.string().uri().optional().allow("", null),
    notes: Joi.string().trim().max(500).optional().allow("", null),
});

module.exports = {
    submitApplicationSchema,
    updateApplicationSchema,
    reviewApplicationSchema,
    approveApplicationSchema,
    cancelAgreementSchema,
    recordPaymentSchema,
};
