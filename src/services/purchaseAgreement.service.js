const prisma = require("../config/prisma.client");
const ApiError = require("../utils/ApiError");

class PurchaseAgreementService {

    // ── GET ALL AGREEMENTS ────────────────────────────────────────────────

    async getAllAgreements(filters = {}, userId, userRole) {
        const { status, listingId, buyerId, sellerId, limit = 20, skip = 0 } = filters;

        const where = {};

        // ✅ STRICT ROLE-BASED FILTERING
        if (userRole === "buyer") {
            // Buyer can ONLY see their own agreement
            where.buyerId = userId;
        } else if (userRole === "seller") {
            // Seller can ONLY see their own property agreements
            where.sellerId = userId;
        } else if (userRole === "agent") {
            // ✅ Agents CANNOT see ANY agreements (private buyer-seller data)
            return {
                agreements: [],
                pagination: { total: 0, limit: parseInt(limit), skip: parseInt(skip), hasMore: false },
            };
        } else if (userRole === "super_admin" || userRole === "admin") {
            // Admins can see all agreements
            if (buyerId) where.buyerId = buyerId;
            if (sellerId) where.sellerId = sellerId;
        }

        if (status) where.status = status;
        if (listingId) where.listingId = listingId;

        const [agreements, total] = await Promise.all([
            prisma.purchaseAgreement.findMany({
                where,
                include: {
                    buyer: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            phone: true,
                        },
                    },
                    seller: {
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
                        },
                    },
                    installments: {
                        select: {
                            id: true,
                            installmentNumber: true,
                            dueDate: true,
                            amount: true,
                            paidAmount: true,
                            status: true,
                        },
                        orderBy: { installmentNumber: 'asc' },
                    },
                },
                take: parseInt(limit),
                skip: parseInt(skip),
                orderBy: { createdAt: "desc" },
            }),
            prisma.purchaseAgreement.count({ where }),
        ]);

        // Calculate payment progress for each
        const enrichedAgreements = agreements.map(agreement => {
            const totalAmount = parseFloat(agreement.agreedPrice);
            const paidAmount = parseFloat(agreement.paidAmount);
            const remainingAmount = parseFloat(agreement.remainingAmount);
            const paymentProgress = totalAmount > 0 ? ((paidAmount / totalAmount) * 100).toFixed(2) : 0;

            const overdueInstallments = agreement.installments.filter(
                inst => inst.status === 'pending' && new Date(inst.dueDate) < new Date()
            ).length;

            return {
                ...agreement,
                paymentProgress: parseFloat(paymentProgress),
                overdueInstallments,
            };
        });

        return {
            agreements: enrichedAgreements,
            pagination: {
                total,
                limit: parseInt(limit),
                skip: parseInt(skip),
                hasMore: parseInt(skip) + agreements.length < total,
            },
        };
    }

    // ── GET AGREEMENT BY ID ───────────────────────────────────────────────

    async getAgreementById(agreementId, userId, userRole) {
        const agreement = await prisma.purchaseAgreement.findUnique({
            where: { id: agreementId },
            include: {
                buyer: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phone: true,
                    },
                },
                seller: {
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
                        photos: true,
                    },
                },
                application: {
                    select: {
                        id: true,
                        offerPrice: true,
                        downPayment: true,
                        financingType: true,
                        purchasePurpose: true,
                        createdAt: true,
                    },
                },
                installments: {
                    orderBy: { installmentNumber: 'asc' },
                },
            },
        });

        if (!agreement) {
            throw new ApiError(404, "Purchase agreement not found");
        }

        // ✅ STRICT AUTHORIZATION CHECK
        const isBuyer = agreement.buyerId === userId;
        const isSeller = agreement.sellerId === userId;
        const isAdmin = ["super_admin", "admin"].includes(userRole);

        // Only buyer, seller (property owner), and admin can view
        // Agents and other users cannot view
        if (!isBuyer && !isSeller && !isAdmin) {
            throw new ApiError(403, "You don't have permission to view this agreement");
        }

        // Calculate progress
        const totalAmount = parseFloat(agreement.agreedPrice);
        const paidAmount = parseFloat(agreement.paidAmount);
        const paymentProgress = totalAmount > 0 ? ((paidAmount / totalAmount) * 100).toFixed(2) : 0;

        const overdueInstallments = agreement.installments.filter(
            inst => inst.status === 'pending' && new Date(inst.dueDate) < new Date()
        );

        return {
            ...agreement,
            paymentProgress: parseFloat(paymentProgress),
            overdueInstallments: overdueInstallments.length,
            nextDueInstallment: agreement.installments.find(inst => inst.status === 'pending'),
        };
    }

    // ── GET MY AGREEMENT (Buyer) ──────────────────────────────────────────

    async getMyAgreement(userId) {
        const agreement = await prisma.purchaseAgreement.findFirst({
            where: {
                buyerId: userId,
                status: { in: ['active', 'completed'] },
            },
            include: {
                seller: {
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
                        photos: true,
                    },
                },
                installments: {
                    orderBy: { installmentNumber: 'asc' },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        if (!agreement) {
            throw new ApiError(404, "No active purchase agreement found");
        }

        const paymentProgress = ((parseFloat(agreement.paidAmount) / parseFloat(agreement.agreedPrice)) * 100).toFixed(2);
        const nextDue = agreement.installments.find(inst => inst.status === 'pending');

        return {
            ...agreement,
            paymentProgress: parseFloat(paymentProgress),
            nextDueInstallment: nextDue,
        };
    }

    // ── CANCEL AGREEMENT ──────────────────────────────────────────────────

    async cancelAgreement(agreementId, cancellationData, adminId) {
        const agreement = await prisma.purchaseAgreement.findUnique({
            where: { id: agreementId },
        });

        if (!agreement) {
            throw new ApiError(404, "Purchase agreement not found");
        }

        if (agreement.status === "cancelled") {
            throw new ApiError(400, "Agreement is already cancelled");
        }

        if (agreement.status === "completed") {
            throw new ApiError(400, "Cannot cancel a completed agreement");
        }

        const updatedAgreement = await prisma.purchaseAgreement.update({
            where: { id: agreementId },
            data: {
                status: "cancelled",
                cancelledAt: new Date(),
                cancellationReason: cancellationData.cancellationReason,
            },
            include: {
                buyer: { select: { id: true, name: true, email: true } },
                listing: { select: { id: true, title: true, reference: true } },
            },
        });

        return {
            agreement: updatedAgreement,
            message: "Purchase agreement cancelled successfully",
        };
    }

    // ── RECORD INSTALLMENT PAYMENT ────────────────────────────────────────

    async recordInstallmentPayment(installmentId, paymentData, userId, userRole) {
        const installment = await prisma.installmentPayment.findUnique({
            where: { id: installmentId },
            include: {
                agreement: {
                    include: {
                        buyer: true,
                        seller: true,
                    },
                },
            },
        });

        if (!installment) {
            throw new ApiError(404, "Installment not found");
        }

        // Authorization
        const isBuyer = installment.agreement.buyerId === userId;
        const isSeller = installment.agreement.sellerId === userId;
        const isAdmin = ["super_admin", "admin"].includes(userRole);

        if (!isBuyer && !isSeller && !isAdmin) {
            throw new ApiError(403, "You don't have permission to record this payment");
        }

        if (installment.status === "paid") {
            throw new ApiError(400, "This installment is already paid");
        }

        const newPaidAmount = parseFloat(installment.paidAmount) + parseFloat(paymentData.paidAmount);
        const installmentAmount = parseFloat(installment.amount);

        let newStatus = installment.status;
        if (newPaidAmount >= installmentAmount) {
            newStatus = "paid";
        } else if (newPaidAmount > 0) {
            newStatus = "partial";
        }

        // Update installment
        const updatedInstallment = await prisma.installmentPayment.update({
            where: { id: installmentId },
            data: {
                paidAmount: newPaidAmount,
                status: newStatus,
                paidDate: newStatus === "paid" ? new Date() : installment.paidDate,
                paymentMethod: paymentData.paymentMethod,
                transactionId: paymentData.transactionId,
                receiptUrl: paymentData.receiptUrl,
                notes: paymentData.notes,
            },
        });

        // Update agreement paid amount
        await prisma.purchaseAgreement.update({
            where: { id: installment.agreementId },
            data: {
                paidAmount: {
                    increment: paymentData.paidAmount,
                },
                remainingAmount: {
                    decrement: paymentData.paidAmount,
                },
            },
        });

        // Check if all installments are paid
        const allInstallments = await prisma.installmentPayment.findMany({
            where: { agreementId: installment.agreementId },
        });

        const allPaid = allInstallments.every(inst => inst.status === "paid");
        
        if (allPaid) {
            await prisma.purchaseAgreement.update({
                where: { id: installment.agreementId },
                data: {
                    status: "completed",
                    completedAt: new Date(),
                },
            });
        }

        return {
            installment: updatedInstallment,
            message: "Payment recorded successfully",
            agreementCompleted: allPaid,
        };
    }
}

module.exports = new PurchaseAgreementService();
