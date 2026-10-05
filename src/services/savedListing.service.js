const prisma = require("../config/prisma.client");
const ApiError = require("../utils/ApiError");

class SavedListingService {
    async save(userId, listingId) {
        const listing = await prisma.propertyListing.findUnique({ where: { id: listingId } });
        if (!listing) {
            throw new ApiError(404, "Listing not found");
        }

        // Security: Only active/approved listings can be saved (draft listings are private)
        if (listing.status !== "active" && listing.status !== "approved") {
            throw new ApiError(404, "Listing not found");
        }

        const saved = await prisma.savedListing.upsert({
            where: { userId_listingId: { userId, listingId } },
            create: { userId, listingId },
            update: {},
            include: {
                listing: {
                    select: {
                        id: true,
                        reference: true,
                        title: true,
                        purpose: true,
                        city: true,
                        location: true,
                        price: true,
                        photos: true,
                        status: true,
                    },
                },
            },
        });

        return saved;
    }

    async unsave(userId, listingId) {
        const existing = await prisma.savedListing.findUnique({
            where: { userId_listingId: { userId, listingId } },
        });
        if (!existing) {
            throw new ApiError(404, "Listing is not in your saved list");
        }
        await prisma.savedListing.delete({
            where: { userId_listingId: { userId, listingId } },
        });
        return { message: "Listing removed from saved list" };
    }

    async listMine(userId) {
        return prisma.savedListing.findMany({
            where: { userId },
            include: {
                listing: {
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
                        photos: true,
                        status: true,
                    },
                },
            },
            orderBy: { createdAt: "desc" },
        });
    }
}

module.exports = new SavedListingService();
