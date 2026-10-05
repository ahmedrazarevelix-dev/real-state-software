const socketConfig = require('../config/socket.config');
const prisma = require('../config/prisma.client');

class SocketService {
    /**
     * Broadcast new message to conversation participants
     */
    async broadcastNewMessage(conversationId, message) {
        try {
            // Get conversation participants
            const participants = await prisma.conversationParticipant.findMany({
                where: { conversationId },
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true
                        }
                    }
                }
            });

            // Format message for broadcast
            const messageData = {
                id: message.id,
                conversationId: message.conversationId,
                senderId: message.senderId,
                body: message.body,
                createdAt: message.createdAt,
                editedAt: message.editedAt,
                deletedAt: message.deletedAt
            };

            // Emit to all participants in the conversation room
            socketConfig.emitNewMessage(conversationId, messageData, message.senderId);

            // Send push notifications to offline users
            const offlineParticipants = participants.filter(
                p => p.userId !== message.senderId && !socketConfig.isUserOnline(p.userId)
            );

            // Notify offline users (can integrate with notification service)
            for (const participant of offlineParticipants) {
                await this.sendOfflineNotification(participant.userId, conversationId, message);
            }

            return { success: true, participantsNotified: participants.length };
        } catch (error) {
            console.error('Error broadcasting new message:', error);
            throw error;
        }
    }

    /**
     * Broadcast message update
     */
    async broadcastMessageUpdate(conversationId, messageId, updates) {
        try {
            socketConfig.emitMessageUpdate(conversationId, messageId, updates);
            return { success: true };
        } catch (error) {
            console.error('Error broadcasting message update:', error);
            throw error;
        }
    }

    /**
     * Broadcast single message read receipt
     */
    async broadcastMessageRead(conversationId, messageId, userId) {
        try {
            socketConfig.getIO().to(`conversation:${conversationId}`).emit('message:read', {
                conversationId,
                messageId,
                userId,
                readAt: new Date()
            });
            return { success: true };
        } catch (error) {
            console.error('Error broadcasting message read:', error);
            throw error;
        }
    }

    /**
     * Broadcast multiple messages read (auto-read on GET)
     */
    async broadcastMessagesRead(conversationId, userId, messageIds) {
        try {
            socketConfig.getIO().to(`conversation:${conversationId}`).emit('messages:read', {
                conversationId,
                userId,
                messageIds,
                readAt: new Date()
            });
            return { success: true };
        } catch (error) {
            console.error('Error broadcasting messages read:', error);
            throw error;
        }
    }

    /**
     * Broadcast message deletion
     */
    async broadcastMessageDelete(conversationId, messageId) {
        try {
            socketConfig.emitMessageDelete(conversationId, messageId);
            return { success: true };
        } catch (error) {
            console.error('Error broadcasting message deletion:', error);
            throw error;
        }
    }

    /**
     * Broadcast conversation update
     */
    async broadcastConversationUpdate(conversationId, updates) {
        try {
            socketConfig.emitConversationUpdate(conversationId, updates);
            return { success: true };
        } catch (error) {
            console.error('Error broadcasting conversation update:', error);
            throw error;
        }
    }

    /**
     * Notify user about new conversation
     */
    async notifyNewConversation(userId, conversation) {
        try {
            socketConfig.notifyUser(userId, 'conversation:new', {
                conversation,
                timestamp: new Date()
            });
            return { success: true };
        } catch (error) {
            console.error('Error notifying new conversation:', error);
            throw error;
        }
    }

    /**
     * Get online status of conversation participants
     */
    async getConversationOnlineStatus(conversationId) {
        try {
            const participants = await prisma.conversationParticipant.findMany({
                where: { conversationId },
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true
                        }
                    }
                }
            });

            const onlineStatus = participants.map(p => ({
                userId: p.userId,
                userName: p.user.name,
                isOnline: socketConfig.isUserOnline(p.userId),
                lastSeenAt: p.lastReadAt
            }));

            return onlineStatus;
        } catch (error) {
            console.error('Error getting online status:', error);
            throw error;
        }
    }

    /**
     * Send typing indicator
     */
    async notifyTyping(conversationId, userId, isTyping) {
        try {
            const event = isTyping ? 'typing:start' : 'typing:stop';
            
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { name: true }
            });

            socketConfig.getIO().to(`conversation:${conversationId}`).emit(event, {
                userId,
                userName: user?.name,
                conversationId,
                timestamp: new Date()
            });

            return { success: true };
        } catch (error) {
            console.error('Error notifying typing:', error);
            throw error;
        }
    }

    /**
     * Get unread message count for user
     */
    async getUnreadCount(userId) {
        try {
            const conversations = await prisma.conversationParticipant.findMany({
                where: { userId },
                include: {
                    conversation: {
                        include: {
                            messages: {
                                where: {
                                    senderId: { not: userId },
                                    readAt: null // Only unread messages
                                },
                                select: { 
                                    id: true
                                }
                            }
                        }
                    }
                }
            });

            const totalUnread = conversations.reduce((sum, participant) => {
                return sum + participant.conversation.messages.length;
            }, 0);

            return { totalUnread, conversations: conversations.length };
        } catch (error) {
            console.error('Error getting unread count:', error);
            throw error;
        }
    }

    /**
     * Mark conversation as read
     * Only marks messages sent TO the logged-in user (not sent BY the user)
     * Returns full conversation details with marked messages
     */
    async markConversationAsRead(conversationId, userId) {
        try {
            const readTime = new Date();
            
            // Check if user is participant
            const participant = await prisma.conversationParticipant.findUnique({
                where: {
                    conversationId_userId: {
                        conversationId,
                        userId
                    }
                },
                select: { lastReadAt: true }
            });

            if (!participant) {
                throw new Error('User is not a participant in this conversation');
            }

            const previousReadAt = participant.lastReadAt || new Date(0);
            
            // Update participant's lastReadAt timestamp
            await prisma.conversationParticipant.update({
                where: {
                    conversationId_userId: {
                        conversationId,
                        userId
                    }
                },
                data: {
                    lastReadAt: readTime
                }
            });

            // Get messages that were just marked as read
            const markedMessages = await prisma.conversationMessage.findMany({
                where: {
                    conversationId,
                    senderId: { not: userId }, // Only messages sent TO this user
                    createdAt: {
                        lte: readTime,
                        gt: previousReadAt
                    }
                },
                include: {
                    sender: {
                        select: {
                            id: true,
                            name: true,
                            email: true
                        }
                    }
                },
                orderBy: { createdAt: 'asc' }
            });

            // Get ALL messages sent TO this user in the conversation
            const allMessagesReceivedByUser = await prisma.conversationMessage.findMany({
                where: {
                    conversationId,
                    senderId: { not: userId } // Only messages sent TO this user
                },
                include: {
                    sender: {
                        select: {
                            id: true,
                            name: true,
                            email: true
                        }
                    }
                },
                orderBy: { createdAt: 'asc' }
            });

            // Get full conversation details
            const conversation = await prisma.conversation.findUnique({
                where: { id: conversationId },
                include: {
                    participants: {
                        include: {
                            user: {
                                select: {
                                    id: true,
                                    name: true,
                                    email: true
                                }
                            }
                        }
                    },
                    listing: {
                        select: {
                            id: true,
                            reference: true,
                            title: true,
                            city: true,
                            location: true
                        }
                    }
                }
            });

            // Notify other participants about read receipt
            socketConfig.getIO().to(`conversation:${conversationId}`).emit('conversation:read', {
                conversationId,
                userId,
                readAt: readTime
            });

            return { 
                success: true, 
                markedCount: markedMessages.length,
                readAt: readTime,
                newlyMarkedMessages: markedMessages, // Just marked as read
                messagesReceivedByUser: allMessagesReceivedByUser, // All messages sent TO this user
                conversation: {
                    id: conversation.id,
                    subject: conversation.subject,
                    listingId: conversation.listingId,
                    listing: conversation.listing,
                    participants: conversation.participants.map(p => ({
                        userId: p.userId,
                        name: p.user.name,
                        email: p.user.email,
                        lastReadAt: p.lastReadAt
                    }))
                }
            };
        } catch (error) {
            console.error('Error marking conversation as read:', error);
            throw error;
        }
    }

    /**
     * Send offline notification (integrate with notification service)
     */
    async sendOfflineNotification(userId, conversationId, message) {
        try {
            // Get conversation details
            const conversation = await prisma.conversation.findUnique({
                where: { id: conversationId },
                include: {
                    listing: {
                        select: { title: true, reference: true }
                    }
                }
            });

            const sender = await prisma.user.findUnique({
                where: { id: message.senderId },
                select: { name: true }
            });

            // Create notification record
            await prisma.notification.create({
                data: {
                    userId,
                    type: 'IN_APP',
                    priority: 'MEDIUM',
                    status: 'PENDING',
                    title: 'New Message',
                    message: `${sender?.name || 'Someone'} sent you a message${conversation?.listing ? ` about ${conversation.listing.title}` : ''}`,
                    category: 'messages',
                    entityType: 'conversation',
                    entityId: conversationId,
                    actionUrl: `/conversations/${conversationId}`,
                    actionLabel: 'View Message',
                    metadata: {
                        messageId: message.id,
                        senderId: message.senderId,
                        senderName: sender?.name,
                        messagePreview: message.body.substring(0, 100)
                    }
                }
            });

            return { success: true };
        } catch (error) {
            console.error('Error sending offline notification:', error);
            // Don't throw - notification failure shouldn't break message delivery
            return { success: false, error: error.message };
        }
    }

    /**
     * Notify user about inquiry response
     */
    async notifyInquiryResponse(userId, inquiry) {
        try {
            socketConfig.notifyUser(userId, 'inquiry:response', {
                inquiry,
                timestamp: new Date()
            });
            return { success: true };
        } catch (error) {
            console.error('Error notifying inquiry response:', error);
            throw error;
        }
    }

    /**
     * Notify user about tour request update
     */
    async notifyTourUpdate(userId, tour) {
        try {
            socketConfig.notifyUser(userId, 'tour:update', {
                tour,
                timestamp: new Date()
            });
            return { success: true };
        } catch (error) {
            console.error('Error notifying tour update:', error);
            throw error;
        }
    }

    /**
     * Broadcast listing update to interested users
     */
    async broadcastListingUpdate(listingId, updates) {
        try {
            // Get users who saved this listing
            const savedBy = await prisma.savedListing.findMany({
                where: { listingId },
                select: { userId: true }
            });

            // Get users who inquired about this listing
            const inquiries = await prisma.listingInquiry.findMany({
                where: { listingId },
                select: { buyerId: true }
            });

            const interestedUsers = [
                ...new Set([
                    ...savedBy.map(s => s.userId),
                    ...inquiries.map(i => i.buyerId)
                ])
            ];

            // Notify interested users
            interestedUsers.forEach(userId => {
                socketConfig.notifyUser(userId, 'listing:updated', {
                    listingId,
                    updates,
                    timestamp: new Date()
                });
            });

            return { success: true, usersNotified: interestedUsers.length };
        } catch (error) {
            console.error('Error broadcasting listing update:', error);
            throw error;
        }
    }

    /**
     * Get connection statistics
     */
    getConnectionStats() {
        const io = socketConfig.getIO();
        const sockets = io.sockets.sockets;
        
        return {
            totalConnections: sockets.size,
            uniqueUsers: socketConfig.userSockets.size,
            rooms: Array.from(io.sockets.adapter.rooms.keys()).filter(
                room => room.startsWith('conversation:') || room.startsWith('user:')
            ).length
        };
    }

    /**
     * Disconnect user's sockets (for admin actions)
     */
    async disconnectUser(userId, reason = 'Administrative action') {
        try {
            const userSocketIds = socketConfig.userSockets.get(userId);
            
            if (userSocketIds) {
                const io = socketConfig.getIO();
                userSocketIds.forEach(socketId => {
                    const socket = io.sockets.sockets.get(socketId);
                    if (socket) {
                        socket.emit('force:disconnect', { reason });
                        socket.disconnect(true);
                    }
                });
            }

            return { success: true, disconnected: userSocketIds?.size || 0 };
        } catch (error) {
            console.error('Error disconnecting user:', error);
            throw error;
        }
    }
}

module.exports = new SocketService();
