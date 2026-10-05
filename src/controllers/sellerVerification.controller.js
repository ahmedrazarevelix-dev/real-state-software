const asyncHandler = require("../middlewares/asyncHandler.middleware");
const verifyJWT = require("../middlewares/auth.middleware");
const { authorizeRoles, requirePermission } = require("../middlewares/rbac.middleware");
const validate = require("../middlewares/validate.middleware");
const ApiResponse = require("../utils/ApiResponse");
const sellerVerificationService = require("../services/sellerVerification.service");
const documentUpload = require("../middlewares/documentUpload.middleware");
const { createVerificationSchema, documentSchema, reviewSchema } = require("../validations/sellerVerification.validation");

const BASE = "/api/v1/seller-verification";
const ADMIN_BASE = "/api/v1/admin/seller-verifications";

const sellerVerificationRequestHandler = (app) => {
    app.post(
        BASE,
        verifyJWT,
        authorizeRoles("seller"),
        validate(createVerificationSchema),
        asyncHandler(async (req, res) => {
            const result = await sellerVerificationService.createOrUpdate(req.user.id, req.body.sellerType);
            return res.status(200).json(new ApiResponse(200, result, "Seller verification draft saved"));
        })
    );

    app.get(
        `${BASE}/me`,
        verifyJWT,
        authorizeRoles("seller"),
        asyncHandler(async (req, res) => {
            const result = await sellerVerificationService.getMine(req.user.id);
            return res.status(200).json(new ApiResponse(200, result, "Seller verification fetched"));
        })
    );

    app.post(
        `${BASE}/documents`,
        verifyJWT,
        authorizeRoles("seller"),
        documentUpload.single("document"),
        validate(documentSchema),
        asyncHandler(async (req, res) => {
            const result = await sellerVerificationService.uploadDocument(req.user.id, req.body.documentType, req.file);
            return res.status(201).json(new ApiResponse(201, result, "Verification document uploaded"));
        })
    );

    app.delete(
        `${BASE}/documents/:documentId`,
        verifyJWT,
        authorizeRoles("seller"),
        asyncHandler(async (req, res) => {
            const result = await sellerVerificationService.removeDocument(req.user.id, req.params.documentId);
            return res.status(200).json(new ApiResponse(200, result, result.message));
        })
    );

    app.get(
        `${BASE}/documents/:documentId/download`,
        verifyJWT,
        asyncHandler(async (req, res) => {
            const isAdmin = req.user.permissions?.includes("seller_verification.review");
            const result = await sellerVerificationService.createDocumentDownloadUrl(
                req.user.id,
                req.params.documentId,
                isAdmin
            );
            return res.status(200).json(new ApiResponse(200, result, "Signed document URL created"));
        })
    );

    app.post(
        `${BASE}/submit`,
        verifyJWT,
        authorizeRoles("seller"),
        asyncHandler(async (req, res) => {
            const result = await sellerVerificationService.submit(req.user.id);
            return res.status(200).json(new ApiResponse(200, result, "Seller verification submitted for review"));
        })
    );

    app.get(
        ADMIN_BASE,
        verifyJWT,
        requirePermission("seller_verification.review"),
        asyncHandler(async (_req, res) => {
            const result = await sellerVerificationService.listForReview();
            return res.status(200).json(new ApiResponse(200, result, "Seller verifications fetched"));
        })
    );

    app.patch(
        `${ADMIN_BASE}/:verificationId/review`,
        verifyJWT,
        requirePermission("seller_verification.review"),
        validate(reviewSchema),
        asyncHandler(async (req, res) => {
            const result = await sellerVerificationService.review(
                req.params.verificationId,
                req.user.id,
                req.body.status,
                req.body.rejectionReason
            );
            return res.status(200).json(new ApiResponse(200, result, "Seller verification reviewed"));
        })
    );

    // NEW: Get single seller verification by ID with property listings
    app.get(
        `${ADMIN_BASE}/:verificationId`,
        verifyJWT,
        requirePermission("seller_verification.review"),
        asyncHandler(async (req, res) => {
            const result = await sellerVerificationService.getByIdWithListings(req.params.verificationId);
            return res.status(200).json(new ApiResponse(200, result, "Seller verification details fetched"));
        })
    );
};

module.exports = sellerVerificationRequestHandler;
