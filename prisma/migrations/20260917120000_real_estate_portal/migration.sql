-- Convert BMS schema to a real-estate portal.

DROP TABLE IF EXISTS "eviction_appeals" CASCADE;
DROP TABLE IF EXISTS "eviction_notices" CASCADE;
DROP TABLE IF EXISTS "payments" CASCADE;
DROP TABLE IF EXISTS "invoices" CASCADE;
DROP TABLE IF EXISTS "complaints" CASCADE;
DROP TABLE IF EXISTS "bids" CASCADE;
DROP TABLE IF EXISTS "property_visits" CASCADE;
DROP TABLE IF EXISTS "investment_listings" CASCADE;
DROP TABLE IF EXISTS "wallet_transactions" CASCADE;
DROP TABLE IF EXISTS "wallets" CASCADE;
DROP TABLE IF EXISTS "leases" CASCADE;
DROP TABLE IF EXISTS "units" CASCADE;
DROP TABLE IF EXISTS "buildings" CASCADE;

ALTER TABLE "users" DROP COLUMN IF EXISTS "stripe_customer_id";
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "agency_name" TEXT;

DROP TABLE IF EXISTS "notification_preferences" CASCADE;

DROP TYPE IF EXISTS "UnitStatus" CASCADE;
DROP TYPE IF EXISTS "LeaseStatus" CASCADE;
DROP TYPE IF EXISTS "EvictionNoticeStatus" CASCADE;
DROP TYPE IF EXISTS "EvictionAppealStatus" CASCADE;
DROP TYPE IF EXISTS "InvoiceStatus" CASCADE;
DROP TYPE IF EXISTS "ComplaintStatus" CASCADE;
DROP TYPE IF EXISTS "ListingStatus" CASCADE;
DROP TYPE IF EXISTS "VisitStatus" CASCADE;
DROP TYPE IF EXISTS "BidStatus" CASCADE;
DROP TYPE IF EXISTS "WalletStatus" CASCADE;
DROP TYPE IF EXISTS "TransactionType" CASCADE;
DROP TYPE IF EXISTS "TransactionStatus" CASCADE;

CREATE TYPE "ListingPurpose" AS ENUM ('sale', 'rent');
CREATE TYPE "PropertyType" AS ENUM ('house', 'flat', 'plot', 'portion', 'room', 'penthouse', 'shop', 'office', 'farmhouse', 'building', 'other');
CREATE TYPE "AreaUnit" AS ENUM ('marla', 'kanal', 'sqft', 'sqyd');
CREATE TYPE "FurnishingStatus" AS ENUM ('unfurnished', 'semi_furnished', 'fully_furnished');
CREATE TYPE "ListingStatus" AS ENUM ('active', 'sold', 'rented', 'withdrawn', 'expired');
CREATE TYPE "InquiryStatus" AS ENUM ('new', 'contacted', 'closed');
CREATE TYPE "TourStatus" AS ENUM ('requested', 'confirmed', 'completed', 'cancelled', 'no_show');

CREATE TABLE "property_listings" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "purpose" "ListingPurpose" NOT NULL,
    "property_type" "PropertyType" NOT NULL,
    "city" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "address" TEXT,
    "price" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PKR',
    "area" DECIMAL(12,2),
    "area_unit" "AreaUnit",
    "bedrooms" INTEGER,
    "bathrooms" INTEGER,
    "furnishing" "FurnishingStatus",
    "description" TEXT,
    "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "listed_by" TEXT NOT NULL,
    "status" "ListingStatus" NOT NULL DEFAULT 'active',
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_listings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "property_listings_reference_key" ON "property_listings"("reference");
CREATE INDEX "property_listings_purpose_city_status_idx" ON "property_listings"("purpose", "city", "status");
CREATE INDEX "property_listings_listed_by_idx" ON "property_listings"("listed_by");
CREATE INDEX "property_listings_property_type_idx" ON "property_listings"("property_type");

ALTER TABLE "property_listings" ADD CONSTRAINT "property_listings_listed_by_fkey" FOREIGN KEY ("listed_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "listing_inquiries" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "buyer_id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "status" "InquiryStatus" NOT NULL DEFAULT 'new',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listing_inquiries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "listing_inquiries_listing_id_idx" ON "listing_inquiries"("listing_id");
CREATE INDEX "listing_inquiries_buyer_id_idx" ON "listing_inquiries"("buyer_id");

ALTER TABLE "listing_inquiries" ADD CONSTRAINT "listing_inquiries_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "property_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "listing_inquiries" ADD CONSTRAINT "listing_inquiries_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "tour_requests" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "buyer_id" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "status" "TourStatus" NOT NULL DEFAULT 'requested',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tour_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tour_requests_listing_id_idx" ON "tour_requests"("listing_id");
CREATE INDEX "tour_requests_buyer_id_idx" ON "tour_requests"("buyer_id");

ALTER TABLE "tour_requests" ADD CONSTRAINT "tour_requests_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "property_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tour_requests" ADD CONSTRAINT "tour_requests_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "saved_listings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_listings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "saved_listings_user_id_listing_id_key" ON "saved_listings"("user_id", "listing_id");

ALTER TABLE "saved_listings" ADD CONSTRAINT "saved_listings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "saved_listings" ADD CONSTRAINT "saved_listings_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "property_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "email_enabled" BOOLEAN NOT NULL DEFAULT true,
    "email_listings" BOOLEAN NOT NULL DEFAULT true,
    "email_inquiries" BOOLEAN NOT NULL DEFAULT true,
    "email_tours" BOOLEAN NOT NULL DEFAULT true,
    "email_security" BOOLEAN NOT NULL DEFAULT true,
    "sms_enabled" BOOLEAN NOT NULL DEFAULT false,
    "sms_listings" BOOLEAN NOT NULL DEFAULT true,
    "sms_inquiries" BOOLEAN NOT NULL DEFAULT true,
    "sms_security" BOOLEAN NOT NULL DEFAULT true,
    "in_app_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_preferences_user_id_key" ON "notification_preferences"("user_id");

ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
