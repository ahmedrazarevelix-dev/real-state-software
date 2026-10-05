const prisma = require("../config/prisma.client");
const ApiError = require("../utils/ApiError");
const notificationService = require("./notification.service");

class TourService {
    async requestTour(listingId, buyerId, reqBody, buyer) {
        const listing = await prisma.propertyListing.findUnique({ where: { id: listingId } });
        if (!listing) {
            throw new ApiError(404, "Listing not found");
        }
        if (listing.status !== "active") {
            throw new ApiError(400, "This listing is no longer available");
        }
        if (listing.listedById === buyerId) {
            throw new ApiError(400, "You cannot book a tour on your own listing");
        }

        const scheduledAt = new Date(reqBody.scheduledAt);
        if (Number.isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) {
            throw new ApiError(400, "Tour time must be a valid future date");
        }

        const tour = await prisma.tourRequest.create({
            data: {
                listingId,
                buyerId,
                scheduledAt,
                notes: reqBody.notes || null,
            },
            include: {
                listing: { select: { id: true, reference: true, title: true, listedById: true } },
                buyer: { select: { id: true, name: true, phone: true, email: true } },
            },
        });

        notificationService
            .notifyTour(listing.listedById, {
                listingTitle: listing.title,
                listingId: listing.id,
                tourId: tour.id,
                buyerName: buyer.name,
                scheduledAt,
            })
            .catch(() => {});

        return tour;
    }

    async getToursForMyListings(agentId) {
        // Get all tours for owner's listings
        const tours = await prisma.tourRequest.findMany({
            where: { listing: { listedById: agentId } },
            include: {
                listing: { select: { id: true, reference: true, title: true, city: true } },
                buyer: { select: { id: true, name: true, phone: true, email: true } },
            },
            orderBy: { scheduledAt: "asc" },
        });

        // Mark all "requested" tours as "viewed" since owner is now viewing them
        for (const tour of tours) {
            if (tour.status === "requested") {
                await prisma.tourRequest.update({
                    where: { id: tour.id },
                    data: { status: "viewed" }
                });
            }
        }

        // Return updated tours
        return prisma.tourRequest.findMany({
            where: { listing: { listedById: agentId } },
            include: {
                listing: { select: { id: true, reference: true, title: true, city: true } },
                buyer: { select: { id: true, name: true, phone: true, email: true } },
            },
            orderBy: { scheduledAt: "asc" },
        });
    }

    async getMyTours(buyerId) {
        return prisma.tourRequest.findMany({
            where: { buyerId },
            include: {
                listing: { select: { id: true, reference: true, title: true, city: true, location: true } },
            },
            orderBy: { scheduledAt: "asc" },
        });
    }

    async getTourById(tourId, userId) {
        const tour = await prisma.tourRequest.findUnique({
            where: { id: tourId },
            include: {
                listing: { 
                    select: { 
                        id: true, 
                        reference: true, 
                        title: true, 
                        city: true, 
                        location: true, 
                        price: true,
                        listedById: true  // ✅ Add this!
                    } 
                },
                buyer: { select: { id: true, name: true, email: true, phone: true } },
            },
        });

        if (!tour) {
            throw new ApiError(404, "Tour not found");
        }

        // Only owner of listing or the buyer or admin can view
        const isOwner = tour.listing.listedById === userId;
        const isBuyer = tour.buyerId === userId;

        if (!isOwner && !isBuyer) {
            throw new ApiError(403, "You don't have permission to view this tour");
        }

        return tour;
    }

    async updateTourStatus(tourId, status, userRole, userId) {
        const tour = await prisma.tourRequest.findUnique({
            where: { id: tourId },
            include: { listing: true },
        });

        if (!tour) {
            throw new ApiError(404, "Tour request not found");
        }

        const isOwner = tour.listing.listedById === userId;
        const isBuyer = tour.buyerId === userId;
        const isAdmin = userRole === "super_admin";

        // Only owner/admin can confirm/complete, anyone can cancel
        if (status === "cancelled") {
            if (!isOwner && !isBuyer && !isAdmin) {
                throw new ApiError(403, "You cannot cancel this tour");
            }
        } else if (!isOwner && !isAdmin) {
            throw new ApiError(403, "Only the listing owner can confirm or complete tours");
        }

        const updated = await prisma.tourRequest.update({
            where: { id: tourId },
            data: { status },
            include: {
                listing: { select: { id: true, title: true, reference: true } },
                buyer: { select: { id: true, name: true, email: true } },
            },
        });

        if (isOwner && status !== "cancelled") {
            notificationService
                .notifyTourStatus(tour.buyerId, {
                    listingTitle: tour.listing.title,
                    listingId: tour.listingId,
                    tourId: tour.id,
                    status,
                })
                .catch(() => {});
        }

        return updated;
    }
}

module.exports = new TourService();
