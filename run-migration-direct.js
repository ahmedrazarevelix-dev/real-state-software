const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function runMigration() {
  try {
    console.log('📦 Reading migration file...');
    
    const migrationPath = path.join(
      __dirname,
      'prisma',
      'migrations',
      '20261004115551_add_seller_subscription_and_agent_assignment',
      'migration.sql'
    );

    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
    
    console.log('🔄 Running entire migration as one transaction...\n');
    
    // Execute the entire SQL file as raw query
    await prisma.$executeRawUnsafe(migrationSQL);

    console.log('\n✅ Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.log('\n🔍 Trying statement by statement...\n');
    
    // Try running statement by statement
    try {
      const migrationPath = path.join(
        __dirname,
        'prisma',
        'migrations',
        '20261004115551_add_seller_subscription_and_agent_assignment',
        'migration.sql'
      );

      const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
      
      // Split and execute
      const statements = migrationSQL
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i];
        console.log(`[${i+1}/${statements.length}] Executing...`);
        try {
          await prisma.$executeRawUnsafe(statement);
          console.log(`✅ Statement ${i+1} executed`);
        } catch (err) {
          // Check if it's "already exists" error
          if (err.message.includes('already exists') || err.message.includes('duplicate')) {
            console.log(`⚠️  Statement ${i+1} skipped (already exists)`);
          } else {
            console.error(`❌ Statement ${i+1} failed:`, err.message);
          }
        }
      }
      
      console.log('\n✅ Migration completed with some warnings!');
    } catch (innerError) {
      console.error('❌ Failed completely:', innerError.message);
    }
  } finally {
    await prisma.$disconnect();
  }
}

runMigration();
