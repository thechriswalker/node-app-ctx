# app-ctx-pino

Simple logging for `app-ctx`. Logs using `pino` and allows dynamic level change.

```javascript
const createContext = require("app-ctx")
const createLogger = require("app-ctx-pino");

const pinoOptions = [...]; // passed to the pino constructor

const { getLogger, setLevel } = createLogger(...pinoOptions);

const ctx = createContext();

const log = getLogger(ctx);

log.info("some log"); // outputs with the context id.

setLevel("silent"); // global setting.

log.info("some log"); // outputs nothing

console.log(getLogger(ctx) === log); // true

const child = ctx.child();

console.log(getLogger(child) === log) // false;

getLogger(child).info("child logs"); // still nothing, we are silenced.

setLevel("debug"); // global setting.

getLogger(child).info("will log this time"); // outputs, but with the child context id.

// allow cleanup (good practice for contexts)
child.done()
ctx.done()
```
