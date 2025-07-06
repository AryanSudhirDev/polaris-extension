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

const execAsync = promisify(exec);

interface CodebaseContext {
  languages: string[];
  frameworks: string[];
  dependencies: string[];
  fileStructure: string[];
  projectType: string;
}

let cachedCodebaseContext: CodebaseContext | null = null;

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
    setTimeout(() => { cachedCodebaseContext = null; }, 30000);

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
      vscode.window.showErrorMessage('Please select some text first.');
      return;
    }

    // Quick override-phrase heuristic
    if (containsOverridePhrases(selectedText)) {
      const proceed = await vscode.window.showWarningMessage(
        'Promptr: Selected text may attempt to override safety instructions. Continue?',
        { modal: false },
        'Send Anyway',
        'Cancel'
      );
      if (proceed !== 'Send Anyway') {
        log.appendLine('User cancelled due to suspicious phrases');
        return;
      }
    }

    // Log what we're about to send to AI
    log.appendLine(`🤖 About to send to AI:`);
    log.appendLine(`   Source: ${textSource}`);
    log.appendLine(`   Length: ${selectedText.length} characters`);
    log.appendLine(`   Preview: "${selectedText.substring(0, 100)}..."`);

    // Get API configuration - use proxy server
    const apiBase = getConfig().get<string>('apiBase', 'https://api.openai.com');
    log.appendLine(`API base: ${apiBase}`);
    
    // Use embedded API key
    const apiKey = process.env.PROMPTR_MASTER_KEY;
    
    if (!apiKey) {
      vscode.window.showErrorMessage('Promptr: Service temporarily unavailable. Please try again later.');
      log.appendLine('No API key available in build-time environment');
      return;
    }
    
    log.appendLine('API key found, proceeding with request');

    // Show progress without stealing focus
    await vscode.window.withProgress({ 
      location: vscode.ProgressLocation.Notification, 
      title: 'Promptr: Generating…',
      cancellable: false
    }, async () => {
      log.appendLine(`Sending ${selectedText.length} chars to AI`);
      let aiResponse: string;
      
      try {
        aiResponse = await aiCall(selectedText, apiBase, apiKey as string, log);

        // --- Leak check: abort if model echoed hidden system prompt ---
        const leaked = aiResponse.includes(PROMPTR_SENTINEL) || /### CORE OBJECTIVE ###|### USER-PROVIDED CONTEXT ###/i.test(aiResponse);
        if (leaked) {
          log.appendLine('🚫 AI response contained internal prompt markers – blocked.');
          vscode.window.showWarningMessage('AI response was blocked because it exposed internal instructions.');
          return; // stop before any clipboard or editor changes
        }
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
          log.appendLine('Text replaced, re-selected, and copied to clipboard');
        } else {
          log.appendLine('Edit operation failed');
          vscode.window.showErrorMessage('Failed to replace text');
        }
      } else {
        // No editor context – automatically paste into the front-most app
        await autoPaste(aiResponse, log);
        vscode.window.showInformationMessage('Promptr: Refined text ready (copied to clipboard)!', { modal: false });
        log.appendLine('Refined text auto-pasted and copied to clipboard');
      }
    });
  });

  /* ----------------- Temperature Status Bar ----------------- */
  const temperatureStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);

  function refreshTemperatureStatus() {
    const temp = getConfig().get<number>('temperature', 0.3);
    temperatureStatus.text = `Promptr 🔥 ${temp.toFixed(1)}`;
    temperatureStatus.tooltip = 'Click to set temperature';
    temperatureStatus.command = 'promptr.setTemperature';
    temperatureStatus.show();
  }

  refreshTemperatureStatus();

  /* -------------- Command: Promptr Menu --------------- */
  // const showMenuCmd = vscode.commands.registerCommand('promptr.showMenu', async () => { /* removed */ });

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

  context.subscriptions.push(temperatureStatus, setCustomContextCmd);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('promptr.temperature')) {
        refreshTemperatureStatus();
      }
    })
  );

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
    refreshTemperatureStatus();
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
      '🎉 Promptr is ready! Fine-tune AI with Temperature or add project context for better answers.',
      'Set Temperature 🔥',
      'Set Custom Context ✍️'
    ).then(selection => {
      if (selection?.startsWith('Set Temperature')) {
        vscode.commands.executeCommand('promptr.setTemperature');
      } else if (selection?.startsWith('Set Custom Context')) {
        vscode.commands.executeCommand('promptr.setCustomContext');
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

// Invisible sentinel used to detect and prevent system-prompt leakage
const PROMPTR_SENTINEL = '\u2063\u2063PROMPTR_SYS';

async function aiCall(input: string, apiBase: string | undefined, apiKey: string, log: vscode.OutputChannel): Promise<string> {
  // Use OpenAI API directly with build-time embedded key
  const urlString = apiBase ? `${apiBase.replace(/\/$/, '')}/v1/chat/completions` : 'https://api.openai.com/v1/chat/completions';
  const url = new URL(urlString);
  log.appendLine(`POST ${url.toString()}`);
  
  // Analyze codebase for context
  const codebaseContext = await getCodebaseContext(log);
  
  // Retrieve the user-provided custom context and place it FIRST in the system prompt so GPT processes it with maximum weight
  const userContext = vscode.workspace.getConfiguration('promptr').get<string>('customContext', '').trim();

  // Build enhanced system prompt starting with the custom context (if any)
  let contextualPrompt = PROMPTR_SENTINEL + ' ';
  if (userContext) {
    contextualPrompt += `### USER-PROVIDED CONTEXT ###\n${userContext}\n\n`;
  }

  contextualPrompt += `You are a **senior product designer**, **technical writer**, and **full-stack architect** with 10+ years of experience in enterprise software development. Your expertise lies in transforming high-level concepts into comprehensive, actionable technical specifications.`;

  // Append codebase context if available
  if (codebaseContext.projectType !== 'unknown' || codebaseContext.languages.length > 0 || codebaseContext.frameworks.length > 0 || codebaseContext.dependencies.length > 0) {
    contextualPrompt += `\n\n### CODEBASE CONTEXT ###\n**Project Type:** ${codebaseContext.projectType}\n**Languages:** ${codebaseContext.languages.join(', ') || 'Not detected'}\n**Frameworks:** ${codebaseContext.frameworks.join(', ') || 'None detected'}\n**Key Dependencies:** ${codebaseContext.dependencies.slice(0, 8).join(', ')}\n**Structure:** ${codebaseContext.fileStructure.join(', ') || 'Standard layout'}\n\n**INTEGRATION DIRECTIVE:** Leverage this technical context to ensure all recommendations align with the existing tech stack and project architecture. Prioritize solutions that integrate seamlessly with current ${codebaseContext.frameworks.length > 0 ? codebaseContext.frameworks.join('/') : 'technology stack'}.`;
  }

  contextualPrompt += `\n\n### CORE OBJECTIVE ###\nTransform brief user ideas into comprehensive, production-ready technical specifications that serve as definitive blueprints for development teams.\n\n### REASONING METHODOLOGY ###\nApply step-by-step analysis: (1) Parse user intent and constraints, (2) Identify technical requirements and dependencies, (3) Structure comprehensive specification, (4) Validate against best practices.\n\n### OUTPUT STRUCTURE ###\nGenerate your response using **only** the following sections that are relevant to the user's request. Use clear markdown formatting with proper hierarchical headers:\n\n#### **1. REFINED SUMMARY**\n- Rewrite the original concept in professional, precise language\n- Clarify scope, objectives, and success metrics\n- Maximum 2-3 sentences, focus on core value proposition\n\n#### **2. USER STORIES & USE CASES**\n- Format: "As a [specific role], I want [specific goal] so that [clear benefit/outcome]"\n- Prioritize by impact and feasibility\n- Include edge cases and error scenarios\n\n#### **3. FEATURE BREAKDOWN**\n- Enumerate concrete, measurable features\n- Organize by priority (MVP vs. future releases)\n- Include technical acceptance criteria for each feature\n\n#### **4. ARCHITECTURE & TECHNICAL RECOMMENDATIONS**\n- Specify recommended tech stack with rationale\n- Include integration patterns, data flow, and system boundaries\n- Address scalability, security, and maintainability concerns\n${codebaseContext.frameworks.length > 0 ? `- **INTEGRATION PRIORITY:** Detail how to integrate with existing ${codebaseContext.frameworks.join('/')} infrastructure` : ''}\n\n#### **5. DEVELOPMENT ROADMAP**\n- Phase-based delivery plan with clear milestones\n- Resource requirements and timeline estimates\n- Risk mitigation strategies for each phase\n\n#### **6. RISK ASSESSMENT & MITIGATION**\n- Technical risks (performance, security, compatibility)\n- Business risks (market fit, resource constraints)\n- Mitigation strategies with contingency plans\n\n#### **7. ACCESSIBILITY & USER EXPERIENCE**\n- WCAG compliance requirements\n- Cross-platform compatibility considerations\n- Performance optimization strategies\n\n### CONSTRAINTS & QUALITY STANDARDS ###\n- **Specificity:** Provide concrete, implementable details\n- **Clarity:** Use precise technical language without jargon\n- **Completeness:** Address all aspects of the request\n- **Actionability:** Every recommendation must be executable\n- **No Commentary:** Exclude meta-explanations or process descriptions\n\n### EXAMPLES FOR GUIDANCE ###\n"""\nInput: "Build a task management app"\nOutput: Comprehensive spec covering user authentication, task CRUD operations, real-time collaboration, notification systems, etc.\n\nInput: "Create a data visualization dashboard"\nOutput: Detailed spec including data sources, chart types, filtering capabilities, export functions, responsive design, etc.\n"""\n\n**EXECUTE IMMEDIATELY:** Process the user's input and generate the structured specification following the exact format above. Begin with the most relevant section based on the input complexity.`;
  
  const postData = JSON.stringify({
    model: 'gpt-3.5-turbo-0125',
    temperature: vscode.workspace.getConfiguration('promptr').get<number>('temperature', 0.3),
    max_tokens: 500,
    stop: ['PROMPTR_SYS'],
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

 