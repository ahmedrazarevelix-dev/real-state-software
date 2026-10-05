const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");

const { globalLimiter } = require("./middlewares/rateLimiter.middleware");
const authRequestHandler = require("./controllers/auth.controller");
const profileRequestHandler = require("./controllers/profile.controller");
const listingRequestHandler = require("./controllers/listing.controller");
const inquiryRequestHandler = require("./controllers/inquiry.controller");
const tourRequestHandler = require("./controllers/tour.controller");
const savedListingRequestHandler = require("./controllers/savedListing.controller");
const agentRequestHandler = require("./controllers/agent.controller");
const auditLogRequestHandler = require("./controllers/auditLog.controller");
const notificationRequestHandler = require("./controllers/notification.controller");
const sellerVerificationRequestHandler = require("./controllers/sellerVerification.controller");
const messagingRequestHandler = require("./controllers/messaging.controller");
const agentVerificationRequestHandler = require("./controllers/agentVerification.controller");
const agentAssignmentRequestHandler = require("./controllers/agentAssignment.controller");
const webhookController = require("./controllers/webhook.controller");
const paymentRequestHandler = require("./controllers/payment.controller");
const tenantApplicationController = require("./controllers/tenantApplication.controller");
const tenantAssignmentController = require("./controllers/tenantAssignment.controller");
const purchaseApplicationRequestHandler = require("./controllers/purchaseApplication.controller");
const purchaseAgreementRequestHandler = require("./controllers/purchaseAgreement.controller");
const asyncHandler = require("./middlewares/asyncHandler.middleware");
const notFound = require("./middlewares/notFound.middleware");
const errorHandler = require("./middlewares/errorHandler.middleware");

const app = express();

app.use(helmet());

const allowedOrigins = (process.env.CORS_ORIGIN || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) {
                return callback(null, true);
            }
            callback(new Error(`CORS: origin '${origin}' is not allowed`));
        },
        credentials: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
    })
);

if (process.env.NODE_ENV !== "test") {
    app.use(morgan(process.env.NODE_ENV === "development" ? "dev" : "combined"));
}

// Stripe webhook endpoint - MUST be before express.json() to get raw body
app.post(
    '/api/v1/payments/webhooks/stripe',
    // In development, allow JSON body for testing
    process.env.NODE_ENV !== 'production' 
        ? express.json()
        : express.raw({ type: 'application/json' }),
    asyncHandler(webhookController.handleStripeWebhook.bind(webhookController))
);

app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: true, limit: "256kb" }));
app.use(globalLimiter);

app.get("/health", (_req, res) => {
    res.status(200).json({ success: true, message: "Server is healthy" });
});

authRequestHandler(app);
profileRequestHandler(app);
listingRequestHandler(app);
sellerVerificationRequestHandler(app);
messagingRequestHandler(app);
agentVerificationRequestHandler(app);
agentAssignmentRequestHandler(app);
agentRequestHandler(app);
inquiryRequestHandler(app);
tourRequestHandler(app);
savedListingRequestHandler(app);
auditLogRequestHandler(app);
notificationRequestHandler(app);
tenantApplicationController(app);
tenantAssignmentController(app);
purchaseApplicationRequestHandler(app);
purchaseAgreementRequestHandler(app);
paymentRequestHandler(app);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
