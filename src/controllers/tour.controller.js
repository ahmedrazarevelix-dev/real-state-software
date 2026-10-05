const asyncHandler = require("../middlewares/asyncHandler.middleware");
const verifyJWT = require("../middlewares/auth.middleware");
const { authorizeRoles } = require("../middlewares/rbac.middleware");
const requireProfileComplete = require("../middlewares/profileComplete.middleware");
const validate = require("../middlewares/validate.middleware");
const ApiResponse = require("../utils/ApiResponse");
const tourService = require("../services/tour.service");
const { createTourSchema, updateTourStatusSchema } = require("../validations/tour.validation");

const BASE = "/api/v1/tours";

const tourRequestHandler = (app) => {
    app.post(
        `${BASE}/listings/:listingId`,
        verifyJWT,
        requireProfileComplete,
        authorizeRoles("buyer", "agent", "super_admin", "tenant", "admin", "seller"),
        validate(createTourSchema),
        asyncHandler(async (req, res) => {
            const tour = await tourService.requestTour(
                req.params.listingId,
                req.user.id,
                req.body,
                req.user
            );
            return res.status(201).json(new ApiResponse(201, tour, "Tour requested successfully"));
        })
    );

    app.get(
        `${BASE}/received`,
        verifyJWT,
        asyncHandler(async (req, res) => {
            const tours = await tourService.getToursForMyListings(req.user.id);
            return res.status(200).json(new ApiResponse(200, tours, "Tour requests for your listings"));
        })
    );

    app.get(
        `${BASE}/mine`,
        verifyJWT,
        asyncHandler(async (req, res) => {
            const tours = await tourService.getMyTours(req.user.id);
            return res.status(200).json(new ApiResponse(200, tours, "Your tour requests"));
        })
    );

    app.get(
        `${BASE}/:id`,
        verifyJWT,
        asyncHandler(async (req, res) => {
            const tour = await tourService.getTourById(req.params.id, req.user.id);
            return res.status(200).json(new ApiResponse(200, tour, "Tour details fetched"));
        })
    );

    app.patch(
        `${BASE}/:id/status`,
        verifyJWT,
        authorizeRoles("buyer", "agent", "super_admin", "tenant", "admin", "seller"),
        validate(updateTourStatusSchema),
        asyncHandler(async (req, res) => {
            const tour = await tourService.updateTourStatus(
                req.params.id,
                req.body.status,
                req.user.role,
                req.user.id
            );
            const message = tour.message || `Tour status updated to ${tour.status}`;
            return res.status(200).json(new ApiResponse(200, tour, message));
        })
    );
};

module.exports = tourRequestHandler;
