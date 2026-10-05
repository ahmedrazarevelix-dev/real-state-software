const ApiError = require("../utils/ApiError");
const sellerVerificationService = require("../services/sellerVerification.service");
const asyncHandler = require("./asyncHandler.middleware");

const requireApprovedSeller = asyncHandler(async (req, _res, next) => {
    if (req.user.role !== "seller") return next();

    const approved = await sellerVerificationService.isApproved(req.user.id);
    if (!approved) {
        return next(new ApiError(403, "Seller verification approval is required before creating listings"));
    }

    next();
});

module.exports = requireApprovedSeller;
