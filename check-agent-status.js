const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAgentStatus() {
    const agentId = 'a23c3901-2d44-4e1a-ac23-da0ce6f795f6';
    
    const agent = await prisma.user.findUnique({
        where: { id: agentId },
        include: {
            agentVerification: true
        }
    });
    
    console.log('\n👤 Agent Details:');
    console.log('ID:', agent.id);
    console.log('Name:', agent.name);
    console.log('Role:', agent.role);
    console.log('Email:', agent.email);
    
    console.log('\n🔐 Verification Status:');
    if (agent.agentVerification) {
        console.log('Status:', agent.agentVerification.status);
        console.log('Agency:', agent.agentVerification.agencyName);
        console.log('Submitted At:', agent.agentVerification.submittedAt);
        console.log('Reviewed At:', agent.agentVerification.reviewedAt);
        console.log('Approved:', agent.agentVerification.status === 'approved' ? '✅ YES' : '❌ NO');
    } else {
        console.log('❌ NO VERIFICATION RECORD FOUND!');
        console.log('This agent has NOT submitted verification yet.');
    }
    
    console.log('\n📊 Conclusion:');
    if (agent.agentVerification?.status === 'approved') {
        console.log('✅ Agent is VERIFIED - Listings will auto-activate');
    } else {
        console.log('❌ Agent is NOT VERIFIED - Listings should be DRAFT');
        console.log('🐛 BUG: Listing became active without verification!');
    }
    
    await prisma.$disconnect();
}

checkAgentStatus().catch(console.error);
