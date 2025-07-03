import * as vscode from 'vscode';
import * as https from 'https';

export function activate(context: vscode.ExtensionContext) {
  console.log('Polaris extension starting...');
  
  const getConfig = () => vscode.workspace.getConfiguration('polaris');

  // Create output channel but don't show it automatically
  const log = vscode.window.createOutputChannel('Polaris');
  
  /*
   * Main command: Generate and refine prompt
   */
  const generatePromptCmd = vscode.commands.registerCommand('polaris.generatePrompt', async () => {
    log.appendLine('=== Polaris Generate Prompt Command Started ===');
    
    const editor = vscode.window.activeTextEditor;
    let selectedText = '';
    let originalSelection: vscode.Selection | undefined;
    
    // First, try to get selected text from the active editor
    if (editor && !editor.selection.isEmpty) {
      selectedText = editor.document.getText(editor.selection);
      originalSelection = editor.selection;
      log.appendLine(`Got selected text from editor: "${selectedText.substring(0, 50)}..."`);
    }
    
    // If no text selected in editor, try to get from active terminal or other sources
    if (!selectedText) {
      // For Cursor chat box and similar, we can try to get text from clipboard
      // This is a simpler approach than accessibility APIs
      try {
        selectedText = await vscode.env.clipboard.readText();
        if (selectedText) {
          log.appendLine(`Got text from clipboard: "${selectedText.substring(0, 50)}..."`);
          // Show a subtle message without stealing focus
          vscode.window.setStatusBarMessage('Polaris: Using clipboard text', 2000);
        }
      } catch (error) {
        log.appendLine(`Failed to read clipboard: ${error}`);
      }
    }
    
    // If still no text, use full document as fallback
    if (!selectedText && editor) {
      selectedText = editor.document.getText();
      log.appendLine(`Using full document: ${selectedText.length} characters`);
    }
    
    if (!selectedText) {
      vscode.window.showErrorMessage('No text found. Please select text or copy text to clipboard first.');
      return;
    }

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
        // No editor context - put refined text in clipboard for pasting
        await vscode.env.clipboard.writeText(aiResponse);
        vscode.window.setStatusBarMessage('✓ Polaris: Refined text copied to clipboard!', 3000);
        log.appendLine('Refined text copied to clipboard');
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

  context.subscriptions.push(generatePromptCmd, quickInsertCmd, promptProvider, signInCmd, signOutCmd, testCmd, log);
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

