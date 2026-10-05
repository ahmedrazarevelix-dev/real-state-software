-- CreateEnum
CREATE TYPE "SellerSubscriptionPlan" AS ENUM ('basic', 'premium', 'pro');

-- CreateEnum
CREATE TYPE "AgentAgreementStatus" AS ENUM ('pending', 'active', 'completed', 'cancelled', 'expired');

-- CreateEnum
CREATE TYPE "AgentAgreementType" AS ENUM ('exclusive', 'non_exclusive');

-- AlterTable: Add managedByAgentId to property_listings
ALTER TABLE "property_listings" ADD COLUMN "managed_by_agent_id" TEXT;

-- CreateTable: SellerSubscription
CREATE TABLE "seller_subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "plan" "SellerSubscriptionPlan" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PKR',
    "billing_cycle" TEXT NOT NULL DEFAULT 'monthly',
    "stripe_subscription_id" TEXT,
    "stripe_customer_id" TEXT,
    "listing_limit" INTEGER NOT NULL,
    "featured_slots" INTEGER NOT NULL DEFAULT 0,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "next_billing_date" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancellation_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seller_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AgentSellerAgreement
CREATE TABLE "agent_seller_agreements" (
    "id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "listing_id" TEXT,
    "commission_rate" DECIMAL(5,2) NOT NULL,
    "commission_amount" DECIMAL(12,2),
    "status" "AgentAgreementStatus" NOT NULL DEFAULT 'pending',
    "agreement_type" "AgentAgreementType" NOT NULL DEFAULT 'exclusive',
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "terms" TEXT,
    "seller_signed_at" TIMESTAMP(3),
    "agent_signed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancellation_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_seller_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "seller_subscriptions_user_id_key" ON "seller_subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "seller_subscriptions_user_id_idx" ON "seller_subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "seller_subscriptions_status_idx" ON "seller_subscriptions"("status");

-- CreateIndex
CREATE INDEX "seller_subscriptions_plan_idx" ON "seller_subscriptions"("plan");

-- CreateIndex
CREATE INDEX "seller_subscriptions_next_billing_date_idx" ON "seller_subscriptions"("next_billing_date");

-- CreateIndex
CREATE INDEX "agent_seller_agreements_seller_id_idx" ON "agent_seller_agreements"("seller_id");

-- CreateIndex
CREATE INDEX "agent_seller_agreements_agent_id_idx" ON "agent_seller_agreements"("agent_id");

-- CreateIndex
CREATE INDEX "agent_seller_agreements_listing_id_idx" ON "agent_seller_agreements"("listing_id");

-- CreateIndex
CREATE INDEX "agent_seller_agreements_status_idx" ON "agent_seller_agreements"("status");

-- AddForeignKey
ALTER TABLE "property_listings" ADD CONSTRAINT "property_listings_managed_by_agent_id_fkey" FOREIGN KEY ("managed_by_agent_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_subscriptions" ADD CONSTRAINT "seller_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_seller_agreements" ADD CONSTRAINT "agent_seller_agreements_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_seller_agreements" ADD CONSTRAINT "agent_seller_agreements_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_seller_agreements" ADD CONSTRAINT "agent_seller_agreements_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "property_listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
