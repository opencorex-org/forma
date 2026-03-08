// This file provides structured logging, exporting functions or classes that format and log messages.

export function logInfo(message: string): void {
    console.log(`[INFO] ${new Date().toISOString()}: ${message}`);
}

export function logWarning(message: string): void {
    console.warn(`[WARNING] ${new Date().toISOString()}: ${message}`);
}

export function logError(message: string): void {
    console.error(`[ERROR] ${new Date().toISOString()}: ${message}`);
}

export function logDebug(message: string): void {
    if (process.env.DEBUG) {
        console.debug(`[DEBUG] ${new Date().toISOString()}: ${message}`);
    }
}