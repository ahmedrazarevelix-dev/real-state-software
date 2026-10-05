/**
 * Agent Assignment Service
 * Manages agent-seller agreements and property assignments
 */

const prisma = require('../config/prisma.client');
const ApiError = require('../utils/ApiError');

class AgentAssignmentService {
  /**
   * Create agent assignment request (Seller assigns agent to listing)
   */
  async createAssignment({ sellerId, agentId, listingId, commissionRate, terms, agreementType = 'exclusive' }) {
    try {
      // Verify seller owns the listing
      const listing = await prisma.propertyListing.findFirst({
        where: {
          id: listingId,
          listedById: sellerId
        }
      });

      if (!listing) {
        throw new ApiError(404, 'Listing not found or you are not the owner');
      }

      // Check if listing already has an active agent
      if (listing.managedByAgentId) {
        throw new ApiError(400, 'Listing already has an assigned agent. Please remove the current agent first.');
      }

      // Verify agent exists and has agent role
      const agent = await prisma.user.findFirst({
        where: {
          id: agentId,
          userRole: {
            role: {
              roleName: 'agent'
            }
          }
        },
        include: {
          userRole: {
            include: {
              role: true
            }
          }
        }
      });

      if (!agent) {
        throw new ApiError(404, 'Agent not found or user is not an agent');
      }

      // Check for existing pending/active agreement
      const existingAgreement = await prisma.agentSellerAgreement.findFirst({
        where: {
          listingId,
          status: {
            in: ['pending', 'active']
          }
        }
      });

      if (existingAgreement) {
        throw new ApiError(400, 'An agreement already exists for this listing');
      }

      // Create agreement
      const agreement = await prisma.agentSellerAgreement.create({
        data: {
          sellerId,
          agentId,
          listingId,
          commissionRate,
          terms,
          agreementType,
          status: 'pending',
          startDate: new Date(),
          sellerSignedAt: new Date()
        },
        include: {
          seller: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true
            }
          },
          agent: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              agencyName: true
            }
          },
          listing: {
            select: {
              id: true,
              title: true,
              reference: true,
              price: true,
              city: true,
              location: true
            }
          }
        }
      });

      // Create notification for agent
      await prisma.notification.create({
        data: {
          userId: agentId,
          type: 'IN_APP',
          status: 'PENDING',
          priority: 'HIGH',
          title: '🤝 New Agent Assignment Request',
          message: `${listing.title} in ${listing.location} - Commission: ${commissionRate}%`,
          category: 'PROPERTY',
          entityType: 'agent_agreement',
          entityId: agreement.id
        }
      });

      return agreement;
    } catch (error) {
      console.error('Create assignment error:', error);
      throw error;
    }
  }

  /**
   * Agent accepts assignment request
   */
  async acceptAssignment({ agreementId, agentId }) {
    try {
      const agreement = await prisma.agentSellerAgreement.findUnique({
        where: { id: agreementId },
        include: {
          listing: true,
          seller: true
        }
      });

      if (!agreement) {
        throw new ApiError(404, 'Agreement not found');
      }

      if (agreement.agentId !== agentId) {
        throw new ApiError(403, 'You are not authorized to accept this agreement');
      }

      if (agreement.status !== 'pending') {
        throw new ApiError(400, `Agreement is already ${agreement.status}`);
      }

      // Update agreement and assign agent to listing
      const [updatedAgreement] = await prisma.$transaction([
        prisma.agentSellerAgreement.update({
          where: { id: agreementId },
          data: {
            status: 'active',
            agentSignedAt: new Date()
          },
          include: {
            seller: {
              select: { id: true, name: true, email: true }
            },
            agent: {
              select: { id: true, name: true, email: true, agencyName: true }
            },
            listing: {
              select: { id: true, title: true, reference: true }
            }
          }
        }),
        prisma.propertyListing.update({
          where: { id: agreement.listingId },
          data: {
            managedByAgentId: agentId
          }
        }),
        prisma.notification.create({
          data: {
            userId: agreement.sellerId,
            type: 'IN_APP',
            status: 'PENDING',
            priority: 'HIGH',
            title: '✅ Agent Assignment Accepted',
            message: `${agreement.agent.name || 'Agent'} has accepted to manage your property: ${agreement.listing.title}`,
            category: 'PROPERTY',
            entityType: 'agent_agreement',
            entityId: agreementId
          }
        })
      ]);

      return updatedAgreement;
    } catch (error) {
      console.error('Accept assignment error:', error);
      throw error;
    }
  }

  /**
   * Agent rejects assignment request
   */
  async rejectAssignment({ agreementId, agentId, reason }) {
    try {
      const agreement = await prisma.agentSellerAgreement.findUnique({
        where: { id: agreementId },
        include: {
          listing: true,
          seller: true
        }
      });

      if (!agreement) {
        throw new ApiError(404, 'Agreement not found');
      }

      if (agreement.agentId !== agentId) {
        throw new ApiError(403, 'You are not authorized to reject this agreement');
      }

      if (agreement.status !== 'pending') {
        throw new ApiError(400, `Agreement is already ${agreement.status}`);
      }

      const updatedAgreement = await prisma.agentSellerAgreement.update({
        where: { id: agreementId },
        data: {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancellationReason: reason || 'Rejected by agent'
        },
        include: {
          seller: {
            select: { id: true, name: true }
          },
          listing: {
            select: { id: true, title: true }
          }
        }
      });

      // Notify seller
      await prisma.notification.create({
        data: {
          userId: agreement.sellerId,
          type: 'IN_APP',
          status: 'PENDING',
          priority: 'MEDIUM',
          title: '❌ Agent Assignment Rejected',
          message: `Your assignment request was declined. ${reason ? 'Reason: ' + reason : ''}`,
          category: 'PROPERTY',
          entityType: 'agent_agreement',
          entityId: agreementId
        }
      });

      return updatedAgreement;
    } catch (error) {
      console.error('Reject assignment error:', error);
      throw error;
    }
  }

  /**
   * Remove agent from listing (Seller or Agent can cancel)
   */
  async removeAssignment({ agreementId, userId, reason }) {
    try {
      const agreement = await prisma.agentSellerAgreement.findUnique({
        where: { id: agreementId },
        include: {
          listing: true
        }
      });

      if (!agreement) {
        throw new ApiError(404, 'Agreement not found');
      }

      // Check if user is seller or agent
      const isSeller = agreement.sellerId === userId;
      const isAgent = agreement.agentId === userId;

      if (!isSeller && !isAgent) {
        throw new ApiError(403, 'You are not authorized to cancel this agreement');
      }

      if (agreement.status !== 'active') {
        throw new ApiError(400, `Agreement is already ${agreement.status}`);
      }

      // Update agreement and remove agent from listing
      const [updatedAgreement] = await prisma.$transaction([
        prisma.agentSellerAgreement.update({
          where: { id: agreementId },
          data: {
            status: 'cancelled',
            cancelledAt: new Date(),
            cancellationReason: reason || `Cancelled by ${isSeller ? 'seller' : 'agent'}`
          }
        }),
        prisma.propertyListing.update({
          where: { id: agreement.listingId },
          data: {
            managedByAgentId: null
          }
        }),
        // Notify the other party
        prisma.notification.create({
          data: {
            userId: isSeller ? agreement.agentId : agreement.sellerId,
            type: 'IN_APP',
            status: 'PENDING',
            priority: 'HIGH',
            title: '🔔 Agent Assignment Cancelled',
            message: `The agreement for ${agreement.listing.title} has been cancelled. ${reason ? 'Reason: ' + reason : ''}`,
            category: 'PROPERTY',
            entityType: 'agent_agreement',
            entityId: agreementId
          }
        })
      ]);

      return updatedAgreement;
    } catch (error) {
      console.error('Remove assignment error:', error);
      throw error;
    }
  }

  /**
   * Get agent's received assignment requests
   */
  async getAgentRequests(agentId, status = null) {
    try {
      const where = {
        agentId
      };

      if (status) {
        where.status = status;
      }

      const agreements = await prisma.agentSellerAgreement.findMany({
        where,
        include: {
          seller: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true
            }
          },
          listing: {
            select: {
              id: true,
              reference: true,
              title: true,
              price: true,
              city: true,
              location: true,
              propertyType: true,
              photos: true,
              status: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      return agreements;
    } catch (error) {
      console.error('Get agent requests error:', error);
      throw error;
    }
  }

  /**
   * Get seller's sent assignment requests
   */
  async getSellerAgreements(sellerId) {
    try {
      const agreements = await prisma.agentSellerAgreement.findMany({
        where: {
          sellerId
        },
        include: {
          agent: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              agencyName: true
            }
          },
          listing: {
            select: {
              id: true,
              reference: true,
              title: true,
              price: true,
              city: true,
              location: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      return agreements;
    } catch (error) {
      console.error('Get seller agreements error:', error);
      throw error;
    }
  }

  /**
   * Get agreement by listing ID
   */
  async getAgreementByListing(listingId) {
    try {
      const agreement = await prisma.agentSellerAgreement.findFirst({
        where: {
          listingId,
          status: {
            in: ['pending', 'active']
          }
        },
        include: {
          seller: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true
            }
          },
          agent: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              agencyName: true
            }
          }
        }
      });

      return agreement;
    } catch (error) {
      console.error('Get agreement by listing error:', error);
      throw error;
    }
  }

  /**
   * Get listings managed by agent
   */
  async getManagedListings(agentId, filters = {}) {
    try {
      const where = {
        managedByAgentId: agentId
      };

      // Apply filters
      if (filters.status) {
        where.status = filters.status;
      }
      if (filters.city) {
        where.city = filters.city;
      }

      const listings = await prisma.propertyListing.findMany({
        where,
        include: {
          listedBy: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      return listings;
    } catch (error) {
      console.error('Get managed listings error:', error);
      throw error;
    }
  }
}

module.exports = new AgentAssignmentService();
