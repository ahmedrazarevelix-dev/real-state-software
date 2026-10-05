const prisma = require("../config/prisma.client");
const ApiError = require("../utils/ApiError");
const notificationService = require("./notification.service");

class PurchaseApplicationService {

    // ── SUBMIT APPLICATION ────────────────────────────────────────────────

    async submitApplication(userId, applicationData) {
        const { listingId, ...appData } = applicationData;

        // 1. Check if listing exists and is for sale
        const listing = await prisma.propertyListing.findUnique({
            where: { id: listingId },
        });

        if (!listing) {
            throw new ApiError(404, "Property listing not found");
        }

        if (listing.purpose !== "sale") {
            throw new ApiError(400, "This property is not for sale");
        }

        if (listing.status !== "active" && listing.status !== "approved") {
            throw new ApiError(400, "This property listing is not available");
        }

        // 2. Check if user already has a pending/approved application
        const existingApplication = await prisma.purchaseApplication.findFirst({
            where: {
                applicantId: userId,
                listingId: listingId,
                status: {
                    in: ["submitted", "under_review", "documents_requested", "approved"],
                },
            },
        });

        if (existingApplication) {
            throw new ApiError(409, "You already have a pending or approved application for this property");
        }

        // 3. Validate down payment (should be reasonable percentage)
        const downPaymentPercentage = (appData.downPayment / appData.offerPrice) * 100;
        if (downPaymentPercentage < 5) {
            throw new ApiError(400, "Down payment should be at least 5% of offer price");
        }

        // 4. Create application
        const application = await prisma.purchaseApplication.create({
            data: {
                applicantId: userId,
                listingId: listingId,
                ...appData,
            },
            include: {
                listing: {
                    select: {
                        id: true,
                        title: true,
                        reference: true,
                        city: true,
                        location: true,
                        price: true,
                        listedById: true,
                    },
                },
                applicant: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
        });

        // 5. ✅ Notify buyer (applicant) - confirmation
        try {
            await notificationService.create(userId, {
                type: 'IN_APP',
                priority: 'HIGH',
                title: '✅ Application Submitted Successfully',
                message: `Your purchase application for ${application.listing.title} has been submitted successfully. You will be notified once the owner reviews it.`,
                category: 'PROPERTY',
                entityType: 'purchase_application',
                entityId: application.id,
                actionUrl: `/purchase-applications/${application.id}`,
                actionLabel: 'View Application',
                metadata: {
                    listingTitle: application.listing.title,
                    listingReference: application.listing.reference,
                    offerPrice: application.offerPrice
                }
            });
        } catch (notifError) {
            console.error('[PURCHASE-APP-BUYER-NOTIFICATION-ERROR]', notifError.message);
        }

        // 6. ✅ Notify property owner about new purchase application
        try {
            await notificationService.create(application.listing.listedById, {
                type: 'IN_APP',
                priority: 'HIGH',
                title: '🏠 New Purchase Application Received',
                message: `${application.applicant.name} submitted a purchase application for ${application.listing.title} with offer price PKR ${Number(application.offerPrice).toLocaleString()}`,
                category: 'PROPERTY',
                entityType: 'purchase_application',
                entityId: application.id,
                actionUrl: `/purchase-applications/${application.id}`,
                actionLabel: 'View Application',
                metadata: {
                    applicantName: application.applicant.name,
                    offerPrice: application.offerPrice,
                    listingTitle: application.listing.title,
                    listingReference: application.listing.reference
                }
            });
        } catch (notifError) {
            console.error('[PURCHASE-APP-NOTIFICATION-ERROR]', notifError.message);
            // Don't fail application submission if notification fails
        }

        return {
            application,
            message: "Purchase application submitted successfully. You will be notified once reviewed.",
        };
    }

    // ── GET APPLICATION BY ID (with engagement history) ───────────────────

    async getApplicationById(applicationId, userId, userRole) {
        const application = await prisma.purchaseApplication.findUnique({
            where: { id: applicationId },
            include: {
                listing: {
                    select: {
                        id: true,
                        title: true,
                        reference: true,
                        city: true,
                        location: true,
                        price: true,
                        listedById: true,
                    },
                },
                applicant: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phone: true,
                    },
                },
                documents: true,
                reviewer: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                purchaseAgreement: {
                    include: {
                        installments: {
                            orderBy: { installmentNumber: 'asc' },
                        },
                    },
                },
            },
        });

        if (!application) {
            throw new ApiError(404, "Application not found");
        }

        // ✅ AUTHORIZATION CHECK
        const isApplicant = application.applicantId === userId;
        const isPropertyOwner = application.listing.listedById === userId;
        const isAdmin = ["super_admin", "admin"].includes(userRole);
        
        // Allowed: Applicant, Property Owner (Agent/Seller), Admin
        if (!isApplicant && !isPropertyOwner && !isAdmin) {
            throw new ApiError(403, "You don't have permission to view this application");
        }

        // ✅ If withdrawn, ONLY applicant can view it (admins also cannot see)
        if (application.status === "withdrawn" && !isApplicant) {
            throw new ApiError(403, "This application has been withdrawn and is no longer visible");
        }

        // ✅ ENGAGEMENT HISTORY: Fetch for admin/landlord
        let enrichedData = {
            ...application,
            relatedHistory: null
        };

        if (isAdmin || isPropertyOwner) {
            enrichedData.relatedHistory = await this._fetchEngagementHistory(
                application.applicantId,
                application.listingId
            );
        }

        return enrichedData;
    }

    // ── FETCH ENGAGEMENT HISTORY (reusable) ───────────────────────────────

    async _fetchEngagementHistory(buyerId, listingId) {
        // Fetch inquiry history
        const inquiries = await prisma.listingInquiry.findMany({
            where: { buyerId, listingId },
            select: {
                id: true,
                message: true,
                phone: true,
                email: true,
                status: true,
                createdAt: true,
                updatedAt: true,
            },
            orderBy: { createdAt: 'desc' },
        });

        // Fetch tour history
        const tours = await prisma.tourRequest.findMany({
            where: { buyerId, listingId },
            select: {
                id: true,
                scheduledAt: true,
                notes: true,
                status: true,
                createdAt: true,
                updatedAt: true,
            },
            orderBy: { scheduledAt: 'desc' },
        });

        // Fetch lead status
        const lead = await prisma.listingLead.findUnique({
            where: {
                listingId_buyerId: { listingId, buyerId },
            },
            select: {
                interest: true,
                agentNote: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        // Fetch saved listing
        const savedListing = await prisma.savedListing.findUnique({
            where: {
                userId_listingId: { userId: buyerId, listingId },
            },
            select: { createdAt: true },
        });

        const engagementScore = this._calculateEngagementScore(
            inquiries.length,
            tours.length,
            lead,
            savedListing
        );

        return {
            inquiries: {
                count: inquiries.length,
                items: inquiries,
            },
            tours: {
                count: tours.length,
                items: tours,
                hasVisited: tours.some(t => t.status === 'completed'),
            },
            lead: lead || null,
            savedProperty: !!savedListing,
            savedAt: savedListing?.createdAt || null,
            engagementScore,
        };
    }

    // ── CALCULATE ENGAGEMENT SCORE ────────────────────────────────────────

    _calculateEngagementScore(inquiryCount, tourCount, lead, savedListing) {
        let score = 0;
        
        score += Math.min(inquiryCount * 10, 30);
        score += Math.min(tourCount * 20, 40);
        
        if (lead) {
            const interestPoints = {
                'watching': 5,
                'inquired': 10,
                'touring': 15,
                'interested': 20,
                'not_interested': 0,
            };
            score += interestPoints[lead.interest] || 0;
        }
        
        if (savedListing) score += 10;
        
        let level = 'low';
        if (score >= 70) level = 'high';
        else if (score >= 40) level = 'medium';
        
        return { score, level, maxScore: 100 };
    }

    // ── GET ALL APPLICATIONS ──────────────────────────────────────────────

    async getAllApplications(filters = {}, userId, userRole) {
        const { status, listingId, applicantId, limit = 20, skip = 0 } = filters;

        const where = {};

        // ✅ ROLE-BASED FILTERING
        if (userRole === "buyer") {
            // Buyers can ONLY see their own applications
            where.applicantId = userId;
        } else if (userRole === "agent") {
            // Agents can see:
            // 1. Applications they submitted (as buyer on behalf of client)
            // 2. Applications on their own property listings (EXCEPT withdrawn)
            where.OR = [
                { applicantId: userId },
                { listing: { listedById: userId }, status: { not: "withdrawn" } }
            ];
        } else if (userRole === "seller") {
            // Sellers can see applications on their own property listings (EXCEPT withdrawn)
            where.listing = { listedById: userId };
            where.status = { not: "withdrawn" };
        } else if (userRole === "super_admin" || userRole === "admin") {
            // Admins can see all applications (including withdrawn for compliance)
            if (applicantId) where.applicantId = applicantId;
        }

        if (status) where.status = status;
        if (listingId) where.listingId = listingId;

        const [applications, total] = await Promise.all([
            prisma.purchaseApplication.findMany({
                where,
                include: {
                    listing: {
                        select: {
                            id: true,
                            title: true,
                            reference: true,
                            city: true,
                            price: true,
                        },
                    },
                    applicant: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        },
                    },
                    documents: {
                        select: {
                            id: true,
                            documentType: true,
                            status: true,
                        },
                    },
                },
                take: parseInt(limit),
                skip: parseInt(skip),
                orderBy: { createdAt: "desc" },
            }),
            prisma.purchaseApplication.count({ where }),
        ]);

        // Add engagement summary for admin/landlord
        const isAdminOrLandlord = ["super_admin", "admin", "seller", "agent"].includes(userRole);
        
        if (isAdminOrLandlord && applications.length > 0) {
            const enrichedApplications = await Promise.all(
                applications.map(async (app) => {
                    const inquiryCount = await prisma.listingInquiry.count({
                        where: { buyerId: app.applicantId, listingId: app.listingId },
                    });

                    const tours = await prisma.tourRequest.findMany({
                        where: { buyerId: app.applicantId, listingId: app.listingId },
                        select: { status: true },
                    });

                    const lead = await prisma.listingLead.findUnique({
                        where: {
                            listingId_buyerId: {
                                listingId: app.listingId,
                                buyerId: app.applicantId,
                            },
                        },
                        select: { interest: true },
                    });

                    const savedListing = await prisma.savedListing.findUnique({
                        where: {
                            userId_listingId: {
                                userId: app.applicantId,
                                listingId: app.listingId,
                            },
                        },
                    });

                    const engagementScore = this._calculateEngagementScore(
                        inquiryCount,
                        tours.length,
                        lead,
                        savedListing
                    );

                    return {
                        ...app,
                        engagementSummary: {
                            inquiries: inquiryCount,
                            tours: tours.length,
                            hasVisited: tours.some(t => t.status === 'completed'),
                            leadInterest: lead?.interest || null,
                            savedProperty: !!savedListing,
                            score: engagementScore,
                        },
                    };
                })
            );

            return {
                applications: enrichedApplications,
                pagination: { total, limit: parseInt(limit), skip: parseInt(skip), hasMore: parseInt(skip) + applications.length < total },
            };
        }

        return {
            applications,
            pagination: { total, limit: parseInt(limit), skip: parseInt(skip), hasMore: parseInt(skip) + applications.length < total },
        };
    }

    // ── UPDATE APPLICATION ────────────────────────────────────────────────

    async updateApplication(applicationId, updateData, userId) {
        const application = await prisma.purchaseApplication.findUnique({
            where: { id: applicationId },
        });

        if (!application) {
            throw new ApiError(404, "Application not found");
        }

        if (application.applicantId !== userId) {
            throw new ApiError(403, "You can only update your own applications");
        }

        if (application.status !== "submitted") {
            throw new ApiError(400, "You can only update applications in 'submitted' status");
        }

        const updatedApplication = await prisma.purchaseApplication.update({
            where: { id: applicationId },
            data: updateData,
            include: {
                listing: {
                    select: { id: true, title: true, reference: true },
                },
            },
        });

        return {
            application: updatedApplication,
            message: "Application updated successfully",
        };
    }

    // ── WITHDRAW APPLICATION ──────────────────────────────────────────────

    async withdrawApplication(applicationId, userId) {
        const application = await prisma.purchaseApplication.findUnique({
            where: { id: applicationId },
        });
        
        if (!application) {
            throw new ApiError(404, "Application not found");
        }

        if (application.applicantId !== userId) {
            throw new ApiError(403, "You can only withdraw your own applications");
        }

        if (application.status === "approved") {
            throw new ApiError(400, "Cannot withdraw an approved application");
        }

        if (application.status === "withdrawn") {
            throw new ApiError(400, "Application is already withdrawn");
        }

        await prisma.purchaseApplication.update({
            where: { id: applicationId },
            data: { status: "withdrawn" },
        });

        return { message: "Application withdrawn successfully" };
    }

    // ── REACTIVATE WITHDRAWN APPLICATION ───────────────────────────────────

    async reactivateApplication(applicationId, userId) {
        const application = await prisma.purchaseApplication.findUnique({
            where: { id: applicationId },
        });

        if (!application) {
            throw new ApiError(404, "Application not found");
        }

        if (application.applicantId !== userId) {
            throw new ApiError(403, "You can only reactivate your own applications");
        }

        if (application.status !== "withdrawn") {
            throw new ApiError(400, "Only withdrawn applications can be reactivated");
        }

        const updatedApplication = await prisma.purchaseApplication.update({
            where: { id: applicationId },
            data: { status: "submitted" },
            include: {
                listing: {
                    select: {
                        id: true,
                        title: true,
                        reference: true,
                        city: true,
                        location: true,
                        price: true,
                        listedById: true,
                    },
                },
                applicant: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
        });

        // ✅ Notify property owner about reactivated application
        try {
            await notificationService.create(updatedApplication.listing.listedById, {
                type: 'IN_APP',
                priority: 'HIGH',
                title: '🔄 Purchase Application Reactivated',
                message: `${updatedApplication.applicant.name} has reactivated their purchase application for ${updatedApplication.listing.title}`,
                category: 'PROPERTY',
                entityType: 'purchase_application',
                entityId: updatedApplication.id,
                actionUrl: `/purchase-applications/${updatedApplication.id}`,
                actionLabel: 'View Application',
                metadata: {
                    applicantName: updatedApplication.applicant.name,
                    listingTitle: updatedApplication.listing.title,
                    listingReference: updatedApplication.listing.reference
                }
            });
        } catch (notifError) {
            console.error('[REACTIVATE-NOTIFICATION-ERROR]', notifError.message);
        }

        return {
            application: updatedApplication,
            message: "Application reactivated successfully and is now visible to sellers",
        };
    }

    // ── OWNER REVIEW APPLICATION (Property Owner Only) ────────────────────

    async ownerReviewApplication(applicationId, ownerId) {
        const application = await prisma.purchaseApplication.findUnique({
            where: { id: applicationId },
            include: {
                listing: true,
                applicant: true,
            },
        });

        if (!application) {
            throw new ApiError(404, "Application not found");
        }

        if (application.status === "withdrawn") {
            throw new ApiError(400, "Cannot review a withdrawn application");
        }

        // ✅ AUTHORIZATION: Only property owner can review
        if (application.listing.listedById !== ownerId) {
            throw new ApiError(403, "You can only review applications for your own properties");
        }

        // ✅ Update status to under_review automatically
        const updatedApplication = await prisma.purchaseApplication.update({
            where: { id: applicationId },
            data: {
                status: "under_review",
                reviewedAt: new Date(),
            },
            include: {
                listing: { select: { id: true, title: true, reference: true, listedById: true } },
                applicant: { select: { id: true, name: true, email: true } },
            },
        });

        // ✅ Notify all admins that application is ready for approval
        try {
            const admins = await prisma.user.findMany({
                where: {
                    userRole: {
                        role: {
                            roleName: { in: ["admin", "super_admin"] }
                        }
                    }
                },
                select: { id: true },
            });

            for (const admin of admins) {
                await notificationService.create(admin.id, {
                    type: 'IN_APP',
                    priority: 'HIGH',
                    title: '📋 Purchase Application Ready for Approval',
                    message: `${updatedApplication.applicant.name}'s purchase application for ${updatedApplication.listing.title} has been reviewed by property owner and is ready for your approval.`,
                    category: 'PROPERTY',
                    entityType: 'purchase_application',
                    entityId: updatedApplication.id,
                    actionUrl: `/purchase-applications/${updatedApplication.id}`,
                    actionLabel: 'Review & Approve',
                    metadata: {
                        applicantName: updatedApplication.applicant.name,
                        listingTitle: updatedApplication.listing.title,
                        listingReference: updatedApplication.listing.reference,
                    }
                });
            }
        } catch (notifError) {
            console.error('[OWNER-REVIEW-ADMIN-NOTIFICATION-ERROR]', notifError.message);
        }

        return {
            application: updatedApplication,
            message: "Application reviewed and marked for admin approval. Admins have been notified.",
        };
    }

    // ── REVIEW APPLICATION ────────────────────────────────────────────────

    async reviewApplication(applicationId, reviewData, reviewerId) {
        const { adminNotes, rejectionReason } = reviewData;

        const application = await prisma.purchaseApplication.findUnique({
            where: { id: applicationId },
            include: { listing: true, applicant: true },
        });

        if (!application) {
            throw new ApiError(404, "Application not found");
        }

        if (application.status === "withdrawn") {
            throw new ApiError(400, "Cannot review a withdrawn application");
        }

        const updatedApplication = await prisma.purchaseApplication.update({
            where: { id: applicationId },
            data: {
                adminNotes,
                rejectionReason,
                reviewedBy: reviewerId,
                reviewedAt: new Date(),
            },
            include: {
                listing: { select: { id: true, title: true, reference: true, listedById: true } },
                applicant: { select: { id: true, name: true, email: true } },
            },
        });

        return {
            application: updatedApplication,
            message: `Application reviewed successfully`,
        };
    }

    // ── APPROVE & CREATE PURCHASE AGREEMENT ───────────────────────────────

    async approveAndCreateAgreement(applicationId, agreementData, adminId) {
        const application = await prisma.purchaseApplication.findUnique({
            where: { id: applicationId },
            include: {
                applicant: true,
                listing: { include: { listedBy: true } },
            },
        });

        if (!application) {
            throw new ApiError(404, "Application not found");
        }

        if (application.status === "approved") {
            throw new ApiError(400, "Application is already approved");
        }

        // Use transaction
        const result = await prisma.$transaction(async (tx) => {
            // 1. Update application
            const updatedApp = await tx.purchaseApplication.update({
                where: { id: applicationId },
                data: {
                    status: "approved",
                    reviewedBy: adminId,
                    reviewedAt: new Date(),
                    adminNotes: agreementData.adminNotes,
                },
            });

            // 2. Generate agreement number
            const agreementNumber = `PA-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

            // 3. Calculate remaining amount
            const remainingAmount = parseFloat(agreementData.agreedPrice) - parseFloat(agreementData.downPaymentAmount);

            // 4. Create purchase agreement
            const agreement = await tx.purchaseAgreement.create({
                data: {
                    applicationId: applicationId,
                    buyerId: application.applicantId,
                    sellerId: application.listing.listedById,
                    listingId: application.listingId,
                    agreementNumber,
                    agreedPrice: agreementData.agreedPrice,
                    downPaymentAmount: agreementData.downPaymentAmount,
                    downPaymentDate: agreementData.downPaymentDate ? new Date(agreementData.downPaymentDate) : null,
                    paymentPlan: agreementData.paymentPlan,
                    totalInstallments: agreementData.totalInstallments,
                    installmentAmount: agreementData.installmentAmount,
                    installmentStartDate: agreementData.installmentStartDate ? new Date(agreementData.installmentStartDate) : null,
                    finalPaymentDate: agreementData.finalPaymentDate ? new Date(agreementData.finalPaymentDate) : null,
                    agreementDate: new Date(),
                    possessionDate: agreementData.possessionDate ? new Date(agreementData.possessionDate) : null,
                    remainingAmount,
                    terms: agreementData.terms,
                    specialConditions: agreementData.specialConditions,
                    createdBy: adminId,
                },
                include: {
                    buyer: { select: { id: true, name: true, email: true } },
                    seller: { select: { id: true, name: true, email: true } },
                    listing: { select: { id: true, title: true, reference: true } },
                },
            });

            // 5. Create installment schedule if applicable
            if (agreementData.paymentPlan.includes('installment') && agreementData.totalInstallments) {
                const installments = [];
                const startDate = new Date(agreementData.installmentStartDate);
                
                for (let i = 1; i <= agreementData.totalInstallments; i++) {
                    const dueDate = new Date(startDate);
                    dueDate.setMonth(dueDate.getMonth() + (i - 1));
                    
                    installments.push({
                        agreementId: agreement.id,
                        installmentNumber: i,
                        dueDate,
                        amount: agreementData.installmentAmount,
                    });
                }

                await tx.installmentPayment.createMany({ data: installments });
            }

            return { updatedApp, agreement };
        });

        // 6. ✅ Notify buyer about approval and agreement creation
        try {
            await notificationService.create(result.updatedApp.applicantId, {
                type: 'IN_APP',
                priority: 'HIGH',
                title: '🎉 Application Approved - Agreement Created',
                message: `Congratulations! Your purchase application for ${result.agreement.listing.title} has been approved. Purchase agreement has been created. Payment plan details have been sent to your email.`,
                category: 'PROPERTY',
                entityType: 'purchase_agreement',
                entityId: result.agreement.id,
                actionUrl: `/purchase-agreements/${result.agreement.id}`,
                actionLabel: 'View Agreement',
                metadata: {
                    agreementNumber: result.agreement.agreementNumber,
                    agreedPrice: result.agreement.agreedPrice,
                    listingTitle: result.agreement.listing.title
                }
            });
        } catch (notifError) {
            console.error('[AGREEMENT-BUYER-NOTIFICATION-ERROR]', notifError.message);
        }

        // 7. ✅ Notify seller/owner about agreement creation
        try {
            await notificationService.create(result.agreement.sellerId, {
                type: 'IN_APP',
                priority: 'HIGH',
                title: '📋 Purchase Agreement Created',
                message: `Purchase agreement has been created for ${result.agreement.buyer.name} on property ${result.agreement.listing.title}. Agreement number: ${result.agreement.agreementNumber}`,
                category: 'PROPERTY',
                entityType: 'purchase_agreement',
                entityId: result.agreement.id,
                actionUrl: `/purchase-agreements/${result.agreement.id}`,
                actionLabel: 'View Agreement',
                metadata: {
                    agreementNumber: result.agreement.agreementNumber,
                    buyerName: result.agreement.buyer.name,
                    agreedPrice: result.agreement.agreedPrice,
                    listingTitle: result.agreement.listing.title
                }
            });
        } catch (notifError) {
            console.error('[AGREEMENT-SELLER-NOTIFICATION-ERROR]', notifError.message);
        }

        return {
            application: result.updatedApp,
            agreement: result.agreement,
            message: "Application approved and purchase agreement created successfully",
        };
    }
}

module.exports = new PurchaseApplicationService();
