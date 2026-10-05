const prisma = require("../config/prisma.client");
const ApiError = require("../utils/ApiError");
const { uploadPrivateFile, deletePrivateFile, createPrivateDownloadUrl } = require("./objectStorage.service");

const requiredDocumentTypes = ["identity_front", "identity_back", "agency_registration", "broker_license"];

class AgentVerificationService {
    async getMine(userId) {
        return prisma.agentVerification.findUnique({ where: { userId }, include: { documents: true } });
    }

    async createOrUpdate(userId, data) {
        const existing = await prisma.agentVerification.findUnique({ where: { userId } });
        if (existing?.status === "approved" && existing.expiresAt && existing.expiresAt > new Date()) {
            throw new ApiError(400, "Agent verification is already approved and active");
        }

        return prisma.agentVerification.upsert({
            where: { userId },
            create: {
                userId,
                agencyName: data.agencyName,
                licenseNumber: data.licenseNumber || null,
                licenseExpiresAt: data.licenseExpiresAt ? new Date(data.licenseExpiresAt) : null,
            },
            update: {
                agencyName: data.agencyName,
                licenseNumber: data.licenseNumber || null,
                licenseExpiresAt: data.licenseExpiresAt ? new Date(data.licenseExpiresAt) : null,
                status: "draft",
                rejectionReason: null,
                reviewedBy: null,
                reviewedAt: null,
                expiresAt: null,
            },
            include: { documents: true },
        });
    }

    async uploadDocument(userId, documentType, file) {
        if (!file) throw new ApiError(400, "A document file is required");
        const verification = await prisma.agentVerification.findUnique({ where: { userId } });
        if (!verification) throw new ApiError(400, "Create your agent verification application first");
        if (verification.status === "approved" && verification.expiresAt > new Date()) {
            throw new ApiError(400, "Approved agent verification cannot be changed");
        }

        const storageKey = await uploadPrivateFile(file, `agent-verification/${userId}`);
        try {
            return await prisma.agentVerificationDocument.upsert({
                where: { verificationId_documentType: { verificationId: verification.id, documentType } },
                create: { verificationId: verification.id, documentType, fileName: file.originalname, storageKey, mimeType: file.mimetype, fileSize: file.size },
                update: { fileName: file.originalname, storageKey, mimeType: file.mimetype, fileSize: file.size, status: "pending", rejectionReason: null, reviewedAt: null },
            });
        } catch (error) {
            await deletePrivateFile(storageKey);
            throw error;
        }
    }

    async submit(userId) {
        const verification = await prisma.agentVerification.findUnique({ where: { userId }, include: { documents: true } });
        if (!verification) throw new ApiError(400, "Create your agent verification application first");
        if (verification.licenseExpiresAt && verification.licenseExpiresAt <= new Date()) {
            throw new ApiError(400, "License expiry must be in the future");
        }
        
        // Require at least 1 document
        if (verification.documents.length === 0) {
            throw new ApiError(400, "At least one verification document is required");
        }

        return prisma.agentVerification.update({ where: { userId }, data: { status: "submitted", submittedAt: new Date(), rejectionReason: null }, include: { documents: true } });
    }

    async listForReview() {
        return prisma.agentVerification.findMany({
            where: { status: { in: ["submitted", "under_review", "changes_requested"] } },
            include: { user: { select: { id: true, name: true, email: true, phone: true } }, documents: true },
            orderBy: { submittedAt: "asc" },
        });
    }

    async review(verificationId, reviewerId, status, rejectionReason) {
        const verification = await prisma.agentVerification.findUnique({ where: { id: verificationId }, include: { documents: true } });
        if (!verification) throw new ApiError(404, "Agent verification not found");
        if (status === "approved") {
            if (verification.licenseExpiresAt && verification.licenseExpiresAt <= new Date()) throw new ApiError(400, "Cannot approve an expired license");
            
            // Require at least 1 document for approval
            if (verification.documents.length === 0) {
                throw new ApiError(400, "At least one verification document is required for approval");
            }
        }

        return prisma.$transaction(async (transaction) => {
            if (status === "approved") {
                await transaction.agentVerificationDocument.updateMany({ where: { verificationId }, data: { status: "approved", reviewedAt: new Date(), rejectionReason: null } });
                
                // Auto-activate all draft listings when agent gets verified
                await transaction.propertyListing.updateMany({
                    where: { 
                        listedById: verification.userId,
                        status: 'draft'
                    },
                    data: { status: 'active' }
                });
            }
            
            return transaction.agentVerification.update({
                where: { id: verificationId },
                data: {
                    status,
                    reviewedBy: reviewerId,
                    reviewedAt: new Date(),
                    rejectionReason: status === "rejected" ? rejectionReason : null,
                    expiresAt: status === "approved" ? verification.licenseExpiresAt : null,
                },
                include: { documents: true },
            });
        });
    }

    async createDocumentDownloadUrl(userId, documentId, isAdmin) {
        const document = await prisma.agentVerificationDocument.findFirst({ where: isAdmin ? { id: documentId } : { id: documentId, verification: { userId } } });
        if (!document) throw new ApiError(404, "Agent document not found");
        return { url: await createPrivateDownloadUrl(document.storageKey), expiresIn: 300 };
    }

    async removeDocument(userId, documentId) {
        const document = await prisma.agentVerificationDocument.findFirst({
            where: { id: documentId, verification: { userId } },
        });
        if (!document) throw new ApiError(404, "Agent document not found");
        await prisma.agentVerificationDocument.delete({ where: { id: documentId } });
        await deletePrivateFile(document.storageKey);
        return { message: "Agent document removed successfully" };
    }

    async isApproved(userId) {
        const verification = await prisma.agentVerification.findUnique({ where: { userId } });
        return verification?.status === "approved" && (!verification.expiresAt || verification.expiresAt > new Date()) && (!verification.licenseExpiresAt || verification.licenseExpiresAt > new Date());
    }

    // NEW: Get agent verification by ID with property listings
    async getByIdWithListings(verificationId) {
        const verification = await prisma.agentVerification.findUnique({
            where: { id: verificationId },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phone: true,
                        agencyName: true,
                        whatsappNumber: true,
                        userRole: {
                            select: {
                                role: {
                                    select: {
                                        roleName: true
                                    }
                                }
                            }
                        }
                    }
                },
                documents: true
            }
        });

        if (!verification) {
            throw new ApiError(404, "Agent verification not found");
        }

        // Get agent's property listings
        const propertyListings = await prisma.propertyListing.findMany({
            where: { listedById: verification.userId },
            select: {
                id: true,
                reference: true,
                title: true,
                purpose: true,
                propertyType: true,
                city: true,
                location: true,
                price: true,
                currency: true,
                area: true,
                areaUnit: true,
                bedrooms: true,
                bathrooms: true,
                status: true,
                viewCount: true,
                createdAt: true,
                updatedAt: true
            },
            orderBy: { createdAt: 'desc' }
        });

        return {
            ...verification,
            propertyListings
        };
    }
}

module.exports = new AgentVerificationService();
