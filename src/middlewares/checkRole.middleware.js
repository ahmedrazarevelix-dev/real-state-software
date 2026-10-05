const ApiError = require("../utils/ApiError");

/**
 * Middleware to check if the authenticated user has one of the allowed roles
 * @param {string[]} allowedRoles - Array of role names that are allowed
 * @returns {Function} Express middleware function
 */
const checkRole = (allowedRoles) => {
    return (req, res, next) => {
        // Ensure user is authenticated (verifyJWT should run before this)
        if (!req.user) {
            throw new ApiError(401, "Authentication required");
        }

        // Get user's role from the authenticated user object
        const userRole = req.user.role;

        if (!userRole) {
            throw new ApiError(403, "No role assigned to user");
        }

        // Check if user's role is in the allowed roles list
        if (!allowedRoles.includes(userRole)) {
            throw new ApiError(
                403,
                `Access denied. Required roles: ${allowedRoles.join(", ")}`
            );
        }

        // Role check passed, continue to next middleware/controller
        next();
    };
};

module.exports = checkRole;
