// An express middleware for context's
exports.middleware = (
    baseContext,
    { send = defaultSend, logTiming = defaultLogTiming, exposeId = true } = {}
) => (req, res, next) => {
    req.withContext = async fn => {
        let hijacked = false;
        const hijack = () => (hijacked = true);
        const childContext = baseContext.child();
        let result;
        try {
            result = await fn(childContext, hijack, req, res, next);
        } catch (err) {
            result = err;
        }

        if (!hijacked) {
            if (logTiming) {
                const timing = childContext.lifetime().toFixed(3);
                res.set("x-request-time", timing + "ms");
                if (typeof logTiming === "function") {
                    logTiming(ctx, timing, req, res);
                }
            }
            if (exposeId) {
                res.set("x-request-id", childContext.id);
            }
            send(req, res, result);
            await childContext.done();
        } else if (!childContext.isDone) {
            // whoa there cowboy! you MUST release the context yourself if hijacking!
            const id = childContext.id;
            // the context was not "done" by the time the hijacked thing finished.
            // we wait 10 seconds and then warn.
            await new Promise(r => setTimeout(r, 10e3));
            if (!childContext.isDone) {
                //ok. lets warn.
                console.warn(
                    "`ctx.done()` not called after hijacking the middleware. Please check your route config",
                    {
                        method: req.method.toUpperCase(),
                        uri: req.originalUrl,
                        ctxId: id
                    }
                );
            }
        }
    };
    next();
};

// this does very little, but often it is enough.
// you will probably want to provide your own send function, that handles errors
// or wraps a Response object of your own devising
function defaultSend(req, res, result) {
    res.send(result);
}

// default is to log as a metric. this assume a "log" property on
// your context with a "log" function on it, ie. it is a "winston" logger... like the app-ctx/default
function defaultLogTiming(ctx, timing, req, res) {
    if (ctx.log && typeof ctx.log.log === "function") {
        ctx.log.log("metric", "request.timer", {
            method: req.method,
            uri: req.originalUrl,
            ms: timing
        });
    }
}
