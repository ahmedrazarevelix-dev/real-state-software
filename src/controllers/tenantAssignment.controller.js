const asyncHandler = require("../middlewares/asyncHandler.middleware");
const verifyJWT = require("../middlewares/auth.middleware");
const checkRole = require("../middlewares/checkRole.middleware");
const validate = require("../middlewares/validate.middleware");
const ApiResponse = require("../utils/ApiResponse");
const tenantAssignmentService = require("../services/tenantAssignment.service");
const { terminateLeaseSchema } = require("../validations/tenantApplication.validation");

const BASE = "/api/v1/tenant-assignments";

const tenantAssignmentController = (app) => {

    // ═══════════════════════════════════════════════════════════════════════
    //  TENANT ROUTES
    // ═══════════════════════════════════════════════════════════════════════

    // ── GET MY CURRENT LEASE ──────────────────────────────────────────────
    app.get(
        "/api/v1/my-lease",
        verifyJWT,
        checkRole(["tenant"]),
        asyncHandler(async (req, res) => {
            const assignment = await tenantAssignmentService.getMyLease(req.user.id);
            return res.status(200).json(
                new ApiResponse(200, assignment, "Lease details fetched successfully")
            );
        })
    );

    // ═══════════════════════════════════════════════════════════════════════
    //  ADMIN/LANDLORD ROUTES
    // ═══════════════════════════════════════════════════════════════════════

    // ── GET ALL TENANT ASSIGNMENTS ────────────────────────────────────────
    app.get(
        `${BASE}`,
        verifyJWT,
        checkRole(["super_admin", "admin", "seller", "agent"]),
        asyncHandler(async (req, res) => {
            const result = await tenantAssignmentService.getAllAssignments(
                req.query,
                req.user.id,
                req.user.role
            );
            return res.status(200).json(
                new ApiResponse(200, result, "Tenant assignments fetched successfully")
            );
        })
    );

    // ── GET ASSIGNMENT BY ID ──────────────────────────────────────────────
    app.get(
        `${BASE}/:id`,
        verifyJWT,
        asyncHandler(async (req, res) => {
            const assignment = await tenantAssignmentService.getAssignmentById(
                req.params.id,
                req.user.id,
                req.user.role
            );
            return res.status(200).json(
                new ApiResponse(200, assignment, "Assignment fetched successfully")
            );
        })
    );

    // ── TERMINATE LEASE ───────────────────────────────────────────────────
    app.put(
        `${BASE}/:id/terminate`,
        verifyJWT,
        checkRole(["super_admin", "admin"]),
        validate(terminateLeaseSchema),
        asyncHandler(async (req, res) => {
            const { assignment, message } = await tenantAssignmentService.terminateLease(
                req.params.id,
                req.body,
                req.user.id
            );
            return res.status(200).json(new ApiResponse(200, assignment, message));
        })
    );
};

module.exports = tenantAssignmentController;
