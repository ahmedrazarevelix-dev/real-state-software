# 🧪 Testing Guide - Seller Subscription & Agent Assignment

## ✅ What's Been Implemented

### 1. **Seller Subscription System**
- Sellers can now subscribe to premium plans
- 3 plans: Basic (FREE), Premium (Rs 5,000/month), Pro (Rs 10,000/month)
- Listing limits enforced

### 2. **Agent Assignment System**
- Sellers can hire agents to manage their properties
- Agents can accept/reject requests
- Agents can promote seller's properties
- Commission tracking

### 3. **Listing Limits**
- Seller FREE: Maximum 3 listings
- Agent FREE: Maximum 5 listings
- Enforced via middleware

---

## 🧪 Test Cases

### **Test 1: Check Listing Limit (Seller - FREE tier)**

**Prerequisite:** Login as Seller (should have `seller` role)

```bash
# Get auth token first
POST http://localhost:5001/api/v1/auth/login
{
  "email": "seller@example.com",
  "password": "password123"
}

# Try to create 4th listing (should fail if already have 3)
POST http://localhost:5001/api/v1/listings
Authorization: Bearer <seller-token>
{
  "title": "Test Property 4",
  "purpose": "sale",
  "propertyType": "house",
  "city": "Lahore",
  "location": "DHA Phase 5",
  "price": 50000000,
  "currency": "PKR"
}

# Expected Response (if limit reached):
{
  "success": false,
  "message": "Listing limit reached (3 listings). Please upgrade your subscription."
}
```

---

### **Test 2: Seller Subscription Purchase**

```bash
POST http://localhost:5001/api/v1/payments/subscription
Authorization: Bearer <seller-token>
Content-Type: application/json

{
  "plan": "premium"
}

# Expected Response:
{
  "success": true,
  "message": "Payment intent created",
  "data": {
    "paymentId": "uuid",
    "clientSecret": "stripe_secret",
    "amount": 5000,
    "currency": "PKR",
    "plan": "premium",
    "subscriptionType": "seller",
    "planDetails": {
      "price": 5000,
      "listingLimit": 10,
      "featuredSlots": 1,
      "features": [...]
    }
  }
}
```

---

### **Test 3: Agent Subscription Purchase**

```bash
POST http://localhost:5001/api/v1/payments/subscription
Authorization: Bearer <agent-token>
Content-Type: application/json

{
  "plan": "gold"
}

# Expected Response:
{
  "success": true,
  "message": "Payment intent created",
  "data": {
    "subscriptionType": "agent",
    "plan": "gold",
    "amount": 30000,
    ...
  }
}
```

---

### **Test 4: Agent Assignment - Seller Assigns Agent**

**Prerequisites:**
- Have a seller with an active listing
- Have an agent user

```bash
POST http://localhost:5001/api/v1/agent-assignments
Authorization: Bearer <seller-token>
Content-Type: application/json

{
  "agentId": "<agent-user-id>",
  "listingId": "<property-listing-id>",
  "commissionRate": 2.5,
  "terms": "Agent will handle all marketing and viewings",
  "agreementType": "exclusive"
}

# Expected Response:
{
  "success": true,
  "message": "Agent assignment request created successfully",
  "data": {
    "id": "agreement-uuid",
    "status": "pending",
    "sellerId": "...",
    "agentId": "...",
    "listingId": "...",
    "commissionRate": 2.5,
    "seller": {...},
    "agent": {...},
    "listing": {...}
  }
}
```

---

### **Test 5: Agent Accepts Assignment**

```bash
# Get pending requests first
GET http://localhost:5001/api/v1/agent-assignments/requests?status=pending
Authorization: Bearer <agent-token>

# Accept specific request
POST http://localhost:5001/api/v1/agent-assignments/<agreement-id>/accept
Authorization: Bearer <agent-token>

# Expected Response:
{
  "success": true,
  "message": "Assignment accepted successfully",
  "data": {
    "status": "active",
    "agentSignedAt": "2026-10-04T...",
    ...
  }
}
```

---

### **Test 6: Agent Views Managed Listings**

```bash
GET http://localhost:5001/api/v1/agent-assignments/managed-listings
Authorization: Bearer <agent-token>

# Expected Response:
{
  "success": true,
  "data": [
    {
      "id": "listing-uuid",
      "title": "...",
      "managedByAgentId": "<agent-id>",
      "listedBy": {
        "id": "seller-id",
        "name": "Seller Name"
      }
    }
  ]
}
```

---

### **Test 7: Agent Promotes Seller's Listing**

**This is the key test - Agent promoting a listing they manage**

```bash
POST http://localhost:5001/api/v1/payments/promotion
Authorization: Bearer <agent-token>
Content-Type: application/json

{
  "listingId": "<managed-listing-id>",
  "promotionType": "featured",
  "duration": 1
}

# Expected Response:
{
  "success": true,
  "message": "Payment intent created",
  "data": {
    "paymentId": "...",
    "amount": 5000,
    "promotionType": "featured"
  }
}

# Before this change, this would fail with:
# "Listing not found or access denied"
```

---

### **Test 8: Seller Removes Agent**

```bash
DELETE http://localhost:5001/api/v1/agent-assignments/<agreement-id>
Authorization: Bearer <seller-token>
Content-Type: application/json

{
  "reason": "No longer need agent services"
}

# Expected Response:
{
  "success": true,
  "message": "Agent assignment cancelled successfully"
}
```

---

### **Test 9: Check Listing Limit After Subscription**

```bash
# After seller subscribes to Premium plan (10 listings)
# Try creating 11th listing

POST http://localhost:5001/api/v1/listings
Authorization: Bearer <seller-token>

# Should work for listings 4-10
# Should fail at listing 11 with:
{
  "success": false,
  "message": "Listing limit reached (10 listings). Please upgrade your subscription."
}
```

---

### **Test 10: Get Pricing Information**

```bash
GET http://localhost:5001/api/v1/payments/pricing
Authorization: Bearer <any-token>

# Expected Response:
{
  "success": true,
  "data": {
    "agentSubscriptionDetails": {
      "basic": { "price": 0, "listingLimit": 5, ... },
      "silver": { "price": 15000, ... },
      "gold": { "price": 30000, ... },
      "platinum": { "price": 50000, ... }
    },
    "sellerSubscriptionDetails": {
      "basic": { "price": 0, "listingLimit": 3, ... },
      "premium": { "price": 5000, "listingLimit": 10, ... },
      "pro": { "price": 10000, "listingLimit": 20, ... }
    }
  }
}
```

---

## 🔍 Verification Checklist

- [ ] Seller can create max 3 FREE listings
- [ ] 4th listing creation fails with proper error
- [ ] Seller can purchase subscription
- [ ] After subscription, listing limit increases
- [ ] Agent can create max 5 FREE listings
- [ ] Seller can assign agent to listing
- [ ] Agent receives notification
- [ ] Agent can accept assignment
- [ ] Listing's `managedByAgentId` gets updated
- [ ] Agent can view managed listings
- [ ] Agent can promote seller's listing (KEY FEATURE)
- [ ] Seller/Agent can cancel agreement
- [ ] On cancellation, `managedByAgentId` becomes null

---

## 🐛 Known Issues / To Fix

None currently - all features implemented!

---

## 📝 Notes

- Stripe payment intents are created but not completed in testing
- Use Stripe test cards to complete payments
- Webhook handler will activate subscriptions automatically
- Database migrations are complete and working

---

## 🎯 Next Steps

1. Test all endpoints manually
2. Create automated test suite
3. Add integration tests
4. Document API in Swagger/Postman
