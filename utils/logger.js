/**
 * SignX - Scoped Debug Logger
 */
class Logger {
  constructor(namespace = 'SignX', enabled = true) {
    this.namespace = namespace;
    this.enabled = enabled;
  }

  log(message, ...args) {
    if (!this.enabled) return;
    console.log(`%c[${this.namespace}]`, 'color: #06b6d4; font-weight: bold;', message, ...args);
  }

  info(message, ...args) {
    if (!this.enabled) return;
    console.info(`%c[${this.namespace}] ℹ`, 'color: #3b82f6; font-weight: bold;', message, ...args);
  }

  warn(message, ...args) {
    if (!this.enabled) return;
    console.warn(`%c[${this.namespace}] ⚠`, 'color: #f59e0b; font-weight: bold;', message, ...args);
  }

  error(message, ...args) {
    console.error(`%c[${this.namespace}] ✖`, 'color: #ef4444; font-weight: bold;', message, ...args);
  }

  group(label) {
    if (!this.enabled) return;
    console.group(`%c[${this.namespace}] ${label}`, 'color: #8b5cf6; font-weight: bold;');
  }

  groupEnd() {
    if (!this.enabled) return;
    console.groupEnd();
  }
}

export const logger = new Logger('SignX');
export function createLogger(subNamespace) {
  return new Logger(`SignX:${subNamespace}`);
}
