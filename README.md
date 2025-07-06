# Promptr – AI-Powered VS Code Extension

Transform your text with AI right inside VS Code/Cursor. Select text, hit ⌘⇧G, and get instant AI-powered refinements.

## Quick Start
1. Install extension
2. Hit ⌘⇧G with text selected
3. Watch your text transform

## Features
* AI-powered prompt refinement with a single hot-key
* Status-bar 🔥 slider to adjust model creativity (temperature)
* Custom project context injection per workspace
* Auto-copy / auto-paste so results land on your clipboard (or replace selection) instantly
* One-time welcome tip to surface options; zero-clutter UI (Prompt Library removed)
* Lightweight injection-guard to block prompts that leak internal instructions
* Works out-of-the-box – no OpenAI key required

## Settings
| Setting | Default | Description |
| --- | --- | --- |
| `promptr.temperature` | `0.3` | Controls randomness / creativity (0 → deterministic) |
| `promptr.customContext` | `""` | Extra context prepended to every prompt, per-workspace |
| `promptr.apiBase` | `https://api.openai.com` | Override backend (rarely needed) |

## Hot-keys / UI
| Action | Default |
| --- | --- |
| Generate Prompt | `⌘⇧G` / `Ctrl+Shift+G` |
| Options Menu (Temperature / Context) | click the `Promptr 🔥 x.x` status-bar item |

## ⌨️ Commands
* **Promptr: Generate Prompt** – main action (hot-key above)
* **Promptr: Set Temperature** – also accessible via status-bar menu
* **Promptr: Set Custom Context** – likewise via menu

## 💡 Tips
• The extension auto-detects your workspace language / framework and injects that context automatically.
• First time you install, you'll get a toast pointing you to the Temperature & Context options.
• Holding a large selection? Promptr replaces it in-place; otherwise it pastes below and copies to your clipboard.

---
Happy prompting! ✨ 