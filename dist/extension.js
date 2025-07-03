"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const https = __importStar(require("https"));
function activate(context) {
    console.log('Polaris extension activating...');
    const getConfig = () => vscode.workspace.getConfiguration('polaris');
    const log = vscode.window.createOutputChannel('Polaris');
    log.appendLine('Extension activated');
    // Test environment variable immediately
    const envKey = process.env.OPENAI_API_KEY || process.env.POLARIS_API_KEY;
    if (envKey) {
        log.appendLine(`Environment API key found: ${envKey.substring(0, 10)}...`);
    }
    else {
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
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            log.appendLine('No active editor');
            console.log('No active editor found');
            vscode.window.showWarningMessage('No active editor');
            return;
        }
        const selection = editor.selection;
        const selectedText = selection.isEmpty ? editor.document.getText() : editor.document.getText(selection);
        log.appendLine(`Selection empty: ${selection.isEmpty}, text length: ${selectedText.length}`);
        const apiBase = getConfig().get('apiBase');
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
            let aiResponse;
            try {
                aiResponse = await aiCall(selectedText, apiBase, apiKey, log);
            }
            catch (err) {
                log.appendLine(`AI call failed: ${err?.message ?? err}`);
                vscode.window.showErrorMessage(err.message || 'AI request failed');
                log.appendLine(`Error: ${err?.message ?? err}`);
                return;
            }
            log.appendLine(`Got AI response: ${aiResponse.substring(0, 100)}...`);
            const editSuccess = await editor.edit((editBuilder) => {
                log.appendLine('Starting edit operation');
                const mode = getConfig().get('insertMode', 'below');
                log.appendLine(`Insert mode: ${mode}`);
                if (mode === 'replace' && !selection.isEmpty) {
                    log.appendLine('Replacing selection');
                    editBuilder.replace(selection, aiResponse);
                }
                else if (mode === 'replace') {
                    log.appendLine('Replacing entire document');
                    const fullRange = new vscode.Range(0, 0, editor.document.lineCount, 0);
                    editBuilder.replace(fullRange, aiResponse);
                }
                else {
                    const line = selection.isEmpty ? selection.active.line : selection.end.line;
                    log.appendLine(`Inserting at line ${line}`);
                    const lineEnd = editor.document.lineAt(line).range.end;
                    editBuilder.insert(lineEnd, `\n${aiResponse}\n`);
                }
            });
            if (editSuccess) {
                log.appendLine('Edit operation successful');
            }
            else {
                log.appendLine('Edit operation failed');
                vscode.window.showErrorMessage('Failed to insert AI response');
            }
        });
    });
    /*
     * Quick-Prompt picker – inserts a saved prompt body immediately.
     */
    const quickInsertCmd = vscode.commands.registerCommand('polaris.quickInsertPrompt', async () => {
        const prompts = context.globalState.get('prompts', []);
        if (!prompts.length) {
            vscode.window.showInformationMessage('No prompts saved yet.');
            return;
        }
        const picked = await vscode.window.showQuickPick(prompts.map(p => ({ label: p.name, description: p.tags?.join(', '), prompt: p })), { placeHolder: 'Select a prompt' });
        if (!picked)
            return;
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
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
function deactivate() { }
class PromptItem extends vscode.TreeItem {
    constructor(prompt) {
        super(prompt.name, vscode.TreeItemCollapsibleState.None);
        this.prompt = prompt;
        this.contextValue = 'polarisPrompt';
        this.description = prompt.tags?.join(', ');
    }
    insert() {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        editor.insertSnippet(new vscode.SnippetString(this.prompt.body));
    }
    edit() {
        vscode.commands.executeCommand('polaris.openPromptEditor', this.prompt);
    }
}
class PromptTreeProvider {
    constructor(ctx) {
        this.ctx = ctx;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    getChildren() {
        const prompts = this.ctx.globalState.get('prompts', []);
        return prompts.map(p => new PromptItem(p));
    }
    dispose() {
        this._onDidChangeTreeData.dispose();
    }
}
async function aiCall(input, apiBase, apiKey, log) {
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
                }
                catch (err) {
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
//# sourceMappingURL=extension.js.map