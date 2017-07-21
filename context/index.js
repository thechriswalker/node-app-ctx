const $parent = Symbol("inheritance");
const $cleanup = Symbol("cleanup");
const $definition = Symbol("definition");
const $done = Symbol("done");

// simple ID generator, not really useful
// but the "id" property is assumed in other properties
const nextId = () => {
    nextId.id = "id" in nextId ? nextId.id + 1 : 0;
    return "<ctx:" + nextId.id + ">";
};

// simple logger
function log(id, level, ...args) {
    console.log(`[${id}][${level}]`, ...args);
}

const baseDefinition = {
    done: {
        enumerable: true,
        configurable: false,
        writable: false,
        value: async function() {
            if (this[$done]) {
                throw new Error("called ctx.done() more than once!");
            }
            this[$done] = true;
            await Promise.all(this[$cleanup].map(f => f()));
        }
    },
    isDone: {
        enumerable: true,
        configurable: false,
        get: function() {
            return this[$done];
        }
    },
    child: {
        enumerable: true,
        configurable: false,
        writable: false,
        value: function() {
            return createChildContext(this);
        }
    },
    id: {
        enumerable: true,
        configurable: false,
        get: function() {
            if ("_id" in this === false) {
                this._id = nextId();
            }
            return this._id;
        }
    },
    log: {
        enumerable: true,
        configurable: false,
        get: function() {
            const l = (...args) => log(this.id, "debug", ...args);
            l.log = (...args) => log(this.id, ...args);
            return l;
        }
    }
};

// This creates a context and assigns it all the correct properties
// NB the context itself has a `null` prototype
const createContext = ({prototype, descriptors}, parent = null) => {
    const ctx = Object.create(prototype, descriptors);
    ctx[$definition] = props;
    ctx[$cleanup] = [];
    if (parent) {
        ctx[$parent] = parent;
    }
    Object.keys(descriptors).forEach(k => {
        if (descriptors[k].onConstruction) {
            // just "get" to trigger it.
            ctx[k];
        }
    });
    return ctx;
};

const createChildContext = parent => {
    const properties = parent[$definition];
    return createContext(properties, parent);
};

const useAfterCleanup = {};
const checkForUseAfterCleanup = (thing, key) => {
    if (thing === useAfterCleanup) {
        throw new Error(
            `Attempt to use 'ctx.${key}' after calling 'ctx.done()'`
        );
    }
    return thing;
};

const createPropertyDescriptors = (properties = {}) => {
    // we want symbols as well as keys!
    const propKeys = Object.getOwnPropertyNames(properties).concat(
        Object.getOwnPropertySymbols(properties)
    );
    const prototype = {};
    const descriptors = propKeys.reduce((defs, key) => {
        const {
            child,
            proto,
            initial,
            cleanup = false,
            onConstruction = false
        } = properties[key];
        if (typeof child !== "function" || !proto) {
            throw new Error(
                "Context property definition must have a `child` key which is a function, or a value in the `proto` key"
            );
        }
        if (proto && (child || cleanup)) {
            throw new Error("If `proto` is set then neither `child`, nor `cleanup` are allowed");
        }
        if (proto) {
            //this should be on the prototype.
            // SIDE EFFECT!
            protoype[key] = proto;
            return defs;
        }

        if (cleanup && typeof cleanup !== "function") {
            throw new Error(
                "Context property definition key `cleanup` key must be a function."
            );
        }

        const definition = {
            enumerable: true,
            configurable: false,
            onConstruction
        };
        const cache = new WeakMap();
        //we have a way to "get" a child value.
        const createObject = (ctx, parent) => {
            if (!parent && initial !== undefined) {
                return initial;
            }
            return child(ctx, parent);
        };
        if (cleanup) {
            // we need to clean it up afterwards.
            definition.get = function() {
                //NB `this` is the class instance itself.
                // we need to cache this instance, in the weakmap.
                if (cache.has(this)) {
                    return checkForUseAfterCleanup(cache.get(this), key);
                }
                const childInstance = createObject(this, this[$parent]);
                cache.set(this, childInstance);
                this[$cleanup].push(async () => {
                    // NB if this errors, you crash. so catch and handle
                    await cleanup(childInstance, this);
                    cache.set(this, useAfterCleanup); //this basically means no new item will be made, but trying to use this will fail
                });
                return childInstance;
            };
        } else {
            // less to worry about if we don't have to clean up.
            definition.get = function() {
                if (!cache.has(this)) {
                    cache.set(this, createObject(this, this[$parent]));
                }
                return cache.get(this);
            };
        }
        defs[key] = definition;
        return defs;
    }, {});

    return { prototype, descriptors };
};

// it is usually a good idea to wrap this in your application as a singleton.
// so only one background context can be created.
exports.createBackgroundContext = props => {
    const { prototype, descriptors } = createPropertyDescriptors(props);
    Object.assign(
        {},
        baseDefinition,
        descriptors
    );
    return createContext({prototype, descriptors});
};

// small helper wrapper that allows static properties (the same for all contexts)
// to be created less verbosely
exports.staticProp = thing => ({ child: () => thing });
exports.protoProp = thing => ({ proto: thing });
