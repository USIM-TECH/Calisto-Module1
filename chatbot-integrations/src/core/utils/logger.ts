/**
 * Shared logger interface used across all integrations.
 * Replace with your preferred logger (winston, pino, etc.)
 */
export interface Logger {
  info(message: string, ...args: any[]): void
  warn(message: string, ...args: any[]): void
  error(message: string, ...args: any[]): void
  debug(message: string, ...args: any[]): void
}

export const createConsoleLogger = (prefix: string = ''): Logger => ({
  info: (msg, ...args) => console.log(`[INFO]${prefix ? ` [${prefix}]` : ''} ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN]${prefix ? ` [${prefix}]` : ''} ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR]${prefix ? ` [${prefix}]` : ''} ${msg}`, ...args),
  debug: (msg, ...args) => console.debug(`[DEBUG]${prefix ? ` [${prefix}]` : ''} ${msg}`, ...args),
})

/** Class-based console logger for convenience */
export class ConsoleLogger implements Logger {
  private _prefix: string
  constructor(prefix: string = '') {
    this._prefix = prefix
  }
  info(msg: string, ...args: any[]) { console.log(`[INFO]${this._prefix ? ` [${this._prefix}]` : ''} ${msg}`, ...args) }
  warn(msg: string, ...args: any[]) { console.warn(`[WARN]${this._prefix ? ` [${this._prefix}]` : ''} ${msg}`, ...args) }
  error(msg: string, ...args: any[]) { console.error(`[ERROR]${this._prefix ? ` [${this._prefix}]` : ''} ${msg}`, ...args) }
  debug(msg: string, ...args: any[]) { console.debug(`[DEBUG]${this._prefix ? ` [${this._prefix}]` : ''} ${msg}`, ...args) }
}
