import { isDebugModeEnabled } from './logger.js';

const shouldLog = () => isDebugModeEnabled();

export const sbtConsole = {
    log: (...args) => {
        if (shouldLog()) console.log(...args);
    },
    debug: (...args) => {
        if (shouldLog()) console.debug(...args);
    },
    info: (...args) => {
        if (shouldLog()) console.info(...args);
    },
    warn: (...args) => {
        if (shouldLog()) console.warn(...args);
    },
    error: (...args) => {
        if (shouldLog()) console.error(...args);
    },
    group: (...args) => {
        if (shouldLog()) console.group(...args);
    },
    groupCollapsed: (...args) => {
        if (shouldLog()) console.groupCollapsed(...args);
    },
    groupEnd: () => {
        if (shouldLog()) console.groupEnd();
    },
    dir: (...args) => {
        if (shouldLog()) console.dir(...args);
    }
};

