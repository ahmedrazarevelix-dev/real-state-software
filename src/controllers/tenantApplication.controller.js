const asyncHandler = require("../middlewares/asyncHandler.middleware");
const verifyJWT = require("../middlewares/auth.middleware");
const checkRole = require("../middlewares/checkRole.middleware");
const validate = require("../middlewares/validate.middleware");
const ApiResponse = require("../utils/ApiResponse");
const tenantApplicationService = require("../services/tenantApplication.service");
const {
    submitApplicationSchema,
    updateApplicationSchema,
    reviewApplicationSchema,
    approveApplicationSchema,
} = require("../validations/tenantApplication.validation");

const BASE = "/api/v1/tenant-applications";

const tenantApplicationController = (app) => {

    // ═══════════════════════════════════════════════════════════════════════
    //  PUBLIC ROUTES (Authenticated Users Only)
    // ═══════════════════════════════════════════════════════════════════════

    // ── SUBMIT APPLICATION ────────────────────────────────────────────────
    app.post(
        `${BASE}`,
        verifyJWT,
        validate(submitApplicationSchema),
        asyncHandler(async (req, res) => {
            const { application, message } = await tenantApplicationService.submitApplication(
                req.user.id,
                req.body
            );
            return res.status(201).json(new ApiResponse(201, application, message));
        })
    );

    // ── GET MY APPLICATIONS ───────────────────────────────────────────────
    app.get(
        `${BASE}`,
        verifyJWT,
        asyncHandler(async (req, res) => {
            const result = await tenantApplicationService.getAllApplications(
                req.query,
                req.user.id,
                req.user.role
            );
            return res.status(200).json(
                new ApiResponse(200, result, "Applications fetched successfully")
            );
        })
    );

    // ── GET APPLICATION BY ID ─────────────────────────────────────────────
    app.get(
        `${BASE}/:id`,
        verifyJWT,
        asyncHandler(async (req, res) => {
            const application = await tenantApplicationService.getApplicationById(
                req.params.id,
                req.user.id,
                req.user.role
            );
            return res.status(200).json(
                new ApiResponse(200, application, "Application fetched successfully")
            );
        })
    );

    // ── UPDATE APPLICATION ────────────────────────────────────────────────
    app.put(
        `${BASE}/:id`,
        verifyJWT,
        validate(updateApplicationSchema),
        asyncHandler(async (req, res) => {
            const { application, message } = await tenantApplicationService.updateApplication(
                req.params.id,
                req.body,
                req.user.id
            );
            return res.status(200).json(new ApiResponse(200, application, message));
        })
    );

    // ── WITHDRAW APPLICATION ──────────────────────────────────────────────
    app.delete(
        `${BASE}/:id`,
        verifyJWT,
        asyncHandler(async (req, res) => {
            const { message } = await tenantApplicationService.withdrawApplication(
                req.params.id,
                req.user.id
            );
            return res.status(200).json(new ApiResponse(200, null, message));
        })
    );

    // ═══════════════════════════════════════════════════════════════════════
    //  ADMIN/LANDLORD ROUTES (Role-Protected)
    // ═══════════════════════════════════════════════════════════════════════

    // ── REVIEW APPLICATION ────────────────────────────────────────────────
    app.put(
        `${BASE}/:id/review`,
        verifyJWT,
        checkRole(["super_admin", "admin", "seller", "agent"]),
        validate(reviewApplicationSchema),
        asyncHandler(async (req, res) => {
            const { application, message } = await tenantApplicationService.reviewApplication(
                req.params.id,
                req.body,
                req.user.id
            );
            return res.status(200).json(new ApiResponse(200, application, message));
        })
    );

    // ── APPROVE & ASSIGN TENANT ───────────────────────────────────────────
    app.post(
        `${BASE}/:id/approve`,
        verifyJWT,
        checkRole(["super_admin", "admin"]),
        validate(approveApplicationSchema),
        asyncHandler(async (req, res) => {
            const result = await tenantApplicationService.approveAndAssignTenant(
                req.params.id,
                req.body,
                req.user.id
            );
            return res.status(200).json(new ApiResponse(200, result, result.message));
        })
    );
};

module.exports = tenantApplicationController;
