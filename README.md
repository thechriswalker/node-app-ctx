# Application Execution Context for Serivces

Creates a single application context to which you can attach (maybe mock) services for your application.

You can make them instantiate per-child context or be static.

They can have custom shutdown handling when a child context is disposed.

There is also an `express` middleware to ease writing HTTP based apps the use context.

## simple example.

This uses `app-ctx/default` which has some sugar, but requires the optional dependencies: `cuid`, `winston` and `chalk`.


```
const { createBackgroundContext, staticProp } = require("app-ctx/default");

const bg = createBackgroundContext({ foo: staticProp("bar") });

// the default context attaches a nice logger
bg.log("this is the background");

// the prop is available
console.log(bg.foo); // "bar"

const child = bg.child();

// and on the children
console.log(child.foo); // "bar"

await someLongAsyncFunctionDoingStuff(child);

// clean up.
await child.done();

//how long did that take?
bg.log("uptime: %d", bg.lifetime());

await bg.done();

bg.log; // throws error on access now context is `done`
```

Of course this is simple. but the api allows per-child instances, so you could have per-request caches, or like the 
logging example, per-request Id's which are automatically attached to the logger. Another useful one if proxying
a database, to ensure all handles are closed after the context is done.

That is now 99% of all use-cases I have had for this.

## demo

[![demo](https://asciinema.org/a/BvWPhJd0ILk4zus1C7vzRG38M.png)](https://asciinema.org/a/BvWPhJd0ILk4zus1C7vzRG38M?autoplay=1)

