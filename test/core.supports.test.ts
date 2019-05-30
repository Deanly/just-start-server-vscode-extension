import * as assert from "assert";
import * as path from "path";
import * as supports from "../src/core/supports";


suite("core.supports.network", function () {
    let filename;
    test("download test", async function () {
        filename = path.join(__dirname, "some.png");
        await supports.network.downloadFile(
            "https://t1.daumcdn.net/daumtop_chanel/op/20170315064553027.png",
            filename
        );
        const state = await supports.fsw.stat(filename);
        assert.ok(state.size > 0);
    });
});

suite("core.supports.fsw", function () {
    test("fsw.readable test", async function () {
        const file = path.join(__dirname, "index.js");
        const res = await supports.fsw.readable(file);
        assert.ok(res);
    });
});