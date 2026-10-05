/**
 * Update _prisma_migrations table
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function updateMigrations() {
  try {
    // Add migration entry
    await prisma.$executeRawUnsafe(`
      INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
      VALUES (
        '${Date.now()}',
        'manual_migration',
        NOW(),
        '20261004115551_add_seller_subscription_and_agent_assignment',
        NULL,
        NULL,
        NOW(),
        1
      )
      ON CONFLICT DO NOTHING;
    `);
    
    console.log('✅ Migration table updated!');
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

updateMigrations();
