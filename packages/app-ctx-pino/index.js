const pino = require("pino");

const createProperty = require("app-ctx/property");

// the args are passed directly into the pino constructor.
const createLogger = (...args) => {
    // this is the top level logger. it is never used directly.
    // only by children.
    const parent = pino(...args);
    const validLevels = Object.keys(parent.levels.values).concat(["silent"]);
    // ctx.id is the only property guarranteed to be there.
    // we attach a listener during load, and detach on unload, to
    // allow dynamic level changing.
    const levelChangeListeners = new WeakMap();
    return {
        getLogger: createProperty(ctx => {
            const log = parent.child({ ctx: ctx.id });
            // prevent infinite recursion as the emitter is inherited, but
            // we only care about the change to the parent.
            log.emit = false;
            const listener = newLevel => log.level = newLevel;
            parent.on("level-change", listener);
            levelChangeListeners.set(ctx, listener);
            return log;
        }, ctx => {
            const listener = levelChangeListeners.get(ctx);
            if (listener) {
                parent.removeListener(listener);
            }
        }
        ),
        // set the log level globally!
        setLevel: (newLevel) => {
            if (validLevels.includes(newLevel)) {
                parent.level = newLevel;
            }
        }
    };
};

module.exports = createLogger;
