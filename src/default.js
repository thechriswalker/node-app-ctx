// this is the default configuration, which includes a logger and cuids
// if you want to include/exclude things, not "require" them, then don't use
// this, use the default createBackgroundContext and all your own things.
// note that the application middleware assume at least an "id" property
//
// Things the `context/default` has:
//
// an `id` property generated using the `cuid` library.
// a `lifetime` property which is a function returning `process.hrtime(creation)`
// a `log` property which is a winston logger, configured by environment variables.
//
const cannotRequire = (...modules) => {
    return modules
        .map(m => {
            try {
                require(m);
                return false;
            } catch (e) {
                return m;
            }
        })
        .filter(Boolean);
};

// check our optional dependencies
// CUID for context ids, winston and chalk for logging.
const failures = cannotRequire("cuid", "winston", "chalk");

if (failures.length) {
    throw new Error(
        "Optional dependencies required for `context/default` not installed: " +
            failures.join(", ") +
            "\nInstall them with: npm install --save " +
            failures.join(" ") +
            "\n"
    );
}

const cuid = require("cuid");
const withIdLogger = require("./logger");
// allows context lifetime calculations.
// returns milliseconds since context creation
// on the background context this is basically application uptime.
const hr2ms = ([s, ns]) => s * 1e3 + ns / 1e6;
const lifetime = () => {
    const start = process.hrtime();
    return () => hr2ms(process.hrtime(start));
};

const baseProps = {
    id: {
        initial: "background",
        child: () => cuid()
    },
    log: {
        child: ctx => withIdLogger(ctx.id),
        cleanup: logger => logger.close()
    },
    lifetime: {
        child: () => lifetime(),
        onConstruction: true
    }
};

const { createBackgroundContext } = require("./index");
exports.createBackgroundContext = moreDefs => {
    return createBackgroundContext(Object.assign({}, baseProps, moreDefs));
};
