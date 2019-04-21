import { Uri } from "vscode";
import path from "path";

import Tomcat from "../src/apps/Tomcat";

const demoPomProject = Uri.file(path.join(__dirname, "..", "..", "test", "demo", "sample-java-war-hello"));
const appTomcat8 = path.join(__dirname, "..", "..", "test", "apps", "apache-tomcat-8.5.28");

suite("apps.tomcat", function () {
    const tomcat = new Tomcat("test01", demoPomProject);
    tomcat.setConfig({
        id: "test01",
        name: "test",
        type: "TOMCAT",
        appPath: appTomcat8,
        properties: []
    });

    test("deploy", async function () {
        await tomcat.deploy();
    }).timeout(10000);
});