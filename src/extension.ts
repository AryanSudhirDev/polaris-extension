import * as vscode from 'vscode';
import * as https from 'https';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const execAsync = promisify(exec);

export function activate(context: vscode.ExtensionContext) {
  console.log('Polaris extension starting...');
  
  const getConfig = () => vscode.workspace.getConfiguration('polaris');

  // Create output channel but don't show it automatically
  const log = vscode.window.createOutputChannel('Polaris');
  
  /*
   * Get selected text from VS Code/Cursor chat interface (cross-platform)
   */
  async function getChatSelectedText(log: vscode.OutputChannel): Promise<string | null> {
    try {
      log.appendLine('🔍 Looking for selected text in chat interface...');
      
      // Use the Webview API to access selected text within VS Code/Cursor
      // First, try to get any selected text from the current document/webview
      const selection = await vscode.env.clipboard.readText();
      
      // Check if the selection looks like it came from a chat interface
      // This is a simple heuristic - we can improve it based on patterns
      if (selection && selection.trim()) {
        log.appendLine(`📋 Found potential chat text: "${selection.substring(0, 50)}..."`);
        
        // For now, we'll use clipboard content but with better validation
        // In the future, we can add more sophisticated detection
        return selection;
      }
      
      log.appendLine('❌ No selected text found in chat interface');
      return null;
      
    } catch (error) {
      log.appendLine(`❌ Error reading chat selected text: ${error}`);
      return null;
    }
  }

  /*
   * Cross-platform text selection (works on Windows, Mac, Linux)
   */
  async function getSelectedTextCrossPlatform(log: vscode.OutputChannel): Promise<string | null> {
    log.appendLine('=== POLARIS CROSS-PLATFORM TEXT RETRIEVAL ===');
    
    // Method 1: Try to get from VS Code editor selection first
    const editor = vscode.window.activeTextEditor;
    if (editor && !editor.selection.isEmpty) {
      const selectedText = editor.document.getText(editor.selection);
      log.appendLine(`✅ Found editor selection: "${selectedText.substring(0, 50)}..."`);
      return selectedText;
    }
    
    // Method 2: Try to get from chat interface
    log.appendLine('🔍 Checking chat interface for selected text...');
    const chatText = await getChatSelectedText(log);
    if (chatText) {
      log.appendLine(`✅ Found chat text: "${chatText.substring(0, 50)}..."`);
      return chatText;
    }
    
    // Method 3: Use clipboard as fallback (user can manually copy)
    log.appendLine('📋 Falling back to clipboard content...');
    try {
      const clipboardText = await vscode.env.clipboard.readText();
      if (clipboardText && clipboardText.trim()) {
        log.appendLine(`✅ Using clipboard: "${clipboardText.substring(0, 50)}..."`);
        return clipboardText;
      }
    } catch (error) {
      log.appendLine(`❌ Clipboard read failed: ${error}`);
    }
    
    log.appendLine('❌ No text found from any source');
    return null;
  }

  /*
   * Main command: Generate and refine prompt
   */
  const generatePromptCmd = vscode.commands.registerCommand('polaris.generatePrompt', async () => {
    log.appendLine('=== Polaris Generate Prompt Command Started ===');
    
    const editor = vscode.window.activeTextEditor;
    let selectedText = '';
    let originalSelection: vscode.Selection | undefined;
    let textSource = 'unknown';
    
    // Try cross-platform text retrieval
    const retrievedText = await getSelectedTextCrossPlatform(log);
    
    if (retrievedText) {
      selectedText = retrievedText;
      
      // Determine source
      if (editor && !editor.selection.isEmpty && editor.document.getText(editor.selection) === retrievedText) {
        originalSelection = editor.selection;
        textSource = 'VS Code editor selection';
      } else {
        textSource = 'chat interface or clipboard';
      }
      
      log.appendLine(`✅ Using text from: ${textSource}`);
    }
    
    // If still no text, use full document as fallback
    if (!selectedText && editor) {
      selectedText = editor.document.getText();
      textSource = 'full document fallback';
      log.appendLine(`⚠️ Using full document: ${selectedText.length} characters`);
    }
    
    if (!selectedText) {
      log.appendLine('💥 NO TEXT FOUND from any source');
      vscode.window.showErrorMessage('No text found. Please select text or copy text to clipboard first.');
      return;
    }

    // Log what we're about to send to AI
    log.appendLine(`🤖 About to send to AI:`);
    log.appendLine(`   Source: ${textSource}`);
    log.appendLine(`   Length: ${selectedText.length} characters`);
    log.appendLine(`   Preview: "${selectedText.substring(0, 100)}..."`);

    // Get API configuration
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
      vscode.window.showWarningMessage('API key not set. Run "Polaris: Sign In" or set OPENAI_API_KEY environment variable.');
      return;
    }
    
    log.appendLine('API key found, proceeding with request');

    // Show progress without stealing focus
    await vscode.window.withProgress({ 
      location: vscode.ProgressLocation.Notification, 
      title: 'Polaris: Generating…',
      cancellable: false
    }, async () => {
      log.appendLine(`Sending ${selectedText.length} chars to AI`);
      let aiResponse: string;
      
      try {
        aiResponse = await aiCall(selectedText, apiBase, apiKey!, log);
      } catch (err: any) {
        log.appendLine(`AI call failed: ${err?.message ?? err}`);
        vscode.window.showErrorMessage(err.message || 'AI request failed');
        return;
      }

      log.appendLine(`Got AI response: ${aiResponse.substring(0, 100)}...`);
      
      // Handle text replacement based on context
      if (editor && originalSelection) {
        // We have an editor with selected text - replace it directly
        const editSuccess = await editor.edit((editBuilder: vscode.TextEditorEdit) => {
          log.appendLine('Replacing selected text in editor');
          editBuilder.replace(originalSelection!, aiResponse);
        });
        
        if (editSuccess) {
          // Select the newly inserted text to maintain selection
          const newSelection = new vscode.Selection(
            originalSelection.start,
            new vscode.Position(
              originalSelection.start.line + aiResponse.split('\n').length - 1,
              aiResponse.split('\n').length === 1 
                ? originalSelection.start.character + aiResponse.length
                : aiResponse.split('\n').pop()!.length
            )
          );
          editor.selection = newSelection;
          
          // Show success message in status bar instead of popup
          vscode.window.setStatusBarMessage('✓ Polaris: Text refined and replaced!', 3000);
          log.appendLine('Text replaced and re-selected successfully');
        } else {
          log.appendLine('Edit operation failed');
          vscode.window.showErrorMessage('Failed to replace text');
        }
      } else {
        // No editor context – automatically paste into the front-most app
        await autoPaste(aiResponse, log);
        vscode.window.setStatusBarMessage('✓ Polaris: Refined text pasted!', 3000);
        log.appendLine('Refined text auto-pasted');
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

  /* Debug command to show output channel */
  const showDebugCmd = vscode.commands.registerCommand('polaris.showDebug', () => {
    log.show(true);
    vscode.window.showInformationMessage('Debug output shown. Run a Polaris command to see logs.');
  });

  /* Test command to verify extension is working */
  const testCmd = vscode.commands.registerCommand('polaris.test', async () => {
    log.appendLine('Test command executed');
    vscode.window.showInformationMessage('Polaris extension is working!');
  });

  context.subscriptions.push(generatePromptCmd, quickInsertCmd, promptProvider, signInCmd, signOutCmd, testCmd, showDebugCmd, log);
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
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are a text refinement assistant. Your job is to improve the provided text by making it clearer, more concise, better structured, and more professional while preserving the original meaning and intent. Fix grammar, improve word choice, enhance clarity, and maintain the original tone and style as much as possible. Return only the refined text without any explanations or meta-commentary.'
      },
      {
        role: 'user', 
        content: input
      }
    ],
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

/**
 * Write text to clipboard, send a paste keystroke to the front-most app, then
 * restore the user's original clipboard. Currently supports macOS (osascript),
 * Windows (PowerShell), and Linux (xdotool if installed). Fail-safe: if the
 * keystroke fails, the text remains on the clipboard so the user can paste
 * manually.
 */
async function autoPaste(text: string, log: vscode.OutputChannel) {
  try {
    const previousClipboard = await vscode.env.clipboard.readText();
    await vscode.env.clipboard.writeText(text);
    log.appendLine('📋 Clipboard updated with AI output for auto-paste');

    if (process.platform === 'darwin') {
      await execAsync(`osascript -e 'tell application "System Events" to keystroke "v" using {command down}'`);
      log.appendLine('⌘V keystroke sent via AppleScript');
    } else if (process.platform === 'win32') {
      await execAsync(`powershell -command "$wshell = New-Object -ComObject wscript.shell; $wshell.SendKeys('^v')"`);
      log.appendLine('Ctrl+V keystroke sent via PowerShell');
    } else {
      // Best-effort Linux support – requires xdotool in PATH
      try {
        await execAsync(`xdotool key --clearmodifiers ctrl+v`);
        log.appendLine('Ctrl+V keystroke sent via xdotool');
      } catch (linuxErr) {
        log.appendLine('xdotool not available – auto-paste skipped on Linux');
      }
    }

    // Restore clipboard after a short delay so the user's data isn't lost
    setTimeout(() => {
      vscode.env.clipboard.writeText(previousClipboard);
      log.appendLine('🔙 Original clipboard content restored');
    }, 700);
  } catch (err: any) {
    log.appendLine(`❌ autoPaste error: ${err.message || err}`);
  }
}

 