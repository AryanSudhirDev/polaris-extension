# Vercel Backend Setup Guide

This guide explains how to deploy the Promptr API backend to Vercel.

## Overview

The Promptr extension now uses a **secure backend proxy** on Vercel to handle OpenAI API calls. This keeps your OpenAI API key safe on the server instead of embedding it in the extension.

## Architecture

```
Extension → Vercel API → OpenAI API
            (with key)
```

## Deployment Steps

### 1. Install Vercel CLI (if not already installed)

```bash
npm install -g vercel
```

### 2. Login to Vercel

```bash
vercel login
```

### 3. Set Environment Variables

You need to add your OpenAI API key as an environment variable in Vercel:

**Option A: Via CLI**
```bash
# Navigate to project directory
cd /Users/aryansudhir/Downloads/Promptr

# Add the secret
vercel env add OPENAI_API_KEY
# When prompted, paste your OpenAI API key
# Select: Production, Preview, and Development
```

**Option B: Via Vercel Dashboard**
1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Select your project (or create it)
3. Go to **Settings** → **Environment Variables**
4. Add variable:
   - **Key:** `OPENAI_API_KEY`
   - **Value:** Your OpenAI API key (starts with `sk-proj-...`)
   - **Environments:** Production, Preview, Development

### 4. Deploy to Vercel

```bash
# Deploy to production
vercel --prod
```

This will:
- Deploy the `/api/chat.ts` endpoint
- Set up serverless functions
- Return your deployment URL (e.g., `https://promptr-api.vercel.app`)

### 5. Update Extension Configuration

After deployment, update the extension to use your new backend:

In `src/extension.ts`, change line ~395:

```typescript
// OLD:
const apiBase = getConfig().get<string>('apiBase', 'https://api.openai.com');

// NEW:
const apiBase = getConfig().get<string>('apiBase', 'https://YOUR-PROJECT.vercel.app');
```

Or users can set it via VS Code settings:

```json
{
  "promptr.apiBase": "https://YOUR-PROJECT.vercel.app"
}
```

### 6. Rebuild Extension

```bash
# Clear any embedded keys
unset PROMPTR_MASTER_KEY
unset OPENAI_API_KEY

# Rebuild
npm run compile

# Package
npm run package
```

## API Endpoints

### POST /api/chat

Proxies requests to OpenAI's chat completion API.

**Request:**
```json
{
  "model": "gpt-3.5-turbo-0125",
  "temperature": 0.3,
  "max_tokens": 950,
  "stop": ["SENTINEL"],
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ]
}
```

**Response:**
```json
{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "..."
      }
    }
  ]
}
```

## Security

✅ **Benefits of this architecture:**
- API key never exposed in extension code
- API key stored securely in Vercel environment
- Rate limiting can be added server-side
- Request validation on server
- CORS properly configured

## Testing

Test your API endpoint:

```bash
curl -X POST https://YOUR-PROJECT.vercel.app/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-3.5-turbo-0125",
    "temperature": 0.3,
    "max_tokens": 50,
    "messages": [
      {"role": "user", "content": "Say hello"}
    ]
  }'
```

## Vercel Project Settings

**Recommended settings:**
- **Framework Preset:** Other
- **Build Command:** (leave empty - no build needed)
- **Output Directory:** (leave empty)
- **Install Command:** `npm install`
- **Development Command:** `vercel dev`

## Troubleshooting

### "OPENAI_API_KEY not configured"
- Make sure you added the environment variable in Vercel dashboard
- Redeploy after adding the variable: `vercel --prod`

### CORS errors
- The API includes CORS headers for all origins
- Check browser console for specific error messages

### 500 errors
- Check Vercel function logs: `vercel logs`
- Verify OpenAI API key is valid

## Cost Management

Vercel Free Tier includes:
- 100GB bandwidth/month
- 100GB-Hrs serverless function execution
- Unlimited API requests

Monitor usage at [vercel.com/dashboard](https://vercel.com/dashboard)

## Local Development

Test the API locally:

```bash
# Install Vercel CLI
npm install -g vercel

# Create .env.local with your key
echo "OPENAI_API_KEY=sk-proj-..." > .env.local

# Run locally
vercel dev
```

Then test at `http://localhost:3000/api/chat`

