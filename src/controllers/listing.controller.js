const asyncHandler = require("../middlewares/asyncHandler.middleware");
const verifyJWT = require("../middlewares/auth.middleware");
const { authorizeRoles } = require("../middlewares/rbac.middleware");
const requireProfileComplete = require("../middlewares/profileComplete.middleware");
const requireApprovedSeller = require("../middlewares/sellerVerification.middleware");
const requireApprovedAgent = require("../middlewares/agentVerification.middleware");
const checkListingLimit = require("../middlewares/checkListingLimit.middleware");
const documentUpload = require("../middlewares/documentUpload.middleware");
const { requirePermission } = require("../middlewares/rbac.middleware");
const validate = require("../middlewares/validate.middleware");
const ApiResponse = require("../utils/ApiResponse");
const listingService = require("../services/listing.service");
const { createListingSchema, updateListingSchema } = require("../validations/listing.validation");
const { propertyDocumentSchema, listingReviewSchema } = require("../validations/propertyDocument.validation");

const BASE = "/api/v1/listings";

const listingRequestHandler = (app) => {
    app.get(
        BASE,
        asyncHandler(async (req, res) => {
            const result = await listingService.searchListings(req.query);
            return res.status(200).json(new ApiResponse(200, result, "Listings fetched successfully"));
        })
    );

    app.get(
        `${BASE}/mine`,
        verifyJWT,
        asyncHandler(async (req, res) => {
            const listings = await listingService.getMyListings(req.user.id);
            return res.status(200).json(new ApiResponse(200, listings, "Your listings fetched successfully"));
        })
    );

    app.get(
        `${BASE}/review-queue`,
        verifyJWT,
        requirePermission("listings.approve"),
        asyncHandler(async (_req, res) => {
            const listings = await listingService.listForReview();
            return res.status(200).json(new ApiResponse(200, listings, "Listing review queue fetched"));
        })
    );

    app.get(
        `${BASE}/:id`,
        asyncHandler(async (req, res) => {
            // Optional authentication - if token present, verify and get user ID
            let requesterId = null;
            const authHeader = req.header("Authorization");
            
            if (authHeader && authHeader.startsWith("Bearer ")) {
                try {
                    const token = authHeader.replace("Bearer ", "");
                    const jwt = require("jsonwebtoken");
                    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
                    requesterId = decoded.id;
                } catch (error) {
                    // Invalid token - continue as guest
                    requesterId = null;
                }
            }
            
            const listing = await listingService.getListingById(req.params.id, true, requesterId);
            return res.status(200).json(new ApiResponse(200, listing, "Listing fetched successfully"));
        })
    );

    app.post(
        BASE,
        verifyJWT,
        requireProfileComplete,
        // requireApprovedSeller,  // Removed - allow draft creation
        // requireApprovedAgent,   // Removed - allow draft creation
        authorizeRoles("super_admin", "admin", "agent", "seller"),
        checkListingLimit,  // Check if user can create more listings
        validate(createListingSchema),
        asyncHandler(async (req, res) => {
            const listing = await listingService.createListing(req.body, req.user.id, req.user.role);
            return res.status(201).json(new ApiResponse(201, listing, "Listing published successfully"));
        })
    );

    app.patch(
        `${BASE}/:id`,
        verifyJWT,
        requireProfileComplete,
        authorizeRoles("super_admin", "admin", "agent", "seller"),
        validate(updateListingSchema),
        asyncHandler(async (req, res) => {
            const listing = await listingService.updateListing(
                req.params.id,
                req.body,
                req.user.role,
                req.user.id
            );
            return res.status(200).json(new ApiResponse(200, listing, "Listing updated successfully"));
        })
    );

    app.delete(
        `${BASE}/:id`,
        verifyJWT,
        authorizeRoles("super_admin", "admin", "agent", "seller"),
        asyncHandler(async (req, res) => {
            const listing = await listingService.withdrawListing(req.params.id, req.user.role, req.user.id);
            return res.status(200).json(new ApiResponse(200, listing, "Listing withdrawn successfully"));
        })
    );

    app.post(
        `${BASE}/:id/documents`,
        verifyJWT,
        requireProfileComplete,
        authorizeRoles("super_admin", "admin", "agent", "seller"),
        documentUpload.single("document"),
        validate(propertyDocumentSchema),
        asyncHandler(async (req, res) => {
            const document = await listingService.uploadPropertyDocument(
                req.params.id,
                req.user.id,
                req.body.documentType,
                req.file
            );
            return res.status(201).json(new ApiResponse(201, document, "Property document uploaded"));
        })
    );

    app.delete(
        `${BASE}/:id/documents/:documentId`,
        verifyJWT,
        authorizeRoles("super_admin", "admin", "agent", "seller"),
        asyncHandler(async (req, res) => {
            const result = await listingService.removePropertyDocument(req.params.id, req.user.id, req.params.documentId);
            return res.status(200).json(new ApiResponse(200, result, result.message));
        })
    );

    app.get(
        `${BASE}/:id/documents/:documentId/download`,
        verifyJWT,
        asyncHandler(async (req, res) => {
            const isAdmin = req.user.permissions?.includes("listings.approve");
            const result = await listingService.createPropertyDocumentDownloadUrl(
                req.params.id,
                req.params.documentId,
                req.user.id,
                isAdmin
            );
            return res.status(200).json(new ApiResponse(200, result, "Signed document URL created"));
        })
    );

    app.post(
        `${BASE}/:id/submit-review`,
        verifyJWT,
        requireProfileComplete,
        requireApprovedSeller,  // Check verification when submitting
        requireApprovedAgent,   // Check verification when submitting
        authorizeRoles("super_admin", "admin", "agent", "seller"),
        asyncHandler(async (req, res) => {
            const listing = await listingService.submitForReview(req.params.id, req.user.id, req.user.role);
            return res.status(200).json(new ApiResponse(200, listing, "Listing submitted for review"));
        })
    );

    app.patch(
        `${BASE}/:id/review`,
        verifyJWT,
        requirePermission("listings.approve"),
        validate(listingReviewSchema),
        asyncHandler(async (req, res) => {
            const listing = await listingService.reviewListing(
                req.params.id,
                req.user.id,
                req.body.status,
                req.body.rejectionReason
            );
            return res.status(200).json(new ApiResponse(200, listing, "Listing review completed"));
        })
    );

    app.post(
        `${BASE}/:id/publish`,
        verifyJWT,
        authorizeRoles("super_admin", "admin", "agent", "seller"),
        asyncHandler(async (req, res) => {
            const listing = await listingService.publishListing(
                req.params.id,
                req.user.id,
                req.user.role,
                req.user.id
            );
            return res.status(200).json(new ApiResponse(200, listing, "Listing published successfully"));
        })
    );
};

module.exports = listingRequestHandler;
