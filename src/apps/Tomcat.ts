import * as path from "path";

import { fsw, util, network }  from "../core/supports";
import { IRunnable, AppTypes, Status, ApplicationError } from "../core/application";
import { ConfigurationAccessor, accessor } from "../core/configuration";
import { OutputChannel } from "vscode";
import { ChildProcess } from "child_process";

export default class Tomcat extends ConfigurationAccessor implements IRunnable {
    static readonly countOfAvailablePorts = 3;

    protected readonly CONFIG_FILE_PATH = path.join("conf", "server.xml");
    private _process: ChildProcess|undefined;

    type: AppTypes = AppTypes.TOMCAT;
    status: Status = Status.STOP;
    command: { start: string, stop: string, version: string };

    constructor (
        public readonly id: string,
        private readonly rootPath: string,
    ) {
        super({
            id,
            type: AppTypes[AppTypes.TOMCAT],
            name: "Tomcat",
            properties: [
                { key: "port", value: "8080", changeable: true },
                { key: "war_path", value: "target/*.war", changeable: true },
                { key: "AJP_PORT", value: "any", changeable: false },
                { key: "REDIRECT_PORT", value: "any", changeable: false },
                { key: "SHUTDOWN_PORT", value: "any", changeable: false },
            ]
        });
        this.command = { start: "", stop: "", version: "" };
    }

    async init (): Promise<void> {
        if (util.getOsType() === util.OsType.WINDOWS_NT) {
            this.command = {
                start: path.join(this.getAppPath(), "bin", "startup.bat"),
                stop: path.join(this.getAppPath(), "bin", "shutdown.bat"),
                version: path.join(this.getAppPath(), "bin", "version.bat"),
            };
        } else {
            this.command = {
                start: path.join(this.getAppPath(), "bin", "startup.sh"),
                stop: path.join(this.getAppPath(), "bin", "shutdown.sh"),
                version: path.join(this.getAppPath(), "bin", "version.sh"),
            };
        }
        this.setVersion(await this.findVersion());
        if (!this.getName().endsWith(this.getVersion() || "")) {
            this.setName(this.getName() + "-" + this.getVersion());
        }
        return void 0;
    }

    getIconPath (asAbsolutePath: (relativePath: string) => string) {
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

    async findVersion (): Promise<string> {
        const output: Array<string> = [];
        await util.executeChildProcess(this.command.version, { shell: true }, [], output);

        const str = output.find(s => s.search("Server number:") > -1);
        if (str) {
            return str.split("Server number:")[1].split("\n")[0].replace(/\s/g, "");
        }
        return Promise.reject(new Error("Not found server version number"));
    }

    async deploy (): Promise<void> {
        let war = path.join(this.rootPath, this.getProperty("war_path")!.value);
        if (!(await fsw.readable(war))) {
            if (await fsw.readable(path.join(this.rootPath, "target"))) {
                const filename = (await fsw.readdir(path.join(this.rootPath, "target"))).find(n => n.endsWith(".war"));
                if (filename) {
                    await this.saveConfigProperties([{ key: "war_path", value: path.join("target", filename) }]);
                    war = path.join(this.rootPath, this.getProperty("war_path")!.value);
                } else {
                    throw ApplicationError.NotFoundTargetDeploy;
                }
            }
        }

        const webapps = path.join(this.getAppPath(), "webapps");
        await fsw.rmrf(webapps);
        await fsw.mkdir(webapps);
        await fsw.copyFile(war, path.join(webapps, "ROOT.war"));

        return void 0;
    }

    async dispose (): Promise<void> {
        await this.stop();
    }

    async start (outputChannel: OutputChannel): Promise<void> {
        // if (await !fsw.readable(this.command.start)) { throw ApplicationError.InaccessibleResources(); }
        try {
            const ports = await network.getAvailablePorts(3);
            const serverxml = new ServerXmlAdapter(path.join(this.getAppPath(), this.CONFIG_FILE_PATH));
            await serverxml.load();
            serverxml.port = this.getProperty("port")!.value;
            serverxml.ajp_port = ports[0].toString();
            serverxml.redirect_port = ports[1].toString();
            serverxml.shutdown_port = ports[2].toString();
            await serverxml.save();

            await this.saveConfigProperties([
                { key: "SHUTDOWN_PORT", value: ports[2].toString() },
                { key: "AJP_PORT", value: ports[0].toString() },
                { key: "REDIRECT_PORT", value: ports[1].toString() }
            ], true);
        } catch (e) {
            console.error(e);
            return Promise.reject(e);
        }
        await this.execProcess(outputChannel);
    }

    async stop (outputChannel?: OutputChannel): Promise<void> {
        // if (await !fsw.readable(this.command.stop)) { throw ApplicationError.InaccessibleResources(); }
        if (!this._process) { throw new Error("에러처리"); }
        let trying = 0, succeed = false, err;
        while (!succeed) {
            try {
                this._process.kill();
                if (this._process.killed) {
                    succeed = true;
                    if (outputChannel) {
                        outputChannel.appendLine("stopped server.");
                    }
                }
            } catch (e) {
                err = e;
                console.log("error", trying++);
                if (trying > 4) { return Promise.reject(err); }
                else { await util.setTimeoutPromise(() => {}, 3000); }
            }
        }
        Promise.resolve(void 0);
    }

    async debug (outputChannel: OutputChannel): Promise<void> {
        let ports;
        try {
            ports = await network.getAvailablePorts(4);
            const serverxml = new ServerXmlAdapter(path.join(this.getAppPath(), this.CONFIG_FILE_PATH));
            await serverxml.load();
            serverxml.port = this.getProperty("port")!.value;
            serverxml.ajp_port = ports[0].toString();
            serverxml.redirect_port = ports[1].toString();
            serverxml.shutdown_port = ports[2].toString();
            await serverxml.save();

            await this.saveConfigProperties([
                { key: "SHUTDOWN_PORT", value: ports[2].toString() },
                { key: "AJP_PORT", value: ports[0].toString() },
                { key: "REDIRECT_PORT", value: ports[1].toString() }
            ], true);
        } catch (e) {
            console.error(e);
            return Promise.reject(e);
        }
        await this.execProcess(outputChannel, ports[3]);
    }

    async execProcess (outputChannel: OutputChannel, debugPort?: number): Promise<void> {
        const args = [
            `-classpath "${path.join(this.getAppPath(), "bin", "bootstrap.jar")}${path.delimiter}${path.join(this.getAppPath(), "bin", "tomcat-juli.jar")}"`,
            `-Dcatalina.base="${this.getAppPath()}"`,
            `-Dcatalina.home="${this.getAppPath()}"`,
            `-Dfile.encoding=UTF8`,
            // `--illegal-access=warn`,
            `--add-opens=java.base/java.lang=ALL-UNNAMED`,
            `--add-opens=java.base/java.io=ALL-UNNAMED`,
            `--add-opens=java.rmi/sun.rmi.transport=ALL-UNNAMED`,
        ];

        if (debugPort) {
            args.push(`-agentlib:jdwp=transport=dt_socket,suspend=n,server=y,address=localhost:${debugPort}`);
        }

        args.push("org.apache.catalina.startup.Bootstrap \"$@\"");

        this._process = await util.executeChildProcess("java", { shell: true }, args, [], outputChannel);
    }

    getStatus (): Status {
        return this.status;
    }

    getServicePort (): number {
        return parseInt(this.getProperty("port")!.value);
    }

    async validateSource (version?: string): Promise<boolean> {
        try {
            if (!(await fsw.readable(path.join(this.getAppPath(), "bin")))) { return false; }
            if (!(await fsw.readable(path.join(this.getAppPath(), "bin", "bootstrap.jar")))) { return false; }
            if (!(await fsw.readable(path.join(this.getAppPath(), "bin", "tomcat-juli.jar")))) { return false; }
            if (!(await fsw.readable(path.join(this.getAppPath(), "lib")))) { return false; }
        } catch (ignore) {
            console.log("debug", "validateSource", ignore);
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

    constructor (
        public readonly confPath: string
    ) {
    }

    async load (): Promise<void> {
        this._data = await accessor.readXmlFile<ServerXmlData>(this.confPath, xmlOptions);
    }

    async save (): Promise<void> {
        if (!this._data) { throw ApplicationError.NotReady; }
        return await accessor.writeXmlFile<ServerXmlData>(this.confPath, this._data, xmlOptions);
    }

    get port (): string {
        if (!this._data) { throw ApplicationError.NotReady; }
        const connector = this._data.Server.Service.Connector.find(c => c._$_protocol.startsWith("HTTP"));
        if (!connector) { throw ApplicationError.InvalidInternalResource; }
        return connector._$_port;
    }

    set port (v: string) {
        if (!this._data) { throw ApplicationError.NotReady; }
        const connector = this._data.Server.Service.Connector.find(c => c._$_protocol.startsWith("HTTP"));
        if (!connector) { throw ApplicationError.InvalidInternalResource; }
        connector._$_port = v;
    }

    get ajp_port (): string {
        if (!this._data) { throw ApplicationError.NotReady; }
        const connector = this._data.Server.Service.Connector.find(c => c._$_protocol.startsWith("AJP"));
        if (!connector) { throw ApplicationError.InvalidInternalResource; }
        return connector._$_port;
    }

    set ajp_port (v: string) {
        if (!this._data) { throw ApplicationError.NotReady; }
        const connector = this._data.Server.Service.Connector.find(c => c._$_protocol.startsWith("AJP"));
        if (!connector) { throw ApplicationError.InvalidInternalResource; }
        connector._$_port = v;
    }

    get redirect_port (): string {
        if (!this._data) { throw ApplicationError.NotReady; }
        const connector = this._data.Server.Service.Connector[0];
        if (!connector) { throw ApplicationError.InvalidInternalResource; }
        return connector._$_redirectPort;
    }

    set redirect_port (v: string) {
        if (!this._data) { throw ApplicationError.NotReady; }
        const connectors = this._data.Server.Service.Connector.filter(c => c._$_protocol.startsWith("AJP"));
        if (connectors.length === 0) { throw ApplicationError.InvalidInternalResource; }
        for (let conn of connectors) {
            conn._$_redirectPort = v;
        }
    }

    get shutdown_port (): string {
        if (!this._data) { throw ApplicationError.NotReady; }
        return this._data.Server._$_port;
    }

    set shutdown_port (v: string) {
        if (!this._data) { throw ApplicationError.NotReady; }
        this._data.Server._$_port = v;
    }
}