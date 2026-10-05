const bcrypt = require("bcrypt");
const generateOtp = require("../utils/generateOtp.util");
const prisma = require("../config/prisma.client");
const ApiError = require("../utils/ApiError");

// ── Email Service: Use Brevo (Production-Ready) ──────────────────────────────
const { sendRegistrationOtp, isBrevoConfigured } = require("../utils/mailer.brevo");

const OTP_EXPIRY_MINUTES = parseInt(process.env.OTP_EXPIRY_MINUTES) || 10;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Strip sensitive fields before returning user data
 */
const sanitizeUser = (user) => {
    if (!user) return null;
    const { 
        password, 
        otp, 
        otpExpiry, 
        resetOtp, 
        resetOtpExpiry, 
        refreshToken, 
        userRole, 
        ...safeUser 
    } = user;
    
    // Add role name if available
    if (userRole?.role?.roleName) {
        safeUser.role = userRole.role.roleName;
    }
    
    return safeUser;
};

/**
 * Build OTP expiry timestamp
 */
const buildOtpExpiry = () =>
    new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

/**
 * Send OTP via email (with console fallback)
 */
const sendOtp = async (email, otp, subject = "Email Verification OTP") => {
    if (!isBrevoConfigured()) {
        console.log(`[OTP-FALLBACK] ${subject} | ${email} -> ${otp} (expires in ${OTP_EXPIRY_MINUTES} min)`);
        return;
    }

    try {
        await sendRegistrationOtp(email, otp);
        console.log(`[OTP-SENT] OTP sent to ${email}`);
    } catch (err) {
        console.error(`[OTP-EMAIL-ERROR] Failed to send to ${email}:`, err.message);
    }
};

// ---------------------------------------------------------------------------
// ProfileService
// ---------------------------------------------------------------------------

class ProfileService {

    // ── GET USER PROFILE ──────────────────────────────────────────────────────

    async getUserProfile(userId) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                userRole: {
                    include: {
                        role: true,
                    },
                },
            },
        });

        if (!user) {
            throw new ApiError(404, "User not found");
        }

        return sanitizeUser(user);
    }

    // ── UPDATE PROFILE (name, phone) ──────────────────────────────────────────

    async updateProfile(userId, reqBody) {
        const { 
            name, 
            phone,
            agencyName,
            officePhone,
            whatsappNumber,
            officeAddress,
            officeHours,
            facebookUrl,
            instagramHandle,
            twitterHandle,
            linkedinUrl,
            websiteUrl,
        } = reqBody;

        // Check if user exists
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            throw new ApiError(404, "User not found");
        }

        // Validate that required fields are provided
        if (!name || !phone) {
            throw new ApiError(400, "Name and phone are required to complete profile");
        }

        // Build update data
        const updateData = {
            name,
            phone,
            isProfileComplete: true, // Mark profile as complete
        };

        // Add optional admin contact fields
        if (agencyName !== undefined) updateData.agencyName = agencyName || null;
        if (officePhone !== undefined) updateData.officePhone = officePhone || null;
        if (whatsappNumber !== undefined) updateData.whatsappNumber = whatsappNumber || null;
        if (officeAddress !== undefined) updateData.officeAddress = officeAddress || null;
        if (officeHours !== undefined) updateData.officeHours = officeHours || null;
        if (facebookUrl !== undefined) updateData.facebookUrl = facebookUrl || null;
        if (instagramHandle !== undefined) updateData.instagramHandle = instagramHandle || null;
        if (twitterHandle !== undefined) updateData.twitterHandle = twitterHandle || null;
        if (linkedinUrl !== undefined) updateData.linkedinUrl = linkedinUrl || null;
        if (websiteUrl !== undefined) updateData.websiteUrl = websiteUrl || null;

        // Update user
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: updateData,
            include: {
                userRole: {
                    include: {
                        role: true,
                    },
                },
            },
        });

        return {
            user: sanitizeUser(updatedUser),
            message: "Profile completed successfully. You can now access all features.",
        };
    }

    // ── REQUEST EMAIL UPDATE (send OTP to new email) ──────────────────────────

    async requestEmailUpdate(userId, reqBody) {
        const { newEmail } = reqBody;

        // Check if user exists
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            throw new ApiError(404, "User not found");
        }

        // Check if new email is same as current
        if (user.email.toLowerCase() === newEmail.toLowerCase()) {
            throw new ApiError(400, "New email cannot be the same as current email");
        }

        // Check if new email already exists
        const existingUser = await prisma.user.findUnique({
            where: { email: newEmail },
        });

        if (existingUser) {
            throw new ApiError(409, "This email is already in use by another account");
        }

        // Generate OTP and save (we'll use the otp field temporarily for email update)
        const otp = generateOtp();
        const otpExpiry = buildOtpExpiry();

        await prisma.user.update({
            where: { id: userId },
            data: {
                otp,
                otpExpiry,
            },
        });

        // Send OTP to NEW email
        await sendOtp(newEmail, otp, "Email Update Verification");

        return {
            message: `Verification OTP sent to ${newEmail}. Please verify to update your email.`,
        };
    }

    // ── VERIFY EMAIL UPDATE ───────────────────────────────────────────────────

    async verifyEmailUpdate(userId, reqBody) {
        const { newEmail, otp } = reqBody;

        // Get user
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            throw new ApiError(404, "User not found");
        }

        // Verify OTP
        if (!user.otp || user.otp !== otp) {
            throw new ApiError(400, "Invalid OTP");
        }

        if (!user.otpExpiry || user.otpExpiry < new Date()) {
            throw new ApiError(400, "OTP has expired. Please request a new one.");
        }

        // Check again if new email is available
        const existingUser = await prisma.user.findUnique({
            where: { email: newEmail },
        });

        if (existingUser && existingUser.id !== userId) {
            throw new ApiError(409, "This email is already in use by another account");
        }

        // Update email and clear OTP
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: {
                email: newEmail,
                otp: null,
                otpExpiry: null,
                // Force re-verification if needed (optional based on requirements)
                // isVerified: false,
            },
            include: {
                userRole: {
                    include: {
                        role: true,
                    },
                },
            },
        });

        return {
            user: sanitizeUser(updatedUser),
            message: "Email updated successfully",
        };
    }

    // ── CHANGE PASSWORD (authenticated user) ──────────────────────────────────
    // Note: This duplicates auth.service.changePassword
    // Consider removing this and using auth service instead

    async changePassword(userId, reqBody) {
        const { currentPassword, newPassword } = reqBody;

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            throw new ApiError(404, "User not found");
        }

        // Verify current password
        const isCurrentValid = await bcrypt.compare(currentPassword, user.password);
        if (!isCurrentValid) {
            throw new ApiError(401, "Current password is incorrect");
        }

        // Check if new password is same as current
        const isSamePassword = await bcrypt.compare(newPassword, user.password);
        if (isSamePassword) {
            throw new ApiError(400, "New password must be different from current password");
        }

        // Hash new password
        const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;
        const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);

        // Update password and invalidate all refresh tokens (force re-login)
        await prisma.user.update({
            where: { id: userId },
            data: {
                password: hashedPassword,
                refreshToken: null,
            },
        });

        return {
            message: "Password changed successfully. Please log in again with your new password.",
        };
    }

    // ── GET USER STATISTICS (optional - for profile dashboard) ────────────────

    async getUserStatistics(userId) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                userRole: {
                    include: {
                        role: true,
                    },
                },
            },
        });

        if (!user) {
            throw new ApiError(404, "User not found");
        }

        const roleName = user.userRole?.role?.roleName;

        // Different stats based on role
        const stats = {
            userId: user.id,
            role: roleName,
        };

        switch (roleName) {
            case "buyer": {
                const [saved, inquiries, tours] = await Promise.all([
                    prisma.savedListing.count({ where: { userId } }),
                    prisma.listingInquiry.count({ where: { buyerId: userId } }),
                    prisma.tourRequest.count({ where: { buyerId: userId } }),
                ]);
                stats.savedListings = saved;
                stats.inquiriesSent = inquiries;
                stats.toursRequested = tours;
                stats.listingsPosted = await prisma.propertyListing.count({ where: { listedById: userId } });
                break;
            }
            case "agent":
            case "super_admin": {
                const [listings, inquiries, tours] = await Promise.all([
                    prisma.propertyListing.count({ where: { listedById: userId } }),
                    prisma.listingInquiry.count({ where: { listing: { listedById: userId } } }),
                    prisma.tourRequest.count({ where: { listing: { listedById: userId } } }),
                ]);
                stats.listingsPosted = listings;
                stats.inquiriesReceived = inquiries;
                stats.toursReceived = tours;
                break;
            }
            default:
                stats.info = "No specific statistics available for this role";
        }

        return stats;
    }
}

module.exports = new ProfileService();
