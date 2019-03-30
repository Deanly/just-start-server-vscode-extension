import * as vscode from "vscode";
import * as path from "path";

import { util, network } from "../core/supports";
import { container, IRunnable, AppTypes, Status, ApplicationError } from "../core/application";
import { accessor, ConfigurationAccessor } from "../core/configuration";

import { multiStepInput } from "./serverPicker";

export class ServerEntry extends vscode.TreeItem {

    public busy = false;
    public outputChannel: vscode.OutputChannel;

    constructor (
        protected readonly context: vscode.ExtensionContext,
        protected readonly server: ConfigurationAccessor&IRunnable,
        public readonly onDidChangeTreeData: vscode.EventEmitter<ServerEntry| null | undefined>,
        public readonly collapsibleState?: vscode.TreeItemCollapsibleState,
    ) {
        super(server.getName());
        this.outputChannel = vscode.window.createOutputChannel(`${server.getName()}`);
    }

    dispose () {
        this.outputChannel.dispose();
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

    get iconPath () {
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

    get contextValue (): string {
        return this.server.getStatus();
    }

    get properties () {
        return this.server.getProperties();
    }

    getServer () {
        return this.server;
    }

    redraw (): void {
        this.onDidChangeTreeData.fire(this);
    }

    async runEntry (isDebug: boolean): Promise<void> {
        const prevStatus = this.server.status;
        try {
            if (!(await network.checkAvailablePort(this.server.getServicePort()))) { throw ApplicationError.NotAvailablePort; }
            if (this.busy) { return; }
            this.busy = true;
            this.server.status = Status.PREPARING;
            this.redraw();
            await this.server.deploy();
            await util.setTimeoutPromise(() => {}, 2000);
            this.outputChannel.clear();
            if (isDebug) {
                await this.server.debug(this.outputChannel);
            } else {
                await this.server.start(this.outputChannel);
            }
            await util.setTimeoutPromise(() => {}, 3000);
            this.server.status = Status.RUNNING;
        } catch (e) {
            this.busy = false;
            this.server.status = prevStatus;
            throw e;
        }
        this.redraw();
        this.busy = false;
    }

    async stopEntry (): Promise<void> {
        if (this.busy) { return; }
        this.busy = true;
        const prevStatus = this.server.status;
        try {
            this.server.status = Status.PREPARING;
            this.redraw();
            await this.server.stop(this.outputChannel);
            await util.setTimeoutPromise(() => {}, 1000);
            this.server.status = Status.STOP;
        } catch (e) {
            this.busy = false;
            this.server.status = prevStatus;
            throw e;
        }

        this.redraw();
        this.busy = false;
    }

    command = {
        title: "Select",
        command: "serverExplorer.selectEntry",
        arguments: [this]
    };

}

export class ServerTreeDataProvider implements vscode.TreeDataProvider<ServerEntry> {

    private _onDidChangeTreeData: vscode.EventEmitter<ServerEntry| null | undefined> = new vscode.EventEmitter();
    readonly onDidChangeTreeData: vscode.Event<ServerEntry| null | undefined> = this._onDidChangeTreeData.event;

    constructor (
        private readonly context: vscode.ExtensionContext,
        private readonly onServerChange: vscode.EventEmitter<ServerEntry|null|undefined>,
    ) {
    }

    selectTreeItem (element?: ServerEntry): void {
        this.onServerChange.fire(element);
        if (element) {
            element.outputChannel.show();
        }
    }

    async refresh (exactly?: boolean): Promise<void> {
        await container.loadFromConfigurations(exactly);
        this._onDidChangeTreeData.fire();
        return void 0;
    }

    getTreeItem (element: ServerEntry): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    getChildren (element?: ServerEntry): vscode.ProviderResult<ServerEntry[]> {
        const apps = container.getApplications();
        return Promise.resolve(apps.map(s => new ServerEntry(this.context, s, this._onDidChangeTreeData)));
    }

    async commandAddTreeItem (): Promise<void> {
        const state = await multiStepInput(this.context);
        const srcPath =  state.selectedAppSource.sourcePath;
        if (!state.valid || !srcPath) {
            vscode.window.showErrorMessage("Application service creation failed");
            return;
        }

        await this._createAndRegisterApp(srcPath, state.selectedAppSource.type);
        return void 0;
    }

    private async _createAndRegisterApp (source: string, type: AppTypes): Promise<IRunnable> {
        const app = await container.createApplication(type);
        try {
            await app.copyAppSources(source);
            await accessor.writeConfigApplication(app.config);
            await this.refresh();
            return app;
        } catch (err) {
            vscode.window.showErrorMessage(err);
            throw err;
        }
    }

    async commandDeleteServer (element: ServerEntry): Promise<void> {
        const Yn = await vscode.window.showQuickPick(["Yes", "No"], {
            placeHolder: "Are you sure you want to delete the server?"
        });

        if (Yn === "Yes") {
            const server = element.getServer();
            await accessor.rmAppFsSource(server.getId());
            await accessor.detachConfigApplication(server.getId());
            await this.refresh(true);
            this.onServerChange.fire(undefined);
        }
        return void 0;
    }


}
