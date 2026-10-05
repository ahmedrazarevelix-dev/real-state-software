const rateLimit = require("express-rate-limit");

/**
 * Helper that builds a rate limiter with a consistent error response shape.
 */
const buildLimiter = ({ windowMs, max, message }) =>
    rateLimit({
        windowMs,
        max,
        standardHeaders: true,   // Return rate limit info in `RateLimit-*` headers
        legacyHeaders: false,     // Disable the `X-RateLimit-*` headers
        handler: (_req, res) => {
            res.status(429).json({
                success: false,
                statusCode: 429,
                message,
                errors: [],
            });
        },
    });

// ── Limiters ─────────────────────────────────────────────────────────────────

/**
 * Global limiter — applied to every request.
 * 100 requests per 15 minutes per IP.
 */
const globalLimiter = buildLimiter({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
    message: "Too many requests from this IP, please try again later.",
});

/**
 * Auth limiter — applied to login & register.
 * 10 attempts per 15 minutes per IP (brute-force protection).
 */
const authLimiter = buildLimiter({
    windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 10,
    message: "Too many authentication attempts from this IP, please try again after 15 minutes.",
});

/**
 * OTP limiter — applied to verify-otp, resend-otp, forgot-password.
 * 5 attempts per 15 minutes per IP.
 */
const otpLimiter = buildLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: "Too many OTP requests from this IP, please try again after 15 minutes.",
});

module.exports = { globalLimiter, authLimiter, otpLimiter };

