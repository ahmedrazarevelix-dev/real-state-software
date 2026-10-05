const purchaseAgreementService = require("../services/purchaseAgreement.service");
const asyncHandler = require("../middlewares/asyncHandler.middleware");
const ApiResponse = require("../utils/ApiResponse");
const verifyJWT = require("../middlewares/auth.middleware");
const { authorizeRoles } = require("../middlewares/rbac.middleware");
const validate = require("../middlewares/validate.middleware");
const purchaseApplicationValidation = require("../validations/purchaseApplication.validation");

// ── GET ALL AGREEMENTS ────────────────────────────────────────────────────

const getAllAgreements = asyncHandler(async (req, res) => {
    const filters = {
        status: req.query.status,
        listingId: req.query.listingId,
        buyerId: req.query.buyerId,
        sellerId: req.query.sellerId,
        limit: req.query.limit,
        skip: req.query.skip,
    };

    const result = await purchaseAgreementService.getAllAgreements(
        filters,
        req.user.id,
        req.user.role
    );

    res.status(200).json({
        success: true,
        data: result.agreements,
        pagination: result.pagination,
        message: "Purchase agreements retrieved successfully",
    });
});

// ── GET AGREEMENT BY ID ───────────────────────────────────────────────────

const getAgreementById = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const agreement = await purchaseAgreementService.getAgreementById(
        id,
        req.user.id,
        req.user.role
    );

    res.status(200).json({
        success: true,
        data: agreement,
        message: "Purchase agreement retrieved successfully",
    });
});

// ── GET MY AGREEMENT ──────────────────────────────────────────────────────

const getMyAgreement = asyncHandler(async (req, res) => {
    const agreement = await purchaseAgreementService.getMyAgreement(req.user.id);

    res.status(200).json({
        success: true,
        data: agreement,
        message: "Your purchase agreement retrieved successfully",
    });
});

// ── CANCEL AGREEMENT ──────────────────────────────────────────────────────

const cancelAgreement = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await purchaseAgreementService.cancelAgreement(
        id,
        req.body,
        req.user.id
    );

    res.status(200).json({
        success: true,
        data: result.agreement,
        message: result.message,
    });
});

// ── RECORD INSTALLMENT PAYMENT ────────────────────────────────────────────

const recordInstallmentPayment = asyncHandler(async (req, res) => {
    const { installmentId } = req.params;

    const result = await purchaseAgreementService.recordInstallmentPayment(
        installmentId,
        req.body,
        req.user.id,
        req.user.role
    );

    res.status(200).json({
        success: true,
        data: result.installment,
        message: result.message,
        agreementCompleted: result.agreementCompleted,
    });
});

// ══════════════════════════════════════════════════════════════════════════
// REQUEST HANDLER - REGISTER ROUTES
// ══════════════════════════════════════════════════════════════════════════

const purchaseAgreementRequestHandler = (app) => {
    const BASE_PATH = "/api/v1/purchase-agreements";

    // ── BUYER ROUTES ──────────────────────────────────────────────────────

    // Get my agreement
    app.get(
        `${BASE_PATH}/my-agreement`,
        verifyJWT,
        authorizeRoles("buyer"),
        getMyAgreement
    );

    // ── SHARED ROUTES ─────────────────────────────────────────────────────

    // Get agreement by ID
    app.get(
        `${BASE_PATH}/:id`,
        verifyJWT,
        getAgreementById
    );

    // Record installment payment
    app.post(
        `${BASE_PATH}/installments/:installmentId/pay`,
        verifyJWT,
        validate(purchaseApplicationValidation.recordPaymentSchema),
        recordInstallmentPayment
    );

    // ── ADMIN / SELLER ROUTES ─────────────────────────────────────────────

    // Get all agreements
    app.get(
        BASE_PATH,
        verifyJWT,
        authorizeRoles("super_admin", "admin", "seller"),
        getAllAgreements
    );

    // Cancel agreement
    app.post(
        `${BASE_PATH}/:id/cancel`,
        verifyJWT,
        authorizeRoles("super_admin", "admin"),
        validate(purchaseApplicationValidation.cancelAgreementSchema),
        cancelAgreement
    );
};

module.exports = purchaseAgreementRequestHandler;
