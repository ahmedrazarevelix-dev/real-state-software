const asyncHandler = require("../middlewares/asyncHandler.middleware");
const verifyJWT = require("../middlewares/auth.middleware");
const ApiResponse = require("../utils/ApiResponse");
const savedListingService = require("../services/savedListing.service");

const BASE = "/api/v1/saved-listings";

const savedListingRequestHandler = (app) => {
    app.get(
        BASE,
        verifyJWT,
        asyncHandler(async (req, res) => {
            const items = await savedListingService.listMine(req.user.id);
            return res.status(200).json(new ApiResponse(200, items, "Saved listings fetched"));
        })
    );

    app.post(
        `${BASE}/:listingId`,
        verifyJWT,
        asyncHandler(async (req, res) => {
            const saved = await savedListingService.save(req.user.id, req.params.listingId);
            return res.status(201).json(new ApiResponse(201, saved, "Listing saved"));
        })
    );

    app.delete(
        `${BASE}/:listingId`,
        verifyJWT,
        asyncHandler(async (req, res) => {
            const result = await savedListingService.unsave(req.user.id, req.params.listingId);
            return res.status(200).json(new ApiResponse(200, null, result.message));
        })
    );
};

module.exports = savedListingRequestHandler;
