/**
 * Internal logger interface for the EventBus
 * Centralizes console usage for easier testing and customization
 * Can be replaced with custom implementations for different logging strategies
 */
interface Logger {
  /** Log error messages */
  error(message: string, ...args: unknown[]): void;
  /** Log warning messages */
  warn(message: string, ...args: unknown[]): void;
  /** Log informational messages */
  info(message: string, ...args: unknown[]): void;
  /** Log debug messages */
  debug(message: string, ...args: unknown[]): void;
}

/**
 * Default console-based logger implementation
 * Wraps console methods for consistent logging across the EventBus
 */
export const logger: Logger = {
  error(message: string, ...args: unknown[]): void {
    console.error(message, ...args);
  },

  warn(message: string, ...args: unknown[]): void {
    console.warn(message, ...args);
  },

  info(message: string, ...args: unknown[]): void {
    console.info(message, ...args);
  },

  debug(message: string, ...args: unknown[]): void {
    console.debug(message, ...args);
  },
};
