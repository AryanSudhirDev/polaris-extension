# Promptr

AI-powered prompt refinement for VS Code and Cursor. Transform rough ideas into polished, detailed prompts.

## Getting Started

1. Install the extension
2. Get your access token from [usepromptr.com/account](https://usepromptr.com/account)
3. Select text in your editor or chat interface
4. Press `⌘⇧G` (Mac) or `Ctrl+Shift+G` (Windows/Linux)

## Features

- **Quick refinement** – Single hotkey transforms selected text into detailed prompts
- **Temperature control** – Adjust AI creativity from deterministic (0) to varied (1)
- **Project-aware** – Auto-detects your tech stack and provides relevant context
- **Custom context** – Add project-specific instructions that apply to every prompt
- **Clipboard integration** – Results automatically copied; can replace selection or paste elsewhere
- **Free & Pro plans** – Free tier: 50 requests/month; Pro: unlimited

## Usage

### Basic Usage
1. Select text anywhere in VS Code/Cursor
2. Press `⌘⇧G` / `Ctrl+Shift+G`
3. AI refines it into a detailed prompt

### Status Bar
Click the `Promptr 🔥 0.3` status bar item to:
- Adjust temperature
- Set custom context
- Enter access token
- Check usage status

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `promptr.temperature` | `0.3` | Controls output randomness (0-1) |
| `promptr.customContext` | `""` | Additional context for all prompts |

## Commands

- `Promptr: Generate Prompt` – Refine selected text
- `Promptr: Set Temperature` – Adjust creativity level
- `Promptr: Set Custom Context` – Add project context
- `Promptr: Enter Access Token` – Update authentication

## Token Batch Automation

Create a new short-token batch in `premium-tokens-expiring.json`:

```sh
npm run tokens:create
npm run tokens:create -- --count 30
npm run tokens:create -- --count 30 --expires 2026-07-05
npm run tokens:create -- --count 30 --deploy
```

The script defaults to 30 `PROMPTR_<base64url>` tokens expiring one month from today. It updates `generated_at`, `token_count`, validates the JSON and duplicate-free token totals, and prints share-ready giveaway copy. Passing `--deploy` runs `vercel --prod --yes` after validation and verifies `https://promptr-api.vercel.app/api/tokens`.

## Plans

**Free**: 50 AI requests per month  
**Pro**: Unlimited requests

Get your token at [usepromptr.com/account](https://usepromptr.com/account)

## Support

- Issues: [GitHub Issues](https://github.com/AryanSudhirDev/polaris-extension/issues)
- Questions: Visit [usepromptr.com](https://usepromptr.com)

---

MIT License