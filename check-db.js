const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDB() {
  try {
    // Check all tables
    const tables = await prisma.$queryRaw`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename
    `;
    
    console.log('📋 Database Tables:\n');
    tables.forEach(t => console.log(`  - ${t.tablename}`));
    
    // Check for our new tables
    const hasSellerSub = tables.some(t => t.tablename === 'seller_subscriptions');
    const hasAgreement = tables.some(t => t.tablename === 'agent_seller_agreements');
    
    console.log('\n🔍 New Tables Status:');
    console.log(`  seller_subscriptions: ${hasSellerSub ? '✅' : '❌'}`);
    console.log(`  agent_seller_agreements: ${hasAgreement ? '✅' : '❌'}`);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkDB();
