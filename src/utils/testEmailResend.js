/**
 * Test Resend Email Sending Utility
 * 
 * Usage: node src/utils/testEmailResend.js test@example.com
 * 
 * This script tests if Resend email sending is working properly
 */

require('dotenv').config();
const { sendRegistrationOtp } = require('./mailer.resend');

const testEmail = async () => {
    const recipientEmail = process.argv[2];
    
    if (!recipientEmail) {
        console.error('❌ Please provide recipient email as argument');
        console.log('\nUsage: node src/utils/testEmailResend.js recipient@example.com');
        process.exit(1);
    }

    console.log('\n=== RESEND EMAIL SENDING TEST ===\n');
    console.log(`Recipient: ${recipientEmail}`);
    console.log(`Resend API Key: ${process.env.RESEND_API_KEY ? '✅ SET' : '❌ NOT SET'}\n`);

    if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === 'your_resend_api_key_here') {
        console.error('❌ RESEND_API_KEY not configured!');
        console.log('\n📝 Setup Instructions:');
        console.log('1. Sign up at: https://resend.com/signup');
        console.log('2. Get API Key from: https://resend.com/api-keys');
        console.log('3. Add to .env file: RESEND_API_KEY=re_xxxxxxxxxx');
        console.log('4. Restart your server\n');
        process.exit(1);
    }

    const testOtp = Math.floor(100000 + Math.random() * 900000).toString();
    
    try {
        console.log('Sending test OTP email via Resend...\n');
        await sendRegistrationOtp(recipientEmail, testOtp);
        console.log('\n✅ Test completed successfully!');
        console.log(`📧 Check your inbox at: ${recipientEmail}`);
        console.log('⚡ Resend has 99.9% deliverability - email should arrive in seconds!');
        console.log('💡 No spam folder issues with Resend!\n');
    } catch (error) {
        console.error('\n❌ Test FAILED!');
        console.error('Error:', error.message);
        
        if (error.message.includes('API key')) {
            console.log('\n📝 Check your RESEND_API_KEY in .env file');
            console.log('Get it from: https://resend.com/api-keys');
        }
        
        console.error('\nFull error:', error);
    }
};

testEmail();
