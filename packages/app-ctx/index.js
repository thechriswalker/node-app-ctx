const $doneSync = Symbol("doneSync");
const $doneAsync = Symbol("doneAsync");
const $children = Symbol("children");
const $start = Symbol("start");
const $createChild = Symbol("createChild");

// a simple id generator.
const defaultIdGen = (() => {
    let id = 0;
    return () => {
        id++;
        return id;
    };
})();

// this will be the new object prototype.
const contextPrototype = Object.create(null, {
    // this property returns a boolean value of whether the context is done
    // or not.
    isDone: {
        get: function () {
            return this[$doneSync] !== undefined;
        }
    },
    // lifetime is the time in milliseconds since this context was instantiated.
    // paused at the moment of "done".
    lifetime: {
        get: function () {
            if (this.isDone) {
                // if done, short.
                return this[$doneSync];
            }
            return Date.now() - this[$start];
        }
    },
    // done() marks this context as finished with.
    // we should throw if any children exist, or if new children are created.
    done: {
        value: function () {
            if (this.isDone) {
                // this is not considered an error
                return this[$doneSync]
            }
            if (this[$children].some(child => !child.isDone)) {
                throw new Error("Attempt to call `done()` on a context with active children");
            }
            this[$doneSync] = this.lifetime;
            if (this[$doneAsync]) {
                this[$doneAsync].deferral();
            }
            return this[$doneSync];
        }
    },
    // wait() returns a promise that will resolve when this context is "done"
    wait: {
        value: function () {
            if (this[$doneSync]) {
                return Promise.resolve();
            }
            if (!this[$doneAsync]) {
                let deferral;
                const promise = new Promise(resolve => deferral = resolve);
                this[$doneAsync] = { promise, deferral };
            }
            return this[$doneAsync].promise;
        }
    },
    // child() creates a child context from this one.
    // if this is closed, then `child()` will throw. If `done()` is called
    // while children are still not done, it will throw.
    child: {
        // we should really track child creation in terms of closing, i.e. warn if a parent
        // is destroyed before the children.
        value: function () {
            if (this.isDone) {
                throw new Error("Attempt to create a child context after calling `done()`")
            }
            const kid = this[$createChild]();
            this[$children].push(kid);
            return kid;
        }
    }
});

// create a context with the given ID generator.
const createContext = (idGen = defaultIdGen) => {
    if (typeof idGen !== "function") {
        throw new TypeError(`createContext expects a single optional argument that must be a function. Type '${typeof idGen}' given`);
    }

    // this is the main function. It creates children from the prototype we have defined.
    const createChildContext = () => {
        const ctx = Object.create(contextPrototype, {
            id: {
                // the id is created immediately, not lazily.
                value: idGen()
            }
        });
        Object.defineProperty(ctx, $children, { value: [] });
        Object.defineProperty(ctx, $start, { value: Date.now() });
        Object.defineProperty(ctx, $createChild, { value: createChildContext });
        return ctx;
    };
    // create the initial context.
    return createChildContext();
}

module.exports = createContext;
