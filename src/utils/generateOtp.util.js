const { randomInt } = require("crypto");

/**
 * Generates a cryptographically secure 6-digit OTP string.
 * Uses Node's built-in crypto.randomInt — unlike Math.random(),
 * this is suitable for security-sensitive values.
 */
const generateOtp = () => {
    return randomInt(100000, 1000000).toString();
};

module.exports = generateOtp;

