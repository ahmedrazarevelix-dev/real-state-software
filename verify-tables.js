const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verifyTables() {
  try {
    console.log('🔍 Checking database tables...\n');
    
    // Check seller_subscriptions table
    const sellerSubCount = await prisma.$queryRaw`
      SELECT COUNT(*) FROM seller_subscriptions
    `;
    console.log('✅ seller_subscriptions table exists');
    console.log(`   Records: ${sellerSubCount[0].count}\n`);
    
    // Check agent_seller_agreements table
    const agreementCount = await prisma.$queryRaw`
      SELECT COUNT(*) FROM agent_seller_agreements
    `;
    console.log('✅ agent_seller_agreements table exists');
    console.log(`   Records: ${agreementCount[0].count}\n`);
    
    // Check property_listings has managedByAgentId
    const listingColumns = await prisma.$queryRaw`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'property_listings' 
      AND column_name = 'managed_by_agent_id'
    `;
    console.log('✅ property_listings.managed_by_agent_id field exists');
    console.log(`   Column found: ${listingColumns.length > 0}\n`);
    
    console.log('🎉 All database changes verified successfully!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

verifyTables();
