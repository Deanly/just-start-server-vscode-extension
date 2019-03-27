import en = require("./en.json");
import ko = require("./ko.json");

import { env } from "vscode";

export function getMessage(code: string) {
    try {
        let msg: string;
        switch (env.language.substring(0, 2)) {
            case "ko": msg = (<any>ko)[code]; break;
            default: msg = (<any>en)[code]; break;
        }
        if (msg) { return msg; }
        else { return "Not found system message..."; }
    } catch (e) {
        return "Failed found message: " + e.toString();
    }
}