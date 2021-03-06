import * as path from "path";

import { fsw, util, network, h } from "../core/supports";
import { IRunnable, AppTypes, Status, ApplicationCode } from "../core/application";
import { ConfigurationAccessor, accessor } from "../core/configuration";
import { OutputChannel, DebugConfiguration, debug, workspace, Uri } from "vscode";
import { ChildProcess } from "child_process";
import { getMessage } from "../messages";

export default class Tomcat extends ConfigurationAccessor implements IRunnable {

    protected readonly CONFIG_FILE_PATH = path.join("conf", "server.xml");
    private _process: ChildProcess | undefined;

    rootPath: string;
    type: AppTypes = AppTypes.TOMCAT;
    status: Status = Status.STOP;
    command: { maven: string, gradle: string };

    constructor(
        public readonly id: string,
        private readonly workspaceUri: Uri,
    ) {
        super({
            id,
            type: AppTypes[AppTypes.TOMCAT],
            name: "Tomcat",
            properties: [
                { key: "", value: "", type: "line" },
                { key: "port", value: "8080", type: "number", changeable: true },
                { key: "deploy", value: "true", type: "boolean", changeable: true },
                { key: "build", value: "true", type: "boolean", changeable: true },
                { key: "war_path", value: "target/*.war", type: "string", changeable: true },
                { key: "", value: "", type: "line" },
                { key: "AJP_PORT", value: "any", type: "number", changeable: false },
                { key: "REDIRECT_PORT", value: "any", type: "number", changeable: false },
                { key: "SHUTDOWN_PORT", value: "any", type: "number", changeable: false },
            ],
        });
        this.rootPath = workspaceUri.fsPath;
        this.command = { maven: "", gradle: "" };
    }

    async init(): Promise<void> {
        if (util.getOsType() === util.OsType.WINDOWS_NT) {
            this.command = {
                maven: "mvn",
                gradle: path.join(this.rootPath, "gradlew.bat"),
            };
        } else {
            this.command = {
                maven: "mvn",
                gradle: path.join(this.rootPath, "gradlew"),
            };
        }
        this.setVersion(await this.findVersion());
        if (!this.getName().endsWith(this.getVersion() || "")) {
            this.setName(this.getName() + "-" + this.getVersion());
        }
        return void 0;
    }

    getIconPath(asAbsolutePath: (relativePath: string) => string) {
        switch (this.status) {
            case Status.PREPARING: return {
                dark: asAbsolutePath(path.join("resources", "dark", "tomcat", "preparing.svg")),
                light: asAbsolutePath(path.join("resources", "light", "tomcat", "preparing.svg"))
            };
            case Status.RUNNING: return {
                dark: asAbsolutePath(path.join("resources", "dark", "tomcat", "running.svg")),
                light: asAbsolutePath(path.join("resources", "light", "tomcat", "running.svg"))
            };
            case Status.STOP:
            default: return {
                dark: asAbsolutePath(path.join("resources", "dark", "tomcat", "stop.svg")),
                light: asAbsolutePath(path.join("resources", "light", "tomcat", "stop.svg"))
            };
        }
    }

    async findVersion(): Promise<string> {
        const output: Array<string> = [];
        try {
            await util.executeChildProcess("java", { shell: true }, [
                `-classpath "${path.join(this.getAppPath(), "lib", "catalina.jar")}"`,
                `org.apache.catalina.util.ServerInfo`,
            ], output);
        } catch (e) {
            return Promise.reject(e);
        }

        const str = output.join("").split("\n").find(s => !!s.replace(/\s/gi, "").toLowerCase().match(/servernumber/));
        if (str) {
            return str.split(":")[1].split("\n")[0].replace(/\s*/, "");
        }
        return Promise.reject(new Error("Not found server version number"));
    }

    async packageByMaven(outputChannel?: OutputChannel): Promise<string> {
        let pomXml: string;
        try { pomXml = (await fsw.readfile(path.join(this.rootPath, "pom.xml"))).toString(); } catch (ignore) { return ""; }
        try {
            const output: Array<string> = [];

            if (pomXml.replace(/(\s)|(\>)/gi, "").toLowerCase().match(/packagingwar/)) {
                try {
                    await util.executeChildProcess(
                        this.command.maven,
                        { shell: true },
                        ["package", `--file="${this.rootPath}"`],
                        output, outputChannel);
                } catch (e) {
                    throw new h.ExtError("mvn", ApplicationCode.NotFoundDeployTool);
                }
                const findWarLine = output.join("").split("\n").find(line => !!line.match(/Building war/));
                if (!findWarLine) { throw new Error("Packaging Failed"); }

                const words = findWarLine.split(":");
                return path.normalize(words[words.length - 1].replace(/(^\s*)|(\s*$)/gi, ""));
            } else {
                throw new h.ExtError("Need war-package setting in 'pom.xml'", ApplicationCode.NotMatchConfDeploy);
            }
        } catch (e) {
            if (e instanceof h.ExtError) { throw e; }
            return "";
        }
    }

    async packageByGradle(outputChannel?: OutputChannel): Promise<string> {
        let buildGradle: string;
        try { buildGradle = (await fsw.readfile(path.join(this.rootPath, "build.gradle"))).toString(); } catch (ignore) { return ""; }
        try {
            if (buildGradle.replace(/(\')|(\")|(\s)/gi, "").toLowerCase().match(/applyplugin:war/)) {
                try {
                    await util.executeChildProcess(
                        this.command.gradle,
                        { shell: true },
                        ["build", `-b="${path.join(this.rootPath, "build.gradle")}"`],
                        [], outputChannel);
                } catch (e) {
                    throw new h.ExtError("gradle", ApplicationCode.NotFoundDeployTool);
                }
                return await fsw.findFilePath(path.join(this.rootPath), "*.war");
            } else {
                throw new h.ExtError("No war-plugin setting in 'build.gradle'", ApplicationCode.NotMatchConfDeploy);
            }
        } catch (e) {
            if (e instanceof h.ExtError) { throw e; }
            return "";
        }
    }

    async deploy(outputChannel?: OutputChannel): Promise<void> {
        const propDeploy = this.getProperty("deploy")
            , propBuild = this.getProperty("build");

        if (propDeploy !== undefined && propDeploy.value === "false") { return; }

        let war;
        if (propBuild !== undefined && propBuild.value === "true") {
            war = await this.packageByMaven(outputChannel);
            if (!war) { war = await this.packageByGradle(outputChannel); }
            if (war && outputChannel) {
                outputChannel.appendLine("");
                outputChannel.appendLine(getMessage("M_AP_BULD"));
            }
        }

        if (!war) { war = path.join(this.getProperty("war_path")!.value); }

        if (!(await fsw.readable(war))) {
            if (await fsw.readable(path.join(this.rootPath, "target"))) {
                const filename = (await fsw.readdir(path.join(this.rootPath, "target"))).find(n => n.endsWith(".war"));
                if (filename) {
                    war = path.join(this.rootPath, this.getProperty("war_path")!.value);

                } else {
                    throw new h.ExtError(ApplicationCode.NotFoundTargetDeploy);

                }
            }
        }
        if (!(await fsw.readable(war))) {
            throw new h.ExtError(ApplicationCode.NotFoundTargetDeploy);
        }

        await this.saveConfigProperties([{ key: "war_path", value: war, type: "string" }]);
        const webapps = path.join(this.getAppPath(), "webapps");
        await fsw.rmrf(webapps);
        await fsw.mkdir(webapps);
        await fsw.copyFile(war, path.join(webapps, "ROOT.war"));

        if (outputChannel) {
            outputChannel.appendLine("");
            outputChannel.appendLine(getMessage("M_AP_DPLY"));
            outputChannel.appendLine("");
        }

        return void 0;
    }

    async dispose(): Promise<void> {
    }

    private async _prepareTomcat(ports: Array<number>): Promise<void> {
        const serverxml = new ServerXmlAdapter(path.join(this.getAppPath(), this.CONFIG_FILE_PATH));
        await serverxml.load();
        serverxml.port = this.getProperty("port")!.value;
        serverxml.ajp_port = ports[0].toString();
        serverxml.redirect_port = ports[1].toString();
        serverxml.shutdown_port = ports[2].toString();
        await serverxml.save();

        await this.saveConfigProperties([
            { key: "SHUTDOWN_PORT", value: ports[2].toString(), type: "number" },
            { key: "AJP_PORT", value: ports[0].toString(), type: "number" },
            { key: "REDIRECT_PORT", value: ports[1].toString(), type: "number" }
        ], true);
    }

    async start(outputChannel: OutputChannel): Promise<void> {
        try {
            const ports = await network.getAvailablePorts(3);
            await this._prepareTomcat(ports);
        } catch (e) {
            console.error(e);
            return Promise.reject(e);
        }
        await this.execProcess(outputChannel);
    }

    getDebugSessionName(): string {
        return `debug_${this.getId()}`;
    }

    async debug(outputChannel: OutputChannel): Promise<void> {
        let ports;
        try {
            ports = await network.getAvailablePorts(4);
            await this._prepareTomcat(ports);
        } catch (e) {
            console.error(e);
            return Promise.reject(e);
        }

        await this.execProcess(outputChannel, ports[3]);

        const config: DebugConfiguration = {
            type: "java",
            name: this.getDebugSessionName(),
            request: "attach",
            hostName: "localhost",
            port: ports[3]
        };

        if (!await debug.startDebugging(workspace.getWorkspaceFolder(this.workspaceUri), config)) {
            throw new h.ExtError("Debugger for Java", ApplicationCode.RequiredInstallTools);
        }
    }

    private async execProcess(outputChannel: OutputChannel, debugPort?: number, stop?: boolean): Promise<void> {
        const args = [
            `-classpath "${path.join(this.getAppPath(), "bin", "bootstrap.jar")}${path.delimiter}${path.join(this.getAppPath(), "bin", "tomcat-juli.jar")}"`,
            `-Dcatalina.base="${this.getAppPath()}"`,
            `-Dcatalina.home="${this.getAppPath()}"`,
            `-Dfile.encoding=UTF8`,
            // `--illegal-access=warn`,
            // `--add-opens=java.base/java.lang=ALL-UNNAMED`,
            // `--add-opens=java.base/java.io=ALL-UNNAMED`,
            // `--add-opens=java.rmi/sun.rmi.transport=ALL-UNNAMED`,
        ];

        if (debugPort) {
            args.push(`-agentlib:jdwp=transport=dt_socket,suspend=n,server=y,address=localhost:${debugPort}`);
        }

        args.push(`org.apache.catalina.startup.Bootstrap ${util.getOsType() === util.OsType.WINDOWS_NT ? "" : "$@"}`);

        if (stop) { args.push("stop"); }

        this._process = await util.executeChildProcess("java", { shell: true }, args, [], outputChannel, true);
    }

    async stop(outputChannel: OutputChannel): Promise<void> {
        if (!this._process) { throw new h.ExtError(ApplicationCode.FatalFailure); }
        let trying = 0, succeed = false, err;

        await this.execProcess(outputChannel, undefined, true);
        while (!succeed) {
            try {
                if (await network.checkAvailablePort(this.getServicePort())) {
                    succeed = true;
                    if (outputChannel) {
                        outputChannel.appendLine("stopped server.");
                    }
                } else {
                    await util.setTimeoutPromise(() => { }, 3000);
                    if (trying++ > 4) {
                        this._process.kill();
                        return Promise.reject(new h.ExtError(ApplicationCode.FatalFailure));
                    }
                }
            } catch (e) {
                err = e;
                trying++;
                if (trying > 4) { return Promise.reject(err); }
                else { await util.setTimeoutPromise(() => { }, 3000); }
            }
        }
        Promise.resolve(void 0);
    }

    getStatus(): Status {
        return this.status;
    }

    getServicePort(): number {
        return parseInt(this.getProperty("port")!.value);
    }

    async validateSource(version?: string): Promise<boolean> {
        try {
            if (!(await fsw.readable(path.join(this.getAppPath(), "bin")))) { return false; }
            if (!(await fsw.readable(path.join(this.getAppPath(), "bin", "bootstrap.jar")))) { return false; }
            if (!(await fsw.readable(path.join(this.getAppPath(), "bin", "tomcat-juli.jar")))) { return false; }
            if (!(await fsw.readable(path.join(this.getAppPath(), "lib")))) { return false; }
        } catch (ignore) {
            console.error(ignore);
            return false;
        }
        return true;
    }

}

const xmlOptions = {
    ignoreAttributes: false,
    attributeNamePrefix: "_$_",
};


interface ConnectorXmlData {
    _$_port: string;
    _$_protocol: string;
    _$_connectionTimeout?: string;
    _$_redirectPort: string;
}

interface ServerXmlData {
    Server: {
        _$_port: string;
        _$_shutdown: string;
        Service: {
            Connector: ConnectorXmlData[];
        };
    };
}

class ServerXmlAdapter {
    private _data?: ServerXmlData;

    constructor(
        public readonly confPath: string
    ) {
    }

    async load(): Promise<void> {
        this._data = await accessor.readXmlFile<ServerXmlData>(this.confPath, xmlOptions);
    }

    async save(): Promise<void> {
        if (!this._data) { throw new h.ExtError(ApplicationCode.NotReady); }
        return await accessor.writeXmlFile<ServerXmlData>(this.confPath, this._data, xmlOptions);
    }

    get port(): string {
        if (!this._data) { throw new h.ExtError(ApplicationCode.NotReady); }
        const connector = this._data.Server.Service.Connector.find(c => c._$_protocol.startsWith("HTTP"));
        if (!connector) { throw new h.ExtError(ApplicationCode.InvalidInternalResource); }
        return connector._$_port;
    }

    set port(v: string) {
        if (!this._data) { throw new h.ExtError(ApplicationCode.NotReady); }
        const connector = this._data.Server.Service.Connector.find(c => c._$_protocol.startsWith("HTTP"));
        if (!connector) { throw new h.ExtError(ApplicationCode.InvalidInternalResource); }
        connector._$_port = v;
    }

    get ajp_port(): string {
        if (!this._data) { throw new h.ExtError(ApplicationCode.NotReady); }
        const connector = this._data.Server.Service.Connector.find(c => c._$_protocol.startsWith("AJP"));
        if (!connector) { throw new h.ExtError(ApplicationCode.InvalidInternalResource); }
        return connector._$_port;
    }

    set ajp_port(v: string) {
        if (!this._data) { throw new h.ExtError(ApplicationCode.NotReady); }
        const connector = this._data.Server.Service.Connector.find(c => c._$_protocol.startsWith("AJP"));
        if (!connector) { throw new h.ExtError(ApplicationCode.InvalidInternalResource); }
        connector._$_port = v;
    }

    get redirect_port(): string {
        if (!this._data) { throw new h.ExtError(ApplicationCode.NotReady); }
        const connector = this._data.Server.Service.Connector[0];
        if (!connector) { throw new h.ExtError(ApplicationCode.InvalidInternalResource); }
        return connector._$_redirectPort;
    }

    set redirect_port(v: string) {
        if (!this._data) { throw new h.ExtError(ApplicationCode.NotReady); }
        const connectors = this._data.Server.Service.Connector.filter(c => c._$_protocol.startsWith("AJP"));
        if (connectors.length === 0) { throw new h.ExtError(ApplicationCode.InvalidInternalResource); }
        for (let conn of connectors) {
            conn._$_redirectPort = v;
        }
    }

    get shutdown_port(): string {
        if (!this._data) { throw new h.ExtError(ApplicationCode.NotReady); }
        return this._data.Server._$_port;
    }

    set shutdown_port(v: string) {
        if (!this._data) { throw new h.ExtError(ApplicationCode.NotReady); }
        this._data.Server._$_port = v;
    }
}