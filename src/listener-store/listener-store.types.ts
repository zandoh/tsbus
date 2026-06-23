/**
 * Public listener metadata exposed to consumers
 * Contains information about a registered event listener
 */
export interface ListenerInfo {
  /** Unique listener identifier */
  id: symbol;
  /** Execution priority (higher = earlier) */
  priority: number;
  /** One-time listener flag */
  once: boolean;
  /** Pattern used for subscription */
  pattern: string;
  /** Timestamp when listener was added */
  addedAt: number;
  /** Number of times this listener has been executed */
  executionCount: number;
  /**
   * Average execution duration in milliseconds.
   * Returns 0 when `trackStats` is disabled in `EventBusConfig`.
   */
  avgDuration: number;
}

/**
 * Map of event patterns to their registered listeners
 */
export type ListenerMap = Map<string, ListenerInfo[]>;

/**
 * Event handler function that processes event payloads
 * Supports both synchronous and asynchronous handlers
 * @template T - The type of the payload this handler receives
 */
export type ListenerHandler<T = unknown> = (payload: T) => Promise<void> | void;

/**
 * Options for subscribing to events
 * Allows customization of listener behavior
 */
export interface SubscribeOptions {
  /** Execution priority (higher = earlier, default: 0) */
  priority?: number;
  /** If true, listener is removed after first execution */
  once?: boolean;
}
