-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('employed_full_time', 'employed_part_time', 'self_employed', 'unemployed', 'student', 'retired');

-- CreateEnum
CREATE TYPE "TenantApplicationStatus" AS ENUM ('submitted', 'under_review', 'background_check', 'approved', 'rejected', 'withdrawn');

-- CreateEnum
CREATE TYPE "TenantDocumentType" AS ENUM ('identity_card', 'employment_letter', 'salary_slip', 'bank_statement', 'previous_rental_agreement', 'reference_letter');

-- CreateEnum
CREATE TYPE "TenantAssignmentStatus" AS ENUM ('active', 'expired', 'terminated', 'renewed');

-- CreateTable
CREATE TABLE "tenant_applications" (
    "id" TEXT NOT NULL,
    "applicant_id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "cnic" TEXT,
    "employment_status" "EmploymentStatus" NOT NULL,
    "employer_name" TEXT,
    "monthly_income" DECIMAL(12,2),
    "job_title" TEXT,
    "move_in_date" TIMESTAMP(3) NOT NULL,
    "lease_duration" INTEGER,
    "number_of_occupants" INTEGER NOT NULL DEFAULT 1,
    "has_pets" BOOLEAN NOT NULL DEFAULT false,
    "pet_details" TEXT,
    "emergency_contact" TEXT,
    "emergency_phone" TEXT,
    "previous_landlord" TEXT,
    "previous_landlord_phone" TEXT,
    "status" "TenantApplicationStatus" NOT NULL DEFAULT 'submitted',
    "admin_notes" TEXT,
    "rejection_reason" TEXT,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_application_documents" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "document_type" "TenantDocumentType" NOT NULL,
    "file_name" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "status" "VerificationDocumentStatus" NOT NULL DEFAULT 'pending',
    "rejection_reason" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_application_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_assignments" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "lease_start_date" TIMESTAMP(3) NOT NULL,
    "lease_end_date" TIMESTAMP(3) NOT NULL,
    "monthly_rent" DECIMAL(12,2) NOT NULL,
    "security_deposit" DECIMAL(12,2),
    "status" "TenantAssignmentStatus" NOT NULL DEFAULT 'active',
    "assigned_by" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "terminated_at" TIMESTAMP(3),
    "termination_reason" TEXT,

    CONSTRAINT "tenant_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tenant_applications_applicant_id_idx" ON "tenant_applications"("applicant_id");

-- CreateIndex
CREATE INDEX "tenant_applications_listing_id_idx" ON "tenant_applications"("listing_id");

-- CreateIndex
CREATE INDEX "tenant_applications_status_idx" ON "tenant_applications"("status");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_application_documents_application_id_document_type_key" ON "tenant_application_documents"("application_id", "document_type");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_assignments_application_id_key" ON "tenant_assignments"("application_id");

-- CreateIndex
CREATE INDEX "tenant_assignments_tenant_id_idx" ON "tenant_assignments"("tenant_id");

-- CreateIndex
CREATE INDEX "tenant_assignments_listing_id_idx" ON "tenant_assignments"("listing_id");

-- CreateIndex
CREATE INDEX "tenant_assignments_status_idx" ON "tenant_assignments"("status");

-- AddForeignKey
ALTER TABLE "tenant_applications" ADD CONSTRAINT "tenant_applications_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_applications" ADD CONSTRAINT "tenant_applications_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "property_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_applications" ADD CONSTRAINT "tenant_applications_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_application_documents" ADD CONSTRAINT "tenant_application_documents_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "tenant_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_assignments" ADD CONSTRAINT "tenant_assignments_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "tenant_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_assignments" ADD CONSTRAINT "tenant_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_assignments" ADD CONSTRAINT "tenant_assignments_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "property_listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_assignments" ADD CONSTRAINT "tenant_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
