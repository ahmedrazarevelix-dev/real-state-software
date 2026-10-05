/**
 * Test SendGrid Email Sending Utility
 * 
 * Usage: node src/utils/testEmailSendGrid.js test@example.com
 * 
 * This script tests if SendGrid email sending is working properly
 */

require('dotenv').config();
const { sendRegistrationOtp } = require('./mailer.sendgrid');

const testEmail = async () => {
    const recipientEmail = process.argv[2];
    
    if (!recipientEmail) {
        console.error('❌ Please provide recipient email as argument');
        console.log('\nUsage: node src/utils/testEmailSendGrid.js recipient@example.com');
        process.exit(1);
    }

    console.log('\n=== SENDGRID EMAIL SENDING TEST ===\n');
    console.log(`Recipient: ${recipientEmail}`);
    console.log(`SendGrid API Key: ${process.env.SENDGRID_API_KEY ? '✅ SET' : '❌ NOT SET'}`);
    console.log(`From Email: ${process.env.SENDGRID_FROM_EMAIL || '❌ NOT SET'}\n`);

    if (!process.env.SENDGRID_API_KEY || process.env.SENDGRID_API_KEY === 'your_sendgrid_api_key_here') {
        console.error('❌ SENDGRID_API_KEY not configured!');
        console.log('\n📝 Setup Instructions:');
        console.log('1. Sign up at: https://signup.sendgrid.com/');
        console.log('2. Verify sender: https://app.sendgrid.com/settings/sender_auth/senders');
        console.log('3. Get API Key: https://app.sendgrid.com/settings/api_keys');
        console.log('4. Add to .env:');
        console.log('   SENDGRID_API_KEY=SG.xxxxxxxxxx');
        console.log('   SENDGRID_FROM_EMAIL=your_verified_email@gmail.com\n');
        process.exit(1);
    }

    if (!process.env.SENDGRID_FROM_EMAIL || process.env.SENDGRID_FROM_EMAIL === 'your_verified_email@gmail.com') {
        console.error('❌ SENDGRID_FROM_EMAIL not configured!');
        console.log('\n📝 Set your verified sender email in .env:');
        console.log('   SENDGRID_FROM_EMAIL=ahmedrazarevelix@gmail.com\n');
        process.exit(1);
    }

    const testOtp = Math.floor(100000 + Math.random() * 900000).toString();
    
    try {
        console.log('Sending test OTP email via SendGrid...\n');
        await sendRegistrationOtp(recipientEmail, testOtp);
        console.log('\n✅ Test completed successfully!');
        console.log(`📧 Check your inbox at: ${recipientEmail}`);
        console.log('⚡ SendGrid has 99%+ deliverability - email should arrive in seconds!');
        console.log('💡 Works with ANY email address!\n');
    } catch (error) {
        console.error('\n❌ Test FAILED!');
        console.error('Error:', error.message);
        
        if (error.message.includes('API key')) {
            console.log('\n📝 Check your SENDGRID_API_KEY in .env file');
            console.log('Get it from: https://app.sendgrid.com/settings/api_keys');
        }
        
        if (error.response && error.response.body) {
            console.error('\nSendGrid Response:', JSON.stringify(error.response.body, null, 2));
        }
    }
};

testEmail();
