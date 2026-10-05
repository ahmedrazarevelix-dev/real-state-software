const asyncHandler = require("../middlewares/asyncHandler.middleware");
const verifyJWT = require("../middlewares/auth.middleware");
const { authorizeRoles } = require("../middlewares/rbac.middleware");
const ApiResponse = require("../utils/ApiResponse");
const auditLogService = require("../services/auditLog.service");

const BASE = "/api/v1/audit-logs";

const auditLogRequestHandler = (app) => {

    // ═══════════════════════════════════════════════════════════════════════════
    // GET ALL LOGS (super_admin only)
    // ═══════════════════════════════════════════════════════════════════════════
    
    app.get(
        `${BASE}`,
        verifyJWT,
        authorizeRoles('super_admin'),
        asyncHandler(async (req, res) => {
            const {
                action,
                entity,
                userId,
                success,
                startDate,
                endDate,
                limit,
                offset,
            } = req.query;

            const filters = {
                action,
                entity,
                userId,
                success: success !== undefined ? success === 'true' : undefined,
                startDate,
                endDate,
            };

            const pagination = {
                limit: parseInt(limit) || 50,
                offset: parseInt(offset) || 0,
            };

            const result = await auditLogService.getAllLogs(filters, pagination);
            
            return res.status(200).json(
                new ApiResponse(200, result, "Audit logs fetched successfully")
            );
        })
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // GET MY ACTIVITY (current user's logs)
    // ═══════════════════════════════════════════════════════════════════════════
    
    app.get(
        `${BASE}/me`,
        verifyJWT,
        asyncHandler(async (req, res) => {
            const { limit, offset } = req.query;

            const pagination = {
                limit: parseInt(limit) || 50,
                offset: parseInt(offset) || 0,
            };

            const result = await auditLogService.getLogsByUser(req.user.id, pagination);
            
            return res.status(200).json(
                new ApiResponse(200, result, "Your activity history fetched successfully")
            );
        })
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // GET USER'S LOGS (super_admin only)
    // ═══════════════════════════════════════════════════════════════════════════
    
    app.get(
        `${BASE}/user/:userId`,
        verifyJWT,
        authorizeRoles('super_admin'),
        asyncHandler(async (req, res) => {
            const { userId } = req.params;
            const { limit, offset } = req.query;

            const pagination = {
                limit: parseInt(limit) || 50,
                offset: parseInt(offset) || 0,
            };

            const result = await auditLogService.getLogsByUser(userId, pagination);
            
            return res.status(200).json(
                new ApiResponse(200, result, "User activity logs fetched successfully")
            );
        })
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // GET ENTITY HISTORY
    // ═══════════════════════════════════════════════════════════════════════════
    
    app.get(
        `${BASE}/entity/:entityType/:entityId`,
        verifyJWT,
        authorizeRoles('super_admin', 'admin'),
        asyncHandler(async (req, res) => {
            const { entityType, entityId } = req.params;

            const logs = await auditLogService.getLogsByEntity(entityType, entityId);
            
            return res.status(200).json(
                new ApiResponse(200, logs, `${entityType} history fetched successfully`)
            );
        })
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // GET LOGS BY ACTION
    // ═══════════════════════════════════════════════════════════════════════════
    
    app.get(
        `${BASE}/action/:action`,
        verifyJWT,
        authorizeRoles('super_admin'),
        asyncHandler(async (req, res) => {
            const { action } = req.params;
            const { limit, offset } = req.query;

            const pagination = {
                limit: parseInt(limit) || 50,
                offset: parseInt(offset) || 0,
            };

            const result = await auditLogService.getLogsByAction(action, pagination);
            
            return res.status(200).json(
                new ApiResponse(200, result, `Logs for action '${action}' fetched successfully`)
            );
        })
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // GET FAILED OPERATIONS (security monitoring)
    // ═══════════════════════════════════════════════════════════════════════════
    
    app.get(
        `${BASE}/failed`,
        verifyJWT,
        authorizeRoles('super_admin'),
        asyncHandler(async (req, res) => {
            const { limit, offset } = req.query;

            const pagination = {
                limit: parseInt(limit) || 50,
                offset: parseInt(offset) || 0,
            };

            const result = await auditLogService.getFailedOperations(pagination);
            
            return res.status(200).json(
                new ApiResponse(200, result, "Failed operations fetched successfully")
            );
        })
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // GET AUTHENTICATION EVENTS
    // ═══════════════════════════════════════════════════════════════════════════
    
    app.get(
        `${BASE}/auth-events`,
        verifyJWT,
        authorizeRoles('super_admin'),
        asyncHandler(async (req, res) => {
            const { limit, offset } = req.query;

            const pagination = {
                limit: parseInt(limit) || 50,
                offset: parseInt(offset) || 0,
            };

            const result = await auditLogService.getAuthEvents(pagination);
            
            return res.status(200).json(
                new ApiResponse(200, result, "Authentication events fetched successfully")
            );
        })
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // SEARCH LOGS
    // ═══════════════════════════════════════════════════════════════════════════
    
    app.get(
        `${BASE}/search`,
        verifyJWT,
        authorizeRoles('super_admin'),
        asyncHandler(async (req, res) => {
            const searchParams = {
                keyword: req.query.keyword,
                userId: req.query.userId,
                action: req.query.action,
                entity: req.query.entity,
                success: req.query.success !== undefined ? req.query.success === 'true' : undefined,
                startDate: req.query.startDate,
                endDate: req.query.endDate,
                limit: parseInt(req.query.limit) || 50,
                offset: parseInt(req.query.offset) || 0,
            };

            const result = await auditLogService.searchLogs(searchParams);
            
            return res.status(200).json(
                new ApiResponse(200, result, "Search results fetched successfully")
            );
        })
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // GET STATISTICS
    // ═══════════════════════════════════════════════════════════════════════════
    
    app.get(
        `${BASE}/stats`,
        verifyJWT,
        authorizeRoles('super_admin'),
        asyncHandler(async (req, res) => {
            const { userId } = req.query;

            const stats = await auditLogService.getStatistics(userId || null);
            
            return res.status(200).json(
                new ApiResponse(200, stats, "Statistics fetched successfully")
            );
        })
    );
};

module.exports = auditLogRequestHandler;
