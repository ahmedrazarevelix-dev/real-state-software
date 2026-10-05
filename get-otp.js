const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function getOTP() {
    const user = await prisma.user.findUnique({
        where: { email: 'testagent.fresh@example.com' }
    });
    
    if (user) {
        console.log('\n✅ User found!');
        console.log('Email:', user.email);
        console.log('OTP:', user.otp);
        console.log('OTP Expiry:', user.otpExpiry);
        console.log('Verified:', user.isVerified);
        console.log('\n📝 Use this OTP to verify email!');
    } else {
        console.log('❌ User not found');
    }
    
    await prisma.$disconnect();
}

getOTP().catch(console.error);
