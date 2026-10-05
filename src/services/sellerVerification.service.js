const prisma = require("../config/prisma.client");
const ApiError = require("../utils/ApiError");
const { uploadPrivateFile, deletePrivateFile, createPrivateDownloadUrl } = require("./objectStorage.service");

const identityDocuments = ["identity_front", "identity_back"];

const requiredDocumentTypes = (sellerType) =>
    sellerType === "owner"
        ? [...identityDocuments, "ownership_proof"]
        : [...identityDocuments, "ownership_proof", "authorization_letter"];

class SellerVerificationService {
    async getMine(userId) {
        return prisma.sellerVerification.findUnique({
            where: { userId },
            include: { documents: true },
        });
    }

    async createOrUpdate(userId, sellerType) {
        const existing = await prisma.sellerVerification.findUnique({ where: { userId } });
        if (existing?.status === "approved") {
            throw new ApiError(400, "Seller verification is already approved");
        }

        return prisma.sellerVerification.upsert({
            where: { userId },
            create: { userId, sellerType },
            update: {
                sellerType,
                status: "draft",
                rejectionReason: null,
                reviewedBy: null,
                reviewedAt: null,
            },
            include: { documents: true },
        });
    }

    async uploadDocument(userId, documentType, file) {
        if (!file) throw new ApiError(400, "A document file is required");

        const verification = await prisma.sellerVerification.findUnique({ where: { userId } });
        if (!verification) throw new ApiError(400, "Create your seller verification application first");
        if (verification.status === "approved") throw new ApiError(400, "Approved verification cannot be changed");

        const storageKey = await uploadPrivateFile(file, `seller-verification/${userId}`);
        try {
            const document = await prisma.verificationDocument.upsert({
                where: { verificationId_documentType: { verificationId: verification.id, documentType } },
                create: {
                verificationId: verification.id,
                documentType,
                fileName: file.originalname,
                storageKey,
                mimeType: file.mimetype,
                fileSize: file.size,
                },
                update: {
                fileName: file.originalname,
                storageKey,
                mimeType: file.mimetype,
                fileSize: file.size,
                status: "pending",
                rejectionReason: null,
                reviewedAt: null,
                },
            });

            return document;
        } catch (error) {
            await deletePrivateFile(storageKey);
            throw error;
        }
    }

    async submit(userId) {
        const verification = await prisma.sellerVerification.findUnique({
            where: { userId },
            include: { documents: true },
        });
        if (!verification) throw new ApiError(400, "Create your seller verification application first");

        // Require at least 1 document
        if (verification.documents.length === 0) {
            throw new ApiError(400, "At least one verification document is required");
        }

        return prisma.sellerVerification.update({
            where: { userId },
            data: { status: "submitted", submittedAt: new Date(), rejectionReason: null },
            include: { documents: true },
        });
    }

    async listForReview() {
        return prisma.sellerVerification.findMany({
            where: { status: { in: ["submitted", "under_review", "changes_requested"] } },
            include: { user: { select: { id: true, name: true, email: true, phone: true } }, documents: true },
            orderBy: { submittedAt: "asc" },
        });
    }

    async review(verificationId, reviewerId, status, rejectionReason) {
        const verification = await prisma.sellerVerification.findUnique({ where: { id: verificationId } });
        if (!verification) throw new ApiError(404, "Seller verification not found");

        if (status === "approved") {
            // Require at least 1 document for approval
            const documents = await prisma.verificationDocument.findMany({ where: { verificationId } });
            if (documents.length === 0) {
                throw new ApiError(400, "At least one verification document is required for approval");
            }
        }

        return prisma.$transaction(async (transaction) => {
            if (status === "approved") {
                await transaction.verificationDocument.updateMany({
                    where: { verificationId },
                    data: { status: "approved", reviewedAt: new Date(), rejectionReason: null },
                });
                
                // Auto-activate all draft listings when seller gets verified
                await transaction.propertyListing.updateMany({
                    where: { 
                        listedById: verification.userId,
                        status: 'draft'
                    },
                    data: { status: 'active' }
                });
            }

            return transaction.sellerVerification.update({
                where: { id: verificationId },
                data: {
                    status,
                    reviewedBy: reviewerId,
                    reviewedAt: new Date(),
                    rejectionReason: status === "rejected" ? rejectionReason : null,
                },
                include: { documents: true },
            });
        });
    }

    async removeDocument(userId, documentId) {
        const document = await prisma.verificationDocument.findFirst({
            where: { id: documentId, verification: { userId } },
        });
        if (!document) throw new ApiError(404, "Document not found");

        await prisma.verificationDocument.delete({ where: { id: documentId } });
        await deletePrivateFile(document.storageKey);
        return { message: "Document removed successfully" };
    }

    async createDocumentDownloadUrl(userId, documentId, isAdmin) {
        const document = await prisma.verificationDocument.findFirst({
            where: isAdmin ? { id: documentId } : { id: documentId, verification: { userId } },
        });
        if (!document) throw new ApiError(404, "Document not found");
        return { url: await createPrivateDownloadUrl(document.storageKey), expiresIn: 300 };
    }

    async isApproved(userId) {
        const verification = await prisma.sellerVerification.findUnique({ where: { userId } });
        return verification?.status === "approved";
    }

    // NEW: Get seller verification by ID with property listings
    async getByIdWithListings(verificationId) {
        const verification = await prisma.sellerVerification.findUnique({
            where: { id: verificationId },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phone: true,
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
            throw new ApiError(404, "Seller verification not found");
        }

        // Get seller's property listings
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

module.exports = new SellerVerificationService();
