# Polaris VS Code / Cursor Extension

## Core Feature Shortlist (MVP)

1. **Generate-Prompt command**  
   • Command Palette entry + default hotkey **⌘⇧G**  
   • Uses current selection *(fallback: whole file)*  
   • Sends text to your AI API, inserts or replaces with the response

2. **Temperature Control**  
   • Status bar item `Polaris 🔥 0.3` shows current temperature setting  
   • Click to adjust from 0.0 (focused) to 1.0 (creative)  
   • Also accessible via Command Palette: "Polaris: Set Temperature"

3. **Prompt Library side-panel**  
   • Tree view listing saved prompts  
   • Click to insert; context-menu: edit / delete  
   • Search box at top

4. **Prompt Editor webview**  
   • Rich form to create/update a prompt *(name, body, tags)*  
   • **Save** → updates side-panel list

5. **Account / Auth (Clerk)**  
   • Sign-in/out button in side-panel header  
   • After login, prompts sync from backend *(JWT stored in secrets)*  
   • Offline fallback to local storage

6. **Settings**  
   • `polaris.apiBase` *(URL)*  
   • `polaris.insertMode` *("replace" | "below")*  
   • `polaris.hotkey` *(overrides default)*
   • `polaris.temperature` *(0.0 - 1.0, default: 0.3)*

7. **Quick-Prompt picker**  
   • Command **"Polaris: Quick Insert Prompt"** opens a QuickPick list  
   • Choose prompt → insert immediately

8. **Codebase Analysis**  
   • Automatically analyzes your workspace (languages, frameworks, dependencies)  
   • Provides contextual AI responses tailored to your tech stack  
   • Cached for 30 seconds for performance

---

These features provide a comprehensive AI-powered development workflow inside VS Code/Cursor.

---

## Roadmap / Next Feature

• **Enhanced Code-Aware Refinement** – deeper AST parsing and semantic search for even more contextual AI suggestions based on your specific codebase patterns.

This is tracked internally; contributions welcome.

### Getting Started

Install the extension and configure your OpenAI API key. The extension will automatically analyze your codebase and provide intelligent, context-aware AI assistance. 