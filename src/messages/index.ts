import en = require("./en.json");
import ko = require("./ko.json");

import { env } from "vscode";

function pickup(code: string): string {
    switch (env.language.substring(0, 2)) {
        case "ko": return (<any>ko)[code];
        default: return (<any>en)[code];
    }
}

export function getMessage(code: string) {
    try {
        const msg = pickup(code);
        if (msg) { return msg; }
        else { return "Not found system message..."; }
    } catch (e) {
        return "Failed found message: " + e.toString();
    }
}

export function existsCode(code: string) {
    try {
        return !!pickup(code);
    } catch (e) {
        return false;
    }
}