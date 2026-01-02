# 🚀 Quick Deployment Guide

## Deploy Promptr API to Vercel (5 minutes)

### Step 1: Go to Vercel Dashboard
Visit: **https://vercel.com/new**

### Step 2: Import Your GitHub Repository
1. Click **"Add New..."** → **"Project"**
2. Search for: `polaris-extension`
3. Click **"Import"**

### Step 3: Configure Project
- **Framework Preset:** Other (leave default)
- **Root Directory:** `./` (leave default)
- **Build Command:** (leave empty)
- **Output Directory:** (leave empty)

### Step 4: Add Environment Variable
1. Click **"Environment Variables"**
2. Add variable:
   - **Name:** `OPENAI_API_KEY`
   - **Value:** `sk-proj-...` (your OpenAI API key)
   - Check: ✅ Production, ✅ Preview, ✅ Development

### Step 5: Deploy!
Click **"Deploy"**

Wait ~30 seconds... Done! 🎉

### Step 6: Copy Your API URL
After deployment, you'll see your URL:
```
https://polaris-extension-xxx.vercel.app
```

### Step 7: Update Extension
Open `src/extension.ts` and change line ~1042:

```typescript
// Replace this:
const urlString = apiBase ? `${apiBase.replace(/\/$/, '')}/v1/chat/completions` : 'https://api.openai.com/v1/chat/completions';

// With this:
const urlString = apiBase ? `${apiBase.replace(/\/$/, '')}/api/chat` : 'https://YOUR-PROJECT.vercel.app/api/chat';
```

### Step 8: Rebuild & Test
```bash
# Clear any embedded keys
unset PROMPTR_MASTER_KEY
unset OPENAI_API_KEY

# Rebuild
npm run compile

# Package
npm run package
```

## Test Your API

```bash
curl -X POST https://YOUR-PROJECT.vercel.app/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-3.5-turbo-0125",
    "temperature": 0.3,
    "max_tokens": 50,
    "messages": [{"role": "user", "content": "Say hello"}]
  }'
```

## ✅ Done!

Your Promptr API is now:
- ✅ Deployed on Vercel
- ✅ OpenAI API key secured server-side
- ✅ Ready for extension to use
- ✅ Automatically deploys on git push

## Next: Publish Extension

See `PUBLISHING.md` for publishing to:
- VS Code Marketplace
- Open VSX Registry (for VSCodium, etc.)

