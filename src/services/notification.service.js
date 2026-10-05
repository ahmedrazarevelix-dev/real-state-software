const prisma = require("../config/prisma.client");
const ApiError = require("../utils/ApiError");
const mailerUtil = require("../utils/mailer.util");

class NotificationService {
    
    // ══════════════════════════════════════════════════════════════════════════
    // CREATE & SEND NOTIFICATIONS
    // ══════════════════════════════════════════════════════════════════════════
    
    /**
     * Create notification
     * @param {string} userId - User ID
     * @param {Object} data - Notification data
     * @returns {Promise<Object>} Created notification
     */
    async create(userId, data) {
        const {
            type,
            priority = 'MEDIUM',
            title,
            message,
            category,
            entityType,
            entityId,
            actionUrl,
            actionLabel,
            metadata,
        } = data;

        // Check user preferences
        const preferences = await this.getUserPreferences(userId);
        
        if (!this.shouldSendNotification(type, category, preferences)) {
            console.log(`[NOTIFICATION-SKIPPED] User ${userId} has disabled ${type} ${category} notifications`);
            return null;
        }

        const notification = await prisma.notification.create({
            data: {
                userId,
                type,
                priority,
                title,
                message,
                category,
                entityType: entityType || null,
                entityId: entityId || null,
                actionUrl: actionUrl || null,
                actionLabel: actionLabel || null,
                metadata: metadata || null,
                status: 'PENDING',
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phone: true,
                    },
                },
            },
        });

        // Send notification asynchronously
        this.send(notification.id).catch(err => {
            console.error('[NOTIFICATION-SEND-ERROR]', err.message);
        });

        return notification;
    }

    /**
     * Send notification
     * @param {string} notificationId - Notification ID
     * @returns {Promise<Object>} Updated notification
     */
    async send(notificationId) {
        const notification = await prisma.notification.findUnique({
            where: { id: notificationId },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phone: true,
                    },
                },
            },
        });

        if (!notification) {
            throw new ApiError(404, "Notification not found");
        }

        if (notification.status === 'SENT') {
            return notification;
        }

        try {
            if (notification.type === 'EMAIL') {
                await this.sendEmail(notification);
            } else if (notification.type === 'SMS') {
                await this.sendSMS(notification);
            }
            // IN_APP notifications don't need external sending

            // Mark as sent
            const updated = await prisma.notification.update({
                where: { id: notificationId },
                data: {
                    status: notification.type === 'IN_APP' ? 'SENT' : 'SENT',
                    sentAt: new Date(),
                },
            });

            return updated;
        } catch (error) {
            // Mark as failed
            await prisma.notification.update({
                where: { id: notificationId },
                data: {
                    status: 'FAILED',
                    failureReason: error.message,
                },
            });

            throw error;
        }
    }

    /**
     * Send email notification
     * @param {Object} notification - Notification object
     */
    async sendEmail(notification) {
        const { user, title, message, actionUrl, actionLabel, category } = notification;

        if (!user.email) {
            throw new Error("User has no email address");
        }

        const emailSubject = title;
        const emailBody = this.formatEmailBody(notification);

        await mailerUtil.sendMail({
            to: user.email,
            subject: emailSubject,
            html: emailBody,
        });

        console.log(`[EMAIL-SENT] ${category} notification sent to ${user.email}`);
    }

    /**
     * Send SMS notification
     * @param {Object} notification - Notification object
     */
    async sendSMS(notification) {
        const { user, message } = notification;

        if (!user.phone) {
            throw new Error("User has no phone number");
        }

        // TODO: Integrate Twilio or SMS service
        // For now, just log
        console.log(`[SMS] Would send to ${user.phone}: ${message}`);
        
        // Placeholder for actual SMS sending
        // await smsUtil.sendSMS(user.phone, message);
    }

    /**
     * Format email body with HTML template
     * @param {Object} notification - Notification object
     * @returns {string} HTML email body
     */
    formatEmailBody(notification) {
        const { user, title, message, actionUrl, actionLabel, priority } = notification;

        const priorityColor = {
            LOW: '#808080',
            MEDIUM: '#4CAF50',
            HIGH: '#FF9800',
            URGENT: '#F44336',
        };

        return `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .priority { display: inline-block; padding: 5px 10px; border-radius: 5px; font-size: 12px; font-weight: bold; color: white; background: ${priorityColor[priority]}; }
        .message { background: white; padding: 20px; margin: 20px 0; border-left: 4px solid ${priorityColor[priority]}; border-radius: 5px; }
        .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; color: #999; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🏢 BMS Notification</h1>
        </div>
        <div class="content">
            <p>Hello <strong>${user.name}</strong>,</p>
            <div class="message">
                <span class="priority">${priority}</span>
                <h2>${title}</h2>
                <p>${message}</p>
            </div>
            ${actionUrl ? `<a href="${actionUrl}" class="button">${actionLabel || 'View Details'}</a>` : ''}
            <p>If you have any questions, please contact support.</p>
        </div>
        <div class="footer">
            <p>&copy; 2026 Building Management System. All rights reserved.</p>
            <p>You are receiving this because you are registered on our system.</p>
        </div>
    </div>
</body>
</html>
        `;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // QUERY NOTIFICATIONS
    // ══════════════════════════════════════════════════════════════════════════
    
    /**
     * Get user notifications
     * @param {string} userId - User ID
     * @param {Object} filters - Filters (status, category, type)
     * @param {Object} pagination - Pagination (limit, offset)
     * @returns {Promise<Object>} Notifications with pagination
     */
    async getUserNotifications(userId, filters = {}, pagination = {}) {
        const { status, category, type, unreadOnly } = filters;
        const { limit = 50, offset = 0 } = pagination;

        const whereClause = { userId };

        if (status) whereClause.status = status;
        if (category) whereClause.category = category;
        if (type) whereClause.type = type;
        if (unreadOnly) whereClause.readAt = null;

        const [notifications, total, unreadCount] = await Promise.all([
            prisma.notification.findMany({
                where: whereClause,
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip: offset,
            }),
            prisma.notification.count({ where: whereClause }),
            prisma.notification.count({
                where: {
                    userId,
                    readAt: null,
                },
            }),
        ]);

        return {
            notifications,
            total,
            unreadCount,
            limit,
            offset,
            hasMore: offset + notifications.length < total,
        };
    }

    /**
     * Get unread count
     * @param {string} userId - User ID
     * @returns {Promise<number>} Unread count
     */
    async getUnreadCount(userId) {
        return await prisma.notification.count({
            where: {
                userId,
                readAt: null,
            },
        });
    }

    /**
     * Mark notification as read
     * @param {string} notificationId - Notification ID
     * @param {string} userId - User ID (for authorization)
     * @returns {Promise<Object>} Updated notification
     */
    async markAsRead(notificationId, userId) {
        const notification = await prisma.notification.findUnique({
            where: { id: notificationId },
        });

        if (!notification) {
            throw new ApiError(404, "Notification not found");
        }

        if (notification.userId !== userId) {
            throw new ApiError(403, "Unauthorized");
        }

        if (notification.readAt) {
            return notification; // Already read
        }

        return await prisma.notification.update({
            where: { id: notificationId },
            data: {
                readAt: new Date(),
                status: 'READ',
            },
        });
    }

    /**
     * Mark all notifications as read
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Update result
     */
    async markAllAsRead(userId) {
        const result = await prisma.notification.updateMany({
            where: {
                userId,
                readAt: null,
            },
            data: {
                readAt: new Date(),
                status: 'READ',
            },
        });

        return result;
    }

    /**
     * Delete notification
     * @param {string} notificationId - Notification ID
     * @param {string} userId - User ID (for authorization)
     * @returns {Promise<Object>} Deleted notification
     */
    async delete(notificationId, userId) {
        const notification = await prisma.notification.findUnique({
            where: { id: notificationId },
        });

        if (!notification) {
            throw new ApiError(404, "Notification not found");
        }

        if (notification.userId !== userId) {
            throw new ApiError(403, "Unauthorized");
        }

        return await prisma.notification.delete({
            where: { id: notificationId },
        });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // USER PREFERENCES
    // ══════════════════════════════════════════════════════════════════════════
    
    /**
     * Get user notification preferences
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Preferences
     */
    async getUserPreferences(userId) {
        let preferences = await prisma.notificationPreference.findUnique({
            where: { userId },
        });

        // Create default preferences if not exist
        if (!preferences) {
            preferences = await prisma.notificationPreference.create({
                data: { userId },
            });
        }

        return preferences;
    }

    /**
     * Update user notification preferences
     * @param {string} userId - User ID
     * @param {Object} updates - Preference updates
     * @returns {Promise<Object>} Updated preferences
     */
    async updateUserPreferences(userId, updates) {
        const preferences = await this.getUserPreferences(userId);

        return await prisma.notificationPreference.update({
            where: { id: preferences.id },
            data: updates,
        });
    }

    /**
     * Check if notification should be sent based on user preferences
     * @param {string} type - Notification type (EMAIL, SMS, IN_APP)
     * @param {string} category - Category (BILLING, INVESTMENT, etc.)
     * @param {Object} preferences - User preferences
     * @returns {boolean} Should send
     */
    shouldSendNotification(type, category, preferences) {
        if (type === 'IN_APP') {
            return preferences.inAppEnabled;
        }

        if (type === 'EMAIL') {
            if (!preferences.emailEnabled) return false;

            const categoryMap = {
                LISTING: preferences.emailListings,
                INQUIRY: preferences.emailInquiries,
                TOUR: preferences.emailTours,
                AUTH: preferences.emailSecurity,
            };

            return categoryMap[category] !== false;
        }

        if (type === 'SMS') {
            if (!preferences.smsEnabled) return false;

            const categoryMap = {
                LISTING: preferences.smsListings,
                INQUIRY: preferences.smsInquiries,
                AUTH: preferences.smsSecurity,
            };

            return categoryMap[category] !== false;
        }

        return true;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // HELPER FUNCTIONS FOR COMMON NOTIFICATIONS
    // ══════════════════════════════════════════════════════════════════════════
    
    async notifyInquiry(agentId, data) {
        return this.create(agentId, {
            type: "IN_APP",
            priority: "HIGH",
            title: "New listing inquiry",
            message: `${data.buyerName} asked about "${data.listingTitle}"`,
            category: "INQUIRY",
            entityType: "ListingInquiry",
            entityId: data.inquiryId,
            actionUrl: `/listings/${data.listingId}`,
            actionLabel: "View listing",
        });
    }

    async notifyTour(agentId, data) {
        return this.create(agentId, {
            type: "IN_APP",
            priority: "HIGH",
            title: "New tour request",
            message: `${data.buyerName} requested a visit for "${data.listingTitle}"`,
            category: "TOUR",
            entityType: "TourRequest",
            entityId: data.tourId,
            actionUrl: `/listings/${data.listingId}`,
            actionLabel: "View listing",
        });
    }

    async notifyTourStatus(buyerId, data) {
        return this.create(buyerId, {
            type: "IN_APP",
            priority: "MEDIUM",
            title: "Tour update",
            message: `Your tour for "${data.listingTitle}" is now ${data.status}`,
            category: "TOUR",
            entityType: "TourRequest",
            entityId: data.tourId,
            actionUrl: `/listings/${data.listingId}`,
            actionLabel: "View listing",
        });
    }
}

module.exports = new NotificationService();
