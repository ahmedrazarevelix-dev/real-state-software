/**
 * Agent Assignment Controller
 * Handles agent-seller agreement endpoints
 */

const asyncHandler = require('../middlewares/asyncHandler.middleware');
const verifyJWT = require('../middlewares/auth.middleware');
const { authorizeRoles } = require('../middlewares/rbac.middleware');
const validate = require('../middlewares/validate.middleware');
const ApiResponse = require('../utils/ApiResponse');
const agentAssignmentService = require('../services/agentAssignment.service');
const agentAssignmentValidation = require('../validations/agentAssignment.validation');

const BASE = '/api/v1/agent-assignments';

const agentAssignmentRequestHandler = (app) => {
  /**
   * Create agent assignment (Seller assigns agent to listing)
   * POST /api/v1/agent-assignments
   */
  app.post(
    BASE,
    verifyJWT,
    authorizeRoles('seller'),
    validate(agentAssignmentValidation.createAssignment),
    asyncHandler(async (req, res) => {
      const { agentId, listingId, commissionRate, terms, agreementType } = req.body;
      const sellerId = req.user.id;

      const agreement = await agentAssignmentService.createAssignment({
        sellerId,
        agentId,
        listingId,
        commissionRate,
        terms,
        agreementType
      });

      return res.status(201).json(
        new ApiResponse(201, agreement, 'Agent assignment request created successfully')
      );
    })
  );

  /**
   * Accept agent assignment (Agent accepts request)
   * POST /api/v1/agent-assignments/:id/accept
   */
  app.post(
    `${BASE}/:id/accept`,
    verifyJWT,
    authorizeRoles('agent'),
    asyncHandler(async (req, res) => {
      const agreementId = req.params.id;
      const agentId = req.user.id;

      const agreement = await agentAssignmentService.acceptAssignment({
        agreementId,
        agentId
      });

      return res.status(200).json(
        new ApiResponse(200, agreement, 'Assignment accepted successfully')
      );
    })
  );

  /**
   * Reject agent assignment (Agent rejects request)
   * POST /api/v1/agent-assignments/:id/reject
   */
  app.post(
    `${BASE}/:id/reject`,
    verifyJWT,
    authorizeRoles('agent'),
    validate(agentAssignmentValidation.rejectAssignment),
    asyncHandler(async (req, res) => {
      const agreementId = req.params.id;
      const agentId = req.user.id;
      const { reason } = req.body;

      const agreement = await agentAssignmentService.rejectAssignment({
        agreementId,
        agentId,
        reason
      });

      return res.status(200).json(
        new ApiResponse(200, agreement, 'Assignment rejected')
      );
    })
  );

  /**
   * Cancel/Remove agent assignment
   * DELETE /api/v1/agent-assignments/:id
   */
  app.delete(
    `${BASE}/:id`,
    verifyJWT,
    authorizeRoles('seller', 'agent'),
    asyncHandler(async (req, res) => {
      const agreementId = req.params.id;
      const userId = req.user.id;
      const { reason } = req.body;

      const agreement = await agentAssignmentService.removeAssignment({
        agreementId,
        userId,
        reason
      });

      return res.status(200).json(
        new ApiResponse(200, agreement, 'Agent assignment cancelled successfully')
      );
    })
  );

  /**
   * Get agent's received assignment requests
   * GET /api/v1/agent-assignments/requests
   */
  app.get(
    `${BASE}/requests`,
    verifyJWT,
    authorizeRoles('agent'),
    asyncHandler(async (req, res) => {
      const agentId = req.user.id;
      const { status } = req.query;

      const agreements = await agentAssignmentService.getAgentRequests(agentId, status);

      return res.status(200).json(
        new ApiResponse(200, agreements, 'Agent requests fetched successfully')
      );
    })
  );

  /**
   * Get seller's sent agreements
   * GET /api/v1/agent-assignments/my-agreements
   */
  app.get(
    `${BASE}/my-agreements`,
    verifyJWT,
    authorizeRoles('seller'),
    asyncHandler(async (req, res) => {
      const sellerId = req.user.id;

      const agreements = await agentAssignmentService.getSellerAgreements(sellerId);

      return res.status(200).json(
        new ApiResponse(200, agreements, 'Agreements fetched successfully')
      );
    })
  );

  /**
   * Get agreement by listing ID
   * GET /api/v1/agent-assignments/by-listing/:listingId
   */
  app.get(
    `${BASE}/by-listing/:listingId`,
    verifyJWT,
    asyncHandler(async (req, res) => {
      const { listingId } = req.params;

      const agreement = await agentAssignmentService.getAgreementByListing(listingId);

      if (!agreement) {
        return res.status(404).json(
          new ApiResponse(404, null, 'No active agreement found for this listing')
        );
      }

      return res.status(200).json(
        new ApiResponse(200, agreement, 'Agreement fetched successfully')
      );
    })
  );

  /**
   * Get listings managed by agent
   * GET /api/v1/agent-assignments/managed-listings
   */
  app.get(
    `${BASE}/managed-listings`,
    verifyJWT,
    authorizeRoles('agent'),
    asyncHandler(async (req, res) => {
      const agentId = req.user.id;
      const filters = {
        status: req.query.status,
        city: req.query.city
      };

      const listings = await agentAssignmentService.getManagedListings(agentId, filters);

      return res.status(200).json(
        new ApiResponse(200, listings, 'Managed listings fetched successfully')
      );
    })
  );
};

module.exports = agentAssignmentRequestHandler;
