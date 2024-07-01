import * as vscode from 'vscode';
import * as yaml from 'js-yaml';

class RasaCompletionItemProvider implements vscode.CompletionItemProvider {
    public static readonly triggerCharacters = ['.', ':', ' '];

    provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): vscode.ProviderResult<vscode.CompletionItem[]> {
        const linePrefix = document.lineAt(position).text.substr(0, position.character);
        const indent = ' '.repeat(document.lineAt(position).firstNonWhitespaceCharacterIndex);
        console.log(`Autocomplete triggered. Line prefix: "${linePrefix}"`);

        if (linePrefix.trim() === 'flows:') {
            const flowNameItem = new vscode.CompletionItem('flow_name', vscode.CompletionItemKind.Property);
            flowNameItem.insertText = new vscode.SnippetString('\n${1:flow_name}:\n  description: "${2:Flow description}"\n  steps:\n    - ${0}');
            return [flowNameItem];
        }

        if (linePrefix.endsWith('steps:')) {
            return this.getStepCompletions(indent);
        }

        if (linePrefix.trim().startsWith('-')) {
            return this.getStepTypeCompletions(indent);
        }

        return [];
    }

    private getStepCompletions(indent: string): vscode.CompletionItem[] {
        const actionStep = new vscode.CompletionItem('- action:', vscode.CompletionItemKind.Snippet);
        actionStep.insertText = new vscode.SnippetString(`\n${indent}- action: \${1:action_name}\n${indent}  next: \${0}`);

        const collectStep = new vscode.CompletionItem('- collect:', vscode.CompletionItemKind.Snippet);
        collectStep.insertText = new vscode.SnippetString(`\n${indent}- collect: \${1:slot_name}\n${indent}  next: \${0}`);

        const linkStep = new vscode.CompletionItem('- link:', vscode.CompletionItemKind.Snippet);
        linkStep.insertText = new vscode.SnippetString(`\n${indent}- link: \${1:flow_name}\n${indent}  next: \${0}`);

        const callStep = new vscode.CompletionItem('- call:', vscode.CompletionItemKind.Snippet);
        callStep.insertText = new vscode.SnippetString(`\n${indent}- call: \${1:flow_name}\n${indent}  next: \${0}`);

        const setSlotsStep = new vscode.CompletionItem('- set_slots:', vscode.CompletionItemKind.Snippet);
        setSlotsStep.insertText = new vscode.SnippetString(`\n${indent}- set_slots:\n${indent}    - \${1:slot_name}: \${2:value}\n${indent}  next: \${0}`);

        return [actionStep, collectStep, linkStep, callStep, setSlotsStep];
    }

    private getStepTypeCompletions(indent: string): vscode.CompletionItem[] {
        const actionItem = new vscode.CompletionItem('action:', vscode.CompletionItemKind.Property);
        actionItem.insertText = new vscode.SnippetString(`action: \${1:action_name}\n${indent}  next: \${0}`);

        const collectItem = new vscode.CompletionItem('collect:', vscode.CompletionItemKind.Property);
        collectItem.insertText = new vscode.SnippetString(`collect: \${1:slot_name}\n${indent}  next: \${0}`);

        const linkItem = new vscode.CompletionItem('link:', vscode.CompletionItemKind.Property);
        linkItem.insertText = new vscode.SnippetString(`link: \${1:flow_name}\n${indent}  next: \${0}`);

        const callItem = new vscode.CompletionItem('call:', vscode.CompletionItemKind.Property);
        callItem.insertText = new vscode.SnippetString(`call: \${1:flow_name}\n${indent}  next: \${0}`);

        const setSlotsItem = new vscode.CompletionItem('set_slots:', vscode.CompletionItemKind.Property);
        setSlotsItem.insertText = new vscode.SnippetString(`set_slots:\n${indent}    - \${1:slot_name}: \${2:value}\n${indent}  next: \${0}`);

        return [actionItem, collectItem, linkItem, callItem, setSlotsItem];
    }
}

class RasaHoverProvider implements vscode.HoverProvider {
    provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.ProviderResult<vscode.Hover> {
        const range = document.getWordRangeAtPosition(position);
        const word = document.getText(range);

        if (word === 'flows') {
            return new vscode.Hover('Defines the flows in your Rasa chatbot.');
        }

        if (word === 'steps') {
            return new vscode.Hover('Defines the sequence of actions in a flow.');
        }

        if (word === 'collect') {
            return new vscode.Hover('Collects information from the user.');
        }

        if (word === 'action') {
            return new vscode.Hover('Performs a specific action in the flow.');
        }

        return null;
    }
}

class RasaDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
    provideDocumentSymbols(document: vscode.TextDocument): vscode.ProviderResult<vscode.SymbolInformation[]> {
        const text = document.getText();
        const flows = yaml.load(text) as any;

        if (!flows || !flows.flows) {
            return [];
        }

        const symbols: vscode.SymbolInformation[] = [];

        for (const [flowName, flow] of Object.entries(flows.flows)) {
            const flowSymbol = new vscode.SymbolInformation(
                flowName,
                vscode.SymbolKind.Class,
                '',
                new vscode.Location(document.uri, new vscode.Position(0, 0))
            );
            symbols.push(flowSymbol);

            if ((flow as any).steps) {
                for (const step of (flow as any).steps) {
                    if (step.collect) {
                        symbols.push(new vscode.SymbolInformation(
                            `Collect: ${step.collect}`,
                            vscode.SymbolKind.Method,
                            flowName,
                            new vscode.Location(document.uri, new vscode.Position(0, 0))
                        ));
                    } else if (step.action) {
                        symbols.push(new vscode.SymbolInformation(
                            `Action: ${step.action}`,
                            vscode.SymbolKind.Method,
                            flowName,
                            new vscode.Location(document.uri, new vscode.Position(0, 0))
                        ));
                    }
                }
            }
        }

        return symbols;
    }
}

function validateRasaFlow(uri: vscode.Uri, collection: vscode.DiagnosticCollection): void {
    vscode.workspace.openTextDocument(uri).then(document => {
        const text = document.getText();
        const diagnostics: vscode.Diagnostic[] = [];

        try {
            const flows = yaml.load(text) as any;
            
            if (!flows || !flows.flows) {
                diagnostics.push(new vscode.Diagnostic(
                    new vscode.Range(0, 0, 0, 1),
                    'The YAML file must contain a "flows" key at the root level.',
                    vscode.DiagnosticSeverity.Error
                ));
            } else {
                for (const [flowName, flow] of Object.entries(flows.flows)) {
                    if (!(flow as any).description) {
                        diagnostics.push(new vscode.Diagnostic(
                            new vscode.Range(0, 0, 0, 1),
                            `Flow "${flowName}" is missing a description.`,
                            vscode.DiagnosticSeverity.Error
                        ));
                    }
                    if (!(flow as any).steps || !(flow as any).steps.length) {
                        diagnostics.push(new vscode.Diagnostic(
                            new vscode.Range(0, 0, 0, 1),
                            `Flow "${flowName}" must have at least one step.`,
                            vscode.DiagnosticSeverity.Error
                        ));
                    }
                }
            }
        } catch (e) {
            diagnostics.push(new vscode.Diagnostic(
                new vscode.Range(0, 0, 0, 1),
                `Invalid YAML: ${e}`,
                vscode.DiagnosticSeverity.Error
            ));
        }

        collection.set(uri, diagnostics);
    });
}

function visualizeFlow(): void {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        const document = editor.document;
        const text = document.getText();
        
        try {
            const flows = yaml.load(text) as any;
            if (flows && flows.flows) {
                let visualization = 'Rasa Flow Visualization:\n\n';
                
                for (const [flowName, flow] of Object.entries(flows.flows)) {
                    visualization += `Flow: ${flowName}\n`;
                    visualization += `Description: ${(flow as any).description}\n`;
                    visualization += `Steps:\n`;
                    
                    if ((flow as any).steps) {
                        for (const step of (flow as any).steps) {
                            if (step.collect) {
                                visualization += `  - Collect: ${step.collect}\n`;
                            } else if (step.action) {
                                visualization += `  - Action: ${step.action}\n`;
                            } else if (step.link) {
                                visualization += `  - Link: ${step.link}\n`;
                            } else if (step.call) {
                                visualization += `  - Call: ${step.call}\n`;
                            } else if (step.set_slots) {
                                visualization += `  - Set Slots: ${JSON.stringify(step.set_slots)}\n`;
                            }
                        }
                    }
                    
                    visualization += '\n';
                }
                
                const panel = vscode.window.createWebviewPanel(
                    'rasaFlowVisualization',
                    'Rasa Flow Visualization',
                    vscode.ViewColumn.Beside,
                    {}
                );
                
                panel.webview.html = `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Rasa Flow Visualization</title>
                </head>
                <body>
                    <pre>${visualization}</pre>
                </body>
                </html>`;
            }
        } catch (e) {
            vscode.window.showErrorMessage(`Failed to visualize Rasa flow: ${e}`);
        }
    }
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Rasa Flow Extension is now active');

    // Register commands
    let disposable = vscode.commands.registerCommand('extension.visualizeRasaFlow', () => {
        console.log('Visualize Rasa Flow command triggered');
        visualizeFlow();
    });

    context.subscriptions.push(disposable);

    // Register providers
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            'yaml', 
            new RasaCompletionItemProvider(), 
            ...RasaCompletionItemProvider.triggerCharacters
        ),
        vscode.languages.registerHoverProvider('yaml', new RasaHoverProvider()),
        vscode.languages.registerDocumentSymbolProvider('yaml', new RasaDocumentSymbolProvider())
    );

    console.log('Providers registered');

    // Set up diagnostics
    const collection = vscode.languages.createDiagnosticCollection('rasa-flow');
    context.subscriptions.push(collection);

    // Watch for changes in YAML files
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.yml');
    watcher.onDidChange(uri => {
        console.log(`File changed: ${uri.toString()}`);
        validateRasaFlow(uri, collection);
    });
    watcher.onDidCreate(uri => {
        console.log(`File created: ${uri.toString()}`);
        validateRasaFlow(uri, collection);
    });
    context.subscriptions.push(watcher);

    console.log('File watcher set up');

    // Log when a YAML file is opened
    vscode.workspace.onDidOpenTextDocument(document => {
        if (document.languageId === 'yaml') {
            console.log(`YAML file opened: ${document.uri.toString()}`);
        }
    });
}

export function deactivate() {}