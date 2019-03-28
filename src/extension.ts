"use strict";
// The module "vscode" contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";

import * as config from "./core/configuration";
import * as app from "./core/application";

import { ServerTreeDataProvider, ServerEntry } from "./views/serverExplorer";
// import { ConfigurationPanel } from "./views/propertyDocument";
import { PropertyTreeDataProvider, PropertyEntry } from "./views/propertyExplorer";

let onServerChange: vscode.EventEmitter<ServerEntry|null|undefined>;
let propertyTreeDataProvider: PropertyTreeDataProvider;
let serverTreeDataProvider: ServerTreeDataProvider;

function initialize (context: vscode.ExtensionContext, n: number = 10): void {
    if (n <= 0) { return; }
    if (
        !context.storagePath ||
        (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length === 0)
    ) {
        setTimeout(() => initialize(context, --n), 100);
        return void 0;
    }
    app.container.initialize(vscode.workspace.workspaceFolders![0].uri.fsPath);
    config.accessor.initialize(context.storagePath);
    app.container.loadFromConfigurations();
    setTimeout(() => serverTreeDataProvider.refresh(), 500);
}

function handle(exec: (...args: any) => any): any {
    function hError(e: Error) {
        console.error(e);

        if (e === config.ConfigurationError.BrokenConfigFile) {
            vscode.window.showErrorMessage(e.toString());
            config.accessor.reset()
                .then(() => {
                    app.container.reset();
                    serverTreeDataProvider.refresh();
                    propertyTreeDataProvider.refresh();
                });
        } else {
            vscode.window.showErrorMessage(e.toString());
        }
    }

    return (...args: any) => {
        try {
            const out = exec.apply({}, args);
            if (out instanceof Promise) {
                out.catch(e => hError(e));
            }
        } catch (e) {
            hError(e);
        }
    };
}

export function activate (context: vscode.ExtensionContext) {
    console.log("asAbsolutePath", context.asAbsolutePath);
    console.log("extensionPath", context.extensionPath);
    console.log("globalState", context.globalState);
    console.log("storagePath", context.storagePath);
    console.log("subscriptions", context.subscriptions);
    console.log("workspaceState", context.workspaceState);

    handle(() => initialize(context))();

    // TODO(dean):
    // 1. 에러를 수렴시켜서 컨트롤 하는 방법을 구상하기
    // 2. 설정파일 저장시 깨지는 문제가 있는데 뒷부분이 일부 남는 현상이다.
    //   cd /Users/dean/Library/Application Support/Code/User/workspaceStorage/17305cec438a3b76fa269e2ba12013ca/Deanly.server-starter/extension-server-starter
    //   왜 남는지는 모르겠다. nodejs writeFile 함수의 설정값을 잘못하여 file 이 replace 되지 않는 것은 아닐까? 추정중...

    onServerChange = new vscode.EventEmitter<ServerEntry|null|undefined>();
    propertyTreeDataProvider = new PropertyTreeDataProvider(context, onServerChange.event);
    serverTreeDataProvider = new ServerTreeDataProvider(context, onServerChange);

    vscode.window.registerTreeDataProvider("propertyExplorer", propertyTreeDataProvider);
    vscode.commands.registerCommand("propertyExplorer.editEntry", handle(async (entry: PropertyEntry) => await entry.changeValue()));
    vscode.commands.registerCommand("propertyExplorer.refreshEntry", handle(() => propertyTreeDataProvider.refresh()));

    vscode.window.registerTreeDataProvider("serverExplorer", serverTreeDataProvider);
    vscode.commands.registerCommand("serverExplorer.addServer", handle(() => serverTreeDataProvider.commandAddTreeItem()));
    vscode.commands.registerCommand("serverExplorer.delServer", handle((entry: ServerEntry) => serverTreeDataProvider.commandDeleteServer(entry)));
    vscode.commands.registerCommand("serverExplorer.refresh", handle(async () => await serverTreeDataProvider.refresh()));
    vscode.commands.registerCommand("serverExplorer.runEntry", handle((entry: ServerEntry) => { entry.runEntry().then(() => onServerChange.fire(entry)); }));
    vscode.commands.registerCommand("serverExplorer.debugEntry", handle((entry: ServerEntry) => { entry.runEntry().then(() => onServerChange.fire(entry)); }));
    vscode.commands.registerCommand("serverExplorer.stopEntry", handle((entry: ServerEntry) => entry.stopEntry()));
    vscode.commands.registerCommand("serverExplorer.selectEntry", handle((entry) => serverTreeDataProvider.selectTreeItem(entry)));

    // if (vscode.window.registerWebviewPanelSerializer) {
    //     vscode.window.registerWebviewPanelSerializer(ConfigurationPanel.viewType, {
    //         async deserializeWebviewPanel (webviewPanel: vscode.WebviewPanel, state: any) {
    //             console.log(`Get state: ${state}`);
    //             ConfigurationPanel.revive(webviewPanel, context.extensionPath);
    //         }
    //     });
    // }

    // ConfigurationPanel.createOrShow(context.extensionPath);


    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    // let disposable = vscode.commands.registerCommand("extension.sayHello", () => {
    //     // The code you place here will be executed every time your command is executed

    //     // Display a message box to the user
    //     vscode.window.showInformationMessage("Hello World!");
    // });

    // context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {
    app.container.getApplications().forEach(element => {
        element.dispose();
    });
}