-- CreateEnum for all new enums
CREATE TYPE "UserStatus" AS ENUM ('active', 'suspended', 'pending');
CREATE TYPE "UnitStatus" AS ENUM ('vacant', 'rented', 'for_sale', 'under_maintenance');
CREATE TYPE "LeaseStatus" AS ENUM ('active', 'ended', 'terminated');
CREATE TYPE "InvoiceStatus" AS ENUM ('unpaid', 'paid', 'overdue');
CREATE TYPE "ComplaintStatus" AS ENUM ('open', 'assigned', 'in_progress', 'resolved', 'closed');
CREATE TYPE "ListingStatus" AS ENUM ('active', 'sold', 'withdrawn');
CREATE TYPE "VisitStatus" AS ENUM ('scheduled', 'completed', 'interested', 'rejected');

-- AlterTable Users - Add new columns first
ALTER TABLE "users" ADD COLUMN "full_name" TEXT;
ALTER TABLE "users" ADD COLUMN "phone" TEXT;
ALTER TABLE "users" ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'active';
ALTER TABLE "users" ADD COLUMN "is_verified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "reset_otp" TEXT;
ALTER TABLE "users" ADD COLUMN "reset_otp_expiry" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "refresh_token" TEXT;
ALTER TABLE "users" ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "users" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "users" ADD COLUMN "otp_expiry" TIMESTAMP(3);

-- Copy data from old columns to new columns
UPDATE "users" SET "full_name" = "name" WHERE "full_name" IS NULL;
UPDATE "users" SET "is_verified" = "isVerified" WHERE "is_verified" = false;
UPDATE "users" SET "created_at" = "createdAt" WHERE "created_at" = CURRENT_TIMESTAMP;
UPDATE "users" SET "updated_at" = "updatedAt" WHERE "updated_at" = CURRENT_TIMESTAMP;
UPDATE "users" SET "otp_expiry" = "otpExpiry" WHERE "otpExpiry" IS NOT NULL;
UPDATE "users" SET "reset_otp_expiry" = "resetOtpExpiry" WHERE "resetOtpExpiry" IS NOT NULL;
UPDATE "users" SET "refresh_token" = "refreshToken" WHERE "refreshToken" IS NOT NULL;

-- Make full_name NOT NULL after data copy
ALTER TABLE "users" ALTER COLUMN "full_name" SET NOT NULL;

-- Drop old columns
ALTER TABLE "users" DROP COLUMN "name";
ALTER TABLE "users" DROP COLUMN "isVerified";
ALTER TABLE "users" DROP COLUMN "createdAt";
ALTER TABLE "users" DROP COLUMN "updatedAt";
ALTER TABLE "users" DROP COLUMN "otpExpiry";
ALTER TABLE "users" DROP COLUMN "resetOtpExpiry";
ALTER TABLE "users" DROP COLUMN "refreshToken";

-- CreateTable Roles
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "role_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable UserRole
CREATE TABLE "user_roles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "assigned_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable Building
CREATE TABLE "buildings" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "admin_id" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "buildings_pkey" PRIMARY KEY ("id")
);

-- CreateTable Unit
CREATE TABLE "units" (
    "id" TEXT NOT NULL,
    "building_id" TEXT NOT NULL,
    "unit_number" TEXT NOT NULL,
    "status" "UnitStatus" NOT NULL DEFAULT 'vacant',
    "owner_name" TEXT,
    "rent_amount" DECIMAL(12,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable Lease
CREATE TABLE "leases" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "deposit_amount" DECIMAL(12,2),
    "status" "LeaseStatus" NOT NULL DEFAULT 'active',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leases_pkey" PRIMARY KEY ("id")
);

-- CreateTable Invoice
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "lease_id" TEXT NOT NULL,
    "rent_amount" DECIMAL(12,2) NOT NULL,
    "gas_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "electricity_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "billing_month" TIMESTAMP(3) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'unpaid',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable Payment
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "paid_by" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "payment_method" TEXT,
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable Complaint
CREATE TABLE "complaints" (
    "id" TEXT NOT NULL,
    "raised_by" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "assigned_to" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ComplaintStatus" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "complaints_pkey" PRIMARY KEY ("id")
);

-- CreateTable InvestmentListing
CREATE TABLE "investment_listings" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "listed_price" DECIMAL(14,2) NOT NULL,
    "broker_id" TEXT,
    "status" "ListingStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investment_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable PropertyVisit
CREATE TABLE "property_visits" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "broker_id" TEXT NOT NULL,
    "visitor_name" TEXT NOT NULL,
    "visitor_contact" TEXT,
    "visit_date" TIMESTAMP(3) NOT NULL,
    "feedback" TEXT,
    "status" "VisitStatus" NOT NULL DEFAULT 'scheduled',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable AuditLog
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_role_name_key" ON "roles"("role_name");
CREATE UNIQUE INDEX "user_roles_user_id_key" ON "user_roles"("user_id");

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "units" ADD CONSTRAINT "units_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leases" ADD CONSTRAINT "leases_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leases" ADD CONSTRAINT "leases_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "leases" ADD CONSTRAINT "leases_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "leases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_paid_by_fkey" FOREIGN KEY ("paid_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_raised_by_fkey" FOREIGN KEY ("raised_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "investment_listings" ADD CONSTRAINT "investment_listings_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "investment_listings" ADD CONSTRAINT "investment_listings_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "property_visits" ADD CONSTRAINT "property_visits_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "investment_listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "property_visits" ADD CONSTRAINT "property_visits_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Insert default roles
INSERT INTO "roles" ("id", "role_name") VALUES 
    (gen_random_uuid(), 'super_admin'),
    (gen_random_uuid(), 'admin'),
    (gen_random_uuid(), 'staff'),
    (gen_random_uuid(), 'broker'),
    (gen_random_uuid(), 'invitor'),
    (gen_random_uuid(), 'tenant')
ON CONFLICT (role_name) DO NOTHING;
