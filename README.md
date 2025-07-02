# Polaris VS Code / Cursor Extension

## Core Feature Shortlist (MVP)

1. **Generate-Prompt command**  
   • Command Palette entry + default hotkey **⌘⇧G**  
   • Uses current selection *(fallback: whole file)*  
   • Sends text to your AI API, inserts or replaces with the response

2. **Prompt Library side-panel**  
   • Tree view listing saved prompts  
   • Click to insert; context-menu: edit / delete  
   • Search box at top

3. **Prompt Editor webview**  
   • Rich form to create/update a prompt *(name, body, tags)*  
   • **Save** → updates side-panel list

4. **Account / Auth (Clerk)**  
   • Sign-in/out button in side-panel header  
   • After login, prompts sync from backend *(JWT stored in secrets)*  
   • Offline fallback to local storage

5. **Settings**  
   • `polaris.apiBase` *(URL)*  
   • `polaris.insertMode` *("replace" | "below")*  
   • `polaris.hotkey` *(overrides default)*

6. **Quick-Prompt picker**  
   • Command **"Polaris: Quick Insert Prompt"** opens a QuickPick list  
   • Choose prompt → insert immediately

---

These six components match (and surpass) the existing menu-bar app inside VS Code/Cursor.

---

### Getting Started

The repo is in its infancy—just a roadmap for now. Pull requests welcome once scaffolding lands. 