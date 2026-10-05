const jwt = require("jsonwebtoken");
const ApiError = require("../utils/ApiError");
const prisma = require("../config/prisma.client");
const asyncHandler = require("./asyncHandler.middleware");

const verifyJWT = asyncHandler(async (req, _res, next) => {
    const authHeader = req.header("Authorization");
    console.log('[AUTH-DEBUG] Authorization header:', authHeader ? `${authHeader.substring(0, 50)}...` : 'MISSING');
    
    const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;
    
    if(!token) {
        console.error('[AUTH-DEBUG] Token not found in header');
        throw new ApiError(401, "Unauthorized user access token are required");
    }
    
    console.log('[AUTH-DEBUG] Token received (first 30 chars):', token.substring(0, 30) + '...');
    console.log('[AUTH-DEBUG] Token length:', token.length);

    let decodedToken;
    try {
        decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        console.log('[AUTH-DEBUG] Token verified successfully for user:', decodedToken.id);
    } catch(error){
        console.error('[AUTH-DEBUG] Token verification failed:', error.message);
        console.error('[AUTH-DEBUG] Token was:', token.substring(0, 50) + '...');
        throw new ApiError(401, "Invalid or expire access token");
    }

    const user = await prisma.user.findUnique({
        where : { id : decodedToken.id },
        select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            status: true,
            isVerified: true,
            isProfileComplete: true,
            agencyName: true,
            officePhone: true,
            whatsappNumber: true,
            officeAddress: true,
            officeHours: true,
            facebookUrl: true,
            instagramHandle: true,
            twitterHandle: true,
            linkedinUrl: true,
            websiteUrl: true,
            createdAt: true,
            updatedAt: true,
            refreshToken: true,
            userRole: {
                select: {
                    roleId: true,
                    role: {
                        select: {
                            roleName: true
                        }
                    }
                }
            },
            sessions: {
                where: { isActive: true },
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    isActive: true,
                    deviceInfo: true,
                    ipAddress: true,
                    userAgent: true,
                    createdAt: true,
                    lastSeenAt: true
                }
            }
        }
    })

    if(!user) {
        console.error('[AUTH-MIDDLEWARE] User not found for token ID:', decodedToken.id);
        throw new ApiError(401, "Invalid access token User not found");
    }

    if(user.status !== 'active') {
        throw new ApiError(403, `Account is ${user.status}. Please contact support.`);
    }

    if(!user.refreshToken) {
        console.error('[AUTH-MIDDLEWARE] No refresh token found for user:', user.id);
        throw new ApiError(401, "Session expired. Please log in again.");
    }

    if (!user.sessions || user.sessions.length === 0) {
        console.error('[AUTH-MIDDLEWARE] No active session for user:', user.id);
        throw new ApiError(401, "No active session found for this user. Please log in again.");
    }

    const roleName = user.userRole?.role?.roleName || null;
    const permissions = await prisma.rolePermission.findMany({
        where: { roleId: user.userRole?.roleId || '' },
        include: { permission: true }
    });

    const rolePermissions = permissions.map(item => item.permission.permissionName);

    const { refreshToken: _, userRole: __, sessions: ___, password: __password, otp: __otp, otpExpiry: __otpExpiry, resetOtp: __resetOtp, resetOtpExpiry: __resetOtpExpiry, ...safeUser } = user;
    req.user = { ...safeUser, role: roleName, permissions: rolePermissions };
    next();

});

module.exports = verifyJWT;

// next(); ya is use agle step agge barhne ka liye hota ha 
/**
 * catch(error){
 * next(error);    iska use error ko catch karke errorHandler name middleware ko through karega
 * }    warna ya catch error meg bhi throw kar sakhta ha 
 *
 */
 // process.exit(1);    ya server ko band karne ka liye 

