const purchaseApplicationService = require("../services/purchaseApplication.service");
const asyncHandler = require("../middlewares/asyncHandler.middleware");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");
const prisma = require("../config/prisma.client");
const verifyJWT = require("../middlewares/auth.middleware");
const { authorizeRoles } = require("../middlewares/rbac.middleware");
const validate = require("../middlewares/validate.middleware");
const purchaseApplicationValidation = require("../validations/purchaseApplication.validation");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// ══════════════════════════════════════════════════════════════════════════
// MULTER CONFIGURATION FOR DOCUMENT UPLOAD
// ══════════════════════════════════════════════════════════════════════════

const uploadDir = path.join(__dirname, "../../private_uploads/purchase_documents");

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, uploadDir);
    },
    filename: (_req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, uniqueSuffix + "-" + file.originalname);
    },
});

const documentUpload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024, files: 10 },
    fileFilter: (_req, file, cb) => {
        const allowedMimeTypes = ["application/pdf", "image/jpeg", "image/png", "image/jpg"];
        if (allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Only PDF, JPG, and PNG files are allowed"));
        }
    },
});

// ── SUBMIT APPLICATION ────────────────────────────────────────────────────

const submitApplication = asyncHandler(async (req, res) => {
    const result = await purchaseApplicationService.submitApplication(
        req.user.id,
        req.body
    );

    res.status(201).json({
        success: true,
        data: result.application,
        message: result.message,
    });
});

// ── GET APPLICATION BY ID ─────────────────────────────────────────────────

const getApplicationById = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const application = await purchaseApplicationService.getApplicationById(
        id,
        req.user.id,
        req.user.role
    );

    res.status(200).json({
        success: true,
        data: application,
        message: "Application retrieved successfully",
    });
});

// ── GET ALL APPLICATIONS ──────────────────────────────────────────────────

const getAllApplications = asyncHandler(async (req, res) => {
    const filters = {
        status: req.query.status,
        listingId: req.query.listingId,
        applicantId: req.query.applicantId,
        limit: req.query.limit,
        skip: req.query.skip,
    };

    const result = await purchaseApplicationService.getAllApplications(
        filters,
        req.user.id,
        req.user.role
    );

    res.status(200).json({
        success: true,
        data: result.applications,
        pagination: result.pagination,
        message: "Applications retrieved successfully",
    });
});

// ── GET MY APPLICATIONS ───────────────────────────────────────────────────

const getMyApplications = asyncHandler(async (req, res) => {
    const filters = {
        status: req.query.status,
        limit: req.query.limit || 20,
        skip: req.query.skip || 0,
    };

    const result = await purchaseApplicationService.getAllApplications(
        filters,
        req.user.id,
        req.user.role
    );

    res.status(200).json({
        success: true,
        data: result.applications,
        pagination: result.pagination,
        message: "Your applications retrieved successfully",
    });
});

// ── UPDATE APPLICATION ────────────────────────────────────────────────────

const updateApplication = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await purchaseApplicationService.updateApplication(
        id,
        req.body,
        req.user.id
    );

    res.status(200).json({
        success: true,
        data: result.application,
        message: result.message,
    });
});

// ── WITHDRAW APPLICATION ──────────────────────────────────────────────────

const withdrawApplication = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await purchaseApplicationService.withdrawApplication(
        id,
        req.user.id
    );

    res.status(200).json({
        success: true,
        message: result.message,
    });
});

// ── REACTIVATE WITHDRAWN APPLICATION ───────────────────────────────────

const reactivateApplication = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await purchaseApplicationService.reactivateApplication(
        id,
        req.user.id
    );

    res.status(200).json({
        success: true,
        data: result.application,
        message: result.message,
    });
});

// ── REVIEW APPLICATION (Admin/Landlord) ───────────────────────────────────

const reviewApplication = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await purchaseApplicationService.reviewApplication(
        id,
        req.body,
        req.user.id
    );

    res.status(200).json({
        success: true,
        data: result.application,
        message: result.message,
    });
});

// ── OWNER REVIEW APPLICATION (Property Owner Only) ────────────────────────

const ownerReviewApplication = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await purchaseApplicationService.ownerReviewApplication(
        id,
        req.user.id
    );

    res.status(200).json({
        success: true,
        data: result.application,
        message: result.message,
    });
});

// ── APPROVE & CREATE AGREEMENT (Admin) ────────────────────────────────────

const approveAndCreateAgreement = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await purchaseApplicationService.approveAndCreateAgreement(
        id,
        req.body,
        req.user.id
    );

    res.status(200).json({
        success: true,
        data: {
            application: result.application,
            agreement: result.agreement,
        },
        message: result.message,
    });
});

// ── UPLOAD DOCUMENTS ──────────────────────────────────────────────────────

const uploadDocuments = asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    if (!req.files || req.files.length === 0) {
        throw new ApiError(400, "No files uploaded");
    }

    // Verify application exists and user owns it
    const application = await purchaseApplicationService.getApplicationById(
        id,
        req.user.id,
        req.user.role
    );

    if (application.applicantId !== req.user.id) {
        throw new ApiError(403, "You can only upload documents to your own applications");
    }

    // Create document records
    const documents = await Promise.all(
        req.files.map(async (file) => {
            return await prisma.purchaseApplicationDocument.create({
                data: {
                    applicationId: id,
                    documentType: req.body.documentType || "identity_card",
                    storageKey: file.path,
                    fileName: file.originalname,
                    fileSize: file.size,
                    mimeType: file.mimetype,
                },
            });
        })
    );

    res.status(200).json({
        success: true,
        data: documents,
        message: "Documents uploaded successfully",
    });
});

// ── DELETE DOCUMENT ───────────────────────────────────────────────────────

const deleteDocument = asyncHandler(async (req, res) => {
    const { applicationId, documentId } = req.params;

    // Verify ownership
    const application = await purchaseApplicationService.getApplicationById(
        applicationId,
        req.user.id,
        req.user.role
    );

    if (application.applicantId !== req.user.id && !["super_admin", "admin"].includes(req.user.role)) {
        throw new ApiError(403, "You don't have permission to delete this document");
    }

    await prisma.purchaseApplicationDocument.delete({
        where: { id: documentId },
    });

    res.status(200).json({
        success: true,
        message: "Document deleted successfully",
    });
});

// ══════════════════════════════════════════════════════════════════════════
// REQUEST HANDLER - REGISTER ROUTES
// ══════════════════════════════════════════════════════════════════════════

const purchaseApplicationRequestHandler = (app) => {
    const BASE_PATH = "/api/v1/purchase-applications";

    // ── PUBLIC / BUYER ROUTES ─────────────────────────────────────────────

    // Submit new purchase application
    app.post(
        `${BASE_PATH}/submit`,
        verifyJWT,
        authorizeRoles("buyer", "agent"),
        validate(purchaseApplicationValidation.submitApplicationSchema),
        submitApplication
    );

    // Get my applications
    app.get(
        `${BASE_PATH}/my-applications`,
        verifyJWT,
        authorizeRoles("buyer", "agent"),
        getMyApplications
    );

    // Get application by ID
    app.get(
        `${BASE_PATH}/:id`,
        verifyJWT,
        getApplicationById
    );

    // Update application
    app.put(
        `${BASE_PATH}/:id`,
        verifyJWT,
        authorizeRoles("buyer", "agent"),
        validate(purchaseApplicationValidation.updateApplicationSchema),
        updateApplication
    );

    // Withdraw application
    app.post(
        `${BASE_PATH}/:id/withdraw`,
        verifyJWT,
        authorizeRoles("buyer", "agent"),
        withdrawApplication
    );

    // Reactivate withdrawn application
    app.post(
        `${BASE_PATH}/:id/reactivate`,
        verifyJWT,
        authorizeRoles("buyer", "agent"),
        reactivateApplication
    );

    // Upload documents
    app.post(
        `${BASE_PATH}/:id/documents`,
        verifyJWT,
        authorizeRoles("buyer", "agent"),
        documentUpload.array("documents", 10),
        uploadDocuments
    );

    // Delete document
    app.delete(
        `${BASE_PATH}/:applicationId/documents/:documentId`,
        verifyJWT,
        deleteDocument
    );

    // ── ADMIN / LANDLORD ROUTES ───────────────────────────────────────────

    // Get all applications (admin/seller view)
    app.get(
        BASE_PATH,
        verifyJWT,
        authorizeRoles("super_admin", "admin", "seller", "agent"),
        getAllApplications
    );

    // Review application
    app.post(
        `${BASE_PATH}/:id/review`,
        verifyJWT,
        authorizeRoles("super_admin", "admin", "seller"),
        validate(purchaseApplicationValidation.reviewApplicationSchema),
        reviewApplication
    );

    // Owner review application (property owner only - auto-marks for approval)
    app.post(
        `${BASE_PATH}/:id/owner-review`,
        verifyJWT,
        ownerReviewApplication
    );

    // Approve and create agreement
    app.post(
        `${BASE_PATH}/:id/approve`,
        verifyJWT,
        authorizeRoles("super_admin", "admin"),
        validate(purchaseApplicationValidation.approveApplicationSchema),
        approveAndCreateAgreement
    );
};

module.exports = purchaseApplicationRequestHandler;
