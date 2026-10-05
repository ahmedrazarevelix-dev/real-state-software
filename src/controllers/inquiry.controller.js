const asyncHandler = require("../middlewares/asyncHandler.middleware");
const verifyJWT = require("../middlewares/auth.middleware");
const { authorizeRoles } = require("../middlewares/rbac.middleware");
const requireProfileComplete = require("../middlewares/profileComplete.middleware");
const validate = require("../middlewares/validate.middleware");
const ApiResponse = require("../utils/ApiResponse");
const inquiryService = require("../services/inquiry.service");
const { createInquirySchema, updateInquiryStatusSchema } = require("../validations/inquiry.validation");

const BASE = "/api/v1/inquiries";

const inquiryRequestHandler = (app) => {
    app.post(
        `${BASE}/listings/:listingId`,
        verifyJWT,
        requireProfileComplete,
        authorizeRoles("buyer", "agent", "super_admin", "tenant", "admin", "seller"),
        validate(createInquirySchema),
        asyncHandler(async (req, res) => {
            const inquiry = await inquiryService.createInquiry(
                req.params.listingId,
                req.user.id,
                req.body,
                req.user
            );
            return res.status(201).json(new ApiResponse(201, inquiry, "Inquiry sent to the agent"));
        })
    );

    app.get(
        `${BASE}/received`,
        verifyJWT,
        authorizeRoles("agent", "buyer", "super_admin"),
        asyncHandler(async (req, res) => {
            const inquiries = await inquiryService.getInquiriesForMyListings(req.user.id);
            return res.status(200).json(new ApiResponse(200, inquiries, "Listing inquiries fetched"));
        })
    );

    app.get(
        `${BASE}/mine`,
        verifyJWT,
        asyncHandler(async (req, res) => {
            const inquiries = await inquiryService.getMyInquiries(req.user.id);
            return res.status(200).json(new ApiResponse(200, inquiries, "Your inquiries fetched"));
        })
    );

    app.patch(
        `${BASE}/:id/status`,
        verifyJWT,
        authorizeRoles("agent", "buyer", "super_admin", "tenant", "admin", "seller"),
        validate(updateInquiryStatusSchema),
        asyncHandler(async (req, res) => {
            const inquiry = await inquiryService.updateInquiryStatus(
                req.params.id,
                req.body.status,
                req.user.role,
                req.user.id
            );
            const message = inquiry.message || `Inquiry status updated to ${inquiry.status}`;
            return res.status(200).json(new ApiResponse(200, inquiry, message));
        })
    );
};

module.exports = inquiryRequestHandler;
