-- CreateEnum
CREATE TYPE "AgentVerificationStatus" AS ENUM ('draft', 'submitted', 'under_review', 'changes_requested', 'approved', 'rejected', 'expired');

-- CreateEnum
CREATE TYPE "AgentDocumentType" AS ENUM ('identity_front', 'identity_back', 'agency_registration', 'broker_license', 'office_address_proof');

-- CreateTable
CREATE TABLE "agent_verifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "agency_name" TEXT NOT NULL,
    "license_number" TEXT,
    "license_expires_at" TIMESTAMP(3),
    "status" "AgentVerificationStatus" NOT NULL DEFAULT 'draft',
    "admin_notes" TEXT,
    "rejection_reason" TEXT,
    "reviewed_by" TEXT,
    "submitted_at" TIMESTAMP(3),
    "reviewed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_verification_documents" (
    "id" TEXT NOT NULL,
    "verification_id" TEXT NOT NULL,
    "document_type" "AgentDocumentType" NOT NULL,
    "file_name" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "status" "VerificationDocumentStatus" NOT NULL DEFAULT 'pending',
    "rejection_reason" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_verification_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_verifications_user_id_key" ON "agent_verifications"("user_id");

-- CreateIndex
CREATE INDEX "agent_verifications_status_idx" ON "agent_verifications"("status");

-- CreateIndex
CREATE UNIQUE INDEX "agent_verification_documents_verification_id_document_type_key" ON "agent_verification_documents"("verification_id", "document_type");

-- AddForeignKey
ALTER TABLE "agent_verifications" ADD CONSTRAINT "agent_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_verifications" ADD CONSTRAINT "agent_verifications_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_verification_documents" ADD CONSTRAINT "agent_verification_documents_verification_id_fkey" FOREIGN KEY ("verification_id") REFERENCES "agent_verifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
