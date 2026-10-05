const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createTables() {
  try {
    console.log('🔧 Creating tables manually...\n');
    
    // Step 1: Create Enums
    console.log('1. Creating enums...');
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "SellerSubscriptionPlan" AS ENUM ('basic', 'premium', 'pro');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "AgentAgreementStatus" AS ENUM ('pending', 'active', 'completed', 'cancelled', 'expired');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "AgentAgreementType" AS ENUM ('exclusive', 'non_exclusive');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log('✅ Enums created\n');
    
    // Step 2: Add column to property_listings
    console.log('2. Adding managedByAgentId to property_listings...');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "property_listings" 
      ADD COLUMN IF NOT EXISTS "managed_by_agent_id" TEXT;
    `);
    console.log('✅ Column added\n');
    
    // Step 3: Create seller_subscriptions table
    console.log('3. Creating seller_subscriptions table...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "seller_subscriptions" (
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
    `);
    console.log('✅ Table created\n');
    
    // Step 4: Create agent_seller_agreements table
    console.log('4. Creating agent_seller_agreements table...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "agent_seller_agreements" (
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
    `);
    console.log('✅ Table created\n');
    
    // Step 5: Create indexes
    console.log('5. Creating indexes...');
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "seller_subscriptions_user_id_key" 
      ON "seller_subscriptions"("user_id");
    `);
    
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "seller_subscriptions_user_id_idx" 
      ON "seller_subscriptions"("user_id");
    `);
    
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "seller_subscriptions_status_idx" 
      ON "seller_subscriptions"("status");
    `);
    
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "seller_subscriptions_plan_idx" 
      ON "seller_subscriptions"("plan");
    `);
    
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "agent_seller_agreements_seller_id_idx" 
      ON "agent_seller_agreements"("seller_id");
    `);
    
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "agent_seller_agreements_agent_id_idx" 
      ON "agent_seller_agreements"("agent_id");
    `);
    
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "agent_seller_agreements_listing_id_idx" 
      ON "agent_seller_agreements"("listing_id");
    `);
    
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "agent_seller_agreements_status_idx" 
      ON "agent_seller_agreements"("status");
    `);
    console.log('✅ Indexes created\n');
    
    // Step 6: Add foreign keys
    console.log('6. Adding foreign keys...');
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "property_listings" 
        ADD CONSTRAINT "property_listings_managed_by_agent_id_fkey" 
        FOREIGN KEY ("managed_by_agent_id") REFERENCES "users"("id") 
        ON DELETE SET NULL ON UPDATE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "seller_subscriptions" 
        ADD CONSTRAINT "seller_subscriptions_user_id_fkey" 
        FOREIGN KEY ("user_id") REFERENCES "users"("id") 
        ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "agent_seller_agreements" 
        ADD CONSTRAINT "agent_seller_agreements_seller_id_fkey" 
        FOREIGN KEY ("seller_id") REFERENCES "users"("id") 
        ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "agent_seller_agreements" 
        ADD CONSTRAINT "agent_seller_agreements_agent_id_fkey" 
        FOREIGN KEY ("agent_id") REFERENCES "users"("id") 
        ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "agent_seller_agreements" 
        ADD CONSTRAINT "agent_seller_agreements_listing_id_fkey" 
        FOREIGN KEY ("listing_id") REFERENCES "property_listings"("id") 
        ON DELETE SET NULL ON UPDATE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log('✅ Foreign keys added\n');
    
    console.log('🎉 All tables created successfully!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

createTables();
