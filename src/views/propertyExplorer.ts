import * as vscode from "vscode";
import { ConfigProperty, ConfigurationAccessor } from "../core/configuration";
import { ServerEntry } from "./serverExplorer";

export class PropertyEntry extends vscode.TreeItem {

    constructor (
        protected readonly context: vscode.ExtensionContext,
        protected readonly onDidChangeTreeData: vscode.EventEmitter<PropertyEntry|null|undefined>,
        protected readonly property: ConfigProperty,
        protected readonly accessor: ConfigurationAccessor|null,
        public readonly options?: { readonly redrawEmitter: vscode.EventEmitter<ServerEntry|null|undefined>, isTitle?: boolean }, 
        public readonly collapsibleState?: vscode.TreeItemCollapsibleState,
    ) {
        super(property.key);
    }

    get label () {
        return `${this.property.key}${this.property.value === "" ? "" : ": " + this.property.value}`;
    }

    set label (ignore) { }

    get contextValue () {
        return this.property.changeable ? "edit" : "no";
    }

    public async changeValue () {
        if (this.accessor === null) { return; }
        let prompt = this.property.key;
        if (this.options && this.options.isTitle) {
            prompt = "Server Name";
            const value = await vscode.window.showInputBox({ prompt, value: this.property.key });
            if (value) {
                this.accessor.setName(value);
                await this.accessor.saveConfig();
                this.property.key = value;
                this.onDidChangeTreeData.fire(this);
                this.options.redrawEmitter.fire();
            }

        } else {
            const value = await vscode.window.showInputBox({ prompt, value: this.property.value });
            if (value) {
                this.property.value = value;
                await this.accessor.saveConfigProperties([this.property]);
                this.onDidChangeTreeData.fire(this);
            }
        }
    }

}

export class PropertyTreeDataProvider implements vscode.TreeDataProvider<PropertyEntry> {

    private _properties: PropertyEntry[] = [];

    private _onDidChangeTreeData: vscode.EventEmitter<PropertyEntry|null|undefined> = new vscode.EventEmitter();
    readonly onDidChangeTreeData: vscode.Event<PropertyEntry|null|undefined> = this._onDidChangeTreeData.event;

    constructor (
        private readonly context: vscode.ExtensionContext,
        onDidServerChange: vscode.Event<ServerEntry|null|undefined>,
    ) {
        onDidServerChange(this._onServerChange.bind(this));
    }

    private _onServerChange (element: ServerEntry|null|undefined) {
        if (element instanceof ServerEntry) {
            this.fetchProperties(element.properties, element.getServer());
            this._properties
                .unshift(
                    new PropertyEntry(
                        this.context,
                        this._onDidChangeTreeData,
                        { key: element.label!, value: "", changeable: true },
                        element.getServer(),
                        { isTitle: true, redrawEmitter: element.onDidChangeTreeData }
                    )
                );
            this.refresh();
        } else {
            this._properties = [];
            this.refresh();
        }
    }

    private fetchProperties (config: ConfigProperty[], accessor: ConfigurationAccessor) {
        this._properties = config
            .map(conf =>
                new PropertyEntry(
                    this.context,
                    this._onDidChangeTreeData,
                    conf,
                    accessor
                )
            );
    }

    getTreeItem (element: PropertyEntry): vscode.TreeItem|Thenable<vscode.TreeItem> {
        return element;
    }

    getChildren (element?: PropertyEntry|undefined): vscode.ProviderResult<PropertyEntry[]> {
        return this._properties;
    }

    refresh () {
        this._onDidChangeTreeData.fire();
    }
}