import type { EventMap } from "../eventbus/eventbus.types";

/**
 * Plugin interface for extending EventBus functionality
 * Provides lifecycle hooks for observing and reacting to EventBus operations
 *
 * Note: Plugin functionality is currently not integrated into the EventBus
 * This interface is preserved for future use
 *
 * @template TEventMap - The event map defining available events
 * @example
 * ```ts
 * const loggingPlugin: Plugin = {
 *   name: 'logger',
 *   onInit: () => console.log('EventBus initialized'),
 *   onBeforeEmit: (event, payload) => console.log('Emitting:', event, payload)
 * }
 * ```
 */
export interface Plugin<TEventMap extends EventMap = EventMap> {
  /** Unique plugin identifier */
  name: string;

  /** Called when the EventBus is initialized */
  onInit?: () => void | Promise<void>;

  /** Called when a listener is subscribed */
  onSubscribe?: <K extends keyof TEventMap>(event: K, listenerId: symbol) => void | Promise<void>;

  /** Called when a listener is unsubscribed */
  onUnsubscribe?: <K extends keyof TEventMap>(event: K, listenerId: symbol) => void | Promise<void>;

  /**
   * Called before an event is emitted
   * Can be used for validation, transformation, or logging
   */
  onBeforeEmit?: <K extends keyof TEventMap>(
    event: K,
    payload: TEventMap[K],
  ) => void | Promise<void>;

  /**
   * Called after an event is emitted
   * Useful for metrics, logging, or cleanup
   */
  onAfterEmit?: <K extends keyof TEventMap>(
    event: K,
    payload: TEventMap[K],
    duration: number,
    handlerCount: number,
  ) => void | Promise<void>;

  /**
   * Called when an error occurs during handler execution
   * Allows for centralized error handling and logging
   */
  onError?: <K extends keyof TEventMap>(
    event: K,
    payload: TEventMap[K],
    error: unknown,
    handler?: symbol,
  ) => void | Promise<void>;
}
