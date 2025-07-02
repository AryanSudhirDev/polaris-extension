import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  const getConfig = () => vscode.workspace.getConfiguration('polaris');

  /*
   * Generate-Prompt command
   * Grabs current selection (fallback: full document), sends to AI, then
   * inserts or replaces according to `polaris.insertMode`.
   * The AI call is stubbed for now (echoes the input).
   */
  const generatePromptCmd = vscode.commands.registerCommand('polaris.generatePrompt', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active editor');
      return;
    }

    const selection = editor.selection;
    const selectedText = selection.isEmpty ? editor.document.getText() : editor.document.getText(selection);

    const apiBase = getConfig().get<string>('apiBase');
    const aiResponse = await mockAiCall(selectedText, apiBase); // TODO replace with real call

    await editor.edit((editBuilder: vscode.TextEditorEdit) => {
      const mode = getConfig().get<'replace' | 'below'>('insertMode', 'below');
      if (mode === 'replace' && !selection.isEmpty) {
        editBuilder.replace(selection, aiResponse);
      } else if (mode === 'replace') {
        const fullRange = new vscode.Range(0, 0, editor.document.lineCount, 0);
        editBuilder.replace(fullRange, aiResponse);
      } else {
        const insertPos = selection.isEmpty ? selection.active : selection.end;
        editBuilder.insert(insertPos.translate(1), `\n${aiResponse}\n`);
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

  context.subscriptions.push(generatePromptCmd, quickInsertCmd, promptProvider);
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

async function mockAiCall(input: string, _apiBase?: string): Promise<string> {
  // Placeholder – just echoes for now.
  return `/* AI response */\n${input}`;
} 