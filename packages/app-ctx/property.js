
const noop = () => { };

// context properties are loaded lazily and mapped via weakmaps.
// libraries (or your own code) can create these properties with this
// function.
// `load` is called to initialize the property, `unload` to dispose of it when the
// context is closed.
const createProperty = (load, unload = noop) => {
    const wm = new WeakMap();
    return ctx => {
        if (!wm.has(ctx)) {
            wm.set(ctx, load(ctx));
            ctx.wait().then(() => unload(ctx));
        }
        return wm.get(ctx);
    };
}
module.exports = createProperty;
