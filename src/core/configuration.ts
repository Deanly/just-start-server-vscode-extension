import * as path from "path";
import * as xml from "fast-xml-parser";

import { fsw, h } from "./supports";

export interface ConfigProperty {
    key: string;
    value: string;
    type: string;
    changeable?: boolean;
    description?: string;
}

export interface Workspace {
    path: string;
    name: string;
}

export interface ConfigApplication {
    id: string;
    name: string;
    type: string;
    properties: ConfigProperty[];

    version?: string;
    workspace?: Workspace;
    oriPath?: string;
    appPath?: string;
}

interface ConfigFile {
    count: number;
    apps: ConfigApplication[];
}


export class ConfigurationAccessor {

    constructor (
        public readonly config: ConfigApplication,
    ) {
    }

    public getId () { return this.config.id; }
    public getName () { return this.config.name; }
    public getVersion () { return this.config.version; }
    public getType () { return this.config.type; }
    public getOriPath () { return this.config.oriPath; }
    public getAppPath () { return this.config.appPath!; }
    public getWorkspace () { return this.config.workspace; }
    public getProperties () { return this.config.properties; }
    public getProperty (key: string): ConfigProperty|undefined { return this.config.properties.find(p => p.key === key); }

    public setName (v: string) { this.config.name = v; }
    public setVersion (v: string) { this.config.version = v; }

    async copyAppSources (src: string, workspace: Workspace, progress?: (mark: number, come: number, name: string) => void): Promise<void> {
        this.config.oriPath = src;
        this.config.appPath = await accessor.copyAppFsSource(src, this.config.id, workspace.path, progress);
        await this.saveConfig();
        return void 0;
    }

    async updateConfig (): Promise<void> {
        const _config = await accessor.readConfigApplication(this.config.id);
        this.setConfig(_config);
        return void 0;
    }

    async saveConfig (): Promise<void> {
        if (!this.config.id || !this.config.type || !this.config.appPath || !this.config.workspace) { throw new h.ExtError(ConfigurationCode.ValidationFailed); }
        await accessor.writeConfigApplication(this.config);
        return void 0;
    }

    setConfig (config: ConfigApplication): void {
        this.config.name = config.name;
        this.config.type = config.type;
        this.config.properties = config.properties;
        this.config.version = config.version;
        this.config.workspace = config.workspace;
        this.config.oriPath = config.oriPath;
        this.config.appPath = config.appPath;
        return void 0;
    }

    async saveConfigProperties (property: Array<ConfigProperty>, forced?: boolean): Promise<ConfigApplication> {
        property.forEach(prop => {
            if (prop.changeable === undefined) { prop.changeable = true; }
        });
        const app = await accessor.appendConfigProperty(this.config.id, property, forced);
        await this.updateConfig();
        return app;
    }

}

export const ConfigurationCode = {
    NotFoundStoragePath: "E_CF_NFSP",
    NotInitialized: "E_CF_NIZD",
    NotFoundConfig: "E_CF_NFCF",
    WriteProtectedProperty:  "E_CF_WPPT",
    AlreadyExists:  "E_CF_ALEX",
    ValidationFailed:  "E_CF_VDFD",
    BrokenConfigFile:  "E_CF_BKCF",
};

export namespace accessor {
    const STORAGE_DIR_NAME = "extension-server-starter";
    const CONFIG_FILE_NAME = "config";
    let _storageRootPath: string;

    export async function initialize(storagePath: string) {
        if (!storagePath) { throw new h.ExtError(ConfigurationCode.NotFoundStoragePath); }

        _storageRootPath = path.join(storagePath, STORAGE_DIR_NAME);

        if (!(await fsw.exists(storagePath))) { await fsw.mkdir(storagePath); }
        if (!(await fsw.exists(_storageRootPath))) { await fsw.mkdir(_storageRootPath); }
        if (!(await fsw.exists(path.join(_storageRootPath, CONFIG_FILE_NAME)))) {
            await writeJsonFile<ConfigFile>(CONFIG_FILE_NAME, { count: 0, apps: [] });
        }
    }

    export async function reset() {
        await fsw.rmrf(_storageRootPath);
        await initialize(_storageRootPath.split(STORAGE_DIR_NAME)[0]);
        return void 0;
    }

    export async function writeJsonFile<T> (file: string, obj: T): Promise<void> {
        if (!_storageRootPath) { return Promise.reject(new h.ExtError(ConfigurationCode.NotInitialized)); }

        const exists = await fsw.exists(_storageRootPath);
        if (!exists) {
            await fsw.mkdir(path.dirname(_storageRootPath));
        }
        return fsw.writefile(path.join(_storageRootPath, file), Buffer.from(JSON.stringify(obj), "utf8"));
    }

    export async function readJsonFile<T> (file: string): Promise<T> {
        if (!_storageRootPath) { return Promise.reject(new h.ExtError(ConfigurationCode.NotInitialized)); }

        const buf = await fsw.readfile(path.join(_storageRootPath, file));
        const str = buf.toString("utf8");
        try {
            return JSON.parse(str);
        } catch (e) {
            console.error(e);
            throw new h.ExtError(ConfigurationCode.BrokenConfigFile);
        }
    }

    export async function readXmlFile<T> (file: string, options?: xml.X2jOptionsOptional): Promise<T> {
        const data = await fsw.readfile(file);
        const strXml = data.toString();
        if (xml.validate(strXml)) {
            return xml.parse(strXml, options);
        } else {
            throw new h.ExtError(ConfigurationCode.ValidationFailed);
        }
    }

    export async function writeXmlFile<T> (file: string, obj: T, options: xml.J2xOptionsOptional): Promise<void> {
        const parser = new xml.j2xParser(options);
        const strXml = parser.parse(obj);
        const buf = Buffer.from(strXml);
        await fsw.writefile(file, buf);
    }

    export async function copyAppFsSource (src: string, id: string, dest?: string, progress?: (mark: number, come: number, name: string) => void): Promise<string> {
        let appPath;
        if (dest) {
            appPath = path.join(dest, ".vscode", "ext_jss", "apps", id);
        } else {
            appPath = path.join(_storageRootPath, id);
        }
        const exists = await fsw.exists(appPath);
        if (!exists) {
            await fsw.mkdir(appPath);
        }

        await fsw.copydir(src, appPath, progress);
        return appPath;
    }

    export async function rmAppFsSource (id: string, target: string): Promise<void> {
        let appPath = path.join(target, ".vscode", "ext_jss", "apps", id);

        if (!await fsw.exists(appPath)) {
            appPath = path.join(_storageRootPath, id);
        }
        if (!await fsw.exists(appPath)) {
            throw new h.ExtError(ConfigurationCode.NotFoundConfig);
        }

        await fsw.rmrf(appPath);
    }

    export async function readConfigFile (): Promise<ConfigFile> {
        return readJsonFile<ConfigFile>(CONFIG_FILE_NAME);
    }

    export async function readConfigApplication (id: string): Promise<ConfigApplication> {
        const conf = await readJsonFile<ConfigFile>(CONFIG_FILE_NAME);
        const app = conf.apps.find(app => app.id === id);

        if (!app) { throw new h.ExtError(ConfigurationCode.NotFoundConfig); }
        else { return app; }
    }

    export async function writeConfigApplication (confApps: Array<ConfigApplication>|ConfigApplication): Promise<void> {
        if (!(confApps instanceof Array)) { confApps = [confApps]; }
        const conf = await readJsonFile<ConfigFile>(CONFIG_FILE_NAME);

        let app;
        confApps.forEach(confApp => {
            app = conf.apps.find(app => app.id === confApp.id);

            if (app) {
                app.name = confApp.name;
                app.oriPath = confApp.oriPath;
                app.appPath = confApp.appPath;
                app.workspace = confApp.workspace;
                app.properties = confApp.properties;
            } else {
                conf.count += 1;
                conf.apps.push(confApp);
            }
        });

        return writeJsonFile(CONFIG_FILE_NAME, conf);
    }

    export async function appendConfigProperty (id: string, properties: Array<ConfigProperty>|ConfigProperty, forced?: boolean): Promise<ConfigApplication> {
        const conf = await readJsonFile<ConfigFile>(CONFIG_FILE_NAME);
        const app = conf.apps.find(app => app.id === id);

        if (!app) { throw new h.ExtError(ConfigurationCode.NotFoundConfig); }

        if (properties instanceof Array) {
            properties.forEach(property => _appendConfigProperty(app, property, forced));
        } else {
            _appendConfigProperty(app, properties, forced);
        }

        await writeJsonFile<ConfigFile>(CONFIG_FILE_NAME, conf);
        return app;
    }

    function _appendConfigProperty (app: ConfigApplication, property: ConfigProperty, forced?: boolean) {
        let _prop = app.properties.find(p => p.key === property.key);
        if (!_prop) {
            _prop = { ...property };
            app.properties.push(_prop);
        }
        if (!forced && !_prop.changeable) { throw new h.ExtError(ConfigurationCode.WriteProtectedProperty); }

        _prop.value = property.value;
    }


    export async function detachConfigApplication (id: string): Promise<void> {
        const conf = await readJsonFile<ConfigFile>(CONFIG_FILE_NAME);
        if (!conf.apps.some(app => app.id === id)) { throw new h.ExtError(ConfigurationCode.NotFoundConfig); }

        conf.count -= 1;
        conf.apps.splice(conf.apps.map(a => a.id).indexOf(id), 1);
        await writeJsonFile<ConfigFile>(CONFIG_FILE_NAME, conf);
        return void 0;
    }

}