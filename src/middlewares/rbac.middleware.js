const ApiError = require("../utils/ApiError");

/**
 * Role-Based Access Control (RBAC) Middleware
 *
 * Usage: authorizeRoles('super_admin', 'admin')
 * Usage: requirePermission('listings.create')
 *
 * @param {...string} allowedRoles - List of roles that can access the route
 * @returns {Function} Express middleware
 */
const authorizeRoles = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            throw new ApiError(401, "Authentication required");
        }

        if (!req.user.role) {
            throw new ApiError(403, "User role not assigned");
        }

        if (!allowedRoles.includes(req.user.role)) {
            throw new ApiError(403, `Access denied. Required roles: ${allowedRoles.join(", ")}`);
        }

        next();
    };
};

const requirePermission = (...requiredPermissions) => {
    return (req, res, next) => {
        if (!req.user) {
            throw new ApiError(401, "Authentication required");
        }

        const userPermissions = req.user.permissions || [];
        const hasPermission = requiredPermissions.some(permission => userPermissions.includes(permission));

        if (!hasPermission) {
            throw new ApiError(403, `Access denied. Required permission: ${requiredPermissions.join(", ")}`);
        }

        next();
    };
};

module.exports = { authorizeRoles, requirePermission };

