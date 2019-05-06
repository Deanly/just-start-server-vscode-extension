import { IRunnable, AppTypes, Status } from "../core/application";
import { ConfigurationAccessor } from "../core/configuration";
import { Uri } from "vscode";

export default class SpringBoot extends ConfigurationAccessor implements IRunnable {
    countOfAvailablePorts = 1;
    type: AppTypes = AppTypes.SPRING_BOOT;
    status: Status = Status.STOP;

    constructor (
        public readonly id: string,
        public readonly workspaceUri: Uri,
    ) {
        super({
            id,
            type: AppTypes[AppTypes.SPRING_BOOT],
            name: "SpringBoot",
            properties: [
                { key: "hi", value: "test", changeable: true },
            ],
        });
    }

    async init(): Promise<void> {
    }
    async findVersion() {
        return "";
    }
    async deploy (): Promise<void> {
        this.status = Status.STOP;
    }
    async dispose (): Promise<void> {
        throw new Error("Method not implemented.");
    }
    async start (): Promise<void> {
        this.status = Status.RUNNING;
        return void 0;
    }
    async stop (): Promise<void> {
        this.status = Status.STOP;
        return void 0;
    }
    async debug (): Promise<void> {
        throw new Error("Method not implemented.");
    }

    getDebugSessionName(): string {
        return `debug_${this.getName()}`;
    }
    getStatus (): Status {
        return this.status;
    }
    getServicePort (): number {
        return parseInt(this.getProperty("port")!.value);
    }

}