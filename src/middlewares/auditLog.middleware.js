const auditLogService = require("../services/auditLog.service");

/**
 * Audit log middleware factory
 * Creates middleware for automatic logging of API requests
 * 
 * @param {string} action - Action name (e.g., "CREATE_BUILDING", "UPDATE_PROFILE")
 * @param {string} entity - Entity type (e.g., "Building", "User", "Lease")
 * @returns {Function} Express middleware
 */
const auditLog = (action, entity = null) => {
    return async (req, res, next) => {
        // Store original methods
        const originalJson = res.json;
        const originalSend = res.send;

        // Track response data
        let responseData = null;

        // Override res.json
        res.json = function (data) {
            responseData = data;
            return originalJson.call(this, data);
        };

        // Override res.send
        res.send = function (data) {
            responseData = data;
            return originalSend.call(this, data);
        };

        // Log after response is sent
        res.on('finish', async () => {
            try {
                // Extract entity ID from response or request
                let entityId = null;
                if (responseData && responseData.data) {
                    entityId = responseData.data.id || req.params.id || null;
                } else {
                    entityId = req.params.id || req.body.id || null;
                }

                // Determine success from status code
                const success = res.statusCode >= 200 && res.statusCode < 400;

                // Extract error message if failed
                let errorMessage = null;
                if (!success && responseData) {
                    errorMessage = responseData.message || responseData.error || "Unknown error";
                }

                // Create log entry (non-blocking)
                auditLogService.log({
                    userId: req.user?.id || null,
                    action,
                    entity,
                    entityId,
                    method: req.method,
                    endpoint: req.originalUrl,
                    statusCode: res.statusCode,
                    ipAddress: req.ip || req.connection.remoteAddress,
                    userAgent: req.get('user-agent'),
                    metadata: {
                        body: maskSensitiveData(req.body),
                        query: req.query,
                        params: req.params,
                    },
                    success,
                    errorMessage,
                }).catch(err => {
                    console.error('[AUDIT-LOG-MIDDLEWARE-ERROR]', err.message);
                });
            } catch (error) {
                console.error('[AUDIT-LOG-MIDDLEWARE-ERROR]', error.message);
            }
        });

        next();
    };
};

/**
 * Mask sensitive data before logging
 * @param {Object} data - Data to mask
 * @returns {Object} Masked data
 */
function maskSensitiveData(data) {
    if (!data || typeof data !== 'object') {
        return data;
    }

    const masked = { ...data };
    const sensitiveFields = ['password', 'otp', 'resetOtp', 'refreshToken', 'token', 'accessToken'];

    sensitiveFields.forEach(field => {
        if (masked[field]) {
            masked[field] = '***REDACTED***';
        }
    });

    return masked;
}

/**
 * Log authentication events manually
 * Use this for login, logout, password changes
 * 
 * @param {Object} req - Express request
 * @param {string} action - Action name
 * @param {boolean} success - Success status
 * @param {string} errorMessage - Error message if failed
 */
const logAuthEvent = async (req, action, success = true, errorMessage = null) => {
    try {
        await auditLogService.log({
            userId: req.user?.id || req.body?.email || null,
            action,
            entity: 'User',
            entityId: req.user?.id || null,
            method: req.method,
            endpoint: req.originalUrl,
            statusCode: success ? 200 : 401,
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('user-agent'),
            metadata: {
                email: req.body?.email || req.user?.email,
            },
            success,
            errorMessage,
        });
    } catch (error) {
        console.error('[AUTH-LOG-ERROR]', error.message);
    }
};

/**
 * Log data changes (CREATE, UPDATE, DELETE)
 * Captures old and new values
 * 
 * @param {Object} params - Logging parameters
 */
const logDataChange = async ({
    userId,
    action,
    entity,
    entityId,
    oldValues = null,
    newValues = null,
    req = null,
}) => {
    try {
        await auditLogService.log({
            userId,
            action,
            entity,
            entityId,
            oldValues: oldValues ? maskSensitiveData(oldValues) : null,
            newValues: newValues ? maskSensitiveData(newValues) : null,
            method: req?.method || null,
            endpoint: req?.originalUrl || null,
            ipAddress: req?.ip || req?.connection?.remoteAddress || null,
            userAgent: req?.get('user-agent') || null,
            success: true,
        });
    } catch (error) {
        console.error('[DATA-CHANGE-LOG-ERROR]', error.message);
    }
};

module.exports = {
    auditLog,
    logAuthEvent,
    logDataChange,
};
