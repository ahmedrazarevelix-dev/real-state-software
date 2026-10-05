const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Starting comprehensive seed...\n');

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1: Roles
    // ═══════════════════════════════════════════════════════════════════════
    
    console.log('📋 Seeding Roles...');
    const roles = ['super_admin', 'admin', 'agent', 'buyer', 'seller', 'tenant'];
    
    for (const roleName of roles) {
        await prisma.role.upsert({
            where: { roleName },
            update: {},
            create: { roleName },
        });
        console.log(`  ✅ ${roleName}`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2: Permissions
    // ═══════════════════════════════════════════════════════════════════════
    
    console.log('\n🔐 Seeding Permissions...');
    const permissions = [
        'users.manage',
        'roles.manage',
        'listings.read',
        'listings.create',
        'listings.approve',
        'listings.manage',
        'inquiries.read',
        'inquiries.manage',
        'tours.read',
        'tours.manage',
        'payments.read',
        'payments.manage',
        'support.manage',
        'seller_verification.review',
        'agent_verification.review',
        'tenant_applications.review',
        'purchase_applications.review',
        'agreements.manage',
    ];

    for (const permissionName of permissions) {
        await prisma.permission.upsert({
            where: { permissionName },
            update: {},
            create: { permissionName },
        });
        console.log(`  ✅ ${permissionName}`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3: Role-Permission Mapping
    // ═══════════════════════════════════════════════════════════════════════
    
    console.log('\n🔗 Mapping Role Permissions...');
    
    const roleMap = await prisma.role.findMany();
    const permissionMap = await prisma.permission.findMany();
    const permissionByName = Object.fromEntries(permissionMap.map(item => [item.permissionName, item]));

    const rolePermissions = {
        super_admin: [
            'users.manage',
            'roles.manage',
            'listings.read',
            'listings.create',
            'listings.approve',
            'listings.manage',
            'inquiries.read',
            'inquiries.manage',
            'tours.read',
            'tours.manage',
            'payments.read',
            'payments.manage',
            'support.manage',
            'seller_verification.review',
            'agent_verification.review',
            'tenant_applications.review',
            'purchase_applications.review',
            'agreements.manage',
        ],
        admin: [
            'users.manage',
            'listings.read',
            'listings.approve',
            'listings.manage',
            'inquiries.read',
            'inquiries.manage',
            'tours.read',
            'tours.manage',
            'payments.read',
            'payments.manage',
            'seller_verification.review',
            'agent_verification.review',
            'tenant_applications.review',
            'purchase_applications.review',
            'agreements.manage',
        ],
        agent: [
            'listings.read',
            'listings.create',
            'inquiries.read',
            'inquiries.manage',
            'tours.read',
            'tours.manage',
        ],
        seller: [
            'listings.read',
            'listings.create',
            'inquiries.read',
            'tours.read',
        ],
        buyer: [
            'listings.read',
            'inquiries.read',
            'tours.read',
        ],
        tenant: [
            'listings.read',
        ],
    };

    for (const role of roleMap) {
        const permissions = rolePermissions[role.roleName] || [];
        console.log(`  📌 ${role.roleName}: ${permissions.length} permissions`);

        for (const permissionName of permissions) {
            const permission = permissionByName[permissionName];
            if (!permission) {
                console.log(`    ⚠️  Permission not found: ${permissionName}`);
                continue;
            }

            await prisma.rolePermission.upsert({
                where: {
                    roleId_permissionId: {
                        roleId: role.id,
                        permissionId: permission.id
                    }
                },
                update: {},
                create: {
                    roleId: role.id,
                    permissionId: permission.id
                }
            });
        }
    }

    console.log('\n✅ Seed completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`   Roles: ${roles.length}`);
    console.log(`   Permissions: ${permissions.length}`);
    console.log(`   Role-Permission Mappings: Created`);
}

main()
    .catch((e) => {
        console.error('❌ Seeding failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
