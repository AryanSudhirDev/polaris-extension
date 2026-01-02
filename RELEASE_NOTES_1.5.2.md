# 🎉 Promptr v1.5.2 - Secure Backend Architecture

**Release Date:** January 2, 2026  
**Package:** `promptr-1.5.2.vsix`

---

## 🚀 Major Changes

### ✅ Migrated to Secure Backend Proxy

Previously, the OpenAI API key was embedded in the extension bundle (detected during packaging). This version completely removes all API keys from the client-side code.

**Before (v1.5.1 and earlier):**
```typescript
// ❌ API key embedded in extension
const apiKey = process.env.PROMPTR_MASTER_KEY;
headers: {
  'Authorization': `Bearer ${apiKey}`
}
```

**After (v1.5.2):**
```typescript
// ✅ No API key in extension - handled by backend
const urlString = 'https://promptr-api.vercel.app/api/chat';
headers: {
  'Content-Type': 'application/json'
  // No Authorization header needed
}
```

---

## 🔒 Security Improvements

### 1. **Backend Proxy Architecture**
   - Vercel serverless function at `/api/chat.ts`
   - OpenAI API key stored as Vercel environment variable
   - Extension makes requests to backend, not directly to OpenAI

### 2. **No Client-Side Secrets**
   - Removed `PROMPTR_MASTER_KEY` from webpack bundle
   - Removed Authorization header from extension
   - API key never exposed to end users

### 3. **CORS Configuration**
   - Backend allows requests from extension
   - Secure headers implementation
   - Production-ready deployment

---

## 📋 Technical Changes

### Modified Files:
1. **`src/extension.ts`**
   - Updated default API base to Vercel backend
   - Removed API key checks and usage
   - Removed Authorization header
   - Line 395-408: Simplified API configuration
   - Line 1042: Changed endpoint to `/api/chat`

2. **`package.json`**
   - Version bumped to 1.5.2
   - Default `apiBase` now points to Vercel

3. **`webpack.config.js`**
   - Removed `PROMPTR_MASTER_KEY` from EnvironmentPlugin

4. **`CHANGELOG.md`**
   - Added comprehensive v1.5.2 release notes

### New Files (from v1.5.1):
- `/api/chat.ts` - Vercel serverless function
- `vercel.json` - Deployment configuration
- `.vercelignore` - Deployment exclusions
- `DEPLOY_NOW.md` - Quick deployment guide
- `VERCEL_SETUP.md` - Comprehensive setup docs
- `SETUP_COMPLETE.md` - Post-deployment checklist

---

## 🧪 Testing

### ✅ Verified Working:
- Backend API responds correctly
- OpenAI integration functional
- No security warnings during packaging
- Extension bundle size: 1.5 MB (51.6 KB compiled code)

### Test Command:
```bash
curl -X POST https://promptr-api.vercel.app/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-3.5-turbo-0125",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

**Expected:** JSON response with OpenAI completion ✅

---

## 📦 Installation

### Option 1: Install VSIX Directly
```bash
code --install-extension promptr-1.5.2.vsix
```

### Option 2: Publish to Marketplaces

**VS Code Marketplace:**
```bash
vsce login aryansudhir
npm run publish:vsce
```

**Open VSX Registry:**
```bash
export OVSX_PAT=your-token-here
npm run publish:ovsx
```

**Both at once:**
```bash
export OVSX_PAT=your-token-here
npm run publish:all
```

---

## 🎯 Benefits

| Aspect | Before | After |
|--------|--------|-------|
| **Security** | ❌ API key in bundle | ✅ Server-side only |
| **Distribution** | ❌ Can't publish publicly | ✅ Safe for public distribution |
| **Architecture** | ⚠️ Client-side API calls | ✅ Backend proxy pattern |
| **Scalability** | ⚠️ Rate limits per user | ✅ Centralized management |
| **Maintenance** | ⚠️ Key rotation = rebuild | ✅ Update Vercel env var |

---

## 🔗 Resources

- **Backend API:** https://promptr-api.vercel.app/api/chat
- **GitHub Repo:** https://github.com/AryanSudhirDev/polaris-extension
- **Vercel Dashboard:** https://vercel.com/aryansudhirdevs-projects/promptr-api

---

## 🆘 Troubleshooting

### Extension shows "service unavailable"
- Check backend is deployed: Visit https://promptr-api.vercel.app/api/chat
- Verify Vercel environment variables are set
- Check Vercel logs: `vercel logs`

### API returns 401 error
- Verify OpenAI API key in Vercel dashboard
- Confirm key has sufficient credits
- Check key hasn't expired

### Need to update API key
```bash
cd /Users/aryansudhir/Downloads/Promptr
vercel env rm OPENAI_API_KEY production
vercel env add OPENAI_API_KEY production
# Paste new key when prompted
vercel --prod --yes
```

---

## 📊 Package Contents

```
promptr-1.5.2.vsix (1.5 MB, 25 files)
├── dist/extension.js (51.6 KB) ✅ No embedded keys
├── api/chat.ts (2.2 KB) - Backend proxy
├── images/promptr-icon.png (1.46 MB)
├── premium-tokens.json (6.05 KB) - 90 tokens
├── Documentation files
└── Configuration files
```

---

## ✨ What's Next?

1. **Test the extension** with your premium tokens
2. **Publish to marketplaces** (optional)
3. **Monitor Vercel logs** for usage patterns
4. **Update API key** on Vercel when needed (no rebuild required!)

---

**🎉 Congratulations! You now have a production-ready, secure VS Code extension!**

For questions or issues, check the documentation files or Vercel logs.

