const $parent = Symbol("inheritance");
const $cleanup = Symbol("cleanup");
const $definition = Symbol("definition");
const $done = Symbol("done");

// simple ID generator, not really useful
// but the "id" property is assumed in other properties
const nextId = () => {
    nextId.id = "id" in nextId ? nextId.id + 1 : 0;
    return "<id:" + nextId.id + ">";
};

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
    }
};

// This creates a context and assigns it all the correct properties
// NB the context itself has a `null` prototype
const createContext = (props, parent = null) => {
    const ctx = Object.create(null, props);
    ctx[$definition] = props;
    ctx[$cleanup] = [];
    if (parent) {
        ctx[$parent] = parent;
    }
    Object.keys(props).forEach(k => {
        if (props[k].onConstruction) {
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
    return Object.keys(properties).reduce((defs, key) => {
        const {
            child,
            initial,
            cleanup = false,
            onConstruction = false
        } = properties[key];
        if (typeof child !== "function") {
            throw new Error(
                "Context property definition must have a `child` key which is a function."
            );
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
};

// it is usually a good idea to wrap this in your application as a singleton.
// so only one background context can be created.
exports.createBackgroundContext = props => {
    const definition = Object.assign(
        {},
        baseDefinition,
        createPropertyDescriptors(props)
    );
    return createContext(definition);
};

// small helper wrapper that allows static properties (the same for all contexts)
// to be created less verbosely
exports.staticProp = thing => {
    return { child: () => thing };
};
