import * as assert from "assert";
import * as here from "../src/core/application";
import { ConfigurationAccessor } from "../src/core/configuration";


class Test extends ConfigurationAccessor implements here.IRunnable {
    async init(): Promise<void> {
    }
    async findVersion() {
        return "";
    }
    async deploy(): Promise<void> {
    }
    async dispose(): Promise<void> {
    }
    async start(): Promise<void> {
    }
    async stop(): Promise<void> {
    }
    async debug(): Promise<void> {
    }
    getId(): string {
        return this.config.id;
    }
    getName(): string {
        return this.config.name;
    }
    getAppPath(): string {
        return "testInsAppPath";
    }
    getIconPath(): string {
        return "testInsIconPath";
    }
    getStatus (): here.Status {
        return here.Status.STOP;
    }
    status = here.Status.STOP;

    getServicePort (): number {
        return parseInt(this.getProperty("port")!.value);
    }

    getDebugSessionName(): string {
        return "testdebugsession";
    }

    constructor (
        public readonly type: here.AppTypes
    ) {
        super({
            id: "testIns",
            name: "testInsName",
            type: "test",
            properties: []
        });
    }
}


suite("core.application", function () {

    let testIns;

    test("Create instance", function () {
        testIns = new Test(here.AppTypes.TOMCAT);
    });

    test("Add Application to cache", function () {
        testIns = new Test(here.AppTypes.TOMCAT);
        const before = here.container.getApplications().length;
        here.container.setAppsToContainer([testIns]);
        const after = here.container.getApplications().length;
        assert.notEqual(before, after);
    });

    test("Add Duplicated App to cache", function () {
        const tempTestIns = new Test(here.AppTypes.TOMCAT);
        const before = here.container.getApplications().length;
        here.container.setAppsToContainer([tempTestIns]);
        const after = here.container.getApplications().length;
        assert.equal(before, after);
    });


});