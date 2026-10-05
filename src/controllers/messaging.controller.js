const asyncHandler = require("../middlewares/asyncHandler.middleware");
const verifyJWT = require("../middlewares/auth.middleware");
const validate = require("../middlewares/validate.middleware");
const ApiResponse = require("../utils/ApiResponse");
const messagingService = require("../services/messaging.service");
const socketService = require("../services/socket.service");
const { startConversationSchema, messageSchema, blockSchema } = require("../validations/messaging.validation");

const BASE = "/api/v1/conversations";
const BLOCKS = "/api/v1/blocks";

const messagingRequestHandler = (app) => {
    // Start new conversation
    app.post(BASE, verifyJWT, validate(startConversationSchema), asyncHandler(async (req, res) => {
        const conversation = await messagingService.startConversation(req.user.id, req.body);
        
        // Notify other participant via WebSocket
        const otherParticipants = conversation.participants?.filter(p => p.userId !== req.user.id);
        for (const participant of otherParticipants || []) {
            await socketService.notifyNewConversation(participant.userId, conversation);
        }
        
        return res.status(201).json(new ApiResponse(201, conversation, "Conversation started"));
    }));

    // List user's conversations
    app.get(BASE, verifyJWT, asyncHandler(async (req, res) => {
        const conversations = await messagingService.listConversations(req.user.id);
        return res.status(200).json(new ApiResponse(200, conversations, "Conversations fetched"));
    }));

    // Get conversation details
    app.get(`${BASE}/:conversationId`, verifyJWT, asyncHandler(async (req, res) => {
        const conversation = await messagingService.getConversation(req.user.id, req.params.conversationId);
        return res.status(200).json(new ApiResponse(200, conversation, "Conversation fetched"));
    }));

    // Send message in conversation
    app.post(`${BASE}/:conversationId/messages`, verifyJWT, validate(messageSchema), asyncHandler(async (req, res) => {
        const message = await messagingService.sendMessage(req.params.conversationId, req.user.id, req.user.role, req.body.body);
        
        // Broadcast message via WebSocket to all conversation participants
        await socketService.broadcastNewMessage(req.params.conversationId, message);
        
        return res.status(201).json(new ApiResponse(201, message, "Message sent"));
    }));

    // Get conversation messages (AUTO-READ when fetched)
    app.get(`${BASE}/:conversationId/messages`, verifyJWT, asyncHandler(async (req, res) => {
        const { page = 1, limit = 50 } = req.query;
        const result = await messagingService.getMessages(
            req.params.conversationId,
            req.user.id,
            parseInt(page),
            parseInt(limit)
        );
        return res.status(200).json(new ApiResponse(200, result, `Messages fetched. ${result.markedAsRead} messages marked as read.`));
    }));

    // NEW: Manual mark individual message as read
    app.patch(`${BASE}/:conversationId/messages/:messageId/read`, verifyJWT, asyncHandler(async (req, res) => {
        const result = await messagingService.markMessageAsRead(
            req.params.conversationId,
            req.params.messageId,
            req.user.id
        );
        return res.status(200).json(new ApiResponse(200, result, "Message marked as read"));
    }));

    // NEW: Get message status
    app.get(`${BASE}/:conversationId/messages/:messageId/status`, verifyJWT, asyncHandler(async (req, res) => {
        const result = await messagingService.getMessageStatus(
            req.params.conversationId,
            req.params.messageId,
            req.user.id
        );
        return res.status(200).json(new ApiResponse(200, result, "Message status fetched"));
    }));

    // Mark conversation as read
    app.post(`${BASE}/:conversationId/read`, verifyJWT, asyncHandler(async (req, res) => {
        const result = await socketService.markConversationAsRead(req.params.conversationId, req.user.id);
        return res.status(200).json(new ApiResponse(200, result, "Conversation marked as read"));
    }));

    // Get online status of conversation participants
    app.get(`${BASE}/:conversationId/online-status`, verifyJWT, asyncHandler(async (req, res) => {
        const onlineStatus = await socketService.getConversationOnlineStatus(req.params.conversationId);
        return res.status(200).json(new ApiResponse(200, onlineStatus, "Online status fetched"));
    }));

    // Get unread message count
    app.get(`${BASE}/unread/count`, verifyJWT, asyncHandler(async (req, res) => {
        const unreadCount = await socketService.getUnreadCount(req.user.id);
        return res.status(200).json(new ApiResponse(200, unreadCount, "Unread count fetched"));
    }));

    // Update message (edit)
    app.patch(`${BASE}/:conversationId/messages/:messageId`, verifyJWT, validate(messageSchema), asyncHandler(async (req, res) => {
        const message = await messagingService.updateMessage(
            req.params.conversationId,
            req.params.messageId,
            req.user.id,
            req.body.body
        );
        
        // Broadcast update via WebSocket
        await socketService.broadcastMessageUpdate(req.params.conversationId, req.params.messageId, {
            body: message.body,
            editedAt: message.editedAt
        });
        
        return res.status(200).json(new ApiResponse(200, message, "Message updated"));
    }));

    // Delete message
    app.delete(`${BASE}/:conversationId/messages/:messageId`, verifyJWT, asyncHandler(async (req, res) => {
        await messagingService.deleteMessage(
            req.params.conversationId,
            req.params.messageId,
            req.user.id
        );
        
        // Broadcast deletion via WebSocket
        await socketService.broadcastMessageDelete(req.params.conversationId, req.params.messageId);
        
        return res.status(200).json(new ApiResponse(200, null, "Message deleted"));
    }));

    // Close conversation
    // Block user
    app.post(`${BLOCKS}/:userId`, verifyJWT, validate(blockSchema), asyncHandler(async (req, res) => {
        const block = await messagingService.blockUser(req.user.id, req.params.userId);
        return res.status(201).json(new ApiResponse(201, block, "User blocked"));
    }));

    // Unblock user
    app.delete(`${BLOCKS}/:userId`, verifyJWT, asyncHandler(async (req, res) => {
        const result = await messagingService.unblockUser(req.user.id, req.params.userId);
        return res.status(200).json(new ApiResponse(200, result, result.message));
    }));

    // Get WebSocket connection statistics (Admin only)
    app.get("/api/v1/socket/stats", verifyJWT, asyncHandler(async (req, res) => {
        const stats = socketService.getConnectionStats();
        return res.status(200).json(new ApiResponse(200, stats, "Connection stats fetched"));
    }));
};

module.exports = messagingRequestHandler;
