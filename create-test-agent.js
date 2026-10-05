require('dotenv').config();
const axios = require('axios');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5001';

async function createTestAgent() {
    console.log('\n🔧 Creating Fresh Unverified Agent Account...\n');
    
    const testAgent = {
        name: "Test Agent Fresh",
        email: "testagent.fresh@example.com",
        password: "TestAgent123!@#",
        role: "agent"
    };
    
    try {
        // Step 1: Register
        console.log('📝 Step 1: Registering agent...');
        const registerResponse = await axios.post(`${BASE_URL}/api/v1/auth/register`, testAgent);
        console.log('✅ Registration successful');
        
        const userData = registerResponse.data.data;
        const userId = userData.id || userData.userId;
        const otp = userData.otp; // Development mode
        
        console.log('User ID:', userId);
        console.log('OTP:', otp);
        
        // Step 2: Verify Email
        console.log('\n📧 Step 2: Verifying email...');
        const verifyResponse = await axios.post(`${BASE_URL}/api/v1/auth/verify-otp`, {
            email: testAgent.email,
            otp: otp
        });
        console.log('✅ Email verified');
        
        // Step 3: Login
        console.log('\n🔐 Step 3: Logging in...');
        const loginResponse = await axios.post(`${BASE_URL}/api/v1/auth/login`, {
            email: testAgent.email,
            password: testAgent.password
        });
        
        const accessToken = loginResponse.data.data.accessToken;
        const loginUserId = loginResponse.data.data.user.id;
        
        console.log('✅ Login successful');
        
        // Step 4: Complete Profile
        console.log('\n👤 Step 4: Completing profile...');
        const profileResponse = await axios.patch(
            `${BASE_URL}/api/v1/profile`,
            {
                phone: "+923001234567",
                city: "Lahore",
                address: "Test Address, DHA Phase 5",
                dateOfBirth: "1990-01-15"
            },
            {
                headers: { Authorization: `Bearer ${accessToken}` }
            }
        );
        console.log('✅ Profile completed');
        
        // Final Summary
        console.log('\n' + '='.repeat(60));
        console.log('✅ FRESH UNVERIFIED AGENT CREATED SUCCESSFULLY!');
        console.log('='.repeat(60));
        console.log('\n📋 Account Details:');
        console.log('─'.repeat(60));
        console.log('Name:      ', testAgent.name);
        console.log('Email:     ', testAgent.email);
        console.log('Password:  ', testAgent.password);
        console.log('Role:      ', testAgent.role);
        console.log('User ID:   ', loginUserId);
        console.log('─'.repeat(60));
        console.log('\n🔑 Access Token:');
        console.log(accessToken);
        console.log('\n⚠️  Verification Status: NOT VERIFIED (Draft mode)');
        console.log('─'.repeat(60));
        console.log('\n✅ Use this token to test:');
        console.log('   - Listings should be DRAFT (not active)');
        console.log('   - Agent needs verification first');
        console.log('\n');
        
        return {
            email: testAgent.email,
            password: testAgent.password,
            accessToken: accessToken,
            userId: loginUserId
        };
        
    } catch (error) {
        console.error('\n❌ Error:', error.response?.data || error.message);
        throw error;
    }
}

createTestAgent();
