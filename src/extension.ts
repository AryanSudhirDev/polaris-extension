import * as vscode from 'vscode';
import * as https from 'https';
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
          vscode.window.showInformationMessage('Polaris: Refined text ready (copied to clipboard)!', { modal: false });
          log.appendLine('Text replaced, re-selected, and copied to clipboard');
        } else {
          log.appendLine('Edit operation failed');
          vscode.window.showErrorMessage('Failed to replace text');
        }
      } else {
        // No editor context – automatically paste into the front-most app
        await autoPaste(aiResponse, log);
        vscode.window.showInformationMessage('Polaris: Refined text ready (copied to clipboard)!', { modal: false });
        log.appendLine('Refined text auto-pasted and copied to clipboard');
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

  /* Test codebase analysis command */
  const testCodebaseCmd = vscode.commands.registerCommand('polaris.testCodebase', async () => {
    log.show(true); // Show output panel
    log.appendLine('=== CODEBASE ANALYSIS TEST ===');
    
    const context = await analyzeCodebase(log);
    
    // Display in both log and popup
    const summary = `
📁 Project Type: ${context.projectType}
🔤 Languages: ${context.languages.join(', ') || 'None detected'}
⚛️ Frameworks: ${context.frameworks.join(', ') || 'None detected'}
📦 Dependencies: ${context.dependencies.slice(0, 5).join(', ')}${context.dependencies.length > 5 ? '...' : ''}
📂 Structure: ${context.fileStructure.join(', ') || 'Standard layout'}
    `.trim();
    
    log.appendLine(summary);
    vscode.window.showInformationMessage(
      `Codebase Analysis Complete!\nCheck Output → Polaris for details.`,
      'Open Output'
    ).then(action => {
      if (action === 'Open Output') {
        log.show(true);
      }
    });
  });

  context.subscriptions.push(generatePromptCmd, quickInsertCmd, promptProvider, signInCmd, signOutCmd, testCmd, testCodebaseCmd, showDebugCmd, log);
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
  
  // Analyze codebase for context
  const codebaseContext = await getCodebaseContext(log);
  
  // Build enhanced system prompt
  let contextualPrompt = `You are a **senior product designer**, **technical writer**, and **full-stack architect** with 10+ years of experience in enterprise software development. Your expertise lies in transforming high-level concepts into comprehensive, actionable technical specifications.`;

  // Append codebase context if available
  if (codebaseContext.projectType !== 'unknown' || codebaseContext.languages.length > 0 || codebaseContext.frameworks.length > 0 || codebaseContext.dependencies.length > 0) {
    contextualPrompt += `\n\n### CODEBASE CONTEXT ###\n**Project Type:** ${codebaseContext.projectType}\n**Languages:** ${codebaseContext.languages.join(', ') || 'Not detected'}\n**Frameworks:** ${codebaseContext.frameworks.join(', ') || 'None detected'}\n**Key Dependencies:** ${codebaseContext.dependencies.slice(0, 8).join(', ')}\n**Structure:** ${codebaseContext.fileStructure.join(', ') || 'Standard layout'}\n\n**INTEGRATION DIRECTIVE:** Leverage this technical context to ensure all recommendations align with the existing tech stack and project architecture. Prioritize solutions that integrate seamlessly with current ${codebaseContext.frameworks.length > 0 ? codebaseContext.frameworks.join('/') : 'technology stack'}.`;
  }

  contextualPrompt += `\n\n### CORE OBJECTIVE ###\nTransform brief user ideas into comprehensive, production-ready technical specifications that serve as definitive blueprints for development teams.\n\n### REASONING METHODOLOGY ###\nApply step-by-step analysis: (1) Parse user intent and constraints, (2) Identify technical requirements and dependencies, (3) Structure comprehensive specification, (4) Validate against best practices.\n\n### OUTPUT STRUCTURE ###\nGenerate your response using **only** the following sections that are relevant to the user's request. Use clear markdown formatting with proper hierarchical headers:\n\n#### **1. REFINED SUMMARY**\n- Rewrite the original concept in professional, precise language\n- Clarify scope, objectives, and success metrics\n- Maximum 2-3 sentences, focus on core value proposition\n\n#### **2. USER STORIES & USE CASES**\n- Format: "As a [specific role], I want [specific goal] so that [clear benefit/outcome]"\n- Prioritize by impact and feasibility\n- Include edge cases and error scenarios\n\n#### **3. FEATURE BREAKDOWN**\n- Enumerate concrete, measurable features\n- Organize by priority (MVP vs. future releases)\n- Include technical acceptance criteria for each feature\n\n#### **4. ARCHITECTURE & TECHNICAL RECOMMENDATIONS**\n- Specify recommended tech stack with rationale\n- Include integration patterns, data flow, and system boundaries\n- Address scalability, security, and maintainability concerns\n${codebaseContext.frameworks.length > 0 ? `- **INTEGRATION PRIORITY:** Detail how to integrate with existing ${codebaseContext.frameworks.join('/')} infrastructure` : ''}\n\n#### **5. DEVELOPMENT ROADMAP**\n- Phase-based delivery plan with clear milestones\n- Resource requirements and timeline estimates\n- Risk mitigation strategies for each phase\n\n#### **6. RISK ASSESSMENT & MITIGATION**\n- Technical risks (performance, security, compatibility)\n- Business risks (market fit, resource constraints)\n- Mitigation strategies with contingency plans\n\n#### **7. ACCESSIBILITY & USER EXPERIENCE**\n- WCAG compliance requirements\n- Cross-platform compatibility considerations\n- Performance optimization strategies\n\n### CONSTRAINTS & QUALITY STANDARDS ###\n- **Specificity:** Provide concrete, implementable details\n- **Clarity:** Use precise technical language without jargon\n- **Completeness:** Address all aspects of the request\n- **Actionability:** Every recommendation must be executable\n- **No Commentary:** Exclude meta-explanations or process descriptions\n\n### EXAMPLES FOR GUIDANCE ###\n"""\nInput: "Build a task management app"\nOutput: Comprehensive spec covering user authentication, task CRUD operations, real-time collaboration, notification systems, etc.\n\nInput: "Create a data visualization dashboard"\nOutput: Detailed spec including data sources, chart types, filtering capabilities, export functions, responsive design, etc.\n"""\n\n**EXECUTE IMMEDIATELY:** Process the user's input and generate the structured specification following the exact format above. Begin with the most relevant section based on the input complexity.`;

  const postData = JSON.stringify({
    model: 'gpt-3.5-turbo-0125',
    temperature: 0.3,
    max_tokens: 500,
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

 