const prisma = require("../config/prisma.client");
const ApiError = require("../utils/ApiError");

const participantInclude = {
    user: { select: { id: true, name: true, email: true } },
};

class MessagingService {
    async getRole(userId) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, status: true, userRole: { select: { role: { select: { roleName: true } } } } },
        });
        if (!user) throw new ApiError(404, "User not found");
        return { ...user, role: user.userRole?.role?.roleName || null };
    }

    isAdmin(role) {
        return role === "admin" || role === "super_admin";
    }

    async ensureActiveUser(userId) {
        const user = await this.getRole(userId);
        if (user.status !== "active") throw new ApiError(403, "Only active users can use messaging");
        return user;
    }

    async ensureNotBlocked(firstUserId, secondUserId) {
        const block = await prisma.userBlock.findFirst({
            where: {
                OR: [
                    { blockerId: firstUserId, blockedId: secondUserId },
                    { blockerId: secondUserId, blockedId: firstUserId },
                ],
            },
        });
        if (block) throw new ApiError(403, "Messaging is blocked between these users");
    }

    async hasBusinessRelationship(senderId, recipientId, listingId) {
        if (!listingId) return false;

        const [listing, inquiry, tour] = await Promise.all([
            prisma.propertyListing.findUnique({ where: { id: listingId }, select: { listedById: true } }),
            prisma.listingInquiry.findFirst({ where: { listingId, buyerId: { in: [senderId, recipientId] } }, select: { buyerId: true } }),
            prisma.tourRequest.findFirst({ where: { listingId, buyerId: { in: [senderId, recipientId] } }, select: { buyerId: true } }),
        ]);
        if (!listing) throw new ApiError(404, "Listing not found");

        const participantIds = new Set([senderId, recipientId]);
        const listingOwnerIsParticipant = participantIds.has(listing.listedById);
        const hasInquiryOrTour = Boolean(inquiry || tour);
        if (hasInquiryOrTour && listingOwnerIsParticipant) return true;

        const [sender, recipient] = await Promise.all([
            this.getRole(senderId),
            this.getRole(recipientId),
        ]);
        const roles = new Set([sender.role, recipient.role]);
        const sellerAgentPair = roles.has("seller") && roles.has("agent");
        const buyerAgentPair = roles.has("buyer") && roles.has("agent");
        return listingOwnerIsParticipant && (sellerAgentPair || buyerAgentPair);
    }

    async findConversation(userId, recipientId, listingId) {
        const conversations = await prisma.conversation.findMany({
            where: listingId ? { listingId } : {},
            include: { participants: { select: { userId: true } } },
        });
        return conversations.find((conversation) => {
            const ids = new Set(conversation.participants.map((participant) => participant.userId));
            return ids.has(userId) && ids.has(recipientId) && ids.size === 2;
        });
    }

    async startConversation(userId, data) {
        const sender = await this.ensureActiveUser(userId);
        const recipient = await this.ensureActiveUser(data.recipientId);
        if (sender.id === recipient.id) throw new ApiError(400, "You cannot message yourself");
        await this.ensureNotBlocked(sender.id, recipient.id);

        if (!this.isAdmin(sender.role) && !this.isAdmin(recipient.role)) {
            const allowed = await this.hasBusinessRelationship(sender.id, recipient.id, data.listingId);
            if (!allowed) throw new ApiError(403, "A listing, inquiry, or tour relationship is required to start this conversation");
        }

        const existing = await this.findConversation(sender.id, recipient.id, data.listingId);
        if (existing) {
            return this.sendMessage(existing.id, sender.id, sender.role, data.message);
        }

        return prisma.$transaction(async (transaction) => {
            const conversation = await transaction.conversation.create({
                data: {
                    listingId: data.listingId || null,
                    startedById: sender.id,
                    subject: data.subject || null,
                    participants: {
                        create: [{ userId: sender.id }, { userId: recipient.id }],
                    },
                    messages: { create: { senderId: sender.id, body: data.message } },
                },
                include: { participants: { include: participantInclude }, messages: true },
            });
            return conversation;
        });
    }

    async listConversations(userId) {
        await this.ensureActiveUser(userId);
        // SECURITY: Only show user's own conversations (no admin exception)
        return prisma.conversation.findMany({
            where: { participants: { some: { userId } } },
            include: {
                listing: { select: { id: true, reference: true, title: true } },
                participants: { include: participantInclude },
                messages: { orderBy: { createdAt: "desc" }, take: 1 },
            },
            orderBy: { updatedAt: "desc" },
        });
    }

    async getConversation(userId, conversationId) {
        await this.ensureActiveUser(userId);
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            include: {
                listing: { select: { id: true, reference: true, title: true, listedById: true } },
                participants: { include: participantInclude },
                messages: { orderBy: { createdAt: "asc" }, include: { sender: { select: { id: true, name: true } } } },
            },
        });
        if (!conversation) throw new ApiError(404, "Conversation not found");
        
        // SECURITY: Only participants can view (no admin exception)
        const isParticipant = conversation.participants.some((participant) => participant.userId === userId);
        if (!isParticipant) {
            throw new ApiError(403, "You are not a participant in this conversation");
        }
        
        return conversation;
    }

    async sendMessage(conversationId, userId, role, body) {
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            include: { participants: { select: { userId: true } } },
        });
        if (!conversation) throw new ApiError(404, "Conversation not found");
        
        // SECURITY: Only participants can send (no admin exception)
        const isParticipant = conversation.participants.some((participant) => participant.userId === userId);
        if (!isParticipant) {
            throw new ApiError(403, "You are not a participant in this conversation");
        }
        
        const otherParticipant = conversation.participants.find((participant) => participant.userId !== userId);
        if (otherParticipant) await this.ensureNotBlocked(userId, otherParticipant.userId);
        
        return prisma.conversationMessage.create({
            data: { 
                conversationId, 
                senderId: userId, 
                body,
                deliveredAt: new Date() // Auto-delivered on send
            },
            include: { sender: { select: { id: true, name: true } } },
        });
    }

    async blockUser(userId, blockedId) {
        if (userId === blockedId) throw new ApiError(400, "You cannot block yourself");
        await this.ensureActiveUser(blockedId);
        return prisma.userBlock.upsert({
            where: { blockerId_blockedId: { blockerId: userId, blockedId } },
            create: { blockerId: userId, blockedId },
            update: {},
        });
    }

    async unblockUser(userId, blockedId) {
        await prisma.userBlock.deleteMany({ where: { blockerId: userId, blockedId } });
        return { message: "User unblocked successfully" };
    }

    async getMessages(conversationId, userId, page = 1, limit = 50) {
        await this.ensureActiveUser(userId);
        
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            include: { participants: { select: { userId: true } } },
        });
        
        if (!conversation) throw new ApiError(404, "Conversation not found");
        
        // SECURITY: Only participants can view messages (no admin exception)
        const isParticipant = conversation.participants.some(p => p.userId === userId);
        if (!isParticipant) {
            throw new ApiError(403, "You are not a participant in this conversation");
        }

        const skip = (page - 1) * limit;
        
        const [messages, total] = await Promise.all([
            prisma.conversationMessage.findMany({
                where: { conversationId },
                include: {
                    sender: { select: { id: true, name: true, email: true } }
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit
            }),
            prisma.conversationMessage.count({ where: { conversationId } })
        ]);

        // AUTO-MARK AS READ: Messages sent TO this user that are unread
        const unreadMessageIds = messages
            .filter(msg => msg.senderId !== userId && !msg.readAt)
            .map(msg => msg.id);

        if (unreadMessageIds.length > 0) {
            await prisma.conversationMessage.updateMany({
                where: {
                    id: { in: unreadMessageIds }
                },
                data: {
                    readAt: new Date()
                }
            });

            // Broadcast read receipt via WebSocket
            const socketService = require('./socket.service');
            await socketService.broadcastMessagesRead(conversationId, userId, unreadMessageIds);
        }

        return {
            messages: messages.reverse(), // Reverse to show oldest first
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            },
            markedAsRead: unreadMessageIds.length // How many messages auto-marked
        };
    }

    async updateMessage(conversationId, messageId, userId, newBody) {
        const message = await prisma.conversationMessage.findUnique({
            where: { id: messageId }
        });

        if (!message) throw new ApiError(404, "Message not found");
        if (message.conversationId !== conversationId) {
            throw new ApiError(400, "Message does not belong to this conversation");
        }
        if (message.senderId !== userId) {
            throw new ApiError(403, "You can only edit your own messages");
        }
        if (message.deletedAt) {
            throw new ApiError(400, "Cannot edit a deleted message");
        }

        return prisma.conversationMessage.update({
            where: { id: messageId },
            data: {
                body: newBody,
                editedAt: new Date()
            },
            include: {
                sender: { select: { id: true, name: true } }
            }
        });
    }

    async deleteMessage(conversationId, messageId, userId) {
        const message = await prisma.conversationMessage.findUnique({
            where: { id: messageId }
        });

        if (!message) throw new ApiError(404, "Message not found");
        if (message.conversationId !== conversationId) {
            throw new ApiError(400, "Message does not belong to this conversation");
        }
        if (message.senderId !== userId) {
            throw new ApiError(403, "You can only delete your own messages");
        }

        // Hard delete: physically remove from database
        return prisma.conversationMessage.delete({
            where: { id: messageId }
        });
    }

    // NEW: Manual mark individual message as read
    async markMessageAsRead(conversationId, messageId, userId) {
        const message = await prisma.conversationMessage.findUnique({
            where: { id: messageId },
            include: {
                conversation: {
                    include: { participants: true }
                },
                sender: {
                    select: { id: true, name: true, email: true }
                }
            }
        });

        if (!message) throw new ApiError(404, "Message not found");
        if (message.conversationId !== conversationId) {
            throw new ApiError(400, "Message does not belong to this conversation");
        }

        const isParticipant = message.conversation.participants.some(p => p.userId === userId);
        if (!isParticipant) {
            throw new ApiError(403, "You are not a participant in this conversation");
        }

        if (message.senderId === userId) {
            throw new ApiError(400, "Cannot mark your own message as read");
        }

        const updatedMessage = await prisma.conversationMessage.update({
            where: { id: messageId },
            data: { readAt: new Date() }
        });

        // Broadcast read receipt
        const socketService = require('./socket.service');
        await socketService.broadcastMessageRead(conversationId, messageId, userId);

        return {
            messageId: updatedMessage.id,
            readAt: updatedMessage.readAt,
            status: 'read'
        };
    }

    // NEW: Get message status
    async getMessageStatus(conversationId, messageId, userId) {
        const message = await prisma.conversationMessage.findUnique({
            where: { id: messageId },
            include: {
                conversation: {
                    include: { 
                        participants: true,
                        listing: {
                            select: {
                                id: true,
                                reference: true,
                                title: true
                            }
                        }
                    }
                },
                sender: {
                    select: { id: true, name: true, email: true }
                }
            }
        });

        if (!message) throw new ApiError(404, "Message not found");
        if (message.conversationId !== conversationId) {
            throw new ApiError(400, "Message does not belong to this conversation");
        }

        const isParticipant = message.conversation.participants.some(p => p.userId === userId);
        if (!isParticipant) {
            throw new ApiError(403, "You are not a participant in this conversation");
        }

        const status = message.readAt ? 'read' : 
                      message.deliveredAt ? 'delivered' : 
                      'sent';

        return {
            messageId: message.id,
            status,
            sentAt: message.createdAt,
            deliveredAt: message.deliveredAt,
            readAt: message.readAt,
            message: {
                id: message.id,
                conversationId: message.conversationId,
                body: message.body,
                sentAt: message.createdAt,
                deliveredAt: message.deliveredAt,
                readAt: message.readAt,
                editedAt: message.editedAt,
                deletedAt: message.deletedAt,
                sender: message.sender
            },
            conversation: {
                id: message.conversation.id,
                subject: message.conversation.subject,
                listingId: message.conversation.listingId,
                listing: message.conversation.listing
            }
        };
    }
}

module.exports = new MessagingService();
