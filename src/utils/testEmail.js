/**
 * Test Email Sending Utility
 * 
 * Usage: node src/utils/testEmail.js test@example.com
 * 
 * This script tests if email sending is working properly
 */

require('dotenv').config();
const { sendRegistrationOtp } = require('./mailer.brevo');

const testEmail = async () => {
    const recipientEmail = process.argv[2];
    
    if (!recipientEmail) {
        console.error('❌ Please provide recipient email as argument');
        console.log('\nUsage: node src/utils/testEmail.js recipient@example.com');
        process.exit(1);
    }

    const apiKey = (process.env.BREVO_API_KEY || '').trim();
    const fromEmail = process.env.BREVO_FROM_EMAIL || process.env.GMAIL_USER || 'NOT SET';

    console.log('\n=== BREVO EMAIL TEST ===\n');
    console.log(`Recipient: ${recipientEmail}`);
    console.log(`Brevo API Key: ${apiKey.startsWith('xkeysib-') ? 'SET' : 'INVALID OR MISSING'}`);
    console.log(`From Email: ${fromEmail}\n`);

    const testOtp = Math.floor(100000 + Math.random() * 900000).toString();
    
    try {
        console.log('Sending test OTP email...\n');
        await sendRegistrationOtp(recipientEmail, testOtp);
        console.log('\n✅ Test completed! Check console logs above for details.');
        console.log(`📧 Check your inbox at: ${recipientEmail}`);
        console.log('⚠️  Also check SPAM/JUNK folder!\n');
    } catch (error) {
        console.error('\n❌ Test FAILED!');
        console.error('Error:', error.message);
        console.error('\nFull error:', error);
    }
};

testEmail();
