const ApiError = require("../utils/ApiError");

/**
 * Middleware to check if user has completed their profile
 * Blocks API access until profile is complete
 * NOTE: This middleware runs globally AFTER route matching
 * It relies on req.user being set by verifyJWT in the route
 */
const requireProfileComplete = async (req, res, next) => {
    try {
        // Skip if this is not an authenticated route (req.user not set by verifyJWT)
        // This allows the middleware to run globally without breaking non-auth routes
        if (!req.user || !req.user.id) {
            return next(); // Not an authenticated route, skip profile check
        }

        // Check if profile is complete (now directly from req.user set by verifyJWT)
        if (req.user.isProfileComplete === false) {
            return next(
                new ApiError(
                    403,
                    "Profile incomplete. Please complete your profile first by updating: name, phone, and other required details via PATCH /api/v1/profile"
                )
            );
        }

        // Profile is complete, allow access
        next();
    } catch (error) {
        next(error);
    }
};

module.exports = requireProfileComplete;
