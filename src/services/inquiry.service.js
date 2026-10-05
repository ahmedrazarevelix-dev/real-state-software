const prisma = require("../config/prisma.client");
const ApiError = require("../utils/ApiError");
const notificationService = require("./notification.service");

class InquiryService {
    async createInquiry(listingId, buyerId, reqBody, buyer) {
        const listing = await prisma.propertyListing.findUnique({
            where: { id: listingId },
            include: {
                listedBy: { select: { id: true, name: true } },
            },
        });

        if (!listing) {
            throw new ApiError(404, "Listing not found");
        }

        if (listing.status !== "active") {
            throw new ApiError(400, "This listing is no longer available");
        }

        if (listing.listedById === buyerId) {
            throw new ApiError(400, "You cannot inquire on your own listing");
        }

        // ✅ CHECK: Buyer must have a CONFIRMED tour request for this listing
        const confirmedTour = await prisma.tourRequest.findFirst({
            where: {
                listingId,
                buyerId,
                status: "confirmed"
            }
        });

        if (!confirmedTour) {
            throw new ApiError(
                403, 
                "You must have a confirmed tour request before sending an inquiry. Please request and confirm a tour first."
            );
        }

        const inquiry = await prisma.listingInquiry.create({
            data: {
                listingId,
                buyerId,
                message: reqBody.message,
                phone: reqBody.phone || buyer.phone || null,
                email: reqBody.email || buyer.email || null,
            },
            include: {
                listing: {
                    select: {
                        id: true,
                        reference: true,
                        title: true,
                        listedById: true,
                    },
                },
                buyer: {
                    select: { id: true, name: true, email: true, phone: true },
                },
            },
        });

        notificationService
            .notifyInquiry(listing.listedById, {
                listingTitle: listing.title,
                listingId: listing.id,
                inquiryId: inquiry.id,
                buyerName: buyer.name,
            })
            .catch(() => {});

        return inquiry;
    }

    async getInquiriesForMyListings(agentId) {
        // Fetch inquiries first
        const inquiries = await prisma.listingInquiry.findMany({
            where: { listing: { listedById: agentId } },
            include: {
                listing: { select: { id: true, reference: true, title: true, city: true } },
                buyer: { select: { id: true, name: true, email: true, phone: true } },
            },
            orderBy: { createdAt: "desc" },
        });

        // Mark all "new" inquiries as "contacted" since owner is now viewing them
        for (const inquiry of inquiries) {
            if (inquiry.status === "new") {
                await prisma.listingInquiry.update({
                    where: { id: inquiry.id },
                    data: { status: "contacted" }
                });
            }
        }

        // Return updated inquiries
        return prisma.listingInquiry.findMany({
            where: { listing: { listedById: agentId } },
            include: {
                listing: { select: { id: true, reference: true, title: true, city: true } },
                buyer: { select: { id: true, name: true, email: true, phone: true } },
            },
            orderBy: { createdAt: "desc" },
        });
    }

    async getMyInquiries(buyerId) {
        return prisma.listingInquiry.findMany({
            where: { buyerId },
            include: {
                listing: {
                    select: {
                        id: true,
                        reference: true,
                        title: true,
                        city: true,
                        price: true,
                        purpose: true,
                    },
                },
            },
            orderBy: { createdAt: "desc" },
        });
    }

    async updateInquiryStatus(inquiryId, status, userRole, userId) {
        const inquiry = await prisma.listingInquiry.findUnique({
            where: { id: inquiryId },
            include: { listing: true, buyer: { select: { id: true, name: true, email: true } } },
        });

        if (!inquiry) {
            throw new ApiError(404, "Inquiry not found");
        }

        const isOwner = inquiry.listing.listedById === userId;
        const isAdmin = userRole === "super_admin";

        if (!isOwner && !isAdmin) {
            throw new ApiError(403, "You can only update inquiries on your listings");
        }

        // Validation: Only owner can transition statuses
        if (status === "closed") {
            if (inquiry.status === "closed") {
                throw new ApiError(400, "This inquiry is already closed");
            }
        } else if (status === "contacted") {
            // Owner marking as contacted (responding to inquiry)
            if (inquiry.status === "closed") {
                throw new ApiError(400, "Cannot respond to a closed inquiry");
            }
        }

        const updated = await prisma.listingInquiry.update({
            where: { id: inquiryId },
            data: { status },
            include: {
                listing: { select: { id: true, reference: true, title: true } },
                buyer: { select: { id: true, name: true, email: true } },
            }
        });

        // Notify buyer of status change
        notificationService
            .notifyInquiryStatus(inquiry.buyerId, {
                listingTitle: inquiry.listing.title,
                listingId: inquiry.listingId,
                inquiryId: inquiry.id,
                status,
            })
            .catch(() => {});

        return {
            ...updated,
            message: this._getInquiryStatusMessage(status),
        };
    }

    _getInquiryStatusMessage(status) {
        const messages = {
            new: "New inquiry received.",
            contacted: "You have responded to this inquiry.",
            closed: "This inquiry has been closed.",
        };
        return messages[status] || "Inquiry status updated";
    }
}

module.exports = new InquiryService();
