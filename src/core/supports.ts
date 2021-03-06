import * as fs from "fs";
import * as os from "os";
import * as net from "net";
import * as path from "path";
import * as vscode from "vscode";
import mkdirp from "mkdirp";
import rimraf from "rimraf";
import axios from "axios";
import unzipper from "unzipper";
import { spawn, SpawnOptions, ChildProcess } from "child_process";

export namespace fsw {

    function handleResult<T>(resolve: (result: T) => void, reject: (err: Error) => void, err: Error | null | undefined, result: T): void {
        if (err) {
            reject(messageError(err));
        } else {
            resolve(result);
        }
    }

    function messageError(err: Error & { code?: string }): Error {
        if (err.code === "ENOENT") {
            return vscode.FileSystemError.FileNotFound();
        }

        if (err.code === "EISDIR") {
            return vscode.FileSystemError.FileIsADirectory();
        }

        if (err.code === "EEXIST") {
            return vscode.FileSystemError.FileExists();
        }

        if (err.code === "EPERM" || err.code === "EACCESS") {
            return vscode.FileSystemError.NoPermissions();
        }

        return err;
    }

    export function checkCancellation(token: vscode.CancellationToken): void {
        if (token.isCancellationRequested) {
            throw new Error("Operation cancelled");
        }
    }

    export function normalizeNFC(items: string): string;
    export function normalizeNFC(items: string[]): string[];
    export function normalizeNFC(items: string | string[]): string | string[] {
        if (process.platform !== "darwin") {
            return items;
        }

        if (Array.isArray(items)) {
            return items.map(item => item.normalize("NFC"));
        }

        return items.normalize("NFC");
    }

    export function readdir(path: string): Promise<string[]> {
        return new Promise<string[]>((resolve, reject) => {
            fs.readdir(path, (err, children) => handleResult(resolve, reject, err, children ? normalizeNFC(children) : undefined));
        });
    }

    export function stat(path: string): Promise<fs.Stats> {
        return new Promise<fs.Stats>((resolve, reject) => {
            fs.stat(path, (err, stat) => handleResult(resolve, reject, err, stat));
        });
    }

    export function readfile(path: string): Promise<Buffer> {
        return new Promise<Buffer>((resolve, reject) => {
            fs.readFile(path, (err, buffer) => handleResult(resolve, reject, err, buffer));
        });
    }

    export function writefile(path: string, content: Buffer, options?: string | {
        encoding?: string | null | undefined;
        mode?: string | number | undefined;
        flag?: string | undefined;
    }): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            fs.writeFile(path, content, options, err => handleResult(resolve, reject, err, void 0));
        });
    }

    export function copyFile(src: string, dest: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            fs.copyFile(src, dest, err => handleResult(resolve, reject, err, void 0));
        });
    }

    export function copyFileSync(src: string, dest: string): void {
        fs.copyFileSync(src, dest);
        return void 0;
    }

    export function exists(path: string): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            fs.access(path, fs.constants.F_OK, err => handleResult(resolve, reject, undefined, !err));
        });
    }

    export function readable(path: string): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            fs.access(path, fs.constants.F_OK | fs.constants.R_OK, err => handleResult(resolve, reject, undefined, !err));
        });
    }

    export function writable(path: string): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            fs.access(path, fs.constants.F_OK | fs.constants.W_OK, err => handleResult(resolve, reject, undefined, !err));
        });
    }

    export function rmrf(path: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            rimraf(path, {}, (err => handleResult(resolve, reject, err, void 0)));
        });
    }

    export function rmrfSync(path: string): void {
        rimraf.sync(path);
        return void 0;
    }

    export function mkdir(p: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            mkdirp(p, err => handleResult(resolve, reject, err, void 0));
        });
    }

    export function mkdirSync(p: string): void {
        mkdirp.sync(p);
        return void 0;
    }

    export function rename(oldPath: string, newPath: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            fs.rename(oldPath, newPath, err => handleResult(resolve, reject, err, void 0));
        });
    }

    export function unlink(path: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            fs.unlink(path, err => handleResult(resolve, reject, err, void 0));
        });
    }

    function isDirSync(path: string): boolean {
        try {
            fs.readdirSync(path);
            return true;
        } catch (e) {
            return false;
        }
    }

    export function copydir(src: string, dest: string, progress?: (mark: number, come: number, name: string) => void): Promise<void> {
        return new Promise((resolve, reject) => {
            let _g = 0, _n = 0;
            const recursive = async function (t: string): Promise<void> {
                const arr = await readdir(path.join(src, t));
                _g += arr.length;
                for (let i = 0; i < arr.length; i++) {
                    _n++;
                    if (arr[i].startsWith(".")) { continue; }
                    if (progress) { progress(_g, _n, arr[i]); }
                    if (isDirSync(path.join(src, t, arr[i]))) {
                        await mkdir(path.join(dest, t, arr[i]));
                        await recursive(path.join(t, arr[i]));
                    } else {
                        await copyFile(path.join(src, t, arr[i]), path.join(dest, t, arr[i]));
                    }
                }
                return void 0;
            };

            recursive("")
                .catch(async err => {
                    await rmrf(dest);
                    handleResult(resolve, reject, err, void 0);
                })
                .then(() => handleResult(resolve, reject, undefined, void 0));
        });
    }

    export function findFilePath(basedir: string, filename: string): Promise<string> {
        return new Promise((resolve, reject) => {
            let result: string | undefined;
            const recursive = async function (_path: string): Promise<void> {
                if (result) { return void 0; }

                if (!await readable(path.join(_path, filename))) {
                    const arr = await readdir(_path);

                    for (let i = 0; i < arr.length; i++) {
                        if (arr[i].startsWith(".")) { continue; }

                        if (isDirSync(path.join(_path, arr[i]))) {
                            await recursive(path.join(_path, arr[i]));
                        } else {
                            if (filename.startsWith("*")) {
                                if (arr[i].endsWith(filename.replace(/\**/, ""))) {
                                    result = path.join(_path, arr[i]);
                                    return void 0;
                                }
                            }
                        }
                    }
                } else {
                    result = path.join(_path, filename);
                    return void 0;
                }
            };
            recursive(basedir)
                .catch(err => handleResult(resolve, reject, err, void 0))
                .then(() => handleResult(resolve, reject, undefined, result));
        });
    }
}

export namespace network {

    export async function getAvailablePort(): Promise<number> {
        return await new Promise<number>((resolve, reject) => {
            const srv = net.createServer(() => { });
            srv.listen(0, () => {
                const addrInfo = srv.address();
                if (!addrInfo || typeof addrInfo === "string") {
                    reject(new Error("Failed to create port due to unknown reason"));
                } else {
                    resolve(addrInfo.port);
                }
                srv.close();
            });
        });
    }

    export async function getAvailablePorts(n: number): Promise<number[]> {
        const ports = [];
        for (let i = 0; i < n; i++) {
            ports.push(await getAvailablePort());
        }
        return ports;
    }

    export async function checkAvailablePort(port: number): Promise<boolean> {
        return await new Promise<boolean>((resolve) => {
            const tester = net.createServer()
                .once("error", (err: any) => {
                    if (err.code === "EADDRINUSE") { return resolve(false); }
                    resolve(false);
                })
                .once("listening", () => {
                    tester.once("close", () => { resolve(true); })
                        .close();
                })
                .listen(port);
        });
    }

    export async function downloadFile(url: string, path: string, progress?: (increment: number, current: number, total: number) => boolean): Promise<void> {
        const response = await axios({
            url,
            method: "GET",
            headers: {
                "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.131 Safari/537.36"
            },
            responseType: "stream",
        });

        if (typeof progress !== "function") { progress = function () { return true; }; }

        return new Promise<void>((resolve, reject) => {
            const writer = fs.createWriteStream(path);
            let before = 0;
            writer.on("drain", () => {
                if (!progress!(writer.bytesWritten - before, writer.bytesWritten, parseInt(response.headers["content-length"]))) {
                    writer.destroy();
                }
                before = writer.bytesWritten;
            });
            writer.on("finish", () => resolve(void 0));
            writer.on("error", reject);

            response.data.pipe(writer);
        });
    }

}

export namespace util {
    export async function setTimeoutPromise(callback: (...args: any[]) => void, ms: number): Promise<void> {
        return await new Promise<void>((resolve, reject) => {
            setTimeout(() => {
                try {
                    callback();
                    resolve(void 0);
                } catch (e) {
                    reject(e);
                }
            }, ms);
        });
    }

    export enum OsType { LINUX, DARWIN, WINDOWS_NT }

    export function getOsType() {
        switch (os.type()) {
            case "Linux": return OsType.LINUX;
            case "Darwin": return OsType.DARWIN;
            case "Windows_NT": return OsType.WINDOWS_NT;
            default: return OsType.LINUX;
        }
    }

    export async function executeChildProcess(command: string, options: SpawnOptions, args: string[], out: Array<string>, outputPane?: vscode.OutputChannel, escape?: boolean): Promise<ChildProcess> {
        return await new Promise<ChildProcess>((resolve, reject) => {
            let stderr: string = "";
            const process = spawn(command.replace(" ", "\\ "), args, options);
            if (outputPane) {
                outputPane.show();
                process.stdout.on("data", (data: string | Buffer): void => {
                    outputPane.append(data.toString());
                    out.push(data.toString());
                });
            } else {
                process.stdout.on("data", (data: string | Buffer): void => {
                    out.push(data.toString());
                });
            }

            process.stderr.on("data", (data: string | Buffer) => {
                stderr = stderr.concat(data.toString());
                if (outputPane) {
                    outputPane.append(data.toString());
                }
                out.push(data.toString());
            });
            process.on("error", (err: Error) => {
                reject(err);
            });
            process.on("exit", (code: number) => {
                if (code !== 0) {
                    reject(new Error(`Failed execute child process ${code}: ${command} ${args.join(" ")}`));
                } else {
                    resolve(process);
                }
            });
            if (escape) {
                setTimeout(() => resolve(process), 200);
            }
        });
    }

    export function unzip(zipPath: string, outputPath: string) {
        return new Promise((resolve, reject) => {
            const stream = fs.createReadStream(zipPath);
            stream.on("end", resolve);
            stream.on("error", reject);

            stream.pipe(unzipper.Extract({ path: outputPath }));
        });
    }
}


import { getMessage, existsCode } from "../messages";
export namespace h {
    export class ExtError extends Error {
        constructor(
            public readonly msg: string,
            public readonly code?: string
        ) {
            super(msg);
            if (existsCode(msg) && !code) {
                this.msg = "";
                this.code = msg;
            }
        }

        info: boolean = false;

        information(): ExtError {
            this.info = true;
            return this;
        }

        toString() {
            if (this.code && existsCode(this.code)) {
                return `${getMessage(this.code)}${this.msg ? " (" + this.msg + ")" : ""}`;
            } else {
                return this.msg;
            }
        }
    }

    export function matchError(error: ExtError | Error, code: string): boolean {
        if (error instanceof Error) { return false; }
        return ((error as ExtError).msg === code) || ((error as ExtError).code === code);
    }
}