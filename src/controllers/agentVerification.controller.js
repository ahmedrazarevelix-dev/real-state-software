const asyncHandler = require("../middlewares/asyncHandler.middleware");
const verifyJWT = require("../middlewares/auth.middleware");
const { authorizeRoles, requirePermission } = require("../middlewares/rbac.middleware");
const validate = require("../middlewares/validate.middleware");
const ApiResponse = require("../utils/ApiResponse");
const documentUpload = require("../middlewares/documentUpload.middleware");
const agentVerificationService = require("../services/agentVerification.service");
const { createAgentVerificationSchema, agentDocumentSchema, agentReviewSchema } = require("../validations/agentVerification.validation");

const BASE = "/api/v1/agent-verification";
const ADMIN_BASE = "/api/v1/admin/agent-verifications";

const agentVerificationRequestHandler = (app) => {
    app.post(BASE, verifyJWT, authorizeRoles("agent"), validate(createAgentVerificationSchema), asyncHandler(async (req, res) => {
        const result = await agentVerificationService.createOrUpdate(req.user.id, req.body);
        return res.status(200).json(new ApiResponse(200, result, "Agent verification draft saved"));
    }));

    app.get(`${BASE}/me`, verifyJWT, authorizeRoles("agent"), asyncHandler(async (req, res) => {
        const result = await agentVerificationService.getMine(req.user.id);
        return res.status(200).json(new ApiResponse(200, result, "Agent verification fetched"));
    }));

    app.post(`${BASE}/documents`, verifyJWT, authorizeRoles("agent"), documentUpload.single("document"), validate(agentDocumentSchema), asyncHandler(async (req, res) => {
        const result = await agentVerificationService.uploadDocument(req.user.id, req.body.documentType, req.file);
        return res.status(201).json(new ApiResponse(201, result, "Agent verification document uploaded"));
    }));

    app.delete(`${BASE}/documents/:documentId`, verifyJWT, authorizeRoles("agent"), asyncHandler(async (req, res) => {
        const result = await agentVerificationService.removeDocument(req.user.id, req.params.documentId);
        return res.status(200).json(new ApiResponse(200, result, result.message));
    }));

    app.post(`${BASE}/submit`, verifyJWT, authorizeRoles("agent"), asyncHandler(async (req, res) => {
        const result = await agentVerificationService.submit(req.user.id);
        return res.status(200).json(new ApiResponse(200, result, "Agent verification submitted for review"));
    }));

    app.get(`${BASE}/documents/:documentId/download`, verifyJWT, asyncHandler(async (req, res) => {
        const isAdmin = req.user.permissions?.includes("agent_verification.review");
        const result = await agentVerificationService.createDocumentDownloadUrl(req.user.id, req.params.documentId, isAdmin);
        return res.status(200).json(new ApiResponse(200, result, "Signed agent document URL created"));
    }));

    app.get(ADMIN_BASE, verifyJWT, requirePermission("agent_verification.review"), asyncHandler(async (_req, res) => {
        const result = await agentVerificationService.listForReview();
        return res.status(200).json(new ApiResponse(200, result, "Agent verifications fetched"));
    }));

    app.patch(`${ADMIN_BASE}/:verificationId/review`, verifyJWT, requirePermission("agent_verification.review"), validate(agentReviewSchema), asyncHandler(async (req, res) => {
        const result = await agentVerificationService.review(req.params.verificationId, req.user.id, req.body.status, req.body.rejectionReason);
        return res.status(200).json(new ApiResponse(200, result, "Agent verification reviewed"));
    }));

    // NEW: Get single agent verification by ID with property listings
    app.get(`${ADMIN_BASE}/:verificationId`, verifyJWT, requirePermission("agent_verification.review"), asyncHandler(async (req, res) => {
        const result = await agentVerificationService.getByIdWithListings(req.params.verificationId);
        return res.status(200).json(new ApiResponse(200, result, "Agent verification details fetched"));
    }));
};

module.exports = agentVerificationRequestHandler;
