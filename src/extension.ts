import * as vscode from 'vscode';
import * as https from 'https';
// Dynamically load environment variables from a local .env (if present)
// Avoids adding a build-time dependency on @types/dotenv
require('dotenv').config();
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { checkUserAccess, setExtensionContext, enterAccessTokenCommand, getStoredToken } from './token-auth';


const execAsync = promisify(exec);

interface CodebaseContext {
  languages: string[];
  frameworks: string[];
  dependencies: string[];
  fileStructure: string[];
  projectType: string;
}

let cachedCodebaseContext: CodebaseContext | null = null;
let usageCheckCounter = 0;
let lastUsageAllowed: boolean | null = null;
let authStatusCache: boolean | null = null;
let lastAuthCheck = 0;

/**
 * Analyze the current workspace to understand the codebase structure and tech stack
 */
async function analyzeCodebase(log: vscode.OutputChannel): Promise<CodebaseContext> {
  const context: CodebaseContext = {
    languages: [],
    frameworks: [],
    dependencies: [],
    fileStructure: [],
    projectType: 'unknown'
  };

  try {
    log.appendLine('🔍 Analyzing codebase...');
    
    // Get all files in workspace (exclude common ignore patterns)
    const allFiles = await vscode.workspace.findFiles(
      '**/*',
      '{**/node_modules/**,**/.git/**,**/dist/**,**/build/**,**/.next/**}'
    );

    // Analyze file extensions and structure
    const extensions = new Set<string>();
    const folders = new Set<string>();
    
    for (const file of allFiles.slice(0, 100)) { // Cap at 100 files for performance
      const ext = file.path.split('.').pop()?.toLowerCase();
      if (ext) extensions.add(ext);
      
      const folder = file.path.split('/').slice(-2, -1)[0];
      if (folder) folders.add(folder);
    }

    // Detect languages
    if (extensions.has('ts') || extensions.has('tsx')) context.languages.push('TypeScript');
    if (extensions.has('js') || extensions.has('jsx')) context.languages.push('JavaScript');
    if (extensions.has('py')) context.languages.push('Python');
    if (extensions.has('java')) context.languages.push('Java');
    if (extensions.has('go')) context.languages.push('Go');
    if (extensions.has('rs')) context.languages.push('Rust');
    if (extensions.has('cpp') || extensions.has('c')) context.languages.push('C/C++');

    // Check for package.json to understand Node.js dependencies
    const packageJsonFiles = await vscode.workspace.findFiles('**/package.json', '**/node_modules/**');
    if (packageJsonFiles.length > 0) {
      try {
        const packageContent = await vscode.workspace.fs.readFile(packageJsonFiles[0]);
        const packageJson = JSON.parse(new TextDecoder().decode(packageContent));
        
        const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
        
        // Detect frameworks
        if (deps.react) context.frameworks.push('React');
        if (deps.vue) context.frameworks.push('Vue.js');
        if (deps.angular) context.frameworks.push('Angular');
        if (deps.next) context.frameworks.push('Next.js');
        if (deps.express) context.frameworks.push('Express.js');
        if (deps.fastify) context.frameworks.push('Fastify');
        if (deps['@nestjs/core']) context.frameworks.push('NestJS');
        if (deps.svelte) context.frameworks.push('Svelte');
        
        // Key dependencies
        context.dependencies = Object.keys(deps).slice(0, 10);
        
        // Project type detection
        if (deps['@types/vscode'] || deps.vscode) {
          context.projectType = 'VS Code Extension';
        } else if (packageJson.scripts?.dev || packageJson.scripts?.start) {
          if (deps.react || deps.vue || deps.angular) {
            context.projectType = 'Frontend Application';
          } else if (deps.express || deps.fastify || deps['@nestjs/core']) {
            context.projectType = 'Backend API';
          } else {
            context.projectType = 'Node.js Application';
          }
        } else if (Object.keys(deps).length > 0) {
          context.projectType = 'Node.js Project';
        }
      } catch (err) {
        log.appendLine(`⚠️ Could not parse package.json: ${err}`);
      }
    }

    // Analyze folder structure
    const commonFolders = ['src', 'components', 'pages', 'api', 'utils', 'lib', 'hooks', 'store'];
    context.fileStructure = Array.from(folders).filter(f => commonFolders.includes(f));

    log.appendLine(`✅ Codebase analysis complete:`);
    log.appendLine(`   Languages: ${context.languages.join(', ') || 'none detected'}`);
    log.appendLine(`   Frameworks: ${context.frameworks.join(', ') || 'none detected'}`);
    log.appendLine(`   Project Type: ${context.projectType}`);
    log.appendLine(`   Key Dependencies: ${context.dependencies.slice(0, 5).join(', ')}`);

    // Cache the result for 30 seconds to speed up subsequent calls
    cachedCodebaseContext = context;
    setTimeout(() => { cachedCodebaseContext = null; }, 300000); // 5 minutes

    return context;
  } catch (err: any) {
    log.appendLine(`❌ Codebase analysis failed: ${err.message}`);
    return context;
  }
}

/**
 * Get codebase context with caching for performance
 */
async function getCodebaseContext(log: vscode.OutputChannel): Promise<CodebaseContext> {
  if (cachedCodebaseContext) {
    log.appendLine('🚀 Using cached codebase analysis');
    return cachedCodebaseContext;
  }
  return await analyzeCodebase(log);
}

export function activate(context: vscode.ExtensionContext) {
  // Set the extension context for auth module
  setExtensionContext(context);
  // Expose context globally for lightweight utilities (e.g., one-time rating prompt)
  (global as any).promptrExtensionContext = context;
  
  const EXT_NAMESPACE = 'promptr';
  
  const getConfig = () => vscode.workspace.getConfiguration(EXT_NAMESPACE);

  // Create output channel but don't show it automatically
  const log = vscode.window.createOutputChannel('Promptr');
  

  
  /*
   * Get selected text from VS Code/Cursor chat interface (cross-platform)
   */
  async function getChatSelectedText(log: vscode.OutputChannel): Promise<string | null> {
    // First, try to automatically copy whatever text is selected in the focused UI
    await autoCopy(log);
    // Give the OS clipboard a moment to update (especially on Windows PowerShell)
    await new Promise((r)=>setTimeout(r,150));

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

  /**
   * Tries to trigger the system copy shortcut (Cmd+C / Ctrl+C) so that
   * webviews or external UI elements place their current selection on
   * the clipboard. Mirrors the strategy used by autoPaste.
   */
  async function autoCopy(log: vscode.OutputChannel): Promise<void> {
    try {
      // If we have an active editor selection, just invoke VS Code's built-in copy – avoids any OS pop-ups.
      const editor = vscode.window.activeTextEditor;
      if (editor && !editor.selection.isEmpty) {
        await vscode.commands.executeCommand('editor.action.clipboardCopyAction');
        log.appendLine('✅ Copied selection via VS Code command');
        return;
      }

      // Snapshot clipboard before attempting copy so we can verify it updates
      const beforeClip = await vscode.env.clipboard.readText();

      let copyKeystrokeSent = false;
      let copySuccessful = false;

      if (process.platform === 'win32') {
        try {
          await execAsync(`powershell -command \"$wshell = New-Object -ComObject wscript.shell; $wshell.SendKeys('^c')\"`);
          log.appendLine('Ctrl+C sent via PowerShell');
          copyKeystrokeSent = true;
        } catch { /* ignore */ }
      } else if (process.platform === 'linux') {
        try {
          await execAsync(`xdotool key --clearmodifiers ctrl+c`);
          log.appendLine('Ctrl+C sent via xdotool');
          copyKeystrokeSent = true;
        } catch { /* ignore */ }
      } else if (process.platform === 'darwin') {
        // macOS: use AppleScript via osascript to simulate ⌘C for non-editor selections
        try {
          await execAsync(`osascript -e 'tell application "System Events" to keystroke "c" using {command down}'`);
          log.appendLine('⌘C keystroke sent via osascript');
          copyKeystrokeSent = true;
        } catch { /* ignore */ }
      } else {
        log.appendLine('⚠️ autoCopy: Unsupported platform for non-editor selection');
      }

      // If a keystroke was sent, poll clipboard for ~50 ms (5×10 ms) to confirm update
      if (copyKeystrokeSent) {
        for (let i = 0; i < 5; i++) {
          await new Promise(r => setTimeout(r, 10));
          const nowClip = await vscode.env.clipboard.readText();
          if (nowClip && nowClip !== beforeClip) {
            copySuccessful = true;
            break;
          }
        }
      }

      if (!copySuccessful) {
        log.appendLine('⚠️ autoCopy failed (clipboard unchanged) – relying on existing clipboard content');
      } else {
        log.appendLine('✅ autoCopy succeeded (clipboard updated)');
      }
    } catch (err: any) {
      log.appendLine(`❌ autoCopy error: ${err.message || err}`);
    }
  }

  /*
   * Cross-platform text selection (works on Windows, Mac, Linux)
   */
  async function getSelectedTextCrossPlatform(log: vscode.OutputChannel): Promise<string | null> {
    log.appendLine('=== PROMPTR CROSS-PLATFORM TEXT RETRIEVAL ===');
    
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
  const generatePromptCmd = vscode.commands.registerCommand('promptr.generatePrompt', async () => {
    log.appendLine('=== Promptr Generate Prompt Command Started ===');
    
    // Check authentication first (with caching)
    const now = Date.now();
    if (authStatusCache === null || now - lastAuthCheck > 300000) { // 5 minute cache
      authStatusCache = await checkUserAccess();
      lastAuthCheck = now;
    }
    
    if (!authStatusCache) {
      log.appendLine('❌ Authentication failed - user was notified');
      return; // User was already notified of the issue
    }
    
    log.appendLine('✅ Authentication successful - proceeding with prompt generation');
    
    // Get the validated token for usage checking
    const token = await getStoredToken();
    if (!token) {
      log.appendLine('❌ No access token found after authentication');
      vscode.window.showErrorMessage('Please enter your Promptr access token to continue.');
      return;
    }
    
    // Optimized usage check: only check every 10 requests
    if (usageCheckCounter % 10 === 0 || lastUsageAllowed === null) {
      lastUsageAllowed = await checkUsageLimit(token, log);
    }
    usageCheckCounter++;
    if (!lastUsageAllowed) {
      log.appendLine('❌ Usage limit reached - request blocked');
      return;
    }
    
    log.appendLine('✅ Usage check passed - proceeding with AI request');
    
    // Refresh status bar asynchronously (don't block main flow)
    refreshStatusBar().catch(() => {
      // Silently fail if status can't be loaded
    });
    
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
      log.appendLine('💥 NO TEXT FOUND');
      vscode.window.showErrorMessage('Please select some text to refine first.');
      return;
    }

    // Quick override-phrase heuristic – silently block if suspicious
    if (containsOverridePhrases(selectedText)) {
      log.appendLine('🚫 Suspicious prompt blocked (override phrases detected)');
      // No UI prompt shown to the user – simply abort the command
      return;
    }

    // Log what we're about to send to AI
    log.appendLine(`🤖 About to send to AI:`);
    log.appendLine(`   Source: ${textSource}`);
    log.appendLine(`   Length: ${selectedText.length} characters`);
    log.appendLine(`   Preview: "${selectedText.substring(0, 100)}..."`);



    // Get API configuration - now using Vercel backend proxy
    const apiBase = getConfig().get<string>('apiBase', 'https://promptr-api.vercel.app');
    log.appendLine(`API base: ${apiBase}`);

    // Show progress without stealing focus
    await vscode.window.withProgress({ 
      location: vscode.ProgressLocation.Notification, 
      title: 'Promptr: Generating…',
      cancellable: false
    }, async () => {
      log.appendLine(`Sending ${selectedText.length} chars to AI`);
      let aiResponse: string;
      
      try {
        const { response, sentinel } = await aiCall(selectedText, apiBase, '', log);
        aiResponse = response;

        // --- Leak check: abort if model echoed hidden system prompt ---
        const leaked = aiResponse.includes(sentinel) || /### CORE OBJECTIVE ###|### USER-PROVIDED CONTEXT ###/i.test(aiResponse);
        if (leaked) {
          log.appendLine('🚫 AI response contained internal prompt markers – blocked.');
          vscode.window.showWarningMessage('AI response was blocked for security reasons.');
          return; // stop before any clipboard or editor changes
        }
      } catch (err: any) {
        log.appendLine(`AI call failed: ${err?.message ?? err}`);
        vscode.window.showErrorMessage('AI request failed. Please try again.');
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
          // Also copy to clipboard so user can reuse elsewhere
          await vscode.env.clipboard.writeText(aiResponse);
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
          vscode.window.showInformationMessage('Promptr: Refined text ready (copied to clipboard)!', { modal: false });
          await maybePromptForRating();
          log.appendLine('Text replaced, re-selected, and copied to clipboard');
        } else {
          log.appendLine('Edit operation failed');
          vscode.window.showErrorMessage('Failed to replace text. Please try again.');
        }
      } else {
        // No editor context – automatically paste into the front-most app
        await autoPaste(aiResponse, log);
        vscode.window.showInformationMessage('Promptr: Refined text ready (copied to clipboard)!', { modal: false });
        await maybePromptForRating();
        log.appendLine('Refined text auto-pasted and copied to clipboard');
      }
    });
  });

  /* ----------------- Status Bar Item ----------------- */
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);
  statusBarItem.command = 'promptr.showMenu';

  async function refreshStatusBar() {
    const temp = getConfig().get<number>('temperature', 0.3);
    const token = await getStoredToken();
    
    if (!token) {
      statusBarItem.text = `Promptr 🔥 ${temp.toFixed(1)}`;
      statusBarItem.tooltip = 'Click to enter access token';
      statusBarItem.command = 'promptr.enterAccessToken';
      statusBarItem.show();
      return;
    }

    // Check for premium bypass token first (exact match required)
    if (VALID_PREMIUM_TOKENS.has(token)) {
      statusBarItem.text = `Promptr 💎 ${temp.toFixed(1)}`;
      statusBarItem.tooltip = 'Promptr options - Premium bypass - unlimited requests';
      statusBarItem.command = 'promptr.showMenu';
      statusBarItem.show();
      return;
    }

    try {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
      
      if (!supabaseUrl || !supabaseAnonKey) {
        statusBarItem.text = `Promptr 🔥 ${temp.toFixed(1)}`;
        statusBarItem.tooltip = 'Promptr options';
        statusBarItem.command = 'promptr.showMenu';
        statusBarItem.show();
        return;
      }

      const postData = JSON.stringify({ token });
      const options = {
        hostname: new URL(supabaseUrl).hostname,
        port: 443,
        path: '/functions/v1/check-usage-limit',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const response = await new Promise<UsageCheckResponse>((resolve, reject) => {
        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            if (res.statusCode === 200) {
              try {
                resolve(JSON.parse(data));
              } catch {
                reject(new Error('Invalid response'));
              }
            } else {
              reject(new Error(`HTTP ${res.statusCode}`));
            }
          });
        });
        req.on('error', reject);
        req.setTimeout(10000); // Match the timeout of checkUsageLimit
        req.write(postData);
        req.end();
      });

      if (response.plan === 'pro') {
        statusBarItem.text = `Promptr �� ${temp.toFixed(1)}`;
        statusBarItem.tooltip = 'Promptr options - Pro plan - unlimited requests';
      } else {
        statusBarItem.text = `Promptr 🔥 ${temp.toFixed(1)}`;
        statusBarItem.tooltip = `Promptr options - Free plan`;
      }
      statusBarItem.command = 'promptr.showMenu';
      statusBarItem.show();
    } catch (err) {
      statusBarItem.text = `Promptr 🔥 ${temp.toFixed(1)}`;
      statusBarItem.tooltip = 'Promptr options';
      statusBarItem.command = 'promptr.showMenu';
      statusBarItem.show();
    }
  }

  // Refresh status bar on startup
  refreshStatusBar().catch(() => {
    // Silently fail if status can't be loaded on startup
  });

  /* -------------- Command: Promptr Menu --------------- */
  const showMenuCmd = vscode.commands.registerCommand('promptr.showMenu', async () => {
    const pick = await vscode.window.showQuickPick([
      { label: '$(flame) Set Temperature', action: 'temperature' },
      { label: '$(pencil) Edit Custom Context', action: 'context' },
      { label: '$(key) Enter Access Token', action: 'token' },
      { label: '$(refresh) Refresh Status', action: 'refresh' }
    ], { placeHolder: 'Promptr Options' });

    if (!pick) { return; }
    if (pick.action === 'temperature') {
      vscode.commands.executeCommand('promptr.setTemperature');
    } else if (pick.action === 'context') {
      vscode.commands.executeCommand('promptr.setCustomContext');
    } else if (pick.action === 'token') {
      vscode.commands.executeCommand('promptr.enterAccessToken');
    } else if (pick.action === 'refresh') {
      await refreshStatusBar();
      vscode.window.showInformationMessage('Status refreshed');
    }
  });

  /* ------------ Command: Set Custom Context ----------- */
  const setCustomContextCmd = vscode.commands.registerCommand('promptr.setCustomContext', async () => {
    const current = getConfig().get<string>('customContext', '');
    const input = await vscode.window.showInputBox({
      value: current,
      prompt: 'Enter additional project context to include in AI prompts (leave blank to clear)',
      placeHolder: 'e.g., Im building an iOS app with SwiftUI and it is a health and fitness app',
      ignoreFocusOut: true
    });

    if (input === undefined) {
      return; // user cancelled
    }

    await getConfig().update('customContext', input.trim(), vscode.ConfigurationTarget.Workspace);
    vscode.window.showInformationMessage('Promptr: Custom context updated');
  });

  // Register the enterAccessToken command
  const enterTokenCmd = vscode.commands.registerCommand('promptr.enterAccessToken', async () => {
    await enterAccessTokenCommand();
  });

  // Register the refresh status command
  const refreshStatusCmd = vscode.commands.registerCommand('promptr.refreshStatus', async () => {
    await refreshStatusBar();
  });

  context.subscriptions.push(statusBarItem, showMenuCmd, setCustomContextCmd, enterTokenCmd, refreshStatusCmd);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('promptr.temperature')) {
        refreshStatusBar();
      }
    })
  );

  // Optional: Auto-validate on startup if configured
  const config = vscode.workspace.getConfiguration('promptr');
  if (config.get('autoValidate', true)) {
    // Silently check access on startup (don't show errors)
    checkUserAccess().then(() => {
      // If access check succeeds, refresh status bar
      refreshStatusBar().catch(() => {
        // Silently fail if status can't be loaded
      });
    }).catch(() => {
      // Silently fail - user will be prompted when they use commands
    });
  }

  /* ---------------- Command: Set Temperature --------------- */
  const setTemperatureCmd = vscode.commands.registerCommand('promptr.setTemperature', async () => {
    const current = getConfig().get<number>('temperature', 0.3);
    const values = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1].map((v) => ({
      label: v.toString(),
      description: v === current ? 'Current' : undefined
    }));

    const pick = await vscode.window.showQuickPick(values, {
      placeHolder: 'Select temperature (0 = more focused, 1 = more creative/varied)'
    });
    if (!pick) {
      return;
    }

    await getConfig().update('temperature', parseFloat(pick.label), vscode.ConfigurationTarget.Global);
    refreshStatusBar();
  });

  // Retrieve selected text: tries editor first, otherwise auto-copies and falls back to clipboard
  async function getSelectedText(log: vscode.OutputChannel): Promise<string> {
    const editor = vscode.window.activeTextEditor;
    if (editor && !editor.selection.isEmpty) {
      const txt = editor.document.getText(editor.selection);
      if (txt.trim()) {
        log.appendLine(`✅ Editor selection: "${txt.substring(0,50)}..."`);
        return txt;
      }
    }

    await autoCopy(log);
    await new Promise(r=>setTimeout(r,150));
    const clip = await vscode.env.clipboard.readText();
    if (clip.trim()) {
      log.appendLine(`✅ Clipboard fallback: "${clip.substring(0,50)}..."`);
      return clip;
    }
    return '';
  }



  /* -------------- First-run Welcome Tip -------------- */
  const WELCOME_KEY = 'promptrWelcomeShown';
  if (!context.globalState.get<boolean>(WELCOME_KEY)) {
    vscode.window.showInformationMessage(
      '🎉 Welcome to Promptr! Get started by entering your access token.',
      'Enter Access Token 🔑',
      'Get Token from usepromptr.com',
      'Skip for Now'
    ).then(selection => {
      if (selection?.startsWith('Enter Access Token')) {
        vscode.commands.executeCommand('promptr.enterAccessToken');
      } else if (selection?.startsWith('Get Token')) {
        vscode.env.openExternal(vscode.Uri.parse('https://usepromptr.com/account'));
      }
    });
    context.globalState.update(WELCOME_KEY, true);
  }

  context.subscriptions.push(generatePromptCmd, log);
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
    this.contextValue = 'promptrPrompt';
    this.description = prompt.tags?.join(', ');
  }

  insert() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    editor.insertSnippet(new vscode.SnippetString(this.prompt.body));
  }

  edit() {
    vscode.commands.executeCommand('promptr.openPromptEditor', this.prompt);
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

// Invisible sentinel used to detect and prevent system-prompt leakage.
// Generate a fresh, unpredictable sentinel each request so the model
// can’t reliably reference it. The sentinel is a zero-width char pair
// followed by a random tag. Example: "\u2063\u2063PROMPTR_K4P9X".
function generateSentinel(): string {
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `\u2063\u2063PROMPTR_${rand}`;
}

// 🔒 NOTE: Do NOT export generateSentinel – keep it private to this module.

interface AIResult {
  response: string;
  sentinel: string;
}

interface UsageCheckResponse {
  allowed: boolean;
  plan: string;
  current_usage?: number;
  limit?: number;
  message: string;
}

/**
 * Check usage limits before making AI requests
 */
// Valid premium tokens (must match token-auth.ts)
const VALID_PREMIUM_TOKENS = new Set([
  'PROMPTR_PREMIUM_WPKmg1NPiyPL6ijE9nVBJ1xHb23mafnatop8hKAgxF4',
  'PROMPTR_PREMIUM_m9PsptMLoWK4Ls_VmLHzJ4Wc8A0M8TXOySPEdqdc_KE',
  'PROMPTR_PREMIUM_AL7yc1mI6cEkxmRMVchlT--_5d__6OHs2KDV1Sf92Yg',
  'PROMPTR_PREMIUM_VhcWcX0HAIZFohVJPZa7tJ6CBd78sX8gOqIOFPy4r0o',
  'PROMPTR_PREMIUM_vTM5gjEmgMX0Y0s3mRpCr-kvKws6JClLW1bhKbK6EU8',
  'PROMPTR_PREMIUM_NmNgSrUin-1pn0E39Tzgq9M13NSygJutkhtN7meiucE',
  'PROMPTR_PREMIUM_eFuGY9Z0wfZ37We6rCjswJ8gX3tEEyo2ws4AVUBUjjE',
  'PROMPTR_PREMIUM_GD0KgGXToXziENHtSejhmowb3zG1mOl2IXJcCtllfFI',
  'PROMPTR_PREMIUM_U_1oODvVdhhtkyUXeFj4X7CUtbDLpfnfZk7EvMWfJiI',
  'PROMPTR_PREMIUM_fw8gF5vB1rlqm4JY8l18wHQn-XbIAFGOa0ieM-_9W24',
  'PROMPTR_PREMIUM_Xf-FcQ3dqb7BXBT0bogR8M_oGfgBGZ7VyqPtObh_Ncg',
  'PROMPTR_PREMIUM_fqYZR8t19AWs6FaD8Sttf0yfiUCRjqka2vDTOEgbAtY',
  'PROMPTR_PREMIUM_1flPAp5-qgqrD709lpwkWnZVdSI_Udn5lQUHvvCqdGg',
  'PROMPTR_PREMIUM_Q1Ww6sYqEo56CehclfEgH2LWNQ4lCLgMifiAS04p9ms',
  'PROMPTR_PREMIUM_T6UW7anMYvmwyAMk8uAaqyUIEvz2MMIsc4q-AQdbo00',
  'PROMPTR_PREMIUM_22DOjgcaMrcsNA7o0L3II8L7KQlMqi3Cx6As7QSliT8',
  'PROMPTR_PREMIUM_8H9oOPSgdIQZLrXsxbaUVp40BAOORGEs6KUrprsGHOc',
  'PROMPTR_PREMIUM_3NkUD85OWxuK_zuzj0kTNrsPgTESgM_-GTOAIS4_iD8',
  'PROMPTR_PREMIUM_gn4gKEtwqzqfULZEH3vGgdYoHg-7mBj3-sMSoNxFFHM',
  'PROMPTR_PREMIUM_puPeS0Gr9pXTxjAjpvJE8lpCBAnkYkwF0akXZQnKPro',
  'PROMPTR_PREMIUM_6j33fde7JF6k-tZG_z4j1VN2wKXiIip4WSuWs6sNCV4',
  'PROMPTR_PREMIUM__6w-wsvPjHwtL7ECfRPsA6iq8wM-PXuznwlDonzD_DE',
  'PROMPTR_PREMIUM_67vOOO1hTIWEFzJVP2RBYHfrAODU4UEyjjda0b_ccZo',
  'PROMPTR_PREMIUM_IeeFxfdTQMD7YOnT-tL6L-osjwghwLvkzi1w60QUygc',
  'PROMPTR_PREMIUM_YNf8rN1NsQ7xE4WwI5iViLrpAzOqBRquUR8Uqk4wXGM',
  'PROMPTR_PREMIUM_pek4BsQ1pcs-ezXBre0gKv7OWJqjiHxch9-yO7qW1fk',
  'PROMPTR_PREMIUM_2ixU_x8dCuPuYS3xNwvk1U5rKRZkgu3oVL7A_WWT33o',
  'PROMPTR_PREMIUM_e6t0L4u3pos31UoCuCxgMqBIqTYTp_suThB1-PkPyKc',
  'PROMPTR_PREMIUM_Pvvt4gPZP6-56Z5v13XXhre9GkYaodW5-gxCRlsbeqI',
  'PROMPTR_PREMIUM_yMCKfUKPvFLoLXbjhsf3PZOjKm92BojDltacikXGEHc',
  'PROMPTR_PREMIUM_LkQ7eX9G2zS4pV8mT1aC6nR3yW0dH5uJ7bK2fM8oPiQ',
  'PROMPTR_PREMIUM_R9nV2pL7kT1cX6sY3mB8dF0aH5gJ2wQ4zU8iO1rNcE',
  'PROMPTR_PREMIUM_qW8zX3cV6bN1mT4pR7yL2kJ9hG0aF5dS8uO3iP1vMe',
  'PROMPTR_PREMIUM_Ab7Y2kQ9pL4nV1tX6cR3mF8dH0aG5jS2uW8iO1zPe',
  'PROMPTR_PREMIUM_Nx6C1vB7kL2mT9pR4yJ8aH0fG5dS3uW8iO1zQeV2n',
  'PROMPTR_PREMIUM_Ty9P2nL7kC1xV6sR3mB8fD0aH5gJ2wQ4zU8iO1rNe',
  'PROMPTR_PREMIUM_Gh5J2wQ4zU8iO1rN9vB2kL7mT1cX6sY3pF8dA0eHg',
  'PROMPTR_PREMIUM_Vm8T1aC6nR3yW0dH5uJ7bK2fM8oPqL4xZ9sE2iY7r',
  'PROMPTR_PREMIUM_Kb2fM8oPiQ7lW3xZ9sE2iY7rV6tN1cX4pR8yJ0dHg',
  'PROMPTR_PREMIUM_wQ4zU8iO1rNe9vB2kL7mT1cX6sY3pF8dA0eHg5J2',
  'PROMPTR_PREMIUM_2ixV7sY3mB8dF0aH5gJ2wQ4zU8iO1rN9vB2kL7mT',
  'PROMPTR_PREMIUM_M3tY9eF0aH6gK4WjS2uD8iC0lBp7qV1xN5zR8yL2',
  'PROMPTR_PREMIUM_P6xQdX2LwGZyK4UjW1rC8N0a5Q9vB2kL7mT1cX6s',
  'PROMPTR_PREMIUM_J0aH5gK4WjS2uD8iC0lBp7qV1xN5zR8yL2mT9pF3d',
  'PROMPTR_PREMIUM_Z9sE2iY7rV6tN1cX4pR8yJ0dHg5J2wQ4zU8iO1rN',
  'PROMPTR_PREMIUM_C6nR3yW0dH5uJ7bK2fM8oPiQ7lW3xZ9sE2iY7rV6',
  'PROMPTR_PREMIUM_oPqL4xZ9sE2iY7rV6tN1cX4pR8yJ0dHg5J2wQ4zU',
  'PROMPTR_PREMIUM_yW0dH5uJ7bK2fM8oPiQ7lW3xZ9sE2iY7rV6tN1cX',
  'PROMPTR_PREMIUM_bK2fM8oPiQ7lW3xZ9sE2iY7rV6tN1cX4pR8yJ0dH',
  'PROMPTR_PREMIUM_iC0lBp7qV1xN5zR8yL2mT9pF3dG6hJ4kW8sY2vU0',
  'PROMPTR_PREMIUM_S2uD8iC0lBp7qV1xN5zR8yL2mT9pF3dG6hJ4kW8s',
  'PROMPTR_PREMIUM_Q4zU8iO1rN9vB2kL7mT1cX6sY3pF8dA0eHg5J2w',
  'PROMPTR_PREMIUM_L2mT9pF3dG6hJ4kW8sY2vU0aC5nR7yT1xP9qV3b',
  'PROMPTR_PREMIUM_U1rN9vB2kL7mT1cX6sY3pF8dA0eHg5J2wQ4zU8i',
  'PROMPTR_PREMIUM_X6sY3pF8dA0eHg5J2wQ4zU8iO1rN9vB2kL7mT1c',
  'PROMPTR_PREMIUM_D0eHg5J2wQ4zU8iO1rN9vB2kL7mT1cX6sY3pF8dA',
  'PROMPTR_PREMIUM_R8yL2mT9pF3dG6hJ4kW8sY2vU0aC5nR7yT1xP9qV',
  'PROMPTR_PREMIUM_T1cX6sY3pF8dA0eHg5J2wQ4zU8iO1rN9vB2kL7mT',
  'PROMPTR_PREMIUM_V6tN1cX4pR8yJ0dHg5J2wQ4zU8iO1rN9vB2kL7mT',
  'PROMPTR_PREMIUM_H5uJ7bK2fM8oPiQ7lW3xZ9sE2iY7rV6tN1cX4pR8',
  'PROMPTR_PREMIUM_A9kF3wN7pL2mX6sT0vB4hJ8eR1yQ5dG9iC3nZ7oU2',
  'PROMPTR_PREMIUM_P2xL7nQ3kV6bM9sE1yR4jH8fT0dW5aG2iN7oC4uP8',
  'PROMPTR_PREMIUM_K4jH8bN2mT5xW1sP9vL3fR7yC6eQ0dG4iA8oU2nZ5',
  'PROMPTR_PREMIUM_E7nR3mW6tL9bP2xK5sJ1vH4fY8dQ0oG3iC7aU4nZ2',
  'PROMPTR_PREMIUM_T1vM8xL4nP7bR2sW5jK9eH3fY6dC0oA2iG8uN4qZ7',
  'PROMPTR_PREMIUM_W9sJ2mL7bX4pN1vT5kR8fH3eY6dQ0oC2iA7uG4nZ5',
  'PROMPTR_PREMIUM_N3kP7mW2bT9xL5sR1vJ6fH4eY8dQ0oC3iG7aU2nZ4',
  'PROMPTR_PREMIUM_R6mT2nW8bX5pL1sJ9vK4fH7eY3dQ0oC2iA6uG4nZ8',
  'PROMPTR_PREMIUM_L5xJ9bW3mT7pN2sK6vR1fH4eY8dQ0oC5iG3aU7nZ2',
  'PROMPTR_PREMIUM_M8pR4nW2bX6mL9sT3vJ7fH1eY5dQ0oC4iG8aU2nZ6',
  'PROMPTR_PREMIUM_J2nT7mW5bX9pL4sR8vK1fH6eY3dQ0oC2iG4aU7nZ5',
  'PROMPTR_PREMIUM_Q5mX8nW2bT4pL7sJ1vR9fH3eY6dQ0oC5iG2aU4nZ8',
  'PROMPTR_PREMIUM_H7pL3mW9bX2nT6sK4vR8fJ1eY5dQ0oC7iG3aU2nZ6',
  'PROMPTR_PREMIUM_B4nW8mT2bX7pL5sR1vJ9fH6eY3dQ0oC4iG8aU5nZ2',
  'PROMPTR_PREMIUM_D9mL6nW3bT5xP2sR8vK4fH7eY1dQ0oC9iG6aU3nZ5',
  'PROMPTR_PREMIUM_F2pK7mW4bX9nT3sL6vR1fH8eY5dQ0oC2iG7aU4nZ6',
  'PROMPTR_PREMIUM_G8nR5mW2bT6pL4sX9vJ3fH1eY7dQ0oC8iG5aU2nZ4',
  'PROMPTR_PREMIUM_V3mT9nW7bX2pL5sK8vR4fH6eY1dQ0oC3iG9aU7nZ2',
  'PROMPTR_PREMIUM_S6pX4mW8bT3nL7sR2vJ5fH9eY1dQ0oC6iG4aU8nZ3',
  'PROMPTR_PREMIUM_Y1nL9mW5bX8pT4sK7vR2fH3eY6dQ0oC1iG9aU5nZ8',
  'PROMPTR_PREMIUM_Z8mK3nW6bT2pL9sX5vR7fH4eY1dQ0oC8iG3aU6nZ2',
  'PROMPTR_PREMIUM_I5pT8mW4bX7nL2sR9vK6fH3eY1dQ0oC5iG8aU4nZ7',
  'PROMPTR_PREMIUM_O7nX2mW9bT5pL8sK3vR6fH4eY1dQ0oC7iG2aU9nZ5',
  'PROMPTR_PREMIUM_U4mR7nW3bX8pT2sL5vJ9fH6eY1dQ0oC4iG7aU3nZ8',
  'PROMPTR_PREMIUM_C9pL2mW6bT4nX7sR5vK8fH3eY1dQ0oC9iG2aU6nZ4',
  'PROMPTR_PREMIUM_X3nK8mW5bT9pL2sX6vR4fH7eY1dQ0oC3iG8aU5nZ9',
  'PROMPTR_PREMIUM_A6mT4nW7bX3pL9sK2vR5fH8eY1dQ0oC6iG4aU7nZ3',
  'PROMPTR_PREMIUM_E1pR9mW8bT6nL3sX7vK4fH2eY5dQ0oC1iG9aU8nZ6',
  'PROMPTR_PREMIUM_T4nX5mW2bT8pL7sR3vJ6fH9eY1dQ0oC4iG5aU2nZ8',
  // New tokens - Batch 2025-11-22
  'PROMPTR_PREMIUM_K8mP3nW6bT9xL2sR5vJ7fH4eY1dQ0oC8iG3aU6nZ9',
  'PROMPTR_PREMIUM_Q2nT7mW4bX9pL5sK8vR3fH6eY1dQ0oC2iG7aU4nZ8',
  'PROMPTR_PREMIUM_R5pL9mW3bT6nX2sK7vJ4fH8eY1dQ0oC5iG9aU3nZ6',
  'PROMPTR_PREMIUM_M7nK4mW8bX3pL6sR9vT2fH5eY1dQ0oC7iG4aU8nZ3',
  'PROMPTR_PREMIUM_N3mX6nW5bT8pL4sK9vR7fH2eY1dQ0oC3iG6aU5nZ8',
  'PROMPTR_PREMIUM_P9nR2mW7bX5pL8sT4vK6fH3eY1dQ0oC9iG2aU7nZ5',
  'PROMPTR_PREMIUM_V4mL8nW3bT7pX2sR6vJ9fH5eY1dQ0oC4iG8aU3nZ7',
  'PROMPTR_PREMIUM_W6pT3mW9bX4nL7sK2vR8fH5eY1dQ0oC6iG3aU9nZ4',
  'PROMPTR_PREMIUM_X8nJ5mW2bT4pL9sX7vR3fH6eY1dQ0oC8iG5aU2nZ9',
  'PROMPTR_PREMIUM_Y2mR9nW6bX8pL3sK5vT7fH4eY1dQ0oC2iG9aU6nZ8',
  'PROMPTR_PREMIUM_Z7pK4mW5bT9nX6sR2vL8fH3eY1dQ0oC7iG4aU5nZ9',
  'PROMPTR_PREMIUM_A3nT8mW4bX7pL5sJ9vR6fH2eY1dQ0oC3iG8aU4nZ7',
  'PROMPTR_PREMIUM_B5mP7nW9bT3xL8sK4vR2fH6eY1dQ0oC5iG7aU9nZ3',
  'PROMPTR_PREMIUM_C9pX2mW6bT5nL7sR4vK8fH3eY1dQ0oC9iG2aU6nZ5',
  'PROMPTR_PREMIUM_D4nL6mW8bX9pT3sR7vJ5fH2eY1dQ0oC4iG6aU8nZ9',
  'PROMPTR_PREMIUM_F8mK2nW5bT7pL9sX4vR6fH3eY1dQ0oC8iG2aU5nZ7',
  'PROMPTR_PREMIUM_G6pR4mW3bX8nT7sK2vL9fH5eY1dQ0oC6iG4aU3nZ8',
  'PROMPTR_PREMIUM_H2nX9mW7bT4pL6sR8vJ3fH5eY1dQ0oC2iG9aU7nZ4',
  'PROMPTR_PREMIUM_I7mT3nW4bX6pL9sK5vR8fH2eY1dQ0oC7iG3aU4nZ6',
  'PROMPTR_PREMIUM_J9pL5mW2bT8nX4sR7vK3fH6eY1dQ0oC9iG5aU2nZ8',
  'PROMPTR_PREMIUM_L3nK8mW6bX2pT9sL5vR7fH4eY1dQ0oC3iG8aU6nZ2',
  'PROMPTR_PREMIUM_O5mR7nW4bT9pX3sK8vL6fH2eY1dQ0oC5iG7aU4nZ9',
  'PROMPTR_PREMIUM_S8pT2mW9bX5nL4sR7vK6fH3eY1dQ0oC8iG2aU9nZ5',
  'PROMPTR_PREMIUM_U6nP4mW3bT7pL8sX2vR9fH5eY1dQ0oC6iG4aU3nZ7',
  'PROMPTR_PREMIUM_T9mX5nW8bX3pL6sK4vR7fH2eY1dQ0oC9iG5aU8nZ3',
  'PROMPTR_PREMIUM_W2pL7mW4bT6nX9sR5vK8fH3eY1dQ0oC2iG7aU4nZ6',
  'PROMPTR_PREMIUM_X4nR8mW5bX9pT2sL6vJ7fH4eY1dQ0oC4iG8aU5nZ9',
  'PROMPTR_PREMIUM_Y7mK3nW6bT4pL8sX5vR9fH2eY1dQ0oC7iG3aU6nZ4',
  'PROMPTR_PREMIUM_Z5pJ9mW2bX7nT4sK6vR8fH3eY1dQ0oC5iG9aU2nZ7',
  'PROMPTR_PREMIUM_F3nT6mW8bX4pL9sR2vJ7fH5eY1dQ0oC3iG6aU8nZ4',
  // New tokens - Batch 2025-12-23
  'PROMPTR_PREMIUM_NK62waBKjv-TYcXgA92bj50mv49JdrgkKkyfLhZkAUQ',
  'PROMPTR_PREMIUM_lSNV-_mpoMhExSitATsIlshiNWt2-G16y3Imcj3XN2M',
  'PROMPTR_PREMIUM_gRjdqXyAT6qHBVsDaUxUL2ym0LZYMI6Ca0kj2qlaTD8',
  'PROMPTR_PREMIUM_gIIK2bqvvLcXi9pRmgxf7wPLs7RNJbmfjBn1NMaTV2M',
  'PROMPTR_PREMIUM_lBG_uyhRhYya1KKoD5QZ4A_fdUIJYm4u1zy806NTv2w',
  'PROMPTR_PREMIUM_M1DW7wyaox0KQqp3EO_KppDxEqTESqIVaincJoYUDzs',
  'PROMPTR_PREMIUM_Sg2OOQS0hbTGwitudxylQ32PhgkGYHwtlnDFaq1z_hE',
  'PROMPTR_PREMIUM_JxoPFHD6j_oYchPpqfw6calUkE6ZpuYc_ygyx1kvjQ4',
  'PROMPTR_PREMIUM_uqROieFdseABH6bi2AUIZ9voYGz3hwzj1GZMJWWWros',
  'PROMPTR_PREMIUM_HwKJvsdeBsQImul07gZqNLdgY5SJZ_TJ5R_AFQ6WC2s',
  'PROMPTR_PREMIUM_4mE70D9tkJH3nw6BGpkdRhXeoR4wF72s4r_RxvkTS8M',
  'PROMPTR_PREMIUM_lk_mkupME8NFvOLb8CPwyu59HvUb6LNhoSaegl-eEJM',
  'PROMPTR_PREMIUM_PPckf4di6WEkInASEakUC2KKNzE3zgCB9nnAHVFRtOM',
  'PROMPTR_PREMIUM_QxPzaVaAyXJIC56qlcOCV0Y1s8wpip_sQ9FVnIsYYew',
  'PROMPTR_PREMIUM_-Jk8wW6tHroVWVL5lx9L_6vTyRSYD5RGKIa8v5hvh38',
  'PROMPTR_PREMIUM_tb1InlJ-tGfIs9mEIh6pBY5fzAXyd34vnsRcOF9PS8Y',
  'PROMPTR_PREMIUM_v0GVsv5EN5muleOy4AuBjngoDm8JXVlM6MuUNZ8o6IE',
  'PROMPTR_PREMIUM_zxOaSTn1hhTdA1_7rwcFFaEmRLBRzNUcg6cwHmstOKs',
  'PROMPTR_PREMIUM_WdefrdJ5qHuNhLg63-7Q3eOKadxj5f0nz8K-iYXRvMA',
  'PROMPTR_PREMIUM_m1sRP8xQhcfIUcFszUb6miLFI0AcuVBVTEXmsACrMMI',
  'PROMPTR_PREMIUM_2-IBOqjcSSN9GDzmDL-UmAu6JfqkGScIA_5MbL4BhzA',
  'PROMPTR_PREMIUM_qmnOk1ikNTuyr8by7QXoT1O4sNxqt_j04gm6GMrFW_I',
  'PROMPTR_PREMIUM_slfEV9kPFiLxAulzCT1P2NcYJ0neZH6PzBiK_5HZI3s',
  'PROMPTR_PREMIUM_8xkW7-2ZI076twwyWXSpeamo60CqUZXmiiBvBBWJX1A',
  'PROMPTR_PREMIUM_IRQrEjD4hSuuzX4rtEjbBW4uHdTaC2lWCWKCoDCJoqM',
  'PROMPTR_PREMIUM_XjFqgJaws0pWP_AEE6osUlXHcgGvf8mPSCl4HqTsVdk',
  'PROMPTR_PREMIUM_puvmqOt9klT1stGJOQQN45jRxm4s8k8B3i8EODePuAE',
  'PROMPTR_PREMIUM_EdixgkYlXYAxVIkH7UyGsk5Gy0OC6PepxpPYIM1mC9g',
  'PROMPTR_PREMIUM_rfHt_MgtPwJyXi9aaGtH2a7_y8qu-8akXKsC2ZxX37Q',
  'PROMPTR_PREMIUM_yLzVvQJFzkFM8oWsB5TTx1q7gvJeIc-OGup9uYk9E7k'
]);

async function checkUsageLimit(token: string, log: vscode.OutputChannel): Promise<boolean> {
  // Premium bypass tokens get unlimited access (exact match required)
  if (VALID_PREMIUM_TOKENS.has(token)) {
    log.appendLine('🚀 Valid premium bypass token detected - unlimited access granted');
    return true;
  }
  
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      log.appendLine('❌ Supabase configuration missing');
      return false;
    }

    const url = `${supabaseUrl}/functions/v1/check-usage-limit`;
    const postData = JSON.stringify({ token });
    log.appendLine(`🔑 [DEBUG] Sending token to usage check: ${token}`);

    return new Promise((resolve, reject) => {
      const options = {
        hostname: new URL(supabaseUrl).hostname,
        port: 443,
        path: '/functions/v1/check-usage-limit',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      log.appendLine(`🔍 Checking usage limits for token...`);
      
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', async () => {
          log.appendLine(`Usage check response: ${res.statusCode}`);
          
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            log.appendLine(`Usage check error: ${data.substring(0, 500)}`);
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            return;
          }
          
          try {
            const response: UsageCheckResponse = JSON.parse(data);
            log.appendLine(`Usage check result: ${response.allowed ? 'ALLOWED' : 'BLOCKED'} (${response.plan} plan)`);
            
            if (!response.allowed) {
              const message = response.message || 'Free plan limit reached (50 requests/month). Upgrade to Pro for unlimited requests.';
              const action = await vscode.window.showErrorMessage(
                message,
                'Upgrade to Pro',
                'Cancel'
              );
              
              if (action === 'Upgrade to Pro') {
                vscode.env.openExternal(vscode.Uri.parse('https://usepromptr.com/pricing'));
              }
            }
            
            resolve(response.allowed);
          } catch (err) {
            log.appendLine(`Usage check JSON parse error: ${err}`);
            reject(err);
          }
        });
      });

      req.on('error', (err) => {
        log.appendLine(`Usage check request error: ${err.message}`);
        reject(err);
      });

      req.on('timeout', () => {
        log.appendLine('Usage check request timeout');
        req.destroy();
        reject(new Error('Usage check timeout'));
      });

      req.setTimeout(10000); // 10 second timeout
      req.write(postData);
      req.end();
    });
  } catch (err: any) {
    log.appendLine(`Usage check failed: ${err.message}`);
    return false;
  }
}

async function aiCall(input: string, apiBase: string | undefined, apiKey: string, log: vscode.OutputChannel): Promise<AIResult> {
  // Use Vercel backend proxy (no API key needed - it's server-side)
  const urlString = apiBase ? `${apiBase.replace(/\/$/, '')}/api/chat` : 'https://promptr-api.vercel.app/api/chat';
  const url = new URL(urlString);
  log.appendLine(`POST ${url.toString()}`);
  
  // Analyze codebase for context
  const codebaseContext = await getCodebaseContext(log);
  
  // Retrieve the user-provided custom context and place it FIRST in the system prompt so GPT processes it with maximum weight
  const userContext = vscode.workspace.getConfiguration('promptr').get<string>('customContext', '').trim();

  // --- Build system prompt with a fresh sentinel ---
  const sentinel = generateSentinel();
  let contextualPrompt = sentinel + ' ';
  if (userContext) {
    contextualPrompt += `### USER-PROVIDED CONTEXT ###\n${userContext}\n\n`;
  }

  contextualPrompt += `You are a **senior product designer**, **technical writer**, and **full-stack architect** with 10+ years of experience in enterprise software development. Your expertise lies in transforming high-level concepts into comprehensive, actionable technical specifications.`;

  // Append codebase context if available
  if (codebaseContext.projectType !== 'unknown' || codebaseContext.languages.length > 0 || codebaseContext.frameworks.length > 0 || codebaseContext.dependencies.length > 0) {
    contextualPrompt += `\n\n### CODEBASE CONTEXT ###\n**Project Type:** ${codebaseContext.projectType}\n**Languages:** ${codebaseContext.languages.join(', ') || 'Not detected'}\n**Frameworks:** ${codebaseContext.frameworks.join(', ') || 'None detected'}\n**Key Dependencies:** ${codebaseContext.dependencies.slice(0, 8).join(', ')}\n**Structure:** ${codebaseContext.fileStructure.join(', ') || 'Standard layout'}\n\n**INTEGRATION DIRECTIVE:** Leverage this technical context to ensure all recommendations align with the existing tech stack and project architecture. Prioritize solutions that integrate seamlessly with current ${codebaseContext.frameworks.length > 0 ? codebaseContext.frameworks.join('/') : 'technology stack'}.`;
  }

  contextualPrompt += `

### CORE OBJECTIVE ###
Transform brief user ideas into comprehensive, production-ready technical specifications that serve as definitive blueprints for development teams.

### REASONING METHODOLOGY ###
Apply step-by-step analysis:
1. Parse user intent and constraints
2. Identify technical requirements and dependencies
3. Structure comprehensive specification
4. Validate against best practices.

### OUTPUT STRUCTURE ###
Generate your response using **only** the following sections that are relevant to the user's request. Use clear markdown formatting with proper hierarchical headers:

#### **1. REFINED SUMMARY**
- Rewrite the original concept in professional, precise language
- Clarify scope, objectives, and success metrics
- Maximum 2-3 sentences, focus on core value proposition

#### **2. USER STORIES & USE CASES**
- Format: "As a [specific role], I want [specific goal] so that [clear benefit/outcome]"
- Prioritize by impact and feasibility
- Include edge cases and error scenarios

#### **3. FEATURE BREAKDOWN**
- Enumerate concrete, measurable features
- Organize by priority (MVP vs. future releases)
- Include technical acceptance criteria for each feature

#### **4. ARCHITECTURE & TECHNICAL RECOMMENDATIONS**
- Specify recommended tech stack with rationale
- Include integration patterns, data flow, and system boundaries
- Address scalability, security, and maintainability concerns
${codebaseContext.frameworks.length > 0 ? `- **INTEGRATION PRIORITY:** Detail how to integrate with existing ${codebaseContext.frameworks.join('/')} infrastructure` : ''}

#### **5. DEVELOPMENT ROADMAP**
- Phase-based delivery plan with clear milestones
- Resource requirements and timeline estimates
- Risk mitigation strategies for each phase

#### **6. RISK ASSESSMENT & MITIGATION**
- Technical risks (performance, security, compatibility)
- Business risks (market fit, resource constraints)
- Mitigation strategies with contingency plans

#### **7. ACCESSIBILITY & USER EXPERIENCE**
- Cross-platform compatibility considerations
- Performance optimization strategies

### CONSTRAINTS & QUALITY STANDARDS ###
- **Specificity:** Provide concrete, implementable details
- **Clarity:** Use precise technical language without jargon
- **Completeness:** Address all aspects of the request
- **Actionability:** Every recommendation must be executable
- **No Commentary:** Exclude meta-explanations or process descriptions

### EXAMPLES FOR GUIDANCE ###
"""
Input: "Build a task management app"
Output: Comprehensive spec covering user authentication, task CRUD operations, real-time collaboration, notification systems, etc.

Input: "Create a data visualization dashboard"
Output: Detailed spec including data sources, chart types, filtering capabilities, export functions, responsive design, etc.
"""

**EXECUTE IMMEDIATELY:** Process the user's input and generate the structured specification following the exact format above. Begin with the most relevant section based on the input complexity.`;
  
  const postData = JSON.stringify({
    model: 'gpt-3.5-turbo-0125',
    temperature: vscode.workspace.getConfiguration('promptr').get<number>('temperature', 0.3),
    max_tokens: 950,
    stop: [sentinel],
    messages: [
      { role: 'system', content: contextualPrompt },
      { role: 'user', content: input }
    ]
  });

  // Debug: show first 200 chars of payload (avoid logging full user text)
  log.appendLine(`🚚 Payload preview: ${postData.substring(0, 200)}...`);
  log.appendLine(`🎯 Context-aware prompt enabled: ${codebaseContext.projectType !== 'unknown' || codebaseContext.languages.length > 0 || codebaseContext.frameworks.length > 0 ? 'YES' : 'NO'}`);

  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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
          resolve({ response: content.trim(), sentinel });
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
async function autoPaste(text: string, log: vscode.OutputChannel): Promise<void> {
  try {
    await vscode.env.clipboard.writeText(text);
    log.appendLine('📋 Clipboard updated with AI output for auto-paste');

    let pasteSuccessful = false;
    if (process.platform === 'darwin') {
      try {
        const { stdout, stderr } = await execAsync(`osascript -e 'tell application "System Events" to keystroke "v" using {command down}'`);
        log.appendLine(`⌘V keystroke via osascript. stdout: ${stdout.trim()} stderr: ${stderr.trim()}`);
        pasteSuccessful = true;
      } catch { /* ignore paste failure */ }
    } else if (process.platform === 'win32') {
      try {
        await execAsync(`powershell -command "$wshell = New-Object -ComObject wscript.shell; $wshell.SendKeys('^v')"`);
        log.appendLine('Ctrl+V keystroke sent via PowerShell');
        pasteSuccessful = true;
      } catch { /* ignore paste failure */ }
    } else {
      try {
        await execAsync(`xdotool key --clearmodifiers ctrl+v`);
        log.appendLine('Ctrl+V keystroke sent via xdotool');
        pasteSuccessful = true;
      } catch { /* ignore paste failure */ }
    }

    if (!pasteSuccessful) {
      log.appendLine('📋 Auto-paste failed, text remains on clipboard');
    }
  } catch (err: any) {
    log.appendLine(`❌ autoPaste error: ${err.message || err}`);
    log.appendLine('📋 AI output kept in clipboard for manual paste');
  }
}

/* ---------------- Suspicious instruction detector --------------- */
function containsOverridePhrases(text: string): boolean {
  return /(ignore|override|disregard|forget previous|system prompt|jailbreak)/i.test(text);
}


/**
 * One-time rating prompt after first successful use
 */
async function maybePromptForRating(): Promise<void> {
  try {
    const key = 'promptrRatedOrPrompted';
    const ctx = (global as any).promptrExtensionContext as vscode.ExtensionContext | undefined;
    // Fallback: stash context on global when activate runs
    if (!ctx) {
      return;
    }
    const already = ctx.globalState.get<boolean>(key, false);
    if (already) return;
    const choice = await vscode.window.showInformationMessage(
      'Enjoying Promptr? Help others discover it by leaving a quick rating.',
      'Rate Promptr ⭐️',
      'Later'
    );
    ctx.globalState.update(key, true);
    if (choice?.startsWith('Rate')) {
      vscode.env.openExternal(vscode.Uri.parse('https://marketplace.visualstudio.com/items?itemName=aryansudhir.promptr&ssr=false#review-details'));
    }
  } catch {
    // no-op
  }
}


 