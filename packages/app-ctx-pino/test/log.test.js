const test = require("tape");
const { WritableStreamBuffer } = require("stream-buffers");
const createLogger = require("../index");
const { pretty } = require("pino")
const createContext = require("app-ctx");


test("app-ctx-pino", t => {
    const buf = new WritableStreamBuffer();
    const { getLogger, setLevel } = createLogger({
        name: "test",
        level: "warn",
    }, buf);

    const ids = [
        "THISWILLBETHEPARENTID",
        "THISWILLBETHECHILDID",
        "WESHOULDNTNEEDTHISID"
    ];

    //custom id generator for the testing.
    const ctx = createContext(() => ids.unshift());

    const log = getLogger(ctx);

    t.ok(typeof log.info === "function", "log.info should be a function");
    log.info("should not see this");
    t.equal(buf.size(), 0, "nothing should be written to the buffer")
    const kid = ctx.child();
    const klog = getLogger(kid);
    klog.info("should not see this either.");
    t.equal(buf.size(), 0, "nothing should be written to the buffer")

    // change the level globally.
    setLevel("info");
    log.info("LOG MESSAGE ONE");
    t.ok(buf.size() > 0, "we should see a write to the buffer")
    const message = buf.getContentsAsString("utf8");
    t.ok(/"LOG MESSAGE ONE"/.test(message), "buf should contain our message after parent write");
    t.ok(message.includes(ctx.id), "message should contain the ctx.id")
    klog.info("THIS IS THE CHILD");
    const message2 = buf.getContentsAsString("utf8");
    t.equal(/"THIS IS THE CHILD"/.test(message2), true, "buf should contain our message after child write");
    t.ok(message.includes(kid.id), "message should contain the child ctx.id");

    t.end();
})
