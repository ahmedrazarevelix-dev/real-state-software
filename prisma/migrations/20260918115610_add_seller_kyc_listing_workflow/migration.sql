-- CreateEnum
CREATE TYPE "SellerType" AS ENUM ('owner', 'authorized_agent');

-- CreateEnum
CREATE TYPE "SellerVerificationStatus" AS ENUM ('draft', 'submitted', 'under_review', 'changes_requested', 'approved', 'rejected', 'expired');

-- CreateEnum
CREATE TYPE "VerificationDocumentType" AS ENUM ('identity_front', 'identity_back', 'ownership_proof', 'authorization_letter', 'property_tax');

-- CreateEnum
CREATE TYPE "VerificationDocumentStatus" AS ENUM ('pending', 'approved', 'rejected');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ListingStatus" ADD VALUE 'draft';
ALTER TYPE "ListingStatus" ADD VALUE 'pending_review';
ALTER TYPE "ListingStatus" ADD VALUE 'approved';

-- AlterTable
ALTER TABLE "property_listings" ADD COLUMN     "rejection_reason" TEXT,
ADD COLUMN     "reviewed_at" TIMESTAMP(3),
ADD COLUMN     "reviewed_by" TEXT,
ADD COLUMN     "submitted_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "seller_verifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "seller_type" "SellerType" NOT NULL,
    "status" "SellerVerificationStatus" NOT NULL DEFAULT 'draft',
    "admin_notes" TEXT,
    "rejection_reason" TEXT,
    "reviewed_by" TEXT,
    "submitted_at" TIMESTAMP(3),
    "reviewed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seller_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_documents" (
    "id" TEXT NOT NULL,
    "verification_id" TEXT NOT NULL,
    "document_type" "VerificationDocumentType" NOT NULL,
    "file_name" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "status" "VerificationDocumentStatus" NOT NULL DEFAULT 'pending',
    "rejection_reason" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_documents" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "document_type" "VerificationDocumentType" NOT NULL,
    "file_name" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "status" "VerificationDocumentStatus" NOT NULL DEFAULT 'pending',
    "rejection_reason" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "seller_verifications_user_id_key" ON "seller_verifications"("user_id");

-- CreateIndex
CREATE INDEX "seller_verifications_status_idx" ON "seller_verifications"("status");

-- CreateIndex
CREATE UNIQUE INDEX "verification_documents_verification_id_document_type_key" ON "verification_documents"("verification_id", "document_type");

-- CreateIndex
CREATE INDEX "property_documents_status_idx" ON "property_documents"("status");

-- CreateIndex
CREATE UNIQUE INDEX "property_documents_listing_id_document_type_key" ON "property_documents"("listing_id", "document_type");

-- AddForeignKey
ALTER TABLE "property_listings" ADD CONSTRAINT "property_listings_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_verifications" ADD CONSTRAINT "seller_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_verifications" ADD CONSTRAINT "seller_verifications_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_documents" ADD CONSTRAINT "verification_documents_verification_id_fkey" FOREIGN KEY ("verification_id") REFERENCES "seller_verifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_documents" ADD CONSTRAINT "property_documents_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "property_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
