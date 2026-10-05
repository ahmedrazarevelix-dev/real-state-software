const asyncHandler = require("../middlewares/asyncHandler.middleware");
const verifyJWT = require("../middlewares/auth.middleware");
const validate = require("../middlewares/validate.middleware");
const ApiResponse = require("../utils/ApiResponse");
const ApiError = require("../utils/ApiError");
const profileService = require("../services/profile.service");
const {
    updateProfileSchema,
    updateEmailSchema,
    verifyEmailUpdateSchema,
    changePasswordSchema,
} = require("../validations/profile.validation");

const BASE = "/api/v1/profile";

const profileRequestHandler = (app) => {

    // ═══════════════════════════════════════════════════════════════════════════
    //  ALL PROFILE ROUTES ARE PROTECTED — valid Bearer token required
    // ═══════════════════════════════════════════════════════════════════════════

    // ── GET CURRENT USER PROFILE ──────────────────────────────────────────────
    // Already exists in auth.controller as /api/v1/auth/me
    // This is an alias for consistency
    app.get(
        `${BASE}`,
        verifyJWT,
        asyncHandler(async (req, res) => {
            const user = await profileService.getUserProfile(req.user.id);
            return res
                .status(200)
                .json(new ApiResponse(200, user, "Profile fetched successfully"));
        })
    );

    // ── UPDATE PROFILE (name, phone) ──────────────────────────────────────────
    app.patch(
        `${BASE}`,
        verifyJWT,
        validate(updateProfileSchema),
        asyncHandler(async (req, res) => {
            const { user, message } = await profileService.updateProfile(req.user.id, req.body);
            return res
                .status(200)
                .json(new ApiResponse(200, user, message));
        })
    );

    // ── REQUEST EMAIL UPDATE (send OTP to new email) ──────────────────────────
    app.post(
        `${BASE}/request-email-update`,
        verifyJWT,
        validate(updateEmailSchema),
        asyncHandler(async (req, res) => {
            const { message } = await profileService.requestEmailUpdate(req.user.id, req.body);
            return res
                .status(200)
                .json(new ApiResponse(200, null, message));
        })
    );

    // ── VERIFY EMAIL UPDATE (confirm with OTP) ────────────────────────────────
    app.post(
        `${BASE}/verify-email-update`,
        verifyJWT,
        validate(verifyEmailUpdateSchema),
        asyncHandler(async (req, res) => {
            const { user, message } = await profileService.verifyEmailUpdate(req.user.id, req.body);
            return res
                .status(200)
                .json(new ApiResponse(200, user, message));
        })
    );

    // ── CHANGE PASSWORD ───────────────────────────────────────────────────────
    // Note: Already exists at /api/v1/auth/change-password
    // This is an alias for better organization
    app.post(
        `${BASE}/change-password`,
        verifyJWT,
        validate(changePasswordSchema),
        asyncHandler(async (req, res) => {
            const { message } = await profileService.changePassword(req.user.id, req.body);
            return res
                .status(200)
                .json(new ApiResponse(200, null, message));
        })
    );

    // ── GET USER STATISTICS (dashboard data) ──────────────────────────────────
    app.get(
        `${BASE}/statistics`,
        verifyJWT,
        asyncHandler(async (req, res) => {
            const stats = await profileService.getUserStatistics(req.user.id);
            return res
                .status(200)
                .json(new ApiResponse(200, stats, "Statistics fetched successfully"));
        })
    );

    // ── GET USER BY ID (admin/super_admin only) ───────────────────────────────
    app.get(
        `${BASE}/:userId`,
        verifyJWT,
        asyncHandler(async (req, res) => {
            const { userId } = req.params;

            // Only allow viewing own profile or if user is admin/super_admin
            if (req.user.id !== userId && req.user.role !== "super_admin") {
                throw new ApiError(403, "You can only view your own profile");
            }

            const user = await profileService.getUserProfile(userId);
            return res
                .status(200)
                .json(new ApiResponse(200, user, "Profile fetched successfully"));
        })
    );
};

module.exports = profileRequestHandler;
