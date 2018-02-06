const test = require("tape");

const createContext = require("../index");
const createProperty = require("../property");

test("context", t => {
    const ctx = createContext();
    t.notEqual(ctx.id, undefined, "id should be defined");

    // these property getters are designed to be exported.
    const getLogProperty = createProperty(curr => (...args) => console.log(curr.id, ...args));

    const object = {};
    const getObjectProperty = createProperty(() => object);

    const log = getLogProperty(ctx);
    t.equal(typeof log, "function", "log should be a function");
    const log2 = getLogProperty(ctx);
    t.equal(log, log2, "2 seperate gets should return the exact same object.")

    const o = getObjectProperty(ctx);
    t.equal(o, object, "this object should always be the same");

    const kid = ctx.child();

    const klog = getLogProperty(kid);
    t.notEqual(klog, log2, "logs from different context's should be different");
    t.equal(getObjectProperty(kid), o, "this object should always be the same");

    t.equal(kid.isDone, false, "context should not be done.");
    ctx.wait().then(() => {
        // we only complete when the context is done.
        t.end();
    });

    t.equal(typeof kid.done(), "number", "context.done() should return the lifetime in milliseconds");
    t.equal(kid.isDone, true, "context should now be done.");
    // close the parent context.
    // which should end the test.
    ctx.done()

});
