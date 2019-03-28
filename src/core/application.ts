"use strict";

import { ConfigurationAccessor, accessor, ConfigApplication } from "./configuration";

import Tomcat from "../apps/Tomcat";
import SpringBoot from "../apps/SpringBoot";
import { OutputChannel, WorkspaceFolder } from "vscode";
import { getMessage } from "../messages";

/**
 * This Enum represents the type of application.
 * Normally, you can not change the value once set.
 */
export enum AppTypes {
    TOMCAT = "TOMCAT",
    SPRING_BOOT = "SPRING_BOOT",
}

export function findClassModule(type: AppTypes) {
    switch (type) {
        case AppTypes.TOMCAT: return Tomcat;
        case AppTypes.SPRING_BOOT: return SpringBoot;
        default: throw ApplicationError.NoValidAppType;
    }
}

/**
 * This enum represents the state of the application.
 * The string value of Enum is used in "view/item/context" in the packge.json file.
 */
export enum Status {
    RUNNING = "running",
    PREPARING = "preparing",
    STOP = "stop",
}

/**
 * IRunnable interface for application define.
 */
export interface IRunnable {
    init(): Promise<void>;

    deploy(): Promise<void>;
    dispose(): Promise<void>;
    start(outputChannel: OutputChannel): Promise<void>;
    stop(outputChannel: OutputChannel): Promise<void>;
    debug(outputChannel: OutputChannel): Promise<void>;
    validateSource?(version?: string): Promise<boolean>;

    findVersion(): Promise<string>;

    getId(): string;
    getName(): string;
    getAppPath(): string;
    getStatus(): Status;
    getServicePort(): number;
    getIconPath?(asAbsolutePath: (relativePath: string) => string): { dark: string, light: string } | string;

    type: AppTypes;
    status: Status;
}

export async function validateExecutableApplication(type: AppTypes, path: string, version?: string) {
    const App: any = findClassModule(type);
    const app = new App("xx", container.getAppWorkspace()) as (IRunnable & ConfigurationAccessor);
    app.config.appPath = path;
    if (app.validateSource) {
        return await app.validateSource(version);
    }
    return true;
}

export class ApplicationError extends Error {
    constructor(
        public readonly msg: string,
        public readonly code?: string
    ) {
        super(msg);
    }

    toString() {
        if (this.code) {
            return getMessage(this.code);
        } else {
            return this.msg;
        }
    }

    public static FatalFailure = new ApplicationError("Fatal Failure..", "E_AP_FAIL");
    public static NotReady = new ApplicationError("Not ready application", "E_AP_NTRY");
    public static NotFound = new ApplicationError("Not found", "E_AP_NTFN");
    public static NotFoundTargetDeploy = new ApplicationError("Not found targeting Deployment", "E_AP_NFTD");
    public static NotFoundWorkspace = new ApplicationError("Not found workspace", "E_AP_NFWS");
    public static NoValidAppType = new ApplicationError("Validation failed", "E_AP_NVAT");
    public static NotAvailablePort = new ApplicationError("Already exists application", "E_AP_NAVP");
    public static InaccessibleResources = new ApplicationError("Inaccessible resources", "E_AP_IACR");
    public static InvalidInternalResource = new ApplicationError("Invalid internal resource", "E_AP_IVIR");
}

export namespace container {
    let workspace: WorkspaceFolder;
    const _cache: (IRunnable & ConfigurationAccessor)[] = [];

    export function initialize(_workspace: WorkspaceFolder): void {
        workspace = _workspace;
    }

    export function getAppWorkspace() {
        return workspace;
    }

    export function reset() {
        _cache.length = 0;
    }

    export async function createApplication(type: AppTypes, id?: string): Promise<IRunnable & ConfigurationAccessor> {
        if (!workspace) { throw ApplicationError.NotFoundWorkspace; }
        id = id || "App" + Date.now();
        const App: any = findClassModule(type);
        return new App(id, workspace);
    }

    export async function loadFromConfigurations(exactly?: boolean): Promise<void> {
        const config = await accessor.readConfigFile();
        if (exactly) { _cache.length = 0; }

        if (config.apps.some(app => !app.appPath)) {
            await config.apps.forEach(async (app, i) => {
                if (!app.appPath) {
                    await accessor.detachConfigApplication(app.id);
                    (config.apps as any)[i] = null;
                }
            });
        }
        const appConfigs = config.apps
            .filter(app => app !== null)
            .filter(app => !_cache.some(loaded => loaded.getId() === app.id));

        const apps: Array<IRunnable & ConfigurationAccessor> = [];
        let tempConf;
        for (tempConf of appConfigs) {
            apps.push(await _initializeApplication(tempConf));
        }

        await accessor.writeConfigApplication(apps.map(app => app.config));
        setAppsToContainer(apps);
        return void 0;
    }

    async function _initializeApplication(config: ConfigApplication): Promise<IRunnable & ConfigurationAccessor> {
        const app = await createApplication(AppTypes[config.type as AppTypes], config.id);
        const pure = [...app.getProperties()];
        app.setConfig(config);

        const prev = config.properties;
        app.config.properties = pure.map(p => prev.some(pv => pv.key === p.key && !!pv.changeable) ? prev.find(pv => pv.key === p.key)! : p);
        await app.init();

        return app;
    }

    export function setAppsToContainer(apps: Array<IRunnable & ConfigurationAccessor>): Array<IRunnable> {
        let temp;
        apps.forEach(app => {
            if (_cache.some(_a => _a.getId() === app.getId())) {
                temp = <IRunnable & ConfigurationAccessor>_cache.find(_a => _a.getId() === app.getId());
                temp.setConfig(app.config);
                // temp.init();
            } else {
                _cache.push(app);
            }
        });
        return _cache;
    }

    export function getApplication(id: string): undefined | (IRunnable & ConfigurationAccessor) {
        return _cache.find(_a => _a.getId() === id);
    }

    export function getApplications(): (IRunnable & ConfigurationAccessor)[] {
        return _cache;
    }

}