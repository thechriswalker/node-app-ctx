# Application Execution Context for Services

A unique context for each request and the service as a whole.

The context defines the a lifetime and a unique id. You can attach properties to
it via a seperate weak referenced api.

```javascript
const createContext = require("app-ctx");

const parentCtx = createContext();

// ID is a builtin property, by default an increasing integer,
// but the createContext function accepts an id generating function
// as it's only argument.
console.log(parentCtx.id); // 0 (or something)

// create a child.
const childCtx = parentCtx.child();

console.log(childCtx.id); // 1


(async function testClose() {
    console.log(childCtx.isDone); // false
    // wait for the context to close.
    await childCtx.wait();
    console.log(childCtx.isDone); // true
    consoel.log(childCtx.lifetime); // milliseconds
})();
childCtx.done(); // finish with the context.


// create a custom property
const createProperty = require("app-ctx/property");

const getMyProp = createProperty(ctx => {
    // this function is called once for each new ctx.
    return { id: ctx.id, things: [] };
})

// doesn't need to be defined before context created.
const myProp = getMyProp(parentCtx);

myProp.things.push(1,2,3);

console.log(getMyProp(parentCtx)); // { id: 0, things: [1,2,3] }
const kid = parentCtx.child();
console.log(getMyProp(kid)); // {id: 2, things: [] }
```

## Why?

Often it is useful to be able to have "per-request" variables. For example, in a web
app, a context could represent the lifecycle of a single request. The http server's
`req` and `res` object could be props, or a per-request database cache. Most often
a per-request logger (like `app-ctx-pino`) which add the context id to everylog, useful
for debugging. It can also be used to time requests, with the lifetime built in.

I went through a couple of iterations of the idea with new context objects created with
new instantiations of properties, but eventually realised that keeping the actual
"props" seperate from the context object, by virtue of WeakMaps, was the best solution
and the easiest from a load/unload perspective.

