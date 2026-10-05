const prisma = require("../config/prisma.client");
const ApiError = require("../utils/ApiError");

class AuditLogService {
    
    // ══════════════════════════════════════════════════════════════════════════
    // CREATE AUDIT LOG
    // ══════════════════════════════════════════════════════════════════════════
    
    /**
     * Create an audit log entry
     * @param {Object} logData - Log entry data
     * @returns {Promise<Object>} Created audit log
     */
    async log(logData) {
        try {
            const {
                userId,
                action,
                entity,
                entityId,
                ipAddress,
                userAgent,
                method,
                endpoint,
                statusCode,
                oldValues,
                newValues,
                metadata,
                success = true,
                errorMessage,
            } = logData;

            // Don't block the main operation if logging fails
            const auditLog = await prisma.auditLog.create({
                data: {
                    userId: userId || null,
                    action,
                    entity: entity || null,
                    entityId: entityId || null,
                    ipAddress: ipAddress || null,
                    userAgent: userAgent || null,
                    method: method || null,
                    endpoint: endpoint || null,
                    statusCode: statusCode || null,
                    oldValues: oldValues || null,
                    newValues: newValues || null,
                    metadata: metadata || null,
                    success,
                    errorMessage: errorMessage || null,
                },
            });

            return auditLog;
        } catch (error) {
            // Log error but don't throw - logging should never break the app
            console.error("[AUDIT-LOG-ERROR]", error.message);
            return null;
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // QUERY AUDIT LOGS
    // ══════════════════════════════════════════════════════════════════════════
    
    /**
     * Get all audit logs (super_admin only)
     * @param {Object} filters - Filter criteria
     * @param {Object} pagination - Pagination options
     * @returns {Promise<Object>} Paginated logs
     */
    async getAllLogs(filters = {}, pagination = {}) {
        const {
            action,
            entity,
            userId,
            success,
            startDate,
            endDate,
        } = filters;

        const { limit = 50, offset = 0 } = pagination;

        const whereClause = {};

        if (action) {
            whereClause.action = action;
        }

        if (entity) {
            whereClause.entity = entity;
        }

        if (userId) {
            whereClause.userId = userId;
        }

        if (success !== undefined) {
            whereClause.success = success;
        }

        if (startDate || endDate) {
            whereClause.timestamp = {};
            if (startDate) {
                whereClause.timestamp.gte = new Date(startDate);
            }
            if (endDate) {
                whereClause.timestamp.lte = new Date(endDate);
            }
        }

        const [logs, total] = await Promise.all([
            prisma.auditLog.findMany({
                where: whereClause,
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        },
                    },
                },
                orderBy: { timestamp: 'desc' },
                take: limit,
                skip: offset,
            }),
            prisma.auditLog.count({ where: whereClause }),
        ]);

        return {
            logs,
            total,
            limit,
            offset,
            hasMore: offset + logs.length < total,
        };
    }

    /**
     * Get logs for a specific user
     * @param {string} userId - User ID
     * @param {Object} pagination - Pagination options
     * @returns {Promise<Object>} User's audit logs
     */
    async getLogsByUser(userId, pagination = {}) {
        const { limit = 50, offset = 0 } = pagination;

        const [logs, total] = await Promise.all([
            prisma.auditLog.findMany({
                where: { userId },
                orderBy: { timestamp: 'desc' },
                take: limit,
                skip: offset,
            }),
            prisma.auditLog.count({ where: { userId } }),
        ]);

        return {
            logs,
            total,
            limit,
            offset,
            hasMore: offset + logs.length < total,
        };
    }

    /**
     * Get logs for a specific entity (e.g., all changes to a building)
     * @param {string} entity - Entity type (Building, Unit, etc.)
     * @param {string} entityId - Entity ID
     * @returns {Promise<Array>} Entity history
     */
    async getLogsByEntity(entity, entityId) {
        const logs = await prisma.auditLog.findMany({
            where: {
                entity,
                entityId,
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
            orderBy: { timestamp: 'desc' },
        });

        return logs;
    }

    /**
     * Get logs by action type
     * @param {string} action - Action type (LOGIN, CREATE_BUILDING, etc.)
     * @param {Object} pagination - Pagination options
     * @returns {Promise<Object>} Filtered logs
     */
    async getLogsByAction(action, pagination = {}) {
        const { limit = 50, offset = 0 } = pagination;

        const [logs, total] = await Promise.all([
            prisma.auditLog.findMany({
                where: { action },
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        },
                    },
                },
                orderBy: { timestamp: 'desc' },
                take: limit,
                skip: offset,
            }),
            prisma.auditLog.count({ where: { action } }),
        ]);

        return {
            logs,
            total,
            limit,
            offset,
            hasMore: offset + logs.length < total,
        };
    }

    /**
     * Get failed operations (security monitoring)
     * @param {Object} pagination - Pagination options
     * @returns {Promise<Object>} Failed operations
     */
    async getFailedOperations(pagination = {}) {
        const { limit = 50, offset = 0 } = pagination;

        const [logs, total] = await Promise.all([
            prisma.auditLog.findMany({
                where: { success: false },
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        },
                    },
                },
                orderBy: { timestamp: 'desc' },
                take: limit,
                skip: offset,
            }),
            prisma.auditLog.count({ where: { success: false } }),
        ]);

        return {
            logs,
            total,
            limit,
            offset,
            hasMore: offset + logs.length < total,
        };
    }

    /**
     * Get authentication events (login, logout, failed attempts)
     * @param {Object} pagination - Pagination options
     * @returns {Promise<Object>} Auth events
     */
    async getAuthEvents(pagination = {}) {
        const { limit = 50, offset = 0 } = pagination;

        const authActions = ['LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'PASSWORD_CHANGE', 'PASSWORD_RESET', 'OTP_VERIFY'];

        const [logs, total] = await Promise.all([
            prisma.auditLog.findMany({
                where: {
                    action: { in: authActions },
                },
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        },
                    },
                },
                orderBy: { timestamp: 'desc' },
                take: limit,
                skip: offset,
            }),
            prisma.auditLog.count({
                where: {
                    action: { in: authActions },
                },
            }),
        ]);

        return {
            logs,
            total,
            limit,
            offset,
            hasMore: offset + logs.length < total,
        };
    }

    /**
     * Search logs with advanced filtering
     * @param {Object} searchParams - Search parameters
     * @returns {Promise<Object>} Search results
     */
    async searchLogs(searchParams) {
        const {
            keyword,
            userId,
            action,
            entity,
            success,
            startDate,
            endDate,
            limit = 50,
            offset = 0,
        } = searchParams;

        const whereClause = {};

        if (userId) whereClause.userId = userId;
        if (action) whereClause.action = action;
        if (entity) whereClause.entity = entity;
        if (success !== undefined) whereClause.success = success;

        if (startDate || endDate) {
            whereClause.timestamp = {};
            if (startDate) whereClause.timestamp.gte = new Date(startDate);
            if (endDate) whereClause.timestamp.lte = new Date(endDate);
        }

        // Keyword search in action, entity, or metadata
        if (keyword) {
            whereClause.OR = [
                { action: { contains: keyword, mode: 'insensitive' } },
                { entity: { contains: keyword, mode: 'insensitive' } },
            ];
        }

        const [logs, total] = await Promise.all([
            prisma.auditLog.findMany({
                where: whereClause,
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        },
                    },
                },
                orderBy: { timestamp: 'desc' },
                take: limit,
                skip: offset,
            }),
            prisma.auditLog.count({ where: whereClause }),
        ]);

        return {
            logs,
            total,
            limit,
            offset,
            hasMore: offset + logs.length < total,
        };
    }

    // ══════════════════════════════════════════════════════════════════════════
    // STATISTICS
    // ══════════════════════════════════════════════════════════════════════════
    
    /**
     * Get audit log statistics
     * @param {string} userId - Optional user ID to get user-specific stats
     * @returns {Promise<Object>} Statistics
     */
    async getStatistics(userId = null) {
        const whereClause = userId ? { userId } : {};

        const [
            totalLogs,
            successfulLogs,
            failedLogs,
            authEvents,
            recentActivity,
        ] = await Promise.all([
            prisma.auditLog.count({ where: whereClause }),
            prisma.auditLog.count({ where: { ...whereClause, success: true } }),
            prisma.auditLog.count({ where: { ...whereClause, success: false } }),
            prisma.auditLog.count({
                where: {
                    ...whereClause,
                    action: { in: ['LOGIN', 'LOGOUT', 'LOGIN_FAILED'] },
                },
            }),
            prisma.auditLog.findMany({
                where: whereClause,
                orderBy: { timestamp: 'desc' },
                take: 10,
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        },
                    },
                },
            }),
        ]);

        return {
            totalLogs,
            successfulLogs,
            failedLogs,
            authEvents,
            successRate: totalLogs > 0 ? ((successfulLogs / totalLogs) * 100).toFixed(2) : "0.00",
            recentActivity,
        };
    }
}

module.exports = new AuditLogService();
