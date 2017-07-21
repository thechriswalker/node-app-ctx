/**
 *  Allows us to add custom meta data without having loads of loggers.
 */
const winston = require("winston");
const chalk = require("chalk");

// Config - set with `dotenv`
const LOG_LEVEL = process.env.LOG_LEVEL || "silly";
const LOG_JSON = process.env.LOG_JSON === "true";
const LOG_FILE_POSITION = process.env.LOG_FILE_POSITION === "true";
const LOG_TIME_SHORT = process.env.LOG_TIME_SHORT === "true";

// @see https://github.com/google/closure-library/blob/252d8f515799b689dd99ee8c4a1601074d985297/closure/goog/string/string.js#L1148
const regexEscape = function(s) {
    return String(s)
        .replace(/([-()\[\]{}+?*.$\^|,:#<!\\])/g, "\\$1")
        .replace(/\x08/g, "\\x08");
};

// base them on the current position.
// maybe track back to `package.json`?
const logPosRegex = new RegExp(regexEscape(process.cwd() + "/"));

const logLevels = {
    metric: -1, // metrics can be logged and are always output.
    error: 0,
    warn: 1,
    info: 2,
    verbose: 3,
    debug: 4,
    silly: 5
};

// as we use chalk, you can disable color with FORCE_COLOR=0
const levelColors = {
    metric: chalk.gray,
    error: chalk.bgRed.white.bold,
    warn: chalk.yellow.bold,
    info: chalk.green.bold,
    verbose: chalk.cyan.bold,
    debug: chalk.bold.bgBlue.white,
    silly: chalk.magenta.bold
};
const timeColor = chalk.gray;
const msgColor = chalk.bold;

// longest level name is 7 chars "verbose"
// but "metric" can't really be shortened...
const PAD_LEVEL = 6;
const padLevel = level => (level === "verbose" ? "verb": level).padStart(PAD_LEVEL, " ");

// colorful keys in meta.
const coloredMeta = (color, meta) =>
    Object.keys(meta)
        .map(key => {
            let value = meta[key];
            if (
                value !== null &&
                value !== undefined &&
                typeof value === "object"
            ) {
                value = JSON.stringify(value);
            }
            return color(key + "=") + value;
        })
        .join(" ");

//logstash style json
const jsonFormatter = function({ level, message = "", meta = {} } = {}) {
    const fields = { level };
    Object.keys(meta).forEach(key => {
        if (key === fileKey) {
            fields.file = meta[key].trim();
        } else {
            fields["meta." + key] = meta[key];
        }
    });
    return JSON.stringify({
        "@timestamp": new Date().toISOString(),
        "@version": 1,
        "@fields": fields,
        "@message": message
    });
};

const identity = x => x;

const logTimestamp = () => {
    const d = new Date().toISOString();
    if (LOG_TIME_SHORT) {
        // slice:
        //
        //  from char at startindex
        //  until but not including
        //  char at end index.
        //
        //      start 11      end 23
        //             |           |
        //  012345678901234567890123
        //             |           |
        // '2017-06-21T08:21:36.598Z'
        return d.slice(11, 23);
    }
    return d;
};

// we can't use symbols, winston strips them... :(
// so we use something unlikely
const fileKey = "__log_file_location_and_position";

// how much we pad a message to by default
const MESSAGE_MIN_LENGTH = 50; // you want a wide terminal!

//pretty text.
const textFormatter = function({ level, message = "", meta = {} } = {}) {
    const color = level in levelColors ? levelColors[level] : identity;
    let file = "";
    if (meta.hasOwnProperty(fileKey)) {
        file = meta[fileKey];
        delete meta[fileKey];
    }

    // cannot use String.prototype.pad(Start|End) here, we just want the padding
    message = message.padEnd(MESSAGE_MIN_LENGTH, " ");

    if (file.length) {
        // reduce to 2 path segments... 
        file = " " + coloredMeta(color, { "~pos": file }); //.split("/").slice(-2).join("/") });
    }
    const cm = coloredMeta(color, meta);
    const time = timeColor(logTimestamp());
    const msg = msgColor(message);
    return `${time} ${color(padLevel(level))} ${msg} ${cm}${file}`;
};
// We make a custom transport, what can be used with each logger.
// Then add it as a container - we need to remember to clean up the containers though
// or they will grow unbounded!
//
const container = new winston.Container({
    transports: [
        new winston.transports.File({
            stream: process.stderr,
            level: LOG_LEVEL,
            json: false,
            formatter: LOG_JSON ? jsonFormatter : textFormatter
        })
    ]
});

//add our shouldLog function
const getLevelNum = name => (name in logLevels ? logLevels[name] : -Infinity);
const logLevelNum = getLevelNum(LOG_LEVEL);
const shouldLog = name => getLevelNum(name) <= logLevelNum;

const pad3 = n => (n > 99 ? n : n > 9 ? "0" + n : "00" + n);

function tryAndGetLocation(level, msg, meta = {}) {
    const { stack } = new Error();
    // OK all calls are routed through a stack line:
    const beforeTarget = ".thisMustBeRecognizableInAStacktrace ";
    const target = stack.split(beforeTarget);
    if (target.length === 2) {
        const frames = target[1].split("\n");
        // this allows the "invariant" to log appearing from a previous stack frame
        if ("framesToPop" in meta) {
            let p = meta.framesToPop;
            delete meta.framesToPop;
            frames.splice(0, p); //remove `p` entries
        }
        // we have a chance.
        let file = frames[1].split(logPosRegex);
        if (file.length === 1) {
            //not from inside this folder? ignore
            return meta;
        } else {
            file = file.pop().replace(/:\d+\)?$/, "");
        }
        // now also we have, e.g. http/vi/index.js:12 or http/v1/routes.js:12
        file = file.replace(
            /(\/index\.js|\.js):(\d+)$/,
            (_, __, n) => ":" + pad3(n)
        );
        meta[fileKey] = file;
    }
    return meta;
}

const noop = () => {};

// creates a wrapper around the log that adds the context id
// then we use a function proxy to redirect calls and property access
// to the underlying logger
const logWithContextId = id => {
    const logger = container.add(id);
    logger.setLevels(logLevels);
    const addContextId = (_, __, meta) => Object.assign({ ctx: id }, meta);
    logger.rewriters = LOG_FILE_POSITION
        ? [tryAndGetLocation, addContextId]
        : [addContextId];
    logger.shouldLog = shouldLog;
    const proxy = {
        // direct application is logged at debug level
        apply: function thisMustBeRecognizableInAStacktrace(_, __, args) {
            return logger.log("debug", ...args);
        },
        get: (_, prop) => {
            if (prop === "close") {
                // undocumented function. we don't actaully want to close this,
                // because it will try and close the underlying transport.
                return () => container._delete(id);
            }
            if (typeof logger[prop] === "function") {
                //NB because of this, a minified version of this code will not be able to produce
                // file/line positions in the logs. Of course, if the code is minified, then
                // they wouldn't mean much anyway...
                return (...thisMustBeRecognizableInAStacktrace) =>
                    logger[prop](...thisMustBeRecognizableInAStacktrace);
            }
            return logger[prop];
        }
    };

    //we proxy a function, so we can call it directly.
    return new Proxy(noop, proxy);
};

module.exports = exports = logWithContextId;
