import { Uri } from "vscode";
import path from "path";

import Tomcat from "../src/apps/Tomcat";

const demoPomProject1 = Uri.file(path.join(__dirname, "..", "..", "test", "demo", "demo-maven-war-01"));
const demoGradleProject1 = Uri.file(path.join(__dirname, "..", "..", "test", "demo", "demo-gradle-war-01"));
const demoGradleProject2 = Uri.file(path.join(__dirname, "..", "..", "test", "demo", "demo-gradle-war-02"));

const appTomcat8 = path.join(__dirname, "..", "..", "test", "apps", "apache-tomcat-8.5.28");

suite("apps.tomcat", function () {

    test("deploy maven war 01", async function () {
        const tomcat = new Tomcat("test01", demoPomProject1);
        tomcat.setConfig({
            id: "test01",
            name: "test",
            type: "TOMCAT",
            appPath: appTomcat8,
            properties: []
        });
        await tomcat.init();
        await tomcat.saveConfig();
        await tomcat.deploy();
    }).timeout(10000);

    test("deploy gradle war 01", async function () {
        const tomcat = new Tomcat("test01", demoGradleProject1);
        tomcat.setConfig({
            id: "test01",
            name: "test",
            type: "TOMCAT",
            appPath: appTomcat8,
            properties: []
        });

        await tomcat.init();
        await tomcat.saveConfig();
        await tomcat.deploy();
    }).timeout(20000);

    test("deploy gradle war 02", async function () {
        const tomcat = new Tomcat("test01", demoGradleProject2);
        tomcat.setConfig({
            id: "test01",
            name: "test",
            type: "TOMCAT",
            appPath: appTomcat8,
            properties: []
        });

        await tomcat.init();
        await tomcat.saveConfig();
        await tomcat.deploy();
    }).timeout(20000);
});