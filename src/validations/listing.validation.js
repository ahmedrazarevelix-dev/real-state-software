const Joi = require("joi");

const purposes = ["sale", "rent"];
const propertyTypes = [
    "house",
    "flat",
    "plot",
    "portion",
    "room",
    "penthouse",
    "shop",
    "office",
    "farmhouse",
    "building",
    "other",
];
const areaUnits = ["marla", "kanal", "sqft", "sqyd"];
const furnishings = ["unfurnished", "semi_furnished", "fully_furnished"];
const listingStatuses = ["active", "sold", "rented", "withdrawn", "expired"];

const createListingSchema = Joi.object({
    title: Joi.string().trim().min(5).max(180).required(),
    purpose: Joi.string().valid(...purposes).required(),
    propertyType: Joi.string().valid(...propertyTypes).required(),
    city: Joi.string().trim().min(2).max(80).required(),
    location: Joi.string().trim().min(2).max(120).required(),
    address: Joi.string().trim().max(255).optional().allow("", null),
    price: Joi.number().positive().required(),
    currency: Joi.string().trim().uppercase().max(8).optional(),
    area: Joi.number().positive().optional(),
    areaUnit: Joi.string().valid(...areaUnits).optional(),
    bedrooms: Joi.number().integer().min(0).max(30).optional(),
    bathrooms: Joi.number().integer().min(0).max(30).optional(),
    furnishing: Joi.string().valid(...furnishings).optional(),
    description: Joi.string().trim().max(5000).optional().allow("", null),
    amenities: Joi.array().items(Joi.string().trim().max(80)).max(40).optional(),
    photos: Joi.array().items(Joi.string().uri().max(500)).max(20).optional(),
    latitude: Joi.number().min(-90).max(90).optional(),
    longitude: Joi.number().min(-180).max(180).optional(),
});

const updateListingSchema = Joi.object({
    title: Joi.string().trim().min(5).max(180).optional(),
    purpose: Joi.string().valid(...purposes).optional(),
    propertyType: Joi.string().valid(...propertyTypes).optional(),
    city: Joi.string().trim().min(2).max(80).optional(),
    location: Joi.string().trim().min(2).max(120).optional(),
    address: Joi.string().trim().max(255).optional().allow("", null),
    price: Joi.number().positive().optional(),
    currency: Joi.string().trim().uppercase().max(8).optional(),
    area: Joi.number().positive().optional().allow(null),
    areaUnit: Joi.string().valid(...areaUnits).optional().allow(null),
    bedrooms: Joi.number().integer().min(0).max(30).optional().allow(null),
    bathrooms: Joi.number().integer().min(0).max(30).optional().allow(null),
    furnishing: Joi.string().valid(...furnishings).optional().allow(null),
    description: Joi.string().trim().max(5000).optional().allow("", null),
    amenities: Joi.array().items(Joi.string().trim().max(80)).max(40).optional(),
    photos: Joi.array().items(Joi.string().uri().max(500)).max(20).optional(),
    latitude: Joi.number().min(-90).max(90).optional().allow(null),
    longitude: Joi.number().min(-180).max(180).optional().allow(null),
    status: Joi.string().valid(...listingStatuses).optional(),
}).min(1);

module.exports = {
    createListingSchema,
    updateListingSchema,
};
