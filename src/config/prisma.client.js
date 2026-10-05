const { PrismaClient } = require("@prisma/client");

/**
 * PrismaClient singleton — reused across the entire app.
 * Creating multiple instances wastes connection pool slots,
 * especially during nodemon restarts in dev.
 */
const prisma = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["error"],
});

module.exports = prisma;

