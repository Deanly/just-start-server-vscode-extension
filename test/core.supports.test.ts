import * as assert from "assert";
import * as path from "path";
import * as supports from "../src/core/supports";

suite("core.supports.network", function () {
    test("download test 01", async function () {
        const filename = path.join(__dirname, "some.png");
        console.log(filename);
        await supports.network.downloadFile(
            "https://t1.daumcdn.net/daumtop_chanel/op/20170315064553027.png",
            filename
        );
    });
});