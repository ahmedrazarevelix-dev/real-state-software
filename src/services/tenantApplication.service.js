const prisma = require("../config/prisma.client");
const ApiError = require("../utils/ApiError");

class TenantApplicationService {

    // ── SUBMIT APPLICATION ────────────────────────────────────────────────

    async submitApplication(userId, applicationData) {
        const { listingId, ...appData } = applicationData;

        // 1. Check if listing exists and is available for rent
        const listing = await prisma.propertyListing.findUnique({
            where: { id: listingId },
        });

        if (!listing) {
            throw new ApiError(404, "Property listing not found");
        }

        if (listing.purpose !== "rent") {
            throw new ApiError(400, "This property is not available for rent");
        }

        if (listing.status !== "active" && listing.status !== "approved") {
            throw new ApiError(400, "This property listing is not active");
        }

        // 2. Check if user already has a pending/approved application for this listing
        const existingApplication = await prisma.tenantApplication.findFirst({
            where: {
                applicantId: userId,
                listingId: listingId,
                status: {
                    in: ["submitted", "under_review", "background_check", "approved"],
                },
            },
        });

        if (existingApplication) {
            throw new ApiError(409, "You already have a pending or approved application for this property");
        }

        // 3. Create application
        const application = await prisma.tenantApplication.create({
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

        return {
            application,
            message: "Tenant application submitted successfully. You will be notified once reviewed.",
        };
    }

    // ── GET APPLICATION BY ID ─────────────────────────────────────────────

    async getApplicationById(applicationId, userId, userRole) {
        const application = await prisma.tenantApplication.findUnique({
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
                tenantAssignment: true,
            },
        });

        if (!application) {
            throw new ApiError(404, "Application not found");
        }

        // Authorization check
        const isApplicant = application.applicantId === userId;
        const isListingOwner = application.listing.listedById === userId;
        const isAdmin = ["super_admin", "admin"].includes(userRole);

        if (!isApplicant && !isListingOwner && !isAdmin) {
            throw new ApiError(403, "You don't have permission to view this application");
        }

        // ✅ AUTOMATIC DETECTION: Fetch related history for admin/landlord
        let enrichedData = {
            ...application,
            relatedHistory: null
        };

        if (isAdmin || isListingOwner) {
            // Fetch inquiry history
            const inquiries = await prisma.listingInquiry.findMany({
                where: {
                    buyerId: application.applicantId,
                    listingId: application.listingId,
                },
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
                where: {
                    buyerId: application.applicantId,
                    listingId: application.listingId,
                },
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
                    listingId_buyerId: {
                        listingId: application.listingId,
                        buyerId: application.applicantId,
                    },
                },
                select: {
                    interest: true,
                    agentNote: true,
                    createdAt: true,
                    updatedAt: true,
                },
            });

            // Fetch saved listing status
            const savedListing = await prisma.savedListing.findUnique({
                where: {
                    userId_listingId: {
                        userId: application.applicantId,
                        listingId: application.listingId,
                    },
                },
                select: {
                    createdAt: true,
                },
            });

            enrichedData.relatedHistory = {
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
                savedProperty: savedListing ? true : false,
                savedAt: savedListing?.createdAt || null,
                engagementScore: this._calculateEngagementScore(inquiries.length, tours.length, lead, savedListing),
            };
        }

        return enrichedData;
    }

    // ── CALCULATE ENGAGEMENT SCORE ────────────────────────────────────────

    _calculateEngagementScore(inquiryCount, tourCount, lead, savedListing) {
        let score = 0;
        
        // Inquiries: 10 points each (max 30)
        score += Math.min(inquiryCount * 10, 30);
        
        // Tours: 20 points each (max 40)
        score += Math.min(tourCount * 20, 40);
        
        // Lead interest level: 0-20 points
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
        
        // Saved listing: 10 points
        if (savedListing) {
            score += 10;
        }
        
        // Return score and level
        let level = 'low';
        if (score >= 70) level = 'high';
        else if (score >= 40) level = 'medium';
        
        return {
            score,
            level,
            maxScore: 100,
        };
    }

    // ── GET ALL APPLICATIONS (with filters) ───────────────────────────────

    async getAllApplications(filters = {}, userId, userRole) {
        const { status, listingId, applicantId, limit = 20, skip = 0 } = filters;

        const where = {};

        // Role-based filtering
        if (userRole === "buyer") {
            // Buyer can only see their own applications
            where.applicantId = userId;
        } else if (userRole === "seller" || userRole === "agent") {
            // Seller/Agent can see applications for their listings
            where.listing = {
                listedById: userId,
            };
        }
        // Admin/Super Admin can see all

        if (status) {
            where.status = status;
        }

        if (listingId) {
            where.listingId = listingId;
        }

        if (applicantId && ["super_admin", "admin"].includes(userRole)) {
            where.applicantId = applicantId;
        }

        const [applications, total] = await Promise.all([
            prisma.tenantApplication.findMany({
                where,
                include: {
                    listing: {
                        select: {
                            id: true,
                            title: true,
                            reference: true,
                            city: true,
                            location: true,
                            price: true,
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
                    documents: {
                        select: {
                            id: true,
                            documentType: true,
                            status: true,
                            uploadedAt: true,
                        },
                    },
                },
                take: parseInt(limit),
                skip: parseInt(skip),
                orderBy: { createdAt: "desc" },
            }),
            prisma.tenantApplication.count({ where }),
        ]);

        // ✅ Add engagement summary for admin/landlord
        const isAdminOrLandlord = ["super_admin", "admin", "seller", "agent"].includes(userRole);
        
        if (isAdminOrLandlord) {
            const enrichedApplications = await Promise.all(
                applications.map(async (app) => {
                    // Get inquiry count
                    const inquiryCount = await prisma.listingInquiry.count({
                        where: {
                            buyerId: app.applicantId,
                            listingId: app.listingId,
                        },
                    });

                    // Get tour count and check if visited
                    const tours = await prisma.tourRequest.findMany({
                        where: {
                            buyerId: app.applicantId,
                            listingId: app.listingId,
                        },
                        select: { status: true },
                    });

                    const tourCount = tours.length;
                    const hasVisited = tours.some(t => t.status === 'completed');

                    // Get lead status
                    const lead = await prisma.listingLead.findUnique({
                        where: {
                            listingId_buyerId: {
                                listingId: app.listingId,
                                buyerId: app.applicantId,
                            },
                        },
                        select: { interest: true },
                    });

                    // Check if saved
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
                        tourCount,
                        lead,
                        savedListing
                    );

                    return {
                        ...app,
                        engagementSummary: {
                            inquiries: inquiryCount,
                            tours: tourCount,
                            hasVisited,
                            leadInterest: lead?.interest || null,
                            savedProperty: !!savedListing,
                            score: engagementScore,
                        },
                    };
                })
            );

            return {
                applications: enrichedApplications,
                pagination: {
                    total,
                    limit: parseInt(limit),
                    skip: parseInt(skip),
                    hasMore: parseInt(skip) + applications.length < total,
                },
            };
        }

        return {
            applications,
            pagination: {
                total,
                limit: parseInt(limit),
                skip: parseInt(skip),
                hasMore: parseInt(skip) + applications.length < total,
            },
        };
    }

    // ── UPDATE APPLICATION ────────────────────────────────────────────────

    async updateApplication(applicationId, updateData, userId) {
        const application = await prisma.tenantApplication.findUnique({
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

        const updatedApplication = await prisma.tenantApplication.update({
            where: { id: applicationId },
            data: updateData,
            include: {
                listing: {
                    select: {
                        id: true,
                        title: true,
                        reference: true,
                    },
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
        const application = await prisma.tenantApplication.findUnique({
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

        await prisma.tenantApplication.update({
            where: { id: applicationId },
            data: {
                status: "withdrawn",
            },
        });

        return { message: "Application withdrawn successfully" };
    }

    // ── REVIEW APPLICATION (Admin/Landlord) ───────────────────────────────

    async reviewApplication(applicationId, reviewData, reviewerId) {
        const { status, adminNotes, rejectionReason } = reviewData;

        const application = await prisma.tenantApplication.findUnique({
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

        const updatedApplication = await prisma.tenantApplication.update({
            where: { id: applicationId },
            data: {
                status,
                adminNotes,
                rejectionReason,
                reviewedBy: reviewerId,
                reviewedAt: new Date(),
            },
            include: {
                listing: {
                    select: {
                        id: true,
                        title: true,
                        reference: true,
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

        return {
            application: updatedApplication,
            message: `Application ${status} successfully`,
        };
    }

    // ── APPROVE & ASSIGN TENANT ───────────────────────────────────────────

    async approveAndAssignTenant(applicationId, leaseData, adminId) {
        const application = await prisma.tenantApplication.findUnique({
            where: { id: applicationId },
            include: {
                applicant: {
                    include: {
                        userRole: {
                            include: {
                                role: true,
                            },
                        },
                    },
                },
                listing: true,
            },
        });

        if (!application) {
            throw new ApiError(404, "Application not found");
        }

        if (application.status === "approved") {
            throw new ApiError(400, "Application is already approved");
        }

        // Use Prisma transaction for atomic operations
        const result = await prisma.$transaction(async (tx) => {
            // 1. Update application status
            const updatedApp = await tx.tenantApplication.update({
                where: { id: applicationId },
                data: {
                    status: "approved",
                    reviewedBy: adminId,
                    reviewedAt: new Date(),
                    adminNotes: leaseData.adminNotes,
                },
            });

            // 2. Get or create tenant role
            const tenantRole = await tx.role.findUnique({
                where: { roleName: "tenant" },
            });

            if (!tenantRole) {
                throw new ApiError(500, "Tenant role not found in database");
            }

            // 3. Assign tenant role to user
            await tx.userRole.upsert({
                where: { userId: application.applicantId },
                create: {
                    userId: application.applicantId,
                    roleId: tenantRole.id,
                    assignedBy: adminId,
                },
                update: {
                    roleId: tenantRole.id,
                    assignedBy: adminId,
                },
            });

            // 4. Create tenant assignment (lease record)
            const assignment = await tx.tenantAssignment.create({
                data: {
                    applicationId: applicationId,
                    tenantId: application.applicantId,
                    listingId: application.listingId,
                    leaseStartDate: new Date(leaseData.leaseStartDate),
                    leaseEndDate: new Date(leaseData.leaseEndDate),
                    monthlyRent: leaseData.monthlyRent,
                    securityDeposit: leaseData.securityDeposit,
                    assignedBy: adminId,
                },
                include: {
                    tenant: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        },
                    },
                    listing: {
                        select: {
                            id: true,
                            title: true,
                            reference: true,
                        },
                    },
                },
            });

            return { updatedApp, assignment };
        });

        return {
            application: result.updatedApp,
            assignment: result.assignment,
            message: "Application approved and tenant assigned successfully",
        };
    }
}

module.exports = new TenantApplicationService();
