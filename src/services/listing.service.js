const prisma = require("../config/prisma.client");
const ApiError = require("../utils/ApiError");
const { randomInt } = require("crypto");
const { uploadPrivateFile, deletePrivateFile, createPrivateDownloadUrl } = require("./objectStorage.service");

const listingInclude = {
    listedBy: {
        select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            agencyName: true,
            whatsappNumber: true,
            officePhone: true,
            officeAddress: true,
            officeHours: true,
            websiteUrl: true,
            userRole: { select: { role: { select: { roleName: true } } } },
        },
    },
};

const publicAgent = (user) => {
    if (!user) return null;
    return {
        id: user.id,
        name: user.name,
        agencyName: user.agencyName,
        phone: user.phone,
        whatsappNumber: user.whatsappNumber,
        officePhone: user.officePhone,
        officeHours: user.officeHours,
        websiteUrl: user.websiteUrl,
        role: user.userRole?.role?.roleName || null,
    };
};

const shapeListing = (listing) => {
    if (!listing) return null;
    const { listedBy, ...rest } = listing;
    return {
        ...rest,
        agent: publicAgent(listedBy),
    };
};

const generateReference = () => {
    const n = randomInt(10000000, 100000000);
    return `RE-${n}`;
};

class ListingService {
    async createListing(reqBody, userId, userRole = null) {
        let reference = generateReference();
        for (let i = 0; i < 5; i += 1) {
            const exists = await prisma.propertyListing.findUnique({ where: { reference } });
            if (!exists) break;
            reference = generateReference();
        }

        // Check verification status for auto-activation
        let initialStatus = 'draft';
        
        // Admin/Super Admin listings auto-active
        if (userRole === 'admin' || userRole === 'super_admin') {
            initialStatus = 'active';
        }
        // Agent listings auto-active if verified
        else if (userRole === 'agent') {
            const agentVerification = await prisma.agentVerification.findUnique({ 
                where: { userId } 
            });
            if (agentVerification?.status === 'approved') {
                initialStatus = 'active';
            }
        }
        // Seller listings auto-active if verified
        else if (userRole === 'seller') {
            const sellerVerification = await prisma.sellerVerification.findUnique({ 
                where: { userId } 
            });
            if (sellerVerification?.status === 'approved') {
                // Check if seller has any previous approved/active listings
                const previousListings = await prisma.propertyListing.count({
                    where: {
                        listedById: userId,
                        status: { in: ['active', 'approved', 'sold', 'rented'] }
                    }
                });
                
                // First listing needs admin review, subsequent listings auto-active
                if (previousListings > 0) {
                    initialStatus = 'active';  // Not first listing
                } else {
                    initialStatus = 'draft';   // First listing needs review
                }
            }
        }

        const listing = await prisma.propertyListing.create({
            data: {
                reference,
                title: reqBody.title,
                purpose: reqBody.purpose,
                propertyType: reqBody.propertyType,
                city: reqBody.city.trim(),
                location: reqBody.location.trim(),
                address: reqBody.address || null,
                price: reqBody.price,
                currency: reqBody.currency || "PKR",
                area: reqBody.area || null,
                areaUnit: reqBody.areaUnit || null,
                bedrooms: reqBody.bedrooms ?? null,
                bathrooms: reqBody.bathrooms ?? null,
                furnishing: reqBody.furnishing || null,
                description: reqBody.description || null,
                amenities: reqBody.amenities || [],
                photos: reqBody.photos || [],
                latitude: reqBody.latitude ?? null,
                longitude: reqBody.longitude ?? null,
                listedById: userId,
                status: initialStatus,  // auto-active for verified users
            },
            include: listingInclude,
        });

        return shapeListing(listing);
    }

    async searchListings(query = {}) {
        const {
            purpose,
            propertyType,
            city,
            location,
            minPrice,
            maxPrice,
            minBeds,
            minArea,
            furnishing,
            listedById,
            status,
            page = 1,
            limit = 20,
            sort = "newest",
        } = query;

        const where = {};
        // CRITICAL: Draft/pending listings should ONLY be visible to their creator
        // For all other users: only show active listings
        if (listedById) {
            // User viewing their own listings: show all statuses
            where.listedById = listedById;
            if (status) where.status = status;
        } else {
            // Public search: ONLY show active listings
            // Draft, pending_review, etc. are NEVER visible to anyone except creator
            where.status = "active";
        }
        
        if (purpose) where.purpose = purpose;
        if (propertyType) where.propertyType = propertyType;
        if (city) where.city = { contains: city, mode: "insensitive" };
        if (location) where.location = { contains: location, mode: "insensitive" };
        if (furnishing) where.furnishing = furnishing;
        if (minBeds) where.bedrooms = { gte: parseInt(minBeds, 10) };
        if (minPrice || maxPrice) {
            where.price = {};
            if (minPrice) where.price.gte = minPrice;
            if (maxPrice) where.price.lte = maxPrice;
        }
        if (minArea) where.area = { gte: minArea };

        const take = Math.min(parseInt(limit, 10) || 20, 50);
        const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take;

        let orderBy = { createdAt: "desc" };
        if (sort === "price_asc") orderBy = { price: "asc" };
        if (sort === "price_desc") orderBy = { price: "desc" };
        if (sort === "popular") orderBy = { viewCount: "desc" };

        const [items, total] = await Promise.all([
            prisma.propertyListing.findMany({
                where,
                include: listingInclude,
                orderBy,
                take,
                skip,
            }),
            prisma.propertyListing.count({ where }),
        ]);

        return {
            items: items.map(shapeListing),
            total,
            page: Math.max(parseInt(page, 10) || 1, 1),
            limit: take,
        };
    }

    async getListingById(listingId, incrementView = false, requesterId = null) {
        const listing = await prisma.propertyListing.findUnique({
            where: { id: listingId },
            include: listingInclude,
        });

        if (!listing) {
            throw new ApiError(404, "Listing not found");
        }

        // Allow owner to view their own draft/withdrawn listings
        const isOwner = requesterId && listing.listedById === requesterId;
        
        // Public view: only active listings allowed
        if (incrementView && listing.status !== "active" && !isOwner) {
            throw new ApiError(404, "Listing not found");
        }

        // Increment view count only for public active listings
        if (incrementView && listing.status === "active" && !isOwner) {
            await prisma.propertyListing.update({
                where: { id: listingId },
                data: { viewCount: { increment: 1 } },
            });
            listing.viewCount += 1;
        }

        return shapeListing(listing);
    }

    async getMyListings(userId) {
        const listings = await prisma.propertyListing.findMany({
            where: { listedById: userId },
            include: listingInclude,
            orderBy: { createdAt: "desc" },
        });
        return listings.map(shapeListing);
    }

    async updateListing(listingId, reqBody, userRole, userId) {
        const listing = await prisma.propertyListing.findUnique({ where: { id: listingId } });
        if (!listing) {
            throw new ApiError(404, "Listing not found");
        }

        if (userRole !== "super_admin" && listing.listedById !== userId) {
            throw new ApiError(403, "You can only update your own listings");
        }

        const updated = await prisma.propertyListing.update({
            where: { id: listingId },
            data: reqBody,
            include: listingInclude,
        });

        return shapeListing(updated);
    }

    async withdrawListing(listingId, userRole, userId) {
        const listing = await prisma.propertyListing.findUnique({ where: { id: listingId } });
        if (!listing) {
            throw new ApiError(404, "Listing not found");
        }

        if (userRole !== "super_admin" && listing.listedById !== userId) {
            throw new ApiError(403, "You can only withdraw your own listings");
        }

        const updated = await prisma.propertyListing.update({
            where: { id: listingId },
            data: { status: "withdrawn" },
            include: listingInclude,
        });

        return shapeListing(updated);
    }

    async uploadPropertyDocument(listingId, userId, documentType, file) {
        if (!file) throw new ApiError(400, "A document file is required");

        const listing = await prisma.propertyListing.findFirst({ where: { id: listingId, listedById: userId } });
        if (!listing) throw new ApiError(404, "Listing not found");
        if (!["draft", "pending_review"].includes(listing.status)) {
            throw new ApiError(400, "Documents can only be changed while the listing is under preparation or review");
        }

        const storageKey = await uploadPrivateFile(file, `property-documents/${listingId}`);
        try {
            return await prisma.propertyDocument.upsert({
                where: { listingId_documentType: { listingId, documentType } },
                create: {
                listingId,
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
        } catch (error) {
            await deletePrivateFile(storageKey);
            throw error;
        }
    }

    async submitForReview(listingId, userId, userRole) {
        const listing = await prisma.propertyListing.findFirst({
            where: { id: listingId, listedById: userId },
            include: { documents: true, listedBy: { include: { sellerVerification: true } } },
        });
        if (!listing) throw new ApiError(404, "Listing not found");
        if (!["draft", "pending_review"].includes(listing.status)) {
            throw new ApiError(400, "Only draft listings can be submitted for review");
        }

        if (userRole === "seller" || userRole === "agent") {
            const required = ["ownership_proof"];
            if (userRole === "agent" || listing.listedBy.sellerVerification?.sellerType === "authorized_agent") {
                required.push("authorization_letter");
            }
            const uploaded = new Set(listing.documents.map((document) => document.documentType));
            const missing = required.filter((type) => !uploaded.has(type));
            if (missing.length) throw new ApiError(400, `Missing property documents: ${missing.join(", ")}`);
        }

        return prisma.propertyListing.update({
            where: { id: listingId },
            data: { status: "pending_review", submittedAt: new Date(), rejectionReason: null },
            include: listingInclude,
        }).then(shapeListing);
    }

    async listForReview() {
        return prisma.propertyListing.findMany({
            where: { status: "pending_review" },
            include: { ...listingInclude, documents: true },
            orderBy: { submittedAt: "asc" },
        });
    }

    async reviewListing(listingId, reviewerId, status, rejectionReason) {
        const listing = await prisma.propertyListing.findUnique({ where: { id: listingId } });
        if (!listing) throw new ApiError(404, "Listing not found");
        return prisma.propertyListing.update({
            where: { id: listingId },
            data: {
                status: status === "approved" ? "approved" : "draft",
                rejectionReason: status === "rejected" ? rejectionReason : null,
                reviewedBy: reviewerId,
                reviewedAt: new Date(),
            },
            include: listingInclude,
        }).then(shapeListing);
    }

    async publishListing(listingId, reviewerId, userRole, userId) {
        const listing = await prisma.propertyListing.findUnique({ where: { id: listingId } });
        if (!listing) throw new ApiError(404, "Listing not found");
        if (listing.status !== "approved") throw new ApiError(400, "Only approved listings can be published");
        if (userRole !== "super_admin" && userRole !== "admin" && listing.listedById !== userId) {
            throw new ApiError(403, "You can only publish your own approved listings");
        }

        return prisma.propertyListing.update({
            where: { id: listingId },
            data: { status: "active", reviewedBy: reviewerId, reviewedAt: new Date() },
            include: listingInclude,
        }).then(shapeListing);
    }

    async removePropertyDocument(listingId, userId, documentId) {
        const document = await prisma.propertyDocument.findFirst({
            where: { id: documentId, listingId, listing: { listedById: userId } },
        });
        if (!document) throw new ApiError(404, "Property document not found");
        await prisma.propertyDocument.delete({ where: { id: documentId } });
        await deletePrivateFile(document.storageKey);
        return { message: "Property document removed successfully" };
    }

    async createPropertyDocumentDownloadUrl(listingId, documentId, userId, isAdmin) {
        const document = await prisma.propertyDocument.findFirst({
            where: isAdmin ? { id: documentId, listingId } : { id: documentId, listingId, listing: { listedById: userId } },
        });
        if (!document) throw new ApiError(404, "Property document not found");
        return { url: await createPrivateDownloadUrl(document.storageKey), expiresIn: 300 };
    }
}

module.exports = new ListingService();
