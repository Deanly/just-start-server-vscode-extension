import * as vscode from 'vscode';

/**
 * Manages configuration webview panels
 */
export class ConfigurationPanel {
    public static currentPanel: ConfigurationPanel | undefined;

    public static readonly viewType = 'startServerConfigPanel';

    private readonly _panel: vscode.WebviewPanel;
    // private readonly _extensionPath: string;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow (extensionPath: string) {
        const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

        // If we already have a panel, show it.
        if (ConfigurationPanel.currentPanel) {
            ConfigurationPanel.currentPanel._panel.reveal(column);
            return;
        }

        // Otherwise, create a new panel.
        const panel = vscode.window.createWebviewPanel(ConfigurationPanel.viewType, 'Configuration', column || vscode.ViewColumn.One, {
            enableScripts: true,
            localResourceRoots: [
            ]
        });

        ConfigurationPanel.currentPanel = new ConfigurationPanel(panel, extensionPath);
    }

    public static revive (panel: vscode.WebviewPanel, extensionPath: string) {
        ConfigurationPanel.currentPanel = new ConfigurationPanel(panel, extensionPath);
    }

    private constructor (panel: vscode.WebviewPanel, extensionPath: string) {
        this._panel = panel;
        // this._extensionPath = extensionPath;

        // Set the webview's initial html content
        this._update();

        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programatically
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Update the content based on view changes
        this._panel.onDidChangeViewState(e => {
            if (this._panel.visible) {
                this._update();
            }
        }, null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(message => {
            switch (message.command) {
                case 'alert':
                    vscode.window.showErrorMessage(message.text);
                    return;
            }
        }, null, this._disposables);
    }

    public doRefactor () {
        // Send a message to the webview.
        // You can send any JSON serializeable data.
        this._panel.webview.postMessage({ command: 'refactor' });
    }

    public dispose () {
        ConfigurationPanel.currentPanel = undefined;

        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _update () {

        const nonce = getNonce();

        this._panel.title = 'Test! Configuration';
        this._panel.webview.html = `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <!--
            Use a content security policy to only allow loading images from https or from our extension directory,
            and only allow scripts that have a specific nonce.
            -->
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src vscode-resource: https:; script-src 'nonce-${nonce}';">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Cat Coding</title>
        </head>
        <body>
            Hi, Configuration
            <h1 id="lines-of-code-counter">0</h1>
        </body>
        </html>`;
    }

}

function getNonce() {
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}