const asyncHandler = require("../middlewares/asyncHandler.middleware");
const verifyJWT = require("../middlewares/auth.middleware");
const ApiResponse = require("../utils/ApiResponse");
const notificationService = require("../services/notification.service");

const BASE = "/api/v1/notifications";

const notificationRequestHandler = (app) => {

    // ═══════════════════════════════════════════════════════════════════════════
    // GET MY NOTIFICATIONS
    // ═══════════════════════════════════════════════════════════════════════════
    
    app.get(
        `${BASE}`,
        verifyJWT,
        asyncHandler(async (req, res) => {
            const {
                status,
                category,
                type,
                unreadOnly,
                limit,
                offset,
            } = req.query;

            const filters = {
                status,
                category,
                type,
                unreadOnly: unreadOnly === 'true',
            };

            const pagination = {
                limit: parseInt(limit) || 50,
                offset: parseInt(offset) || 0,
            };

            const result = await notificationService.getUserNotifications(
                req.user.id,
                filters,
                pagination
            );
            
            return res.status(200).json(
                new ApiResponse(200, result, "Notifications fetched successfully")
            );
        })
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // GET UNREAD COUNT
    // ═══════════════════════════════════════════════════════════════════════════
    
    app.get(
        `${BASE}/unread`,
        verifyJWT,
        asyncHandler(async (req, res) => {
            const count = await notificationService.getUnreadCount(req.user.id);
            
            return res.status(200).json(
                new ApiResponse(200, { count }, "Unread count fetched successfully")
            );
        })
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // MARK AS READ
    // ═══════════════════════════════════════════════════════════════════════════
    
    app.patch(
        `${BASE}/:id/read`,
        verifyJWT,
        asyncHandler(async (req, res) => {
            const notification = await notificationService.markAsRead(
                req.params.id,
                req.user.id
            );
            
            return res.status(200).json(
                new ApiResponse(200, notification, "Notification marked as read")
            );
        })
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // MARK ALL AS READ
    // ═══════════════════════════════════════════════════════════════════════════
    
    app.patch(
        `${BASE}/read-all`,
        verifyJWT,
        asyncHandler(async (req, res) => {
            const result = await notificationService.markAllAsRead(req.user.id);
            
            return res.status(200).json(
                new ApiResponse(200, result, "All notifications marked as read")
            );
        })
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // DELETE NOTIFICATION
    // ═══════════════════════════════════════════════════════════════════════════
    
    app.delete(
        `${BASE}/:id`,
        verifyJWT,
        asyncHandler(async (req, res) => {
            await notificationService.delete(req.params.id, req.user.id);
            
            return res.status(200).json(
                new ApiResponse(200, null, "Notification deleted successfully")
            );
        })
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // GET MY PREFERENCES
    // ═══════════════════════════════════════════════════════════════════════════
    
    app.get(
        `${BASE}/preferences`,
        verifyJWT,
        asyncHandler(async (req, res) => {
            const preferences = await notificationService.getUserPreferences(req.user.id);
            
            return res.status(200).json(
                new ApiResponse(200, preferences, "Preferences fetched successfully")
            );
        })
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // UPDATE MY PREFERENCES
    // ═══════════════════════════════════════════════════════════════════════════
    
    app.patch(
        `${BASE}/preferences`,
        verifyJWT,
        asyncHandler(async (req, res) => {
            const preferences = await notificationService.updateUserPreferences(
                req.user.id,
                req.body
            );
            
            return res.status(200).json(
                new ApiResponse(200, preferences, "Preferences updated successfully")
            );
        })
    );
};

module.exports = notificationRequestHandler;
