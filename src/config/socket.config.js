const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const prisma = require('./prisma.client');

class SocketConfig {
    constructor() {
        this.io = null;
        this.userSockets = new Map(); // userId -> Set of socketIds
        this.socketUsers = new Map(); // socketId -> userId
    }

    /**
     * Initialize Socket.IO with HTTP server
     */
    initialize(httpServer) {
        this.io = new Server(httpServer, {
            cors: {
                origin: process.env.CORS_ORIGIN?.split(',').map(o => o.trim()).filter(Boolean) || '*',
                credentials: true,
                methods: ['GET', 'POST']
            },
            pingTimeout: 60000,
            pingInterval: 25000,
            transports: ['websocket', 'polling']
        });

        // Authentication middleware
        this.io.use(async (socket, next) => {
            try {
                const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

                if (!token) {
                    return next(new Error('Authentication token required'));
                }

                // Verify JWT token
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                
                // Verify user exists and is active
                const user = await prisma.user.findUnique({
                    where: { id: decoded.userId },
                    select: {
                        id: true,
                        email: true,
                        name: true,
                        status: true,
                        isVerified: true
                    }
                });

                if (!user) {
                    return next(new Error('User not found'));
                }

                if (user.status !== 'active') {
                    return next(new Error('User account is not active'));
                }

                // Attach user to socket
                socket.userId = user.id;
                socket.user = user;

                next();
            } catch (error) {
                console.error('Socket authentication error:', error.message);
                next(new Error('Authentication failed'));
            }
        });

        // Connection handler
        this.io.on('connection', (socket) => {
            this.handleConnection(socket);
        });

        console.log('✅ Socket.IO initialized with authentication');
        return this.io;
    }

    /**
     * Handle new socket connection
     */
    handleConnection(socket) {
        const userId = socket.userId;
        
        // Track user's sockets
        if (!this.userSockets.has(userId)) {
            this.userSockets.set(userId, new Set());
        }
        this.userSockets.get(userId).add(socket.id);
        this.socketUsers.set(socket.id, userId);

        console.log(`✅ User ${userId} connected (socket: ${socket.id})`);

        // Emit user online status to their conversations
        this.broadcastUserStatus(userId, 'online');

        // Join user's personal room
        socket.join(`user:${userId}`);

        // Handle disconnection
        socket.on('disconnect', () => {
            this.handleDisconnection(socket);
        });

        // Handle conversation joining
        socket.on('join:conversation', (conversationId) => {
            this.handleJoinConversation(socket, conversationId);
        });

        // Handle leaving conversation
        socket.on('leave:conversation', (conversationId) => {
            this.handleLeaveConversation(socket, conversationId);
        });

        // Handle typing indicators
        socket.on('typing:start', (data) => {
            this.handleTypingStart(socket, data);
        });

        socket.on('typing:stop', (data) => {
            this.handleTypingStop(socket, data);
        });

        // Handle message read receipts
        socket.on('message:read', (data) => {
            this.handleMessageRead(socket, data);
        });

        // Handle direct message sending (without API)
        socket.on('send:message', async (data) => {
            await this.handleSendMessage(socket, data);
        });

        // Handle starting new conversation (without API)
        socket.on('start:conversation', async (data) => {
            await this.handleStartConversation(socket, data);
        });
    }

    /**
     * Handle socket disconnection
     */
    handleDisconnection(socket) {
        const userId = socket.userId;

        // Remove socket from tracking
        if (this.userSockets.has(userId)) {
            this.userSockets.get(userId).delete(socket.id);
            
            // If user has no more active sockets, mark as offline
            if (this.userSockets.get(userId).size === 0) {
                this.userSockets.delete(userId);
                this.broadcastUserStatus(userId, 'offline');
            }
        }
        this.socketUsers.delete(socket.id);

        console.log(`❌ User ${userId} disconnected (socket: ${socket.id})`);
    }

    /**
     * Handle user joining a conversation
     */
    async handleJoinConversation(socket, conversationId) {
        try {
            // Verify user is participant in conversation
            const participant = await prisma.conversationParticipant.findFirst({
                where: {
                    conversationId,
                    userId: socket.userId
                }
            });

            if (!participant) {
                socket.emit('error', { message: 'Not authorized to join this conversation' });
                return;
            }

            socket.join(`conversation:${conversationId}`);
            console.log(`User ${socket.userId} joined conversation ${conversationId}`);

            // Notify others in conversation
            socket.to(`conversation:${conversationId}`).emit('user:joined', {
                userId: socket.userId,
                userName: socket.user.name,
                conversationId
            });
        } catch (error) {
            console.error('Error joining conversation:', error);
            socket.emit('error', { message: 'Failed to join conversation' });
        }
    }

    /**
     * Handle user leaving a conversation
     */
    handleLeaveConversation(socket, conversationId) {
        socket.leave(`conversation:${conversationId}`);
        console.log(`User ${socket.userId} left conversation ${conversationId}`);

        // Notify others in conversation
        socket.to(`conversation:${conversationId}`).emit('user:left', {
            userId: socket.userId,
            userName: socket.user.name,
            conversationId
        });
    }

    /**
     * Handle typing start event
     */
    handleTypingStart(socket, { conversationId }) {
        socket.to(`conversation:${conversationId}`).emit('typing:start', {
            userId: socket.userId,
            userName: socket.user.name,
            conversationId
        });
    }

    /**
     * Handle typing stop event
     */
    handleTypingStop(socket, { conversationId }) {
        socket.to(`conversation:${conversationId}`).emit('typing:stop', {
            userId: socket.userId,
            conversationId
        });
    }

    /**
     * Handle message read receipt
     */
    async handleMessageRead(socket, { conversationId, messageId }) {
        try {
            // Update last read time
            await prisma.conversationParticipant.update({
                where: {
                    conversationId_userId: {
                        conversationId,
                        userId: socket.userId
                    }
                },
                data: {
                    lastReadAt: new Date()
                }
            });

            // Notify conversation participants
            socket.to(`conversation:${conversationId}`).emit('message:read', {
                userId: socket.userId,
                conversationId,
                messageId,
                readAt: new Date()
            });
        } catch (error) {
            console.error('Error updating read receipt:', error);
        }
    }

    /**
     * Handle sending message directly through socket
     */
    async handleSendMessage(socket, { conversationId, body }) {
        try {
            const userId = socket.userId;

            // Verify user is participant
            const conversation = await prisma.conversation.findUnique({
                where: { id: conversationId },
                include: { participants: { select: { userId: true } } }
            });

            if (!conversation) {
                socket.emit('error', { message: 'Conversation not found' });
                return;
            }

            const isParticipant = conversation.participants.some(p => p.userId === userId);
            if (!isParticipant) {
                socket.emit('error', { message: 'Not authorized' });
                return;
            }

            // Create message
            const message = await prisma.conversationMessage.create({
                data: {
                    conversationId,
                    senderId: userId,
                    body,
                    deliveredAt: new Date() // Auto-delivered on send
                },
                include: {
                    sender: {
                        select: { id: true, name: true, email: true }
                    }
                }
            });

            // Broadcast to all participants in conversation room
            this.io.to(`conversation:${conversationId}`).emit('message:new', {
                conversationId,
                message,
                timestamp: new Date()
            });

            console.log(`Message sent via socket: ${userId} → conversation ${conversationId}`);
        } catch (error) {
            console.error('Error sending message via socket:', error);
            socket.emit('error', { message: 'Failed to send message' });
        }
    }

    /**
     * Handle starting new conversation directly through socket
     */
    async handleStartConversation(socket, { listingId, recipientId, inquiryId, tourId, subject, message }) {
        try {
            const userId = socket.userId;

            if (userId === recipientId) {
                socket.emit('error', { message: 'Cannot start conversation with yourself' });
                return;
            }

            // Verify listing exists
            const listing = await prisma.propertyListing.findUnique({
                where: { id: listingId }
            });

            if (!listing) {
                socket.emit('error', { message: 'Listing not found' });
                return;
            }

            // Check if conversation already exists
            const existingConversation = await prisma.conversation.findFirst({
                where: {
                    listingId,
                    participants: {
                        every: {
                            userId: { in: [userId, recipientId] }
                        }
                    }
                },
                include: {
                    participants: {
                        include: {
                            user: {
                                select: { id: true, name: true, email: true }
                            }
                        }
                    }
                }
            });

            if (existingConversation) {
                // Join existing conversation
                socket.join(`conversation:${existingConversation.id}`);
                socket.emit('conversation:started', {
                    conversation: existingConversation,
                    existing: true
                });
                return;
            }

            // Create new conversation
            const conversation = await prisma.conversation.create({
                data: {
                    listingId,
                    inquiryId,
                    tourId,
                    subject: subject || 'Conversation about listing',
                    participants: {
                        create: [
                            { userId },
                            { userId: recipientId }
                        ]
                    },
                    messages: message ? {
                        create: {
                            senderId: userId,
                            body: message,
                            deliveredAt: new Date() // Auto-delivered on send
                        }
                    } : undefined
                },
                include: {
                    participants: {
                        include: {
                            user: {
                                select: { id: true, name: true, email: true }
                            }
                        }
                    },
                    messages: true
                }
            });

            // Both users join conversation room
            socket.join(`conversation:${conversation.id}`);

            // Notify sender
            socket.emit('conversation:started', {
                conversation,
                existing: false
            });

            // Notify recipient if online
            this.notifyUser(recipientId, 'conversation:new', {
                conversation
            });

            console.log(`Conversation started via socket: ${userId} with ${recipientId}`);
        } catch (error) {
            console.error('Error starting conversation via socket:', error);
            socket.emit('error', { message: 'Failed to start conversation' });
        }
    }

    /**
     * Broadcast user online/offline status
     */
    async broadcastUserStatus(userId, status) {
        try {
            // Get user's active conversations
            const participants = await prisma.conversationParticipant.findMany({
                where: { userId },
                select: { conversationId: true }
            });

            // Broadcast to all conversations
            participants.forEach(({ conversationId }) => {
                this.io.to(`conversation:${conversationId}`).emit('user:status', {
                    userId,
                    status,
                    timestamp: new Date()
                });
            });
        } catch (error) {
            console.error('Error broadcasting user status:', error);
        }
    }

    /**
     * Emit new message to conversation participants
     */
    emitNewMessage(conversationId, message, senderId) {
        this.io.to(`conversation:${conversationId}`).emit('message:new', {
            conversationId,
            message,
            senderId,
            timestamp: new Date()
        });
    }

    /**
     * Emit message update
     */
    emitMessageUpdate(conversationId, messageId, updates) {
        this.io.to(`conversation:${conversationId}`).emit('message:updated', {
            conversationId,
            messageId,
            updates,
            timestamp: new Date()
        });
    }

    /**
     * Emit message deletion
     */
    emitMessageDelete(conversationId, messageId) {
        this.io.to(`conversation:${conversationId}`).emit('message:deleted', {
            conversationId,
            messageId,
            timestamp: new Date()
        });
    }

    /**
     * Emit conversation update
     */
    emitConversationUpdate(conversationId, updates) {
        this.io.to(`conversation:${conversationId}`).emit('conversation:updated', {
            conversationId,
            updates,
            timestamp: new Date()
        });
    }

    /**
     * Check if user is online
     */
    isUserOnline(userId) {
        return this.userSockets.has(userId);
    }

    /**
     * Get online users in a conversation
     */
    async getOnlineParticipants(conversationId) {
        const participants = await prisma.conversationParticipant.findMany({
            where: { conversationId },
            select: { userId: true }
        });

        return participants
            .map(p => p.userId)
            .filter(userId => this.isUserOnline(userId));
    }

    /**
     * Send notification to specific user
     */
    notifyUser(userId, event, data) {
        if (this.userSockets.has(userId)) {
            this.io.to(`user:${userId}`).emit(event, data);
        }
    }

    /**
     * Get Socket.IO instance
     */
    getIO() {
        if (!this.io) {
            throw new Error('Socket.IO not initialized. Call initialize() first.');
        }
        return this.io;
    }
}

// Export singleton instance
const socketConfig = new SocketConfig();
module.exports = socketConfig;
