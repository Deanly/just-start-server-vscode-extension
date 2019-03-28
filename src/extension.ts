"use strict";
import * as vscode from "vscode";

import * as config from "./core/configuration";
import * as app from "./core/application";

import { ServerTreeDataProvider, ServerEntry } from "./views/serverExplorer";
import { PropertyTreeDataProvider, PropertyEntry } from "./views/propertyExplorer";

let onServerChange: vscode.EventEmitter<ServerEntry|null|undefined>;
let propertyTreeDataProvider: PropertyTreeDataProvider;
let serverTreeDataProvider: ServerTreeDataProvider;

export function activate (context: vscode.ExtensionContext) {
    console.log("asAbsolutePath", context.asAbsolutePath);
    console.log("extensionPath", context.extensionPath);
    console.log("globalState", context.globalState);
    console.log("storagePath", context.storagePath);
    console.log("subscriptions", context.subscriptions);
    console.log("workspaceState", context.workspaceState);

    handle(() => initialize(context))();

    onServerChange = new vscode.EventEmitter<ServerEntry | null | undefined>();
    propertyTreeDataProvider = new PropertyTreeDataProvider(context, onServerChange.event);
    serverTreeDataProvider = new ServerTreeDataProvider(context, onServerChange);

    context.subscriptions.push(vscode.window.registerTreeDataProvider("propertyExplorer", propertyTreeDataProvider));
    context.subscriptions.push(vscode.commands.registerCommand("propertyExplorer.editEntry", handle(async (entry: PropertyEntry) => await entry.changeValue())));
    context.subscriptions.push(vscode.commands.registerCommand("propertyExplorer.refreshEntry", handle(() => propertyTreeDataProvider.refresh())));

    context.subscriptions.push(vscode.window.registerTreeDataProvider("serverExplorer", serverTreeDataProvider));
    context.subscriptions.push(vscode.commands.registerCommand("serverExplorer.addServer", handle(() => serverTreeDataProvider.commandAddTreeItem())));
    context.subscriptions.push(vscode.commands.registerCommand("serverExplorer.delServer", handle((entry: ServerEntry) => serverTreeDataProvider.commandDeleteServer(entry))));
    context.subscriptions.push(vscode.commands.registerCommand("serverExplorer.refresh", handle(async () => await serverTreeDataProvider.refresh())));
    context.subscriptions.push(vscode.commands.registerCommand("serverExplorer.runEntry", handle((entry: ServerEntry) => { entry.runEntry(false).then(() => onServerChange.fire(entry)); })));
    context.subscriptions.push(vscode.commands.registerCommand("serverExplorer.debugEntry", handle((entry: ServerEntry) => { entry.runEntry(true).then(() => onServerChange.fire(entry)); })));
    context.subscriptions.push(vscode.commands.registerCommand("serverExplorer.stopEntry", handle((entry: ServerEntry) => entry.stopEntry())));
    context.subscriptions.push(vscode.commands.registerCommand("serverExplorer.selectEntry", handle((entry) => serverTreeDataProvider.selectTreeItem(entry))));

    setTimeout(() => serverTreeDataProvider.refresh(), 500);
}

// this method is called when your extension is deactivated
export function deactivate() {
    app.container.getApplications().forEach(element => {
        element.dispose();
    });
}

function initialize (context: vscode.ExtensionContext, n: number = 10): void {
    if (n <= 0) { return; }
    if (
        !context.storagePath ||
        (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length === 0)
    ) {
        setTimeout(() => initialize(context, --n), 100);
        return void 0;
    }
    app.container.initialize(vscode.workspace.workspaceFolders![0]);
    config.accessor.initialize(context.storagePath);
    app.container.loadFromConfigurations();
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