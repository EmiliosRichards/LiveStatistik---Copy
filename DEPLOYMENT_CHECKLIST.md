# 🚀 Deployment Checklist for Replit Autoscale

## Required Environment Variables (Secrets)

Before deploying, ensure **ALL** these secrets are configured in your Replit deployment:

### 1. **NextAuth Configuration** (CRITICAL!)
```bash
NEXTAUTH_SECRET="<generate with: openssl rand -base64 32>"
NEXTAUTH_URL="https://your-app-name.replit.app"
```
⚠️ **Without these, authentication will fail with JSON errors!**

### 2. **Azure AD Authentication**
```bash
AZURE_AD_CLIENT_ID="<your-azure-app-client-id>"
AZURE_AD_CLIENT_SECRET="<your-azure-app-secret>"
AZURE_AD_TENANT_ID="<your-azure-tenant-id>"
GROUP_ID_ADMINS="<azure-ad-group-id-for-admins>"
GROUP_ID_USERS="<azure-ad-group-id-for-users>"
```

### 3. **External Database**
```bash
EXTERNAL_DB_HOST="185.216.75.247"
EXTERNAL_DB_DATABASE="<your-db-name>"
EXTERNAL_DB_USER="<your-db-user>"
EXTERNAL_DB_PASSWORD="<your-db-password>"
```

### 4. **Optional Features**
```bash
# Enable guest sign-in (for testing)
ALLOW_GUEST="true"
NEXT_PUBLIC_ALLOW_GUEST="true"

# Dialfire API integration (for campaign mapping)
DIALFIRE_API_TOKEN="<your-dialfire-token>"

# Transcription service
TRANSCRIPTION_API_KEY="<your-transcription-key>"

# Preview environment basic auth (optional)
PREVIEW_BASIC_AUTH="1"
PREVIEW_USER="<username>"
PREVIEW_PASS="<password>"
```

---

## Common Deployment Issues & Fixes

### ❌ Issue: "CLIENT_FETCH_ERROR" or "Internal S... is not valid JSON"
**Cause:** Missing `NEXTAUTH_SECRET` or `NEXTAUTH_URL`

**Fix:**
1. Generate secret: `openssl rand -base64 32`
2. Set `NEXTAUTH_SECRET` in deployment secrets
3. Set `NEXTAUTH_URL` to your deployed URL (e.g., `https://your-app.replit.app`)
4. Redeploy

---

### ❌ Issue: Deployment times out waiting for port
**Cause:** Next.js taking too long to start or crashing

**Fix:**
1. **CRITICAL:** Set these secrets BEFORE deploying:
   - `NEXTAUTH_SECRET` (generate with `openssl rand -base64 32`)
   - `NEXTAUTH_URL` (your deployed URL, e.g., `https://your-app.replit.app`)
2. Check deployment logs for specific Next.js startup errors
3. Verify all required database secrets are set
4. If Next.js is crashing, look for "Error:" messages in deployment logs

---

### ❌ Issue: Guest sign-in button doesn't work
**Cause:** Missing environment variables or NextAuth configuration error

**Fix:**
1. Set `ALLOW_GUEST="true"` in deployment secrets
2. Set `NEXT_PUBLIC_ALLOW_GUEST="true"` (with `NEXT_PUBLIC_` prefix!)
3. Ensure `NEXTAUTH_SECRET` is configured
4. Redeploy

---

## 📋 Pre-Deployment Steps

1. ✅ Run `bash build-prod.sh` locally to verify build succeeds
2. ✅ Check all required secrets are set in Replit deployment settings
3. ✅ Verify `NEXTAUTH_URL` matches your actual deployment URL
4. ✅ Generate new `NEXTAUTH_SECRET` if not already set
5. ✅ Click "Deploy" in Replit
6. ✅ Monitor deployment logs for errors
7. ✅ Test authentication after deployment succeeds

---

## 🔍 How to Debug Failed Deployments

1. **Check deployment logs** - Look for specific error messages
2. **Verify secrets** - Make sure ALL required secrets are set
3. **Test locally** - Run `bash start-prod.sh` to test production mode
4. **Check NextAuth** - Most issues are related to missing NEXTAUTH_SECRET/URL
5. **Contact support** - If issue persists, provide deployment logs

---

## ✅ Deployment Success Indicators

- Express backend starts on port 5001
- Next.js starts on port 5000 within 60 seconds
- Health check at `/` responds with 200 OK
- Sign-in page loads without errors
- Guest sign-in works (if enabled)
- Azure AD sign-in redirects correctly

---

**Last Updated:** October 28, 2025
