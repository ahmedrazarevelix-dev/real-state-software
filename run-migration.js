/**
 * Run migration manually
 */

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
    
    console.log('🔄 Running migration...\n');
    
    // Split by semicolon and run each statement
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const statement of statements) {
      if (statement.startsWith('--')) continue; // Skip comments
      console.log(`Executing: ${statement.substring(0, 50)}...`);
      await prisma.$executeRawUnsafe(statement);
    }

    console.log('\n✅ Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

runMigration();
