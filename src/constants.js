module.exports = {
    OTP_EXPIRY_MINUTES: 10,
    DB_NAME: "auth_db",

    ROLES: {
        SUPER_ADMIN: "super_admin",
        ADMIN: "admin",
        AGENT: "agent",
        BUYER: "buyer",
        SELLER: "seller",
        TENANT: "tenant",
    },

    USER_STATUS: {
        ACTIVE: "active",
        SUSPENDED: "suspended",
        PENDING: "pending",
    },

    LISTING_PURPOSE: {
        SALE: "sale",
        RENT: "rent",
    },

    PROPERTY_TYPE: {
        HOUSE: "house",
        FLAT: "flat",
        PLOT: "plot",
        PORTION: "portion",
        ROOM: "room",
        PENTHOUSE: "penthouse",
        SHOP: "shop",
        OFFICE: "office",
        FARMHOUSE: "farmhouse",
        BUILDING: "building",
        OTHER: "other",
    },

    LISTING_STATUS: {
        ACTIVE: "active",
        SOLD: "sold",
        RENTED: "rented",
        WITHDRAWN: "withdrawn",
        EXPIRED: "expired",
    },

    // Listing limits for free tiers
    FREE_LISTING_LIMITS: {
        SELLER: 3,
        AGENT: 5,
    },

    SUBSCRIPTION_PLANS: {
        SELLER: {
            BASIC: "basic",
            PREMIUM: "premium",
            PRO: "pro",
        },
        AGENT: {
            BASIC: "basic",
            SILVER: "silver",
            GOLD: "gold",
            PLATINUM: "platinum",
        },
    },
};
