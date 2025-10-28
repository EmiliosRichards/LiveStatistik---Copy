# 🚨 DEPLOYMENT FIX - Action Required

## Problem
Next.js is not starting on port 5000 during deployment, causing timeout.

## Root Cause
Missing **NEXTAUTH_SECRET** and/or **NEXTAUTH_URL** environment variables are causing Next.js to crash on startup.

---

## ✅ SOLUTION - Follow These Steps

### Step 1: Generate NEXTAUTH_SECRET

Run this command on your local machine or in Replit Shell:

```bash
openssl rand -base64 32
```

**Copy the output** (it will look like: `xYz123AbC456...`)

### Step 2: Set Deployment Secrets

Go to your Replit Deployment settings and add these secrets:

1. **NEXTAUTH_SECRET**
   - Value: `<paste the output from step 1>`

2. **NEXTAUTH_URL**
   - Value: `https://live-statistik-v2-1s1z20-teamleiter.replit.app` (or your actual deployment URL)

3. **ALLOW_GUEST** (if you want guest sign-in)
   - Value: `true`

4. **NEXT_PUBLIC_ALLOW_GUEST** (if you want guest sign-in button visible)
   - Value: `true`

### Step 3: Verify Other Required Secrets Are Set

Make sure these are configured:

- ✅ `EXTERNAL_DB_HOST`
- ✅ `EXTERNAL_DB_DATABASE`
- ✅ `EXTERNAL_DB_USER`
- ✅ `EXTERNAL_DB_PASSWORD`
- ✅ `AZURE_AD_CLIENT_ID`
- ✅ `AZURE_AD_CLIENT_SECRET`
- ✅ `AZURE_AD_TENANT_ID`
- ✅ `GROUP_ID_ADMINS`
- ✅ `GROUP_ID_USERS`

### Step 4: Redeploy

Click the "Deploy" button again.

---

## What Changed in Latest Build

✅ Fixed Express to run API-only on port 5001  
✅ Fixed Next.js port configuration  
✅ Added explicit NextAuth secret requirement  
✅ Fixed statistics KPI calculation (7-day rolling window)  
✅ Fixed statistics aggregation bug  

---

## Expected Deployment Timeline

- **0-10s**: Security scan
- **10-30s**: Build (Express + Next.js)
- **30-50s**: Express backend starts on 5001
- **50-90s**: Next.js starts on 5000
- **✅ Success**: Both servers running, deployment complete

---

## How to Verify Success

After deployment succeeds, test these:

1. Visit your deployed URL - should show dashboard
2. Click profile button - should show your name (or "Guest")
3. Try "Continue as Guest" - should sign in successfully
4. Check KPI cards show data (e.g., "Total Calls (Last 7 Days)")

---

## If Deployment Still Fails

Check deployment logs for these specific errors:

- `Error: No secret provided` → NEXTAUTH_SECRET missing
- `Error: NEXTAUTH_URL` → NEXTAUTH_URL not set correctly
- `Database connection failed` → Check EXTERNAL_DB_* secrets
- `EADDRINUSE` → Port conflict (shouldn't happen in fresh deployment)

---

**Last Updated:** October 28, 2025 - 07:50 UTC
