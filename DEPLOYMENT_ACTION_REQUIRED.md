# 🚨 MANUAL ACTION REQUIRED - Deployment Fix

## Two Issues Fixed + One Manual Step Needed

---

## ✅ Issue 1: Shell Syntax Error (FIXED)
**Problem:** `start-prod.sh: line 44: exec: PORT=5000: not found`

**Fix Applied:** Changed from:
```bash
cd web && exec PORT=5000 NODE_ENV=production npm start
```

To:
```bash
cd web
export PORT=5000
export NODE_ENV=production
exec npm start
```

---

## ⚠️ Issue 2: Multiple Ports in .replit (NEEDS MANUAL FIX)

**Problem:** According to Replit documentation:
> "Autoscale deployments only support exposing a **single external port**."

Your `.replit` file currently has TWO ports configured:
```toml
[[ports]]
localPort = 5000
externalPort = 80     # ✅ Your app

[[ports]]
localPort = 41413
externalPort = 3000   # ❌ Extra port causing issues
```

---

## 🔧 MANUAL FIX REQUIRED

**You need to manually edit `.replit` and remove the second port.**

### Steps:

1. **Open** `.replit` file in Replit editor
2. **Find** this section:
   ```toml
   [[ports]]
   localPort = 5000
   externalPort = 80

   [[ports]]
   localPort = 41413
   externalPort = 3000
   ```

3. **Delete** the second port block, so it looks like:
   ```toml
   [[ports]]
   localPort = 5000
   externalPort = 80
   ```

4. **Save** the file

---

## After Manual Fix, Deploy!

Once you've removed the extra port configuration:

1. **Build** (optional, already done):
   ```bash
   bash build-prod.sh
   ```

2. **Click "Deploy"** in Replit

3. **Expected result:**
   - Build: ~30 seconds
   - Express starts on 5001: ~5 seconds
   - Next.js starts on 5000: ~10-15 seconds
   - ✅ Deployment succeeds!

---

## Why This Matters

Autoscale deployments watch for the **first port specified** (`localPort: 5000`) to open. With multiple ports configured:
- Replit gets confused about which port to monitor
- Health checks fail even though the app is running
- Deployment times out

**Single port = Clear signal = Successful deployment**

---

## Summary of All Fixes

✅ Fixed shell syntax error in `start-prod.sh`  
✅ Cache warmer delayed to 90s in production  
✅ Azure AD provider made conditional (handles "NA")  
✅ KPI calculations use 7-day rolling comparison  
✅ Statistics aggregation bug fixed  
⚠️ **YOU MUST:** Remove extra port from `.replit` file

---

## Verification After Deployment

1. Visit your deployed URL
2. Click "Continue as Guest"
3. Select agents and date range
4. Click "Statistiken suchen"
5. Charts should load (2-5s first time, instant after)

---

**Last Updated:** October 28, 2025 - 10:10 UTC
