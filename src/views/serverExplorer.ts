import * as vscode from "vscode";
import * as path from "path";

import { util, network, h, fsw } from "../core/supports";
import { container, IRunnable, AppTypes, Status, ApplicationCode } from "../core/application";
import { accessor, ConfigurationAccessor, Workspace } from "../core/configuration";

import { multiStepInput } from "./serverPicker";
import { getMessage } from "../messages";

export class ServerEntry extends vscode.TreeItem {

    public busy = false;
    public outputChannel: vscode.OutputChannel;

    constructor(
        protected readonly context: vscode.ExtensionContext,
        protected readonly server: ConfigurationAccessor & IRunnable,
        public readonly onDidChangeTreeData: vscode.EventEmitter<ServerEntry | null | undefined>,
        public readonly collapsibleState?: vscode.TreeItemCollapsibleState,
    ) {
        super(server.getName());
        this.outputChannel = vscode.window.createOutputChannel(`${server.getName()}`);

        this.disposableOnDidTerminateDebugSession = vscode.debug.onDidTerminateDebugSession(session => {
            if (this.server.status === Status.RUNNING && session.name === this.server.getDebugSessionName()) {
                this.stopEntry();
            }
        });
    }

    dispose() {
        this.outputChannel.dispose();
        this.disposableOnDidTerminateDebugSession.dispose();
        this.server.dispose();
    }

    private _defaultIconPath = {
        preparing: {
            dark: this.context.asAbsolutePath(path.join("resources", "dark", "dependency.svg")),
            light: this.context.asAbsolutePath(path.join("resources", "dark", "dependency.svg")),
        },
        running: {
            dark: this.context.asAbsolutePath(path.join("resources", "light", "dependency.svg")),
            light: this.context.asAbsolutePath(path.join("resources", "light", "dependency.svg")),
        },
        stop: {
            dark: this.context.asAbsolutePath(path.join("resources", "dark", "dependency.svg")),
            light: this.context.asAbsolutePath(path.join("resources", "dark", "dependency.svg")),
        }
    };
    private isDebug = false;
    private disposableOnDidTerminateDebugSession: vscode.Disposable;

    get iconPath() {
        if (this.server.getIconPath) {
            return this.server.getIconPath(this.context.asAbsolutePath);
        } else {
            switch (this.server.getStatus()) {
                case Status.PREPARING: return this._defaultIconPath.preparing;
                case Status.RUNNING: return this._defaultIconPath.running;
                case Status.STOP: return this._defaultIconPath.stop;
                default: return this._defaultIconPath.stop;
            }
        }
    }

    get contextValue(): string {
        return this.server.getStatus();
    }

    get properties() {
        return this.server.getProperties();
    }

    getServer() {
        return this.server;
    }

    redraw(): void {
        this.onDidChangeTreeData.fire(this);
    }

    async runEntry(isDebug: boolean): Promise<void> {
        if (!await fsw.exists(this.server.getAppPath())) { throw new h.ExtError(this.server.getAppPath(), ApplicationCode.NotFound); }
        const prevStatus = this.server.status;
        try {
            if (!(await network.checkAvailablePort(this.server.getServicePort()))) { throw new h.ExtError(ApplicationCode.NotAvailablePort); }
            if (this.busy) { return; }
            this.busy = true;
            this.server.status = Status.PREPARING;
            this.redraw();
            this.outputChannel.clear();
            await this.server.deploy(this.outputChannel);
            await util.setTimeoutPromise(() => { }, 1000);
            if (isDebug) {
                await this.server.debug(this.outputChannel);
            } else {
                await this.server.start(this.outputChannel);
            }
            await util.setTimeoutPromise(() => { }, 1000);
            this.server.status = Status.RUNNING;
            this.isDebug = isDebug;
        } catch (e) {
            this.busy = false;
            this.server.status = prevStatus;
            this.redraw();
            this.server.stop(this.outputChannel);
            throw e;
        }
        this.redraw();
        this.outputChannel.show();
        this.busy = false;
    }

    async stopEntry(): Promise<void> {
        if (this.busy) { return; }
        this.busy = true;
        const prevStatus = this.server.status;
        try {
            if (!await fsw.exists(this.server.getAppPath())) { throw new h.ExtError(this.server.getAppPath(), ApplicationCode.NotFound); }
            this.server.status = Status.PREPARING;
            this.redraw();
            await this.server.stop(this.outputChannel);
            await util.setTimeoutPromise(() => { }, 1000);
            this.server.status = Status.STOP;
        } catch (e) {
            this.busy = false;
            this.server.status = prevStatus;
            throw e;
        }

        this.redraw();
        this.busy = false;
    }

    async rerunEntry(): Promise<void> {
        await this.stopEntry();
        await this.runEntry(this.isDebug);
        return void 0;
    }

    command = {
        title: "Select",
        command: "serverExplorer.selectEntry",
        arguments: [this]
    };

}

export class ServerTreeDataProvider implements vscode.TreeDataProvider<ServerEntry> {

    private _children: Array<ServerEntry> = [];

    private _onDidChangeTreeData: vscode.EventEmitter<ServerEntry | null | undefined> = new vscode.EventEmitter();
    readonly onDidChangeTreeData: vscode.Event<ServerEntry | null | undefined> = this._onDidChangeTreeData.event;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly onServerChange: vscode.EventEmitter<ServerEntry | null | undefined>,
    ) {
    }

    selectTreeItem(element?: ServerEntry): void {
        this.onServerChange.fire(element);
        if (element) {
            element.outputChannel.show();
        }
    }

    async refresh(exactly?: boolean): Promise<void> {
        await container.loadFromConfigurations(exactly);
        this._children.forEach(child => child.dispose());
        const apps = container.getApplications();
        this._children = await Promise.resolve(apps.map(s => new ServerEntry(this.context, s, this._onDidChangeTreeData)));
        this._onDidChangeTreeData.fire();
        return void 0;
    }

    getTreeItem(element: ServerEntry): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    getChildren(element?: ServerEntry): vscode.ProviderResult<ServerEntry[]> {
        return this._children;
    }

    async commandAddTreeItem(): Promise<void> {
        const state = await multiStepInput(this.context);
        const srcPath = state.selectedAppSource.sourcePath;
        if (!state.valid || !srcPath) {
            if (srcPath && state.selectedAppSource.download) { fsw.rmrfSync(srcPath); }
            throw new h.ExtError(ApplicationCode.FailedCreateServer);
        }

        const workspace: Workspace = { name: state.selectedWorkspace.label, path: state.selectedWorkspace.uri.fsPath };

        try {
            await this._createAndRegisterApp(srcPath, state.selectedAppSource.type, workspace);
        } catch (e) {
            throw e;
        }
        if (state.selectedAppSource.download) { fsw.rmrfSync(srcPath); }
        vscode.window.showInformationMessage(getMessage("M_TP_DONE"));
        return void 0;
    }

    private async _createAndRegisterApp(source: string, type: AppTypes, workspace: Workspace): Promise<IRunnable> {
        const app = await container.createApplication(type, workspace);
        app.config.workspace = workspace;
        try {
            await vscode.window.withProgress({
                cancellable: false,
                location: vscode.ProgressLocation.Notification,
                title: getMessage("M_TP_COPY")
            }, async (progress, token) => {
                let last = Date.now();
                await app.copyAppSources(source, workspace, (mark, come, name) => {
                    if (Date.now() - last > 200) {
                        last = Date.now();
                        progress.report({ increment: Math.round(come / mark * 80), message: ` (${name})` });
                    }
                });
                progress.report({ increment: 90 });
                await accessor.writeConfigApplication(app.config);
            });
            await this.refresh();
            return app;
        } catch (err) {
            throw err;
        }
    }

    async commandDeleteServer(element: ServerEntry): Promise<void> {
        const Yn = await vscode.window.showQuickPick(["Yes", "No"], {
            placeHolder: "Are you sure you want to delete the server?"
        });

        if (Yn === "Yes") {
            await this._deleteServer(element);
            await this.refresh(true);
            this.onServerChange.fire(undefined);
        }
        return void 0;
    }

    private async _deleteServer(element: ServerEntry): Promise<void> {
        const server = element.getServer();
        try {
            await accessor.rmAppFsSource(server.getId(), server.config.workspace!.path);
        } catch (e) {
            console.error(e);
        }
        await accessor.detachConfigApplication(server.getId());
    }


}
