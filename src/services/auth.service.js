const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const generateOtp = require("../utils/generateOtp.util");
const prisma = require("../config/prisma.client");
const ApiError = require("../utils/ApiError");
const { generateAccessToken, generateRefreshToken } = require("../utils/token.utils");

// ── Email Service: Use Brevo (Production-Ready) ──────────────────────────────
const { sendRegistrationOtp, sendPasswordResetOtp, isBrevoConfigured } = require("../utils/mailer.brevo");
    
const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;
const OTP_EXPIRY_MINUTES = parseInt(process.env.OTP_EXPIRY_MINUTES) || 10;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOGIN_ATTEMPT_LIMIT = parseInt(process.env.LOGIN_ATTEMPT_LIMIT) || 5;
const LOGIN_ATTEMPT_WINDOW_MINUTES = parseInt(process.env.LOGIN_ATTEMPT_WINDOW_MINUTES) || 15;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Strip all sensitive fields before returning user data to the client.
 */
const sanitizeUser = (user) => {
    if (!user) return null;
    const { password, otp, otpExpiry, resetOtp, resetOtpExpiry, refreshToken, userRole, ...safeUser } = user;
    
    // Add role name if available
    if (userRole?.role?.roleName) {
        safeUser.role = userRole.role.roleName;
    }
    
    return safeUser;
};

/**
 * Shared OTP expiry timestamp builder.
 */
const buildOtpExpiry = () =>
    new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

/**
 * Send OTP via Brevo to the recipient email the user submitted.
 */
const sendOtp = async (email, otp, type = "registration") => {
    const expiryMinutes = parseInt(process.env.OTP_EXPIRY_MINUTES) || 10;

    console.log(`[AUTH-SERVICE] Preparing OTP (${type}) for ${email}`);

    if (!isBrevoConfigured()) {
        console.log(`[OTP-FALLBACK] ${type.toUpperCase()} | ${email} -> ${otp} (expires in ${expiryMinutes} min)`);
        return;
    }

    try {
        if (type === "reset") {
            await sendPasswordResetOtp(email, otp);
        } else {
            await sendRegistrationOtp(email, otp);
        }
        console.log(`[AUTH-SERVICE] OTP sent to ${email}`);
    } catch (err) {
        console.error(`[AUTH-SERVICE] Failed to send OTP to ${email}: ${err.message}`);
    }
};

// ---------------------------------------------------------------------------
// AuthService
// ---------------------------------------------------------------------------

class AuthService {

    // ── REGISTER ────────────────────────────────────────────────────────────

    async registerUser(reqBody, assignedBy = null) {
        const { name, email, password, roleName = "buyer" } = reqBody;

        // Allow super_admin/admin registration ONLY if coming from special endpoint
        // Regular registration blocks these roles
        const privilegedRoles = ["super_admin", "admin"];
        const isPrivilegedRole = privilegedRoles.includes(roleName);

        const existingUser = await prisma.user.findUnique({ where: { email } });

        if (existingUser && existingUser.isVerified) {
            throw new ApiError(409, "An account with this email already exists");
        }

        // Verify role exists
        const role = await prisma.role.findUnique({ where: { roleName } });
        if (!role) {
            throw new ApiError(400, `Invalid role: ${roleName}`);
        }

        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
        const otp = generateOtp();
        const otpExpiry = buildOtpExpiry();

        let user;
        if (existingUser && !existingUser.isVerified) {
            // Re-registration: update the existing unverified record
            user = await prisma.user.update({
                where: { email },
                data: { 
                    name, 
                    password: hashedPassword, 
                    otp, 
                    otpExpiry,
                    userRole: {
                        upsert: {
                            create: { roleId: role.id, assignedBy },
                            update: { roleId: role.id, assignedBy }
                        }
                    }
                },
                include: { userRole: { include: { role: true } } }
            });
        } else {
            user = await prisma.user.create({
                data: { 
                    name, 
                    email, 
                    password: hashedPassword, 
                    otp, 
                    otpExpiry,
                    userRole: {
                        create: { roleId: role.id, assignedBy }
                    }
                },
                include: { userRole: { include: { role: true } } }
            });
        }

        await sendOtp(email, otp, "registration");

        const roleLabel = isPrivilegedRole ? ` as ${roleName}` : "";
        return {
            user: sanitizeUser(user),
            message: `Registration successful${roleLabel}. Check your email for the OTP.`,
        };
    }

    // ── VERIFY OTP (registration) ────────────────────────────────────────────

    async verifyOtp(reqBody) {
        const { email, otp } = reqBody;

        const user = await prisma.user.findUnique({ where: { email } });

        if (!user) throw new ApiError(404, "No account found with this email");
        if (user.isVerified) throw new ApiError(400, "Account is already verified");
        if (!user.otp || user.otp !== otp) throw new ApiError(400, "Invalid OTP");
        if (!user.otpExpiry || user.otpExpiry < new Date()) {
            throw new ApiError(400, "OTP has expired — please request a new one");
        }

        await prisma.user.update({
            where: { email },
            data: { isVerified: true, otp: null, otpExpiry: null },
        });

        return { message: "Account verified successfully. You can now log in." };
    }

    // ── RESEND OTP (registration) ────────────────────────────────────────────

    async resendOtp(reqBody) {
        const { email } = reqBody;

        const user = await prisma.user.findUnique({ where: { email } });

        if (!user) throw new ApiError(404, "No account found with this email");
        if (user.isVerified) throw new ApiError(400, "Account is already verified");

        const otp = generateOtp();
        const otpExpiry = buildOtpExpiry();

        await prisma.user.update({ where: { email }, data: { otp, otpExpiry } });

        await sendOtp(email, otp, "registration");

        return { message: "A new OTP has been sent to your email." };
    }

    // ── LOGIN ────────────────────────────────────────────────────────────────

    async loginUser(reqBody) {
        const { email, password, deviceInfo, ipAddress, userAgent } = reqBody;

        const user = await prisma.user.findUnique({ 
            where: { email },
            include: { userRole: { include: { role: true } } }
        });

        const loginWindowStart = new Date(Date.now() - LOGIN_ATTEMPT_WINDOW_MINUTES * 60 * 1000);
        const recentFailedAttempts = await prisma.loginAttempt.count({
            where: {
                email,
                success: false,
                createdAt: { gte: loginWindowStart }
            }
        });

        if (recentFailedAttempts >= LOGIN_ATTEMPT_LIMIT) {
            throw new ApiError(403, "Too many failed login attempts. Please try again later.");
        }

        if (!user || !(await bcrypt.compare(password, user.password))) {
            await prisma.loginAttempt.create({
                data: {
                    email,
                    ipAddress,
                    userAgent,
                    success: false,
                    userId: user?.id || null
                }
            });
            throw new ApiError(401, "Invalid email or password");
        }

        if (!user.isVerified) {
            throw new ApiError(403, "Please verify your email before logging in");
        }

        if (user.status === 'suspended') {
            throw new ApiError(403, "Your account has been suspended. Please contact support.");
        }

        if (user.status === 'pending') {
            throw new ApiError(403, "Your account is pending approval. Please wait for admin approval.");
        }

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);
        const hashedRefreshToken = await bcrypt.hash(refreshToken, SALT_ROUNDS);

        const updatedUser = await prisma.user.update({
            where: { id: user.id },
            data: { refreshToken: hashedRefreshToken },
            include: { userRole: { include: { role: true } } }
        });

        await prisma.userSession.create({
            data: {
                userId: user.id,
                ipAddress: ipAddress || null,
                userAgent: userAgent || null,
                deviceInfo: deviceInfo || null,
                isActive: true,
                lastSeenAt: new Date()
            }
        });

        await prisma.loginAttempt.create({
            data: {
                userId: user.id,
                email,
                ipAddress,
                userAgent,
                success: true
            }
        });

        const roleName = updatedUser.userRole?.role?.roleName || null;

        return { user: sanitizeUser(updatedUser), role: roleName, accessToken, refreshToken };
    }

    // ── REFRESH TOKEN ────────────────────────────────────────────────────────

    async refreshToken(reqBody) {
        const { refreshToken: incomingToken } = reqBody;

        // Explicitly check if token exists and is not empty
        if (!incomingToken || incomingToken.trim() === '') {
            throw new ApiError(400, "Refresh token is required");
        }

        // Additional check for placeholder/invalid patterns
        if (incomingToken.includes('{{') || incomingToken.includes('}}') || incomingToken.length < 20) {
            throw new ApiError(400, "Invalid refresh token format");
        }

        let decoded;
        try {
            decoded = jwt.verify(incomingToken, process.env.REFRESH_TOKEN_SECRET);
        } catch (error) {
            throw new ApiError(401, "Invalid or expired refresh token");
        }

        const user = await prisma.user.findUnique({ where: { id: decoded.id } });
        if (!user || !user.refreshToken) {
            throw new ApiError(401, "Refresh token not recognised — please log in again");
        }

        const isValid = await bcrypt.compare(incomingToken, user.refreshToken);
        if (!isValid) {
            // Possible token reuse — invalidate the stored token as a safety measure
            await prisma.user.update({
                where: { id: user.id },
                data: { refreshToken: null },
            });
            throw new ApiError(401, "Refresh token has already been used or is invalid. Please log in again.");
        }

        // Rotate: issue a brand-new pair
        const accessToken = generateAccessToken(user);
        const newRefreshToken = generateRefreshToken(user);
        const hashedNewRefreshToken = await bcrypt.hash(newRefreshToken, SALT_ROUNDS);

        await prisma.user.update({
            where: { id: user.id },
            data: { refreshToken: hashedNewRefreshToken },
        });

        return { accessToken, refreshToken: newRefreshToken };
    }

    // ── LOGOUT ───────────────────────────────────────────────────────────────

    async logoutUser(userId) {
        await prisma.user.update({
            where: { id: userId },
            data: { refreshToken: null },
        });

        await prisma.userSession.updateMany({
            where: { userId, isActive: true },
            data: { isActive: false, revokedAt: new Date() }
        });

        return { message: "Logged out successfully" };
    }

    // ── FORGOT PASSWORD ──────────────────────────────────────────────────────

    async forgotPassword(reqBody) {
        const { email } = reqBody;

        const user = await prisma.user.findUnique({ where: { email } });

        // Always return a success-like message — prevents user enumeration
        if (!user || !user.isVerified) {
            return { message: "If that email is registered, you will receive a password reset OTP." };
        }

        const resetOtp = generateOtp();
        const resetOtpExpiry = buildOtpExpiry();

        await prisma.user.update({
            where: { email },
            data: { resetOtp, resetOtpExpiry },
        });

        await sendOtp(email, resetOtp, "reset");

        return { message: "If that email is registered, you will receive a password reset OTP." };
    }

    // ── VERIFY RESET OTP ─────────────────────────────────────────────────────

    async verifyResetOtp(reqBody) {
        const { email, otp } = reqBody;

        const user = await prisma.user.findUnique({ where: { email } });

        if (!user || !user.isVerified) throw new ApiError(404, "No verified account found with this email");
        if (!user.resetOtp || user.resetOtp !== otp) throw new ApiError(400, "Invalid OTP");
        if (!user.resetOtpExpiry || user.resetOtpExpiry < new Date()) {
            throw new ApiError(400, "OTP has expired — please request a new one");
        }

        return { message: "OTP verified. You may now reset your password." };
    }

    // ── RESEND RESET OTP (forgot password) ───────────────────────────────────

    async resendResetOtp(reqBody) {
        const { email } = reqBody;

        const user = await prisma.user.findUnique({ where: { email } });

        // Prevent user enumeration - always return success message
        if (!user || !user.isVerified) {
            return { message: "If that email is registered, a new OTP has been sent." };
        }

        const resetOtp = generateOtp();
        const resetOtpExpiry = buildOtpExpiry();

        await prisma.user.update({
            where: { email },
            data: { resetOtp, resetOtpExpiry },
        });

        await sendOtp(email, resetOtp, "reset");

        return { message: "If that email is registered, a new OTP has been sent." };
    }

    // ── RESET PASSWORD ───────────────────────────────────────────────────────

    async resetPassword(reqBody) {
        const { email, otp, newPassword } = reqBody;

        const user = await prisma.user.findUnique({ where: { email } });

        if (!user || !user.isVerified) throw new ApiError(404, "No verified account found with this email");
        if (!user.resetOtp || user.resetOtp !== otp) throw new ApiError(400, "Invalid OTP");
        if (!user.resetOtpExpiry || user.resetOtpExpiry < new Date()) {
            throw new ApiError(400, "OTP has expired — please request a new one");
        }

        // Prevent reusing the same password
        const isSamePassword = await bcrypt.compare(newPassword, user.password);
        if (isSamePassword) {
            throw new ApiError(400, "New password must be different from the current password");
        }

        const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);

        // Clear reset OTP and invalidate all refresh tokens (force re-login everywhere)
        await prisma.user.update({
            where: { email },
            data: {
                password: hashedPassword,
                resetOtp: null,
                resetOtpExpiry: null,
                refreshToken: null,
            },
        });

        return { message: "Password reset successfully. Please log in with your new password." };
    }

    // ── CHANGE PASSWORD (authenticated) ──────────────────────────────────────

    async changePassword(userId, reqBody) {
        const { currentPassword, newPassword } = reqBody;

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new ApiError(404, "User not found");

        const isCurrentValid = await bcrypt.compare(currentPassword, user.password);
        if (!isCurrentValid) throw new ApiError(401, "Current password is incorrect");

        const isSamePassword = await bcrypt.compare(newPassword, user.password);
        if (isSamePassword) {
            throw new ApiError(400, "New password must be different from the current password");
        }

        const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);

        // Invalidate all refresh tokens — forces re-login on all devices
        await prisma.user.update({
            where: { id: userId },
            data: { password: hashedPassword, refreshToken: null },
        });

        return { message: "Password changed successfully. Please log in again." };
    }

    // ── DELETE ACCOUNT (authenticated) ───────────────────────────────────────

    async deleteAccount(userId) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new ApiError(404, "User not found");

        await prisma.user.delete({ where: { id: userId } });

        return { message: "Account deleted successfully." };
    }

    // ── ASSIGN ROLE (super_admin / admin only) ──────────────────────────────

    async assignRole(reqBody, assignedBy) {
        const { userId, roleName } = reqBody;

        // Check if user exists
        const user = await prisma.user.findUnique({ 
            where: { id: userId },
            include: { userRole: { include: { role: true } } }
        });
        
        if (!user) {
            throw new ApiError(404, "User not found");
        }

        // Check if role exists
        const role = await prisma.role.findUnique({ where: { roleName } });
        if (!role) {
            throw new ApiError(400, `Invalid role: ${roleName}`);
        }

        // Check if user already has this role
        if (user.userRole?.role?.roleName === roleName) {
            throw new ApiError(400, `User already has the role: ${roleName}`);
        }

        // Update or create user role
        const updatedUserRole = await prisma.userRole.upsert({
            where: { userId: userId },
            create: {
                userId: userId,
                roleId: role.id,
                assignedBy: assignedBy
            },
            update: {
                roleId: role.id,
                assignedBy: assignedBy
            },
            include: {
                role: true,
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        status: true
                    }
                }
            }
        });

        return {
            message: `Role '${roleName}' assigned successfully`,
            userRole: {
                userId: updatedUserRole.userId,
                roleName: updatedUserRole.role.roleName,
                user: updatedUserRole.user
            }
        };
    }

    // ── GET ALL ROLES ────────────────────────────────────────────────────────

    async getAllRoles() {
        const roles = await prisma.role.findMany({
            orderBy: { roleName: 'asc' }
        });

        return { roles };
    }

    // ── GET USER ROLE ────────────────────────────────────────────────────────

    async getUserRole(userId) {
        const userRole = await prisma.userRole.findUnique({
            where: { userId },
            include: {
                role: true,
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        status: true
                    }
                },
                assigner: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                }
            }
        });

        if (!userRole) {
            throw new ApiError(404, "User role not found");
        }

        return {
            userId: userRole.userId,
            roleName: userRole.role.roleName,
            user: userRole.user,
            assignedBy: userRole.assigner,
            assignedAt: userRole.createdAt
        };
    }

    // ── GET ALL USERS WITH ROLES (admin feature) ─────────────────────────────

    async getAllUsersWithRoles(filters = {}) {
        const { roleName, status, limit = 100, skip = 0 } = filters;

        const where = {};
        
        if (roleName) {
            where.userRole = {
                role: { roleName }
            };
        }
        
        if (status) {
            where.status = status;
        }

        const users = await prisma.user.findMany({
            where,
            include: {
                userRole: {
                    include: {
                        role: true
                    }
                }
            },
            take: parseInt(limit),
            skip: parseInt(skip),
            orderBy: { createdAt: 'desc' }
        });

        return {
            users: users.map(user => ({
                ...sanitizeUser(user),
                role: user.userRole?.role?.roleName || null
            })),
            count: users.length
        };
    }
}

module.exports = new AuthService();


