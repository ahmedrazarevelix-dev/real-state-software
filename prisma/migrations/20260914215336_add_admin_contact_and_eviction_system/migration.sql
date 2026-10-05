-- CreateEnum
CREATE TYPE "EvictionNoticeStatus" AS ENUM ('pending', 'active', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "EvictionAppealStatus" AS ENUM ('pending', 'under_review', 'approved', 'rejected');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "facebook_url" TEXT,
ADD COLUMN     "instagram_handle" TEXT,
ADD COLUMN     "linkedin_url" TEXT,
ADD COLUMN     "office_address" TEXT,
ADD COLUMN     "office_hours" TEXT,
ADD COLUMN     "office_phone" TEXT,
ADD COLUMN     "twitter_handle" TEXT,
ADD COLUMN     "website_url" TEXT,
ADD COLUMN     "whatsapp_number" TEXT;

-- CreateTable
CREATE TABLE "eviction_notices" (
    "id" TEXT NOT NULL,
    "lease_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "notice_period_days" INTEGER NOT NULL DEFAULT 10,
    "notice_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eviction_date" TIMESTAMP(3) NOT NULL,
    "status" "EvictionNoticeStatus" NOT NULL DEFAULT 'pending',
    "issued_by" TEXT NOT NULL,
    "notes" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eviction_notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eviction_appeals" (
    "id" TEXT NOT NULL,
    "eviction_notice_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "proof_documents" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "EvictionAppealStatus" NOT NULL DEFAULT 'pending',
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eviction_appeals_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "eviction_notices" ADD CONSTRAINT "eviction_notices_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "leases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eviction_notices" ADD CONSTRAINT "eviction_notices_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eviction_appeals" ADD CONSTRAINT "eviction_appeals_eviction_notice_id_fkey" FOREIGN KEY ("eviction_notice_id") REFERENCES "eviction_notices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eviction_appeals" ADD CONSTRAINT "eviction_appeals_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
