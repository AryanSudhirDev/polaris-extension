import * as vscode from 'vscode';
import * as https from 'https';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

export function activate(context: vscode.ExtensionContext) {
  console.log('Polaris extension activating...');
  const getConfig = () => vscode.workspace.getConfiguration('polaris');
  const log = vscode.window.createOutputChannel('Polaris');
  log.appendLine('Extension activated');
  
  // Test environment variable immediately
  const envKey = process.env.OPENAI_API_KEY || process.env.POLARIS_API_KEY;
  if (envKey) {
    log.appendLine(`Environment API key found: ${envKey.substring(0, 10)}...`);
  } else {
    log.appendLine('No environment API key found');
  }
  
  console.log('Output channel created');

  /*
   * Generate-Prompt command
   * Grabs current selection (fallback: full document), sends to AI, then
   * inserts or replaces according to `polaris.insertMode`.
   * The AI call is stubbed for now (echoes the input).
   */
  const generatePromptCmd = vscode.commands.registerCommand('polaris.generatePrompt', async () => {
    console.log('Generate prompt command triggered');
    log.appendLine('GeneratePrompt invoked');
    log.show();
    vscode.window.setStatusBarMessage('Polaris: contacting AI…', 3000);
    
    let selectedText = '';
    let useClipboard = false;
    const editor = vscode.window.activeTextEditor;
    
    // First try to get text from active editor
    if (editor) {
      const selection = editor.selection;
      selectedText = selection.isEmpty ? '' : editor.document.getText(selection);
      log.appendLine(`Got text from VS Code editor: "${selectedText.substring(0, 50)}..."`);
    }
    
          // If no text from editor, try system-wide selection (for chat boxes, etc.)
      if (!selectedText) {
        log.appendLine('No text selected in VS Code editor, trying system-wide selection...');
        try {
          selectedText = await getSystemSelectedText();
          if (selectedText) {
            useClipboard = true;
            log.appendLine(`Got text from system selection: "${selectedText.substring(0, 50)}..."`);
            vscode.window.showInformationMessage('Using selected text from system. Refined text will replace selection.');
          } else {
            log.appendLine('No system selection found - may need accessibility permissions');
            vscode.window.showWarningMessage('No text selected. For system-wide selection, VS Code needs accessibility permissions in System Preferences > Security & Privacy > Accessibility.');
          }
        } catch (error) {
          log.appendLine(`Failed to get system selection: ${error}`);
          vscode.window.showWarningMessage('Failed to access system selection. Check accessibility permissions for VS Code.');
        }
      }
    
    // If still no text, try clipboard as final fallback
    if (!selectedText) {
      log.appendLine('No system selection found, trying clipboard as fallback...');
      try {
        selectedText = await vscode.env.clipboard.readText();
        if (selectedText) {
          useClipboard = true;
          log.appendLine(`Got text from clipboard: "${selectedText.substring(0, 50)}..."`);
          vscode.window.showInformationMessage('Using clipboard text. Refined text will be copied back to clipboard.');
        }
      } catch (error) {
        log.appendLine(`Failed to read clipboard: ${error}`);
      }
    }
    
    // If still no text, fall back to full document
    if (!selectedText && editor) {
      selectedText = editor.document.getText();
      log.appendLine(`Using full document: ${selectedText.length} characters`);
    }
    
    if (!selectedText) {
      vscode.window.showErrorMessage('No text found. Please select text in VS Code or copy text to clipboard first.');
      return;
    }

    const apiBase = getConfig().get<string>('apiBase');
    log.appendLine(`API base: ${apiBase}`);
    let apiKey = await context.secrets.get('polaris.apiKey');
    
    // Fallback to environment variable if no stored key
    if (!apiKey) {
      apiKey = process.env.OPENAI_API_KEY || process.env.POLARIS_API_KEY;
      if (apiKey) {
        log.appendLine('Using API key from environment variable');
      }
    }
    
    // Temporary fallback for testing
    if (!apiKey) {
      apiKey = "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";
      log.appendLine('Using hardcoded API key for testing');
    }
    
    if (!apiKey) {
      log.appendLine('No API key found');
      console.log('No API key found');
      vscode.window.showWarningMessage('API key not set. Run "Polaris: Sign In" or set OPENAI_API_KEY environment variable.');
      return;
    }
    log.appendLine('API key found');
    console.log('API key found, proceeding with request');

    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Polaris: Generating…' }, async () => {
      log.appendLine(`Sending ${selectedText.length} chars to AI`);
      let aiResponse: string;
      try {
        aiResponse = await aiCall(selectedText, apiBase, apiKey!, log);
      } catch (err: any) {
        log.appendLine(`AI call failed: ${err?.message ?? err}`);
        vscode.window.showErrorMessage(err.message || 'AI request failed');
        log.appendLine(`Error: ${err?.message ?? err}`);
        return;
      }

      log.appendLine(`Got AI response: ${aiResponse.substring(0, 100)}...`);
      
      if (useClipboard) {
        // Try to replace the selected text directly
        const replaced = await replaceSystemSelectedText(aiResponse);
        if (replaced) {
          vscode.window.showInformationMessage('Text refined and replaced!');
          log.appendLine('Refined text replaced in system');
        } else {
          // Fallback: put refined text in clipboard
          await vscode.env.clipboard.writeText(aiResponse);
          vscode.window.showInformationMessage('Text refined and copied to clipboard! Paste it back where you need it.');
          log.appendLine('Refined text copied to clipboard');
        }
      } else if (editor) {
        // Replace text in editor
        const selection = editor.selection;
        const editSuccess = await editor.edit((editBuilder: vscode.TextEditorEdit) => {
          log.appendLine('Starting edit operation');
          const mode = getConfig().get<'replace' | 'below'>('insertMode', 'below');
          log.appendLine(`Insert mode: ${mode}`);
          if (mode === 'replace' && !selection.isEmpty) {
            log.appendLine('Replacing selection');
            editBuilder.replace(selection, aiResponse);
          } else if (mode === 'replace') {
            log.appendLine('Replacing entire document');
            const fullRange = new vscode.Range(0, 0, editor.document.lineCount, 0);
            editBuilder.replace(fullRange, aiResponse);
          } else {
            const line = selection.isEmpty ? selection.active.line : selection.end.line;
            log.appendLine(`Inserting at line ${line}`);
            const lineEnd = editor.document.lineAt(line).range.end;
            editBuilder.insert(lineEnd, `\n${aiResponse}\n`);
          }
        });
        if (editSuccess) {
          log.appendLine('Edit operation successful');
        } else {
          log.appendLine('Edit operation failed');
          vscode.window.showErrorMessage('Failed to insert AI response');
        }
      }
    });
  });

  /*
   * Quick-Prompt picker – inserts a saved prompt body immediately.
   */
  const quickInsertCmd = vscode.commands.registerCommand('polaris.quickInsertPrompt', async () => {
    const prompts: Prompt[] = context.globalState.get('prompts', []);
    if (!prompts.length) {
      vscode.window.showInformationMessage('No prompts saved yet.');
      return;
    }
    const picked = await vscode.window.showQuickPick(
      prompts.map(p => ({ label: p.name, description: p.tags?.join(', '), prompt: p })),
      { placeHolder: 'Select a prompt' }
    );
    if (!picked) return;

    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    editor.insertSnippet(new vscode.SnippetString(picked.prompt.body));
  });

  /*
   * Prompt Library tree view (read-only for now)
   */
  const promptProvider = new PromptTreeProvider(context);
  vscode.window.registerTreeDataProvider('polarisPromptLibrary', promptProvider);

  /* Sign In: prompt for API key and save to secret storage */
  const signInCmd = vscode.commands.registerCommand('polaris.account.signIn', async () => {
    const key = await vscode.window.showInputBox({
      prompt: 'Enter Polaris / OpenAI API Key',
      ignoreFocusOut: true,
      password: true,
    });
    if (key) {
      await context.secrets.store('polaris.apiKey', key);
      vscode.window.showInformationMessage('API key saved.');
    }
  });

  /* Sign Out: delete stored key */
  const signOutCmd = vscode.commands.registerCommand('polaris.account.signOut', async () => {
    await context.secrets.delete('polaris.apiKey');
    vscode.window.showInformationMessage('Signed out from Polaris API.');
  });

  /* Test command to verify extension is working */
  const testCmd = vscode.commands.registerCommand('polaris.test', async () => {
    log.appendLine('Test command executed');
    vscode.window.showInformationMessage('Polaris extension is working!');
  });

  /* Test system-wide selection command */
  const testSystemCmd = vscode.commands.registerCommand('polaris.testSystemSelection', async () => {
    log.appendLine('Testing system-wide selection...');
    log.show();
    
    try {
      const selectedText = await getSystemSelectedText();
      if (selectedText) {
        vscode.window.showInformationMessage(`System selection works! Got: "${selectedText.substring(0, 100)}..."`);
        log.appendLine(`System selection successful: "${selectedText}"`);
      } else {
        vscode.window.showWarningMessage('No system selection found. Select some text outside VS Code and try again.');
        log.appendLine('No system selection found');
      }
    } catch (error) {
      vscode.window.showErrorMessage(`System selection failed: ${error}`);
      log.appendLine(`System selection error: ${error}`);
    }
  });

  context.subscriptions.push(generatePromptCmd, quickInsertCmd, promptProvider, signInCmd, signOutCmd, testCmd, testSystemCmd, log);
  console.log('Polaris extension activation complete');
  log.appendLine('Extension setup complete');
}

export function deactivate() {/* noop */}

/* ------------------------------------------------------------------ */

interface Prompt {
  id: string;
  name: string;
  body: string;
  tags?: string[];
}

class PromptItem extends vscode.TreeItem {
  constructor(public readonly prompt: Prompt) {
    super(prompt.name, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'polarisPrompt';
    this.description = prompt.tags?.join(', ');
  }

  insert() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    editor.insertSnippet(new vscode.SnippetString(this.prompt.body));
  }

  edit() {
    vscode.commands.executeCommand('polaris.openPromptEditor', this.prompt);
  }
}

class PromptTreeProvider implements vscode.TreeDataProvider<PromptItem>, vscode.Disposable {
  private _onDidChangeTreeData = new vscode.EventEmitter<PromptItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private ctx: vscode.ExtensionContext) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: PromptItem): vscode.TreeItem {
    return element;
  }

  getChildren(): vscode.ProviderResult<PromptItem[]> {
    const prompts: Prompt[] = this.ctx.globalState.get('prompts', []);
    return prompts.map(p => new PromptItem(p));
  }

  dispose() {
    this._onDidChangeTreeData.dispose();
  }
}

async function aiCall(input: string, apiBase: string | undefined, apiKey: string, log: vscode.OutputChannel): Promise<string> {
  const urlString = apiBase ? `${apiBase.replace(/\/$/, '')}/v1/chat/completions` : 'https://api.openai.com/v1/chat/completions';
  const url = new URL(urlString);
  log.appendLine(`POST ${url.toString()}`);
  
  const postData = JSON.stringify({
    model: 'gpt-3.5-turbo',
    messages: [{ role: 'user', content: input }],
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    log.appendLine(`Making request to ${url.hostname}:${options.port}${url.pathname}`);
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        log.appendLine(`Response status: ${res.statusCode}`);
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          log.appendLine(`Error response: ${data.substring(0, 500)}`);
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          return;
        }
        try {
          const json = JSON.parse(data);
          log.appendLine('AI response received');
          const content = json.choices?.[0]?.message?.content ?? 'Error: no content';
          resolve(content.trim());
        } catch (err) {
          log.appendLine(`JSON parse error: ${err}`);
          reject(err);
        }
      });
    });

    req.on('error', (err) => {
      log.appendLine(`Request error: ${err.message}`);
      console.error('HTTPS request failed:', err);
      reject(err);
    });

    req.on('timeout', () => {
      log.appendLine('Request timeout');
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.setTimeout(30000); // 30 second timeout
    req.write(postData);
    req.end();
  });
}

async function getSystemSelectedText(): Promise<string> {
  try {
    // Method 1: Try to get selected text using accessibility API (fastest, no clipboard interference)
    const accessibilityScript = `
      tell application "System Events"
        try
          set frontApp to first application process whose frontmost is true
          set selectedText to value of attribute "AXSelectedText" of frontApp
          return selectedText
        on error
          return ""
        end try
      end tell
    `;
    
    const { stdout: accessibilityResult } = await execAsync(`osascript -e '${accessibilityScript}'`);
    if (accessibilityResult.trim()) {
      return accessibilityResult.trim();
    }
    
    // Method 2: Immediate clipboard capture while preserving focus
    const clipboardScript = `
      tell application "System Events"
        try
          -- Remember the currently focused app
          set frontApp to first application process whose frontmost is true
          set frontAppName to name of frontApp
          
          -- Save current clipboard immediately
          set originalClipboard to the clipboard
          
          -- Copy selection immediately (no delay)
          keystroke "c" using {command down}
          
          -- Get the copied text immediately
          set selectedText to the clipboard
          
          -- Restore original clipboard
          set the clipboard to originalClipboard
          
          -- Restore focus to original app
          tell application frontAppName to activate
          
          return selectedText
        on error
          return ""
        end try
      end tell
    `;
    
    const { stdout: clipboardResult } = await execAsync(`osascript -e '${clipboardScript}'`);
    return clipboardResult.trim();
    
  } catch (error) {
    console.log('Failed to get system selected text:', error);
    return '';
  }
}

async function replaceSystemSelectedText(newText: string): Promise<boolean> {
  try {
    // Create a temporary file with the new text
    const tempFile = path.join(os.tmpdir(), `polaris-${Date.now()}.txt`);
    fs.writeFileSync(tempFile, newText, 'utf8');
    
    const replaceScript = `
      tell application "System Events"
        try
          -- Remember the currently focused app
          set frontApp to first application process whose frontmost is true
          set frontAppName to name of frontApp
          
          -- Save current clipboard
          set originalClipboard to the clipboard
          
          -- Read new text from file
          set newText to read POSIX file "${tempFile}" as «class utf8»
          
          -- Set new text to clipboard
          set the clipboard to newText
          
          -- Ensure the original app is focused
          tell application frontAppName to activate
          delay 0.1
          
          -- Paste the new text (this should replace the selected text)
          keystroke "v" using {command down}
          
          -- Restore original clipboard
          set the clipboard to originalClipboard
          
          return "success"
        on error errMsg
          -- Try to restore clipboard even on error
          try
            set the clipboard to originalClipboard
          end try
          return "error: " & errMsg
        end try
      end tell
    `;
    
    const { stdout } = await execAsync(`osascript -e '${replaceScript}'`);
    
    // Clean up temp file
    try {
      fs.unlinkSync(tempFile);
    } catch (e) {
      // Ignore cleanup errors
    }
    
    return stdout.trim() === "success";
    
  } catch (error) {
    console.log('Failed to replace system selected text:', error);
    return false;
  }
} 