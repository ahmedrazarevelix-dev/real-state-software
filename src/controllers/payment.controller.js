/**
 * Payment Controller
 * Handles payment-related endpoints
 */

const paymentService = require('../services/payment.service');
const commissionService = require('../services/commission.service');
const refundService = require('../services/refund.service');
const invoiceService = require('../services/invoice.service');

class PaymentController {
  /**
   * Create subscription payment intent
   * POST /api/v1/payments/subscription
   */
  async createSubscriptionPayment(req, res) {
    try {
      const { plan } = req.body;
      const userId = req.user.id;
      const userRole = req.user.role;

      const result = await paymentService.createSubscriptionPayment({
        userId,
        plan,
        userRole
      });

      res.status(201).json({
        success: true,
        message: 'Payment intent created',
        data: result
      });
    } catch (error) {
      console.error('Create subscription payment error:', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Create listing promotion payment
   * POST /api/v1/payments/promotion
   */
  async createPromotionPayment(req, res) {
    try {
      const { listingId, promotionType, duration } = req.body;
      const userId = req.user.id;

      const result = await paymentService.createPromotionPayment({
        userId,
        listingId,
        promotionType,
        duration
      });

      res.status(201).json({
        success: true,
        message: 'Payment intent created',
        data: result
      });
    } catch (error) {
      console.error('Create promotion payment error:', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Create lead purchase payment
   * POST /api/v1/payments/leads
   */
  async createLeadPurchasePayment(req, res) {
    try {
      const { leadType, quantity } = req.body;
      const userId = req.user.id;

      const result = await paymentService.createLeadPurchasePayment({
        userId,
        leadType,
        quantity
      });

      res.status(201).json({
        success: true,
        message: 'Payment intent created',
        data: result
      });
    } catch (error) {
      console.error('Create lead purchase payment error:', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get payment by ID
   * GET /api/v1/payments/:paymentId
   */
  async getPayment(req, res) {
    try {
      const { paymentId } = req.params;
      const userId = req.user.id;

      const payment = await paymentService.getPayment(paymentId);

      if (!payment) {
        return res.status(404).json({
          success: false,
          message: 'Payment not found'
        });
      }

      // Check ownership (unless admin)
      if (payment.userId !== userId && req.user.role !== 'admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      res.status(200).json({
        success: true,
        data: payment
      });
    } catch (error) {
      console.error('Get payment error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve payment'
      });
    }
  }

  /**
   * Get user payment history
   * GET /api/v1/payments/my-payments
   */
  async getMyPayments(req, res) {
    try {
      const userId = req.user.id;
      const { status, paymentType, limit, offset } = req.query;

      const result = await paymentService.getUserPayments(userId, {
        status,
        paymentType,
        limit: parseInt(limit) || 20,
        offset: parseInt(offset) || 0
      });

      res.status(200).json({
        success: true,
        data: result.payments,
        pagination: result.pagination
      });
    } catch (error) {
      console.error('Get user payments error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve payments'
      });
    }
  }

  /**
   * Get pricing information
   * GET /api/v1/payments/pricing
   */
  async getPricing(req, res) {
    try {
      const pricing = commissionService.getAllPricing();

      res.status(200).json({
        success: true,
        data: pricing
      });
    } catch (error) {
      console.error('Get pricing error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve pricing'
      });
    }
  }

  /**
   * Calculate success fee (for property sale)
   * POST /api/v1/payments/calculate-success-fee
   */
  async calculateSuccessFee(req, res) {
    try {
      const { listingId, salePrice, agentCommissionRate } = req.body;

      const calculation = await commissionService.calculateSuccessFee({
        listingId,
        salePrice,
        agentCommissionRate
      });

      res.status(200).json({
        success: true,
        data: calculation
      });
    } catch (error) {
      console.error('Calculate success fee error:', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Check listing availability for user
   * GET /api/v1/payments/listing-availability
   */
  async checkListingAvailability(req, res) {
    try {
      const userId = req.user.id;

      const availability = await commissionService.checkListingAvailability(userId);

      res.status(200).json({
        success: true,
        data: availability
      });
    } catch (error) {
      console.error('Check listing availability error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to check availability'
      });
    }
  }

  /**
   * Get invoice by payment ID
   * GET /api/v1/payments/:paymentId/invoice
   */
  async getInvoice(req, res) {
    try {
      const { paymentId } = req.params;
      const userId = req.user.id;

      // Get payment first to check ownership
      const payment = await paymentService.getPayment(paymentId);

      if (!payment) {
        return res.status(404).json({
          success: false,
          message: 'Payment not found'
        });
      }

      // Check ownership
      if (payment.userId !== userId && req.user.role !== 'admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      const invoice = await invoiceService.getInvoice(payment.invoice?.id);

      if (!invoice) {
        return res.status(404).json({
          success: false,
          message: 'Invoice not found'
        });
      }

      res.status(200).json({
        success: true,
        data: invoice
      });
    } catch (error) {
      console.error('Get invoice error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve invoice'
      });
    }
  }

  /**
   * Get all user invoices
   * GET /api/v1/payments/invoices
   */
  async getMyInvoices(req, res) {
    try {
      const userId = req.user.id;

      const invoices = await invoiceService.getUserInvoices(userId);

      res.status(200).json({
        success: true,
        data: invoices
      });
    } catch (error) {
      console.error('Get user invoices error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve invoices'
      });
    }
  }

  // ==================== ADMIN ENDPOINTS ====================

  /**
   * Get payment statistics (Admin)
   * GET /api/v1/payments/admin/statistics
   */
  async getPaymentStatistics(req, res) {
    try {
      const { startDate, endDate } = req.query;

      const stats = await paymentService.getPaymentStatistics({
        startDate,
        endDate
      });

      res.status(200).json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Get payment statistics error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve statistics'
      });
    }
  }

  /**
   * Process refund (Admin)
   * POST /api/v1/payments/admin/refund
   */
  async processRefund(req, res) {
    try {
      const { paymentId, amount, reason } = req.body;
      const adminId = req.user.id;

      const result = await refundService.processRefund({
        paymentId,
        amount,
        reason,
        adminId
      });

      res.status(200).json({
        success: true,
        message: 'Refund processed successfully',
        data: result
      });
    } catch (error) {
      console.error('Process refund error:', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get refund details (Admin)
   * GET /api/v1/payments/admin/refund/:paymentId
   */
  async getRefundDetails(req, res) {
    try {
      const { paymentId } = req.params;

      const details = await refundService.getRefundDetails(paymentId);

      res.status(200).json({
        success: true,
        data: details
      });
    } catch (error) {
      console.error('Get refund details error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve refund details'
      });
    }
  }

  /**
   * List all refunds (Admin)
   * GET /api/v1/payments/admin/refunds
   */
  async listRefunds(req, res) {
    try {
      const { startDate, endDate, limit, offset } = req.query;

      const result = await refundService.listRefunds({
        startDate,
        endDate,
        limit: parseInt(limit) || 50,
        offset: parseInt(offset) || 0
      });

      res.status(200).json({
        success: true,
        data: result.refunds,
        pagination: result.pagination
      });
    } catch (error) {
      console.error('List refunds error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve refunds'
      });
    }
  }

  /**
   * Get refund statistics (Admin)
   * GET /api/v1/payments/admin/refund-statistics
   */
  async getRefundStatistics(req, res) {
    try {
      const { startDate, endDate } = req.query;

      const stats = await refundService.getRefundStatistics({
        startDate,
        endDate
      });

      res.status(200).json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Get refund statistics error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve statistics'
      });
    }
  }
}

module.exports = new PaymentController();


// ══════════════════════════════════════════════════════════════════════════
// REQUEST HANDLER - REGISTER ROUTES
// ══════════════════════════════════════════════════════════════════════════

const verifyJWT = require('../middlewares/auth.middleware');
const { authorizeRoles } = require('../middlewares/rbac.middleware');
const validate = require('../middlewares/validate.middleware');
const paymentValidation = require('../validations/payment.validation');
const asyncHandler = require('../middlewares/asyncHandler.middleware');
const webhookController = require('./webhook.controller');
const paymentController = new PaymentController();

const paymentRequestHandler = (app) => {
    const BASE_PATH = "/api/v1/payments";

    // ── PUBLIC ROUTES ─────────────────────────────────────────────────────
    // Note: Webhook endpoint is handled in app.js with raw body parser

    // ── AUTHENTICATED ROUTES ──────────────────────────────────────────────

    // Get pricing information
    app.get(
        `${BASE_PATH}/pricing`,
        verifyJWT,
        asyncHandler((req, res) => paymentController.getPricing(req, res))
    );

    // Create subscription payment (Agent or Seller)
    app.post(
        `${BASE_PATH}/subscription`,
        verifyJWT,
        authorizeRoles('agent', 'seller'),
        validate(paymentValidation.createSubscriptionPayment),
        asyncHandler((req, res) => paymentController.createSubscriptionPayment(req, res))
    );

    // Create listing promotion payment
    app.post(
        `${BASE_PATH}/promotion`,
        verifyJWT,
        authorizeRoles('agent'),
        validate(paymentValidation.createPromotionPayment),
        asyncHandler((req, res) => paymentController.createPromotionPayment(req, res))
    );

    // Create lead purchase payment
    app.post(
        `${BASE_PATH}/leads`,
        verifyJWT,
        authorizeRoles('agent'),
        validate(paymentValidation.createLeadPurchasePayment),
        asyncHandler((req, res) => paymentController.createLeadPurchasePayment(req, res))
    );

    // Calculate success fee
    app.post(
        `${BASE_PATH}/calculate-success-fee`,
        verifyJWT,
        authorizeRoles('agent', 'admin', 'super_admin'),
        validate(paymentValidation.calculateSuccessFee),
        asyncHandler((req, res) => paymentController.calculateSuccessFee(req, res))
    );

    // Check listing availability
    app.get(
        `${BASE_PATH}/listing-availability`,
        verifyJWT,
        authorizeRoles('agent'),
        asyncHandler((req, res) => paymentController.checkListingAvailability(req, res))
    );

    // Get my payments
    app.get(
        `${BASE_PATH}/my-payments`,
        verifyJWT,
        validate(paymentValidation.getMyPayments),
        asyncHandler((req, res) => paymentController.getMyPayments(req, res))
    );

    // Get all my invoices
    app.get(
        `${BASE_PATH}/my-invoices`,
        verifyJWT,
        asyncHandler((req, res) => paymentController.getMyInvoices(req, res))
    );

    // Get payment by ID
    app.get(
        `${BASE_PATH}/:paymentId`,
        verifyJWT,
        validate(paymentValidation.getPayment),
        asyncHandler((req, res) => paymentController.getPayment(req, res))
    );

    // Get invoice for payment
    app.get(
        `${BASE_PATH}/:paymentId/invoice`,
        verifyJWT,
        validate(paymentValidation.getPayment),
        asyncHandler((req, res) => paymentController.getInvoice(req, res))
    );

    // ── ADMIN ROUTES ──────────────────────────────────────────────────────

    // Get payment statistics
    app.get(
        `${BASE_PATH}/admin/statistics`,
        verifyJWT,
        authorizeRoles('admin', 'super_admin'),
        validate(paymentValidation.getPaymentStatistics),
        asyncHandler((req, res) => paymentController.getPaymentStatistics(req, res))
    );

    // Process refund
    app.post(
        `${BASE_PATH}/admin/refund`,
        verifyJWT,
        authorizeRoles('admin', 'super_admin'),
        validate(paymentValidation.processRefund),
        asyncHandler((req, res) => paymentController.processRefund(req, res))
    );

    // Get refund details
    app.get(
        `${BASE_PATH}/admin/refund/:paymentId`,
        verifyJWT,
        authorizeRoles('admin', 'super_admin'),
        validate(paymentValidation.getRefundDetails),
        asyncHandler((req, res) => paymentController.getRefundDetails(req, res))
    );

    // List all refunds
    app.get(
        `${BASE_PATH}/admin/refunds`,
        verifyJWT,
        authorizeRoles('admin', 'super_admin'),
        validate(paymentValidation.listRefunds),
        asyncHandler((req, res) => paymentController.listRefunds(req, res))
    );

    // Get refund statistics
    app.get(
        `${BASE_PATH}/admin/refund-statistics`,
        verifyJWT,
        authorizeRoles('admin', 'super_admin'),
        validate(paymentValidation.getPaymentStatistics),
        asyncHandler((req, res) => paymentController.getRefundStatistics(req, res))
    );

    // ── WEBHOOK ADMIN ROUTES ──────────────────────────────────────────────

    // Get webhook event status
    app.get(
        `${BASE_PATH}/webhooks/events/:eventId`,
        verifyJWT,
        authorizeRoles('admin', 'super_admin'),
        validate(paymentValidation.getWebhookEvent),
        asyncHandler((req, res) => webhookController.getWebhookEventStatus(req, res))
    );

    // List webhook events
    app.get(
        `${BASE_PATH}/webhooks/events`,
        verifyJWT,
        authorizeRoles('admin', 'super_admin'),
        validate(paymentValidation.listWebhookEvents),
        asyncHandler((req, res) => webhookController.listWebhookEvents(req, res))
    );

    // Retry failed webhook
    app.post(
        `${BASE_PATH}/webhooks/retry/:eventId`,
        verifyJWT,
        authorizeRoles('admin', 'super_admin'),
        validate(paymentValidation.getWebhookEvent),
        asyncHandler((req, res) => webhookController.retryWebhook(req, res))
    );

    // Test webhook (development only)
    if (process.env.NODE_ENV !== 'production') {
        app.post(
            `${BASE_PATH}/webhooks/test`,
            verifyJWT,
            authorizeRoles('admin', 'super_admin'),
            validate(paymentValidation.testWebhook),
            asyncHandler((req, res) => webhookController.testWebhook(req, res))
        );
    }
};

module.exports = paymentRequestHandler;
