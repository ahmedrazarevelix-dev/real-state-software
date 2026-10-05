/*
  Warnings:

  - Added the required column `updated_at` to the `investment_listings` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `property_visits` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "BidStatus" AS ENUM ('pending', 'accepted', 'rejected', 'countered', 'withdrawn', 'expired');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ListingStatus" ADD VALUE 'under_negotiation';
ALTER TYPE "ListingStatus" ADD VALUE 'offer_received';
ALTER TYPE "ListingStatus" ADD VALUE 'inspection_pending';
ALTER TYPE "ListingStatus" ADD VALUE 'contract_signed';
ALTER TYPE "ListingStatus" ADD VALUE 'payment_pending';
ALTER TYPE "ListingStatus" ADD VALUE 'expired';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "VisitStatus" ADD VALUE 'cancelled';
ALTER TYPE "VisitStatus" ADD VALUE 'rescheduled';
ALTER TYPE "VisitStatus" ADD VALUE 'converted_to_offer';

-- AlterTable
ALTER TABLE "investment_listings" ADD COLUMN     "description" TEXT,
ADD COLUMN     "expiry_date" TIMESTAMP(3),
ADD COLUMN     "features" JSONB,
ADD COLUMN     "listing_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "view_count" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "property_visits" ADD COLUMN     "notes" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "visit_type" TEXT NOT NULL DEFAULT 'physical',
ADD COLUMN     "visitor_email" TEXT;

-- CreateTable
CREATE TABLE "bids" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "bidder_id" TEXT NOT NULL,
    "bid_amount" DECIMAL(14,2) NOT NULL,
    "token_amount" DECIMAL(14,2),
    "status" "BidStatus" NOT NULL DEFAULT 'pending',
    "bidder_name" TEXT NOT NULL,
    "bidder_contact" TEXT NOT NULL,
    "bidder_email" TEXT,
    "message" TEXT,
    "counter_offer_amount" DECIMAL(14,2),
    "counter_offer_message" TEXT,
    "admin_response" TEXT,
    "valid_until" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bids_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bids_listing_id_idx" ON "bids"("listing_id");

-- CreateIndex
CREATE INDEX "bids_bidder_id_idx" ON "bids"("bidder_id");

-- AddForeignKey
ALTER TABLE "bids" ADD CONSTRAINT "bids_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "investment_listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bids" ADD CONSTRAINT "bids_bidder_id_fkey" FOREIGN KEY ("bidder_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
