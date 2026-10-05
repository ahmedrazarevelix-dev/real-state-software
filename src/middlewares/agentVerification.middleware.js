const ApiError = require("../utils/ApiError");
const asyncHandler = require("./asyncHandler.middleware");
const agentVerificationService = require("../services/agentVerification.service");

const requireApprovedAgent = asyncHandler(async (req, _res, next) => {
    if (req.user.role !== "agent") return next();

    const approved = await agentVerificationService.isApproved(req.user.id);
    if (!approved) {
        return next(new ApiError(403, "Approved agent verification is required before creating listings"));
    }

    next();
});

module.exports = requireApprovedAgent;
