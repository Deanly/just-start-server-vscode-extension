import * as assert from "assert";
import * as path from "path";
import { fsw } from "../src/core/supports";
import * as here from "../src/core/configuration";

const tempPath = path.join(__dirname, "temp");
const srcPath = path.join(__dirname, "temp", "src");
const storagePath = path.join(__dirname, "temp", "config-test");

class TestIns extends here.ConfigurationAccessor {
    constructor() {
        super({
            id: "testInstance",
            type: "TEST_TYPE",
            name: "Hi",
            properties: [
                { key: "hello", value: "world", changeable: true },
            ]
        });
    }
}

suite("core.configuration", function () {

    try { fsw.mkdirSync(tempPath); } catch (ignore) { }
    try { fsw.rmrfSync(srcPath); } catch (ignore) { }
    try { fsw.mkdirSync(srcPath); } catch (ignore) { }
    try { fsw.rmrfSync(storagePath); } catch (ignore) { }
    try { fsw.mkdirSync(storagePath); } catch (ignore) { }

    here.accessor.initialize(storagePath);
    let ins: here.ConfigurationAccessor;

    test("Copy sources", async function () {
        try {
            await fsw.copydir(path.join(__dirname, "..", "src"), srcPath);
        } catch (e) {
            assert.ifError(e);
        }
    });

    test("Create app instance", function () {
        ins = new TestIns();
    });

    test("Add app-ins to config file", async function () {
        try {
            await ins.copyAppSources(srcPath);
            const configFile = await here.accessor.readConfigFile();
            assert.equal(configFile.count, 1);
        } catch (e) {
            assert.ifError(e);
        }
    });

    test("Update app-ins to config file", async function () {
        const otherStr = "UpdatedHi~";
        ins.config.name = otherStr;
        try {
            await ins.updateConfig();
            assert.notEqual(ins.config.name, otherStr);
        } catch (e) {
            assert.ifError(e);
        }
    });

    test("Save app-ins to config file", async function () {
        const otherStr = "Hello";
        ins.config.name = otherStr;
        try {
            await ins.saveConfig();
            await ins.updateConfig();
            assert.equal(ins.config.name, otherStr);
        } catch (e) {
            assert.ifError(e);
        }
    });

    test("Set changeable property to config file", async function () {
        try {
            await ins.saveConfigProperties([{
                key: "test",
                value: "123",
                changeable: true
            }, {
                key: "test",
                value: "567"
            }]);
            const prop = await ins.getProperty("test");
            if (!prop) { throw new Error("prop undefined"); }
            assert.equal(prop.value, "567");
        } catch (e) {
            assert.ifError(e);
        }
    });

    test("Try setting the unchangeable property in the config-file", async function () {
        try {
            await ins.saveConfigProperties([{
                key: "test2",
                value: "123",
                changeable: false
            }, {
                key: "test2",
                value: "456",
                changeable: true
            }]);
        } catch (e) {
            assert.ok(e);
            return;
        }
        throw new Error("No come here..");
    });

    test("Remove source", async function () {
        try {
            await here.accessor.rmAppFsSource(ins.getId());
        } catch (e) {
            assert.ifError(e);
        }
        try {
            await fsw.readdir(ins.getAppPath());
        } catch (e) {
            assert.ok(e);
            return;
        }
        throw new Error("No come here..");
    });

    let serverxml: any;
    test("Read Xml File To Object", async function () {
        try {
            serverxml = await here.accessor.readXmlFile<any>(path.join(tempPath, "..", "..", "..", "test", "resources", "server.xml"), {
                ignoreAttributes: false,
                attributeNamePrefix: "@_",
            });
        } catch (e) {
            assert.ifError(e);
        }
    });

    test("Write Xml File from Object", async function () {
        try {
            await here.accessor.writeXmlFile<any>(path.join(tempPath, "server.sample.xml"), serverxml, {
                ignoreAttributes: false,
                attributeNamePrefix: "@_",
            });
            const xml2 = await here.accessor.readXmlFile<any>(path.join(tempPath, "server.sample.xml"), {
                ignoreAttributes: false,
                attributeNamePrefix: "@_",
            });
            console.log(xml2);
            assert.deepEqual(xml2, serverxml);
        } catch (e) {
            assert.ifError(e);
        }
    });

    test("Search file", async function () {
        try {
            console.log("exists", await fsw.exists(path.join(tempPath, "*.xml")));
            console.log("readable", await fsw.readable(path.join(tempPath, "*.xml")));
            console.log("readir", await fsw.readdir(tempPath));
        } catch (e) {
            console.error(e);
        }
    });

});


import * as here2 from "../src/core/application";

suite("core.configuration dependent core.application", function () {

    test("Change application type", async function () {
        await here.accessor.detachConfigApplication("testInstance");
        const ins = new TestIns();
        ins.config.type = here2.AppTypes[here2.AppTypes.TOMCAT];
        ins.config.appPath = "/123";
        await ins.saveConfig();
    });

    test("Load applications from configuration", async function () {
        try {
            await here2.container.loadFromConfigurations();
            const apps = here2.container.getApplications();
            assert.ok(apps.some(a => a.getId() === "testInstance"));
        } catch (e) {
            assert.ifError(e);
        }
    });
});