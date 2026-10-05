const prisma = require("../config/prisma.client");
const ApiError = require("../utils/ApiError");

const agentPublicSelect = {
    id: true,
    name: true,
    agencyName: true,
    phone: true,
    whatsappNumber: true,
    officePhone: true,
    officeAddress: true,
    officeHours: true,
    websiteUrl: true,
    facebookUrl: true,
    createdAt: true,
};

class AgentService {
    async listAgents() {
        const agents = await prisma.user.findMany({
            where: {
                status: "active",
                isVerified: true,
                userRole: { role: { roleName: "agent" } },
            },
            select: {
                ...agentPublicSelect,
                _count: { select: { listings: true } },
            },
            orderBy: { createdAt: "desc" },
        });

        return agents.map(({ _count, ...a }) => ({
            ...a,
            listingCount: _count.listings,
        }));
    }

    async getAgentById(agentId) {
        const agent = await prisma.user.findUnique({
            where: { id: agentId },
            select: {
                ...agentPublicSelect,
                userRole: { select: { role: { select: { roleName: true } } } },
                listings: {
                    where: { status: "active" },
                    orderBy: { createdAt: "desc" },
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
                        bedrooms: true,
                        area: true,
                        areaUnit: true,
                    },
                },
            },
        });

        if (!agent || agent.userRole?.role?.roleName !== "agent") {
            throw new ApiError(404, "Agent not found");
        }

        return {
            id: agent.id,
            name: agent.name,
            agencyName: agent.agencyName,
            phone: agent.phone,
            whatsappNumber: agent.whatsappNumber,
            officePhone: agent.officePhone,
            officeAddress: agent.officeAddress,
            officeHours: agent.officeHours,
            websiteUrl: agent.websiteUrl,
            facebookUrl: agent.facebookUrl,
            createdAt: agent.createdAt,
            listings: agent.listings,
        };
    }
}

module.exports = new AgentService();
