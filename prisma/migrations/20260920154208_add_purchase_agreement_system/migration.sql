-- CreateEnum
CREATE TYPE "FinancingType" AS ENUM ('cash', 'bank_loan', 'installment_plan', 'mixed');

-- CreateEnum
CREATE TYPE "PaymentPlanType" AS ENUM ('full_payment', 'installment_3_months', 'installment_6_months', 'installment_12_months', 'installment_24_months', 'custom');

-- CreateEnum
CREATE TYPE "PurchasePurpose" AS ENUM ('personal_residence', 'investment', 'commercial_use', 'resale');

-- CreateEnum
CREATE TYPE "PurchaseApplicationStatus" AS ENUM ('submitted', 'under_review', 'documents_requested', 'approved', 'rejected', 'withdrawn');

-- CreateEnum
CREATE TYPE "PurchaseAgreementStatus" AS ENUM ('active', 'completed', 'cancelled', 'defaulted');

-- CreateEnum
CREATE TYPE "InstallmentStatus" AS ENUM ('pending', 'paid', 'overdue', 'partial');

-- CreateEnum
CREATE TYPE "PurchaseDocumentType" AS ENUM ('identity_card', 'bank_statement', 'income_proof', 'loan_approval_letter', 'property_valuation', 'noc_certificate');

-- CreateTable
CREATE TABLE "purchase_applications" (
    "id" TEXT NOT NULL,
    "applicant_id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "cnic" TEXT,
    "offer_price" DECIMAL(14,2) NOT NULL,
    "down_payment" DECIMAL(14,2) NOT NULL,
    "financing_type" "FinancingType" NOT NULL,
    "bank_name" TEXT,
    "payment_plan_type" "PaymentPlanType" NOT NULL,
    "installment_months" INTEGER,
    "monthly_installment" DECIMAL(12,2),
    "purchase_purpose" "PurchasePurpose" NOT NULL,
    "is_first_time_buyer" BOOLEAN NOT NULL DEFAULT false,
    "current_address" TEXT,
    "occupation" TEXT,
    "employer_name" TEXT,
    "monthly_income" DECIMAL(12,2),
    "reference1_name" TEXT,
    "reference1_phone" TEXT,
    "reference2_name" TEXT,
    "reference2_phone" TEXT,
    "status" "PurchaseApplicationStatus" NOT NULL DEFAULT 'submitted',
    "admin_notes" TEXT,
    "rejection_reason" TEXT,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_application_documents" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "document_type" "PurchaseDocumentType" NOT NULL,
    "file_name" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "status" "VerificationDocumentStatus" NOT NULL DEFAULT 'pending',
    "rejection_reason" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_application_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_agreements" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "buyer_id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "agreement_number" TEXT NOT NULL,
    "agreed_price" DECIMAL(14,2) NOT NULL,
    "down_payment_amount" DECIMAL(14,2) NOT NULL,
    "down_payment_date" TIMESTAMP(3),
    "payment_plan" "PaymentPlanType" NOT NULL,
    "total_installments" INTEGER,
    "installment_amount" DECIMAL(12,2),
    "installment_start_date" TIMESTAMP(3),
    "final_payment_date" TIMESTAMP(3),
    "agreement_date" TIMESTAMP(3) NOT NULL,
    "possession_date" TIMESTAMP(3),
    "registration_date" TIMESTAMP(3),
    "status" "PurchaseAgreementStatus" NOT NULL DEFAULT 'active',
    "paid_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "remaining_amount" DECIMAL(14,2) NOT NULL,
    "terms" TEXT,
    "special_conditions" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancellation_reason" TEXT,

    CONSTRAINT "purchase_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installment_payments" (
    "id" TEXT NOT NULL,
    "agreement_id" TEXT NOT NULL,
    "installment_number" INTEGER NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paid_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "InstallmentStatus" NOT NULL DEFAULT 'pending',
    "paid_date" TIMESTAMP(3),
    "payment_method" TEXT,
    "transaction_id" TEXT,
    "receipt_url" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "installment_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "purchase_applications_applicant_id_idx" ON "purchase_applications"("applicant_id");

-- CreateIndex
CREATE INDEX "purchase_applications_listing_id_idx" ON "purchase_applications"("listing_id");

-- CreateIndex
CREATE INDEX "purchase_applications_status_idx" ON "purchase_applications"("status");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_application_documents_application_id_document_type_key" ON "purchase_application_documents"("application_id", "document_type");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_agreements_application_id_key" ON "purchase_agreements"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_agreements_agreement_number_key" ON "purchase_agreements"("agreement_number");

-- CreateIndex
CREATE INDEX "purchase_agreements_buyer_id_idx" ON "purchase_agreements"("buyer_id");

-- CreateIndex
CREATE INDEX "purchase_agreements_seller_id_idx" ON "purchase_agreements"("seller_id");

-- CreateIndex
CREATE INDEX "purchase_agreements_listing_id_idx" ON "purchase_agreements"("listing_id");

-- CreateIndex
CREATE INDEX "purchase_agreements_status_idx" ON "purchase_agreements"("status");

-- CreateIndex
CREATE INDEX "installment_payments_agreement_id_status_idx" ON "installment_payments"("agreement_id", "status");

-- CreateIndex
CREATE INDEX "installment_payments_due_date_idx" ON "installment_payments"("due_date");

-- CreateIndex
CREATE UNIQUE INDEX "installment_payments_agreement_id_installment_number_key" ON "installment_payments"("agreement_id", "installment_number");

-- AddForeignKey
ALTER TABLE "purchase_applications" ADD CONSTRAINT "purchase_applications_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_applications" ADD CONSTRAINT "purchase_applications_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "property_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_applications" ADD CONSTRAINT "purchase_applications_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_application_documents" ADD CONSTRAINT "purchase_application_documents_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "purchase_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_agreements" ADD CONSTRAINT "purchase_agreements_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "purchase_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_agreements" ADD CONSTRAINT "purchase_agreements_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_agreements" ADD CONSTRAINT "purchase_agreements_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_agreements" ADD CONSTRAINT "purchase_agreements_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "property_listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_agreements" ADD CONSTRAINT "purchase_agreements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_payments" ADD CONSTRAINT "installment_payments_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "purchase_agreements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
