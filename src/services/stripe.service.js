/**
 * Stripe Service
 * Wrapper around Stripe SDK for payment processing
 */

const Stripe = require('stripe');
const { v4: uuidv4 } = require('uuid');

class StripeService {
  constructor() {
    // Skip Stripe initialization if keys not configured
    this.isMockMode = !process.env.STRIPE_SECRET_KEY || 
                      process.env.STRIPE_SECRET_KEY.includes('YourStripe');
    
    if (this.isMockMode) {
      console.log('⚠️  STRIPE MOCK MODE: Using mock responses (no actual API calls)');
      this.stripe = null;
    } else {
      if (!process.env.STRIPE_SECRET_KEY) {
        throw new Error('STRIPE_SECRET_KEY is not configured');
      }
      
      this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: '2024-11-20.acacia',
        maxNetworkRetries: 3,
        timeout: 30000 // 30 seconds
      });
    }
  }

  /**
   * Create a payment intent
   * @param {Object} params - Payment parameters
   * @returns {Promise<Object>} Stripe PaymentIntent
   */
  async createPaymentIntent({
    amount,
    currency = 'PKR',
    customerId = null,
    metadata = {},
    description = '',
    idempotencyKey = null
  }) {
    try {
      const params = {
        amount: Math.round(amount * 100), // Convert to smallest currency unit (paisa)
        currency: currency.toLowerCase(),
        metadata,
        description
      };

      if (customerId) {
        params.customer = customerId;
      }

      // Auto-generate idempotency key if not provided
      const key = idempotencyKey || uuidv4();

      const paymentIntent = await this.stripe.paymentIntents.create(params, {
        idempotencyKey: key
      });

      return {
        id: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency.toUpperCase(),
        status: paymentIntent.status,
        metadata: paymentIntent.metadata
      };
    } catch (error) {
      throw this._handleStripeError(error);
    }
  }

  /**
   * Create or retrieve a customer
   * @param {Object} params - Customer parameters
   * @returns {Promise<Object>} Stripe Customer
   */
  async createCustomer({ email, name, phone = null, metadata = {} }) {
    try {
      // Check if customer already exists
      const existingCustomers = await this.stripe.customers.list({
        email,
        limit: 1
      });

      if (existingCustomers.data.length > 0) {
        return existingCustomers.data[0];
      }

      // Create new customer
      const customer = await this.stripe.customers.create({
        email,
        name,
        phone,
        metadata
      });

      return customer;
    } catch (error) {
      throw this._handleStripeError(error);
    }
  }

  /**
   * Create a subscription
   * @param {Object} params - Subscription parameters
   * @returns {Promise<Object>} Stripe Subscription
   */
  async createSubscription({
    customerId,
    priceId,
    metadata = {},
    trialPeriodDays = null
  }) {
    try {
      const params = {
        customer: customerId,
        items: [{ price: priceId }],
        metadata,
        payment_behavior: 'default_incomplete',
        expand: ['latest_invoice.payment_intent']
      };

      if (trialPeriodDays) {
        params.trial_period_days = trialPeriodDays;
      }

      const subscription = await this.stripe.subscriptions.create(params);

      return {
        id: subscription.id,
        status: subscription.status,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        clientSecret: subscription.latest_invoice?.payment_intent?.client_secret
      };
    } catch (error) {
      throw this._handleStripeError(error);
    }
  }

  /**
   * Cancel a subscription
   * @param {string} subscriptionId - Stripe subscription ID
   * @param {boolean} immediately - Cancel immediately or at period end
   * @returns {Promise<Object>} Cancelled subscription
   */
  async cancelSubscription(subscriptionId, immediately = false) {
    try {
      if (immediately) {
        return await this.stripe.subscriptions.cancel(subscriptionId);
      } else {
        return await this.stripe.subscriptions.update(subscriptionId, {
          cancel_at_period_end: true
        });
      }
    } catch (error) {
      throw this._handleStripeError(error);
    }
  }

  /**
   * Create a refund
   * @param {Object} params - Refund parameters
   * @returns {Promise<Object>} Stripe Refund
   */
  async createRefund({
    paymentIntentId,
    amount = null,
    reason = 'requested_by_customer',
    metadata = {}
  }) {
    try {
      const params = {
        payment_intent: paymentIntentId,
        reason,
        metadata
      };

      if (amount) {
        params.amount = Math.round(amount * 100);
      }

      const refund = await this.stripe.refunds.create(params, {
        idempotencyKey: `refund-${paymentIntentId}-${Date.now()}`
      });

      return {
        id: refund.id,
        amount: refund.amount / 100,
        status: refund.status,
        reason: refund.reason
      };
    } catch (error) {
      throw this._handleStripeError(error);
    }
  }

  /**
   * Retrieve a payment intent
   * @param {string} paymentIntentId - Stripe payment intent ID
   * @returns {Promise<Object>} Payment intent details
   */
  async retrievePaymentIntent(paymentIntentId) {
    try {
      const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId);
      
      return {
        id: paymentIntent.id,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency.toUpperCase(),
        status: paymentIntent.status,
        metadata: paymentIntent.metadata,
        createdAt: new Date(paymentIntent.created * 1000)
      };
    } catch (error) {
      throw this._handleStripeError(error);
    }
  }

  /**
   * Verify webhook signature
   * @param {string} payload - Raw request body
   * @param {string} signature - Stripe-Signature header
   * @returns {Object} Verified event
   */
  verifyWebhookSignature(payload, signature) {
    try {
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      
      if (!webhookSecret) {
        throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
      }

      const event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        webhookSecret
      );

      return event;
    } catch (error) {
      throw new Error(`Webhook signature verification failed: ${error.message}`);
    }
  }

  /**
   * Create a price for subscription plans
   * @param {Object} params - Price parameters
   * @returns {Promise<Object>} Stripe Price
   */
  async createPrice({
    productId,
    amount,
    currency = 'PKR',
    interval = 'month',
    nickname = ''
  }) {
    try {
      const price = await this.stripe.prices.create({
        product: productId,
        unit_amount: Math.round(amount * 100),
        currency: currency.toLowerCase(),
        recurring: { interval },
        nickname
      });

      return price;
    } catch (error) {
      throw this._handleStripeError(error);
    }
  }

  /**
   * List all customer subscriptions
   * @param {string} customerId - Stripe customer ID
   * @returns {Promise<Array>} List of subscriptions
   */
  async listCustomerSubscriptions(customerId) {
    try {
      const subscriptions = await this.stripe.subscriptions.list({
        customer: customerId,
        limit: 10
      });

      return subscriptions.data;
    } catch (error) {
      throw this._handleStripeError(error);
    }
  }

  /**
   * Handle Stripe errors
   * @private
   */
  _handleStripeError(error) {
    console.error('Stripe Error:', error);

    const errorMap = {
      StripeCardError: 'Card was declined',
      StripeInvalidRequestError: 'Invalid request parameters',
      StripeAPIError: 'Stripe API error occurred',
      StripeConnectionError: 'Network communication failed',
      StripeAuthenticationError: 'Authentication with Stripe failed',
      StripeRateLimitError: 'Too many requests to Stripe'
    };

    const message = errorMap[error.type] || error.message || 'Payment processing failed';

    return new Error(message);
  }
}

module.exports = new StripeService();
