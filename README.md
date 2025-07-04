# Promptr – AI-Powered VS Code Extension

Transform your text with AI right inside VS Code/Cursor. Select text, hit ⌘⇧G, and get instant AI-powered refinements.

## Quick Start
1. Install extension
2. Hit ⌘⇧G with text selected
3. Watch your text transform

## Features
- One-click text transformation with AI
- Smart temperature control (0.0 = focused, 1.0 = creative)
- Seamless VS Code integration
- No API key needed - works out of the box

## Settings
* `promptr.temperature` - Adjust AI creativity (0.0-1.0)
* `promptr.apiBase` - Custom API endpoint (default: OpenAI)

## Hotkeys
* Generate AI Response: `⌘⇧G` (Mac) / `Ctrl+Shift+G` (Windows/Linux)
* Temperature: Click 🔥 in status bar

## ⌨️ Core Commands
| Command Palette label | Default hot-key |
| --- | --- |
| Promptr: Generate Prompt | `⌘⇧G` |
| Promptr: Quick Insert Prompt | – |
| Promptr: Set Temperature | – |
| Promptr: Menu (status-bar) | click `Promptr 🔥` |

## ⚙️ Settings (`File → Preferences → Settings` → search *promptr*)
* `promptr.apiBase` – Override the API endpoint (default `https://api.openai.com`).
* `promptr.temperature` – 0.0 (focused) → 1.0 (creative). Also accessible via status-bar.
* `promptr.insertMode` – `replace` / `below` (where to put AI output).
* `promptr.hotkey` – Custom hot-key for Generate Prompt.
* `promptr.customContext` – Extra project context that is always sent to the model.

## 💡 Tips
• Use the **Prompt Library** side panel to save reusable prompts.
• The extension auto-analyzes your workspace (languages, frameworks) and feeds that into the prompt – responses are aware of your tech stack.
• API key is stored with VS Code Secret Storage; you can clear it via **Promptr: Menu → Edit Custom Context → leave blank** then confirm.

---
Happy prompting! ✨ 