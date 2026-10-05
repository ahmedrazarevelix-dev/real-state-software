const asyncHandler = require("../middlewares/asyncHandler.middleware");
const verifyJWT = require("../middlewares/auth.middleware");
const validate = require("../middlewares/validate.middleware");
const { authLimiter, otpLimiter } = require("../middlewares/rateLimiter.middleware");
const ApiResponse = require("../utils/ApiResponse");
const ApiError = require("../utils/ApiError");
const authService = require("../services/auth.service");
const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma.client");
const {
    registerSchema,
    verifyOtpSchema,
    resendOtpSchema,
    loginSchema,
    refreshTokenSchema,
    forgotPasswordSchema,
    verifyResetOtpSchema,
    resetPasswordSchema,
    changePasswordSchema,
    assignRoleSchema,
    registerAdminSchema,
} = require("../validations/auth.validation");

const BASE = "/api/v1/auth";

const authRequestHandler = (app) => {

    // ═══════════════════════════════════════════════════════════════════════════
    //  PUBLIC ROUTES — no token required
    // ═══════════════════════════════════════════════════════════════════════════

    // ── REGISTER ──────────────────────────────────────────────────────────────
    // Rate: 10 attempts / 15 min
    // PUBLIC ROUTE - Self-registration allowed for 'buyer', 'agent', and 'seller' roles
    // Admin roles (super_admin, admin) must use hidden /register-admin endpoint
    // Tenant role assigned by admin after application approval
    app.post(
        `${BASE}/register`,
        authLimiter,
        validate(registerSchema),
        asyncHandler(async (req, res) => {
            // Additional security check (already validated in Joi schema)
            const { roleName } = req.body;
            
            // Block privileged roles from self-registration
            const privilegedRoles = ["super_admin", "admin", "tenant"];
            if (privilegedRoles.includes(roleName)) {
                throw new ApiError(
                    403, 
                    `Self-registration not allowed for '${roleName}' role. Contact administrator.`
                );
            }

            const { user, message } = await authService.registerUser(req.body);
            return res.status(201).json(new ApiResponse(201, user, message));
        })
    );

    // ── VERIFY OTP (registration) ─────────────────────────────────────────────
    // Rate: 5 attempts / 15 min
    app.post(
        `${BASE}/verify-otp`,
        otpLimiter,
        validate(verifyOtpSchema),
        asyncHandler(async (req, res) => {
            const { message } = await authService.verifyOtp(req.body);
            return res.status(200).json(new ApiResponse(200, null, message));
        })
    );

    // ── RESEND OTP ────────────────────────────────────────────────────────────
    app.post(
        `${BASE}/resend-otp`,
        otpLimiter,
        validate(resendOtpSchema),
        asyncHandler(async (req, res) => {
            const { message } = await authService.resendOtp(req.body);
            return res.status(200).json(new ApiResponse(200, null, message));
        })
    );

    // ── LOGIN ─────────────────────────────────────────────────────────────────
    // Rate: 10 attempts / 15 min
    app.post(
        `${BASE}/login`,
        authLimiter,
        validate(loginSchema),
        asyncHandler(async (req, res) => {
            const { user, accessToken, refreshToken } = await authService.loginUser(req.body);
            // Role is already included in user object, no need to send separately
            return res
                .status(200)
                .json(new ApiResponse(200, { user, accessToken, refreshToken }, "Login successful"));
        })
    );

    // ── REFRESH TOKEN ─────────────────────────────────────────────────────────
    app.post(
        `${BASE}/refresh-token`,
        validate(refreshTokenSchema),
        asyncHandler(async (req, res) => {
            const { accessToken, refreshToken } = await authService.refreshToken(req.body);
            return res
                .status(200)
                .json(new ApiResponse(200, { accessToken, refreshToken }, "Access token refreshed"));
        })
    );

    // ── FORGOT PASSWORD ───────────────────────────────────────────────────────
    app.post(
        `${BASE}/forgot-password`,
        otpLimiter,
        validate(forgotPasswordSchema),
        asyncHandler(async (req, res) => {
            const { message } = await authService.forgotPassword(req.body);
            return res.status(200).json(new ApiResponse(200, null, message));
        })
    );

    // ── VERIFY RESET OTP ──────────────────────────────────────────────────────
    app.post(
        `${BASE}/verify-reset-otp`,
        otpLimiter,
        validate(verifyResetOtpSchema),
        asyncHandler(async (req, res) => {
            const { message } = await authService.verifyResetOtp(req.body);
            return res.status(200).json(new ApiResponse(200, null, message));
        })
    );

    // ── RESEND RESET OTP ──────────────────────────────────────────────────────
    app.post(
        `${BASE}/resend-reset-otp`,
        otpLimiter,
        validate(resendOtpSchema),
        asyncHandler(async (req, res) => {
            const { message } = await authService.resendResetOtp(req.body);
            return res.status(200).json(new ApiResponse(200, null, message));
        })
    );

    // ── RESET PASSWORD ────────────────────────────────────────────────────────
    app.post(
        `${BASE}/reset-password`,
        otpLimiter,
        validate(resetPasswordSchema),
        asyncHandler(async (req, res) => {
            const { message } = await authService.resetPassword(req.body);
            return res.status(200).json(new ApiResponse(200, null, message));
        })
    );

    // ═══════════════════════════════════════════════════════════════════════════
    //  SPECIAL ADMIN REGISTRATION ENDPOINT (Hidden/Invisible)
    //  🔐 Protected by environment variable + role-specific invite codes
    //  📌 Use this ONLY for first super_admin/admin creation
    //  ⚠️  Set ALLOW_ADMIN_REGISTRATION=false in production after setup
    //  🛡️  SECURITY: Each role requires its own invite code (prevents privilege escalation)
    //  🔒  LIMIT: Only 1 super_admin and 1 admin allowed (production-ready)
    // ═══════════════════════════════════════════════════════════════════════════
    
    app.post(
        `${BASE}/register-admin`,
        authLimiter,
        validate(registerAdminSchema),
        asyncHandler(async (req, res) => {
            // Check if admin registration is enabled
            const isEnabled = process.env.ALLOW_ADMIN_REGISTRATION === 'true';
            
            if (!isEnabled) {
                throw new ApiError(
                    403, 
                    "Admin registration is currently disabled. Contact system administrator."
                );
            }

            const { inviteCode, roleName } = req.body;

            // CRITICAL: Check if role already exists (1 super_admin + 1 admin limit)
            const existingRoleUser = await prisma.user.findFirst({
                where: {
                    userRole: {
                        role: {
                            roleName: roleName
                        }
                    }
                },
                include: {
                    userRole: {
                        include: {
                            role: true
                        }
                    }
                }
            });

            if (existingRoleUser) {
                throw new ApiError(
                    409, 
                    `A ${roleName} account already exists. Only one ${roleName} is allowed in the system.`
                );
            }

            // CRITICAL SECURITY: Role-specific invite code validation
            // This prevents privilege escalation (admin cannot become super_admin)
            let validInviteCode;
            if (roleName === 'super_admin') {
                validInviteCode = process.env.SUPER_ADMIN_INVITE_CODE;
            } else if (roleName === 'admin') {
                validInviteCode = process.env.ADMIN_INVITE_CODE;
            }

            if (!validInviteCode || inviteCode !== validInviteCode) {
                throw new ApiError(
                    401, 
                    `Invalid invite code for ${roleName} role. Each role requires its specific invite code.`
                );
            }

            // Register with admin/super_admin role
            const { user, message } = await authService.registerUser(req.body, null);
            
            return res.status(201).json(
                new ApiResponse(
                    201, 
                    user, 
                    `${message} This is the only ${roleName} account. Remember to set ALLOW_ADMIN_REGISTRATION=false.`
                )
            );
        })
    );

    // ═══════════════════════════════════════════════════════════════════════════
    //  PROTECTED ROUTES — valid Bearer token required (verifyJWT runs first)
    //  Without a token → 401 Unauthorized
    // ═══════════════════════════════════════════════════════════════════════════

    // ── GET CURRENT USER PROFILE ──────────────────────────────────────────────
    app.get(
        `${BASE}/me`,
        verifyJWT,
        asyncHandler(async (req, res) => {
            // req.user already attached by verifyJWT — no extra DB call needed
            return res.status(200).json(new ApiResponse(200, req.user, "Profile fetched successfully"));
        })
    );

    // ── LOGOUT ────────────────────────────────────────────────────────────────
    app.post(
        `${BASE}/logout`,
        verifyJWT,
        asyncHandler(async (req, res) => {
            const { message } = await authService.logoutUser(req.user.id);
            return res.status(200).json(new ApiResponse(200, null, message));
        })
    );

    // ── CHANGE PASSWORD ───────────────────────────────────────────────────────
    app.post(
        `${BASE}/change-password`,
        verifyJWT,
        validate(changePasswordSchema),
        asyncHandler(async (req, res) => {
            const { message } = await authService.changePassword(req.user.id, req.body);
            return res.status(200).json(new ApiResponse(200, null, message));
        })
    );

    // ── DELETE ACCOUNT ────────────────────────────────────────────────────────
    app.delete(
        `${BASE}/me`,
        verifyJWT,
        asyncHandler(async (req, res) => {
            const { message } = await authService.deleteAccount(req.user.id);
            return res.status(200).json(new ApiResponse(200, null, message));
        })
    );

    // ═══════════════════════════════════════════════════════════════════════════
    //  ROLE MANAGEMENT ROUTES — super_admin / admin only
    // ═══════════════════════════════════════════════════════════════════════════

    // ── ASSIGN ROLE TO USER ───────────────────────────────────────────────────
    app.post(
        `${BASE}/assign-role`,
        verifyJWT,
        validate(assignRoleSchema),
        asyncHandler(async (req, res) => {
            if (req.user.role !== "super_admin") {
                throw new ApiError(403, "Only super_admin can assign roles");
            }

            const result = await authService.assignRole(req.body, req.user.id);
            return res.status(200).json(new ApiResponse(200, result, result.message));
        })
    );

    // ── GET ALL ROLES ─────────────────────────────────────────────────────────
    app.get(
        `${BASE}/roles`,
        verifyJWT,
        asyncHandler(async (req, res) => {
            const { roles } = await authService.getAllRoles();
            return res.status(200).json(new ApiResponse(200, roles, "Roles fetched successfully"));
        })
    );

    // ── GET USER ROLE BY USER ID ──────────────────────────────────────────────
    app.get(
        `${BASE}/user-role/:userId`,
        verifyJWT,
        asyncHandler(async (req, res) => {
            // Only super_admin, admin can view other user roles
            // Or user can view their own role
            if (req.user.id !== req.params.userId && req.user.role !== "super_admin") {
                throw new ApiError(403, "Access denied");
            }

            const userRole = await authService.getUserRole(req.params.userId);
            return res.status(200).json(new ApiResponse(200, userRole, "User role fetched successfully"));
        })
    );

    // ── GET ALL USERS WITH ROLES ──────────────────────────────────────────────
    app.get(
        `${BASE}/users`,
        verifyJWT,
        asyncHandler(async (req, res) => {
            // Only super_admin and admin can view all users
            if (req.user.role !== "super_admin") {
                throw new ApiError(403, "Only super_admin can view all users");
            }

            const { roleName, status, limit, skip } = req.query;
            const result = await authService.getAllUsersWithRoles({ roleName, status, limit, skip });
            return res.status(200).json(new ApiResponse(200, result, "Users fetched successfully"));
        })
    );
};

module.exports = authRequestHandler;

