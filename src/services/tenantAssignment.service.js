const prisma = require("../config/prisma.client");
const ApiError = require("../utils/ApiError");

class TenantAssignmentService {

    // ── GET ALL TENANT ASSIGNMENTS ────────────────────────────────────────

    async getAllAssignments(filters = {}, userId, userRole) {
        const { status, listingId, tenantId, limit = 20, skip = 0 } = filters;

        const where = {};

        // Role-based filtering
        if (userRole === "tenant") {
            // Tenant can only see their own lease
            where.tenantId = userId;
        } else if (userRole === "seller" || userRole === "agent") {
            // Seller/Agent can see tenants in their properties
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

        if (tenantId && ["super_admin", "admin"].includes(userRole)) {
            where.tenantId = tenantId;
        }

        const [assignments, total] = await Promise.all([
            prisma.tenantAssignment.findMany({
                where,
                include: {
                    tenant: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            phone: true,
                        },
                    },
                    listing: {
                        select: {
                            id: true,
                            title: true,
                            reference: true,
                            city: true,
                            location: true,
                            address: true,
                        },
                    },
                    application: {
                        select: {
                            id: true,
                            createdAt: true,
                        },
                    },
                    assignedByUser: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
                take: parseInt(limit),
                skip: parseInt(skip),
                orderBy: { assignedAt: "desc" },
            }),
            prisma.tenantAssignment.count({ where }),
        ]);

        return {
            assignments,
            pagination: {
                total,
                limit: parseInt(limit),
                skip: parseInt(skip),
                hasMore: parseInt(skip) + assignments.length < total,
            },
        };
    }

    // ── GET ASSIGNMENT BY ID ──────────────────────────────────────────────

    async getAssignmentById(assignmentId, userId, userRole) {
        const assignment = await prisma.tenantAssignment.findUnique({
            where: { id: assignmentId },
            include: {
                tenant: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phone: true,
                    },
                },
                listing: {
                    select: {
                        id: true,
                        title: true,
                        reference: true,
                        city: true,
                        location: true,
                        address: true,
                        price: true,
                        listedById: true,
                    },
                },
                application: {
                    select: {
                        id: true,
                        fullName: true,
                        phone: true,
                        email: true,
                        employmentStatus: true,
                        monthlyIncome: true,
                        createdAt: true,
                    },
                },
                assignedByUser: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
        });

        if (!assignment) {
            throw new ApiError(404, "Tenant assignment not found");
        }

        // Authorization check
        const isTenant = assignment.tenantId === userId;
        const isListingOwner = assignment.listing.listedById === userId;
        const isAdmin = ["super_admin", "admin"].includes(userRole);

        if (!isTenant && !isListingOwner && !isAdmin) {
            throw new ApiError(403, "You don't have permission to view this lease");
        }

        return assignment;
    }

    // ── GET MY CURRENT LEASE (Tenant) ─────────────────────────────────────

    async getMyLease(userId) {
        const assignment = await prisma.tenantAssignment.findFirst({
            where: {
                tenantId: userId,
                status: "active",
            },
            include: {
                listing: {
                    select: {
                        id: true,
                        title: true,
                        reference: true,
                        city: true,
                        location: true,
                        address: true,
                        price: true,
                        photos: true,
                        listedBy: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                                phone: true,
                            },
                        },
                    },
                },
                application: {
                    select: {
                        id: true,
                        createdAt: true,
                    },
                },
            },
            orderBy: { assignedAt: "desc" },
        });

        if (!assignment) {
            throw new ApiError(404, "No active lease found");
        }

        return assignment;
    }

    // ── TERMINATE LEASE ───────────────────────────────────────────────────

    async terminateLease(assignmentId, terminationData, adminId) {
        const assignment = await prisma.tenantAssignment.findUnique({
            where: { id: assignmentId },
            include: {
                tenant: true,
                listing: true,
            },
        });

        if (!assignment) {
            throw new ApiError(404, "Tenant assignment not found");
        }

        if (assignment.status === "terminated") {
            throw new ApiError(400, "Lease is already terminated");
        }

        const updatedAssignment = await prisma.tenantAssignment.update({
            where: { id: assignmentId },
            data: {
                status: "terminated",
                terminatedAt: new Date(),
                terminationReason: terminationData.terminationReason,
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

        return {
            assignment: updatedAssignment,
            message: "Lease terminated successfully",
        };
    }

    // ── RENEW LEASE ───────────────────────────────────────────────────────

    async renewLease(assignmentId, renewalData, adminId) {
        const { leaseEndDate, monthlyRent } = renewalData;

        const assignment = await prisma.tenantAssignment.findUnique({
            where: { id: assignmentId },
        });

        if (!assignment) {
            throw new ApiError(404, "Tenant assignment not found");
        }

        if (assignment.status !== "active") {
            throw new ApiError(400, "Only active leases can be renewed");
        }

        const updatedAssignment = await prisma.tenantAssignment.update({
            where: { id: assignmentId },
            data: {
                leaseEndDate: leaseEndDate || assignment.leaseEndDate,
                monthlyRent: monthlyRent || assignment.monthlyRent,
                status: "renewed",
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

        return {
            assignment: updatedAssignment,
            message: "Lease renewed successfully",
        };
    }
}

module.exports = new TenantAssignmentService();
