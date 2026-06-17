import type {
  ListenerHandler,
  ListenerMap,
  SubscribeOptions,
} from '../listener-store/listener-store.types'
import type { Plugin } from '../plugin-manager/plugin-manager.types'

/**
 * Type-safe mapping of event names to their payload types
 * @example
 * ```ts
 * interface MyEvents {
 *   'user:login': { userId: string }
 *   'user:logout': { userId: string }
 * }
 * ```
 */
export type EventMap = Record<string, unknown>

/**
 * Configuration options for creating an EventBus
 * @template TEventMap - The event map defining available events and their payloads
 */
export interface EventBusConfig<TEventMap extends EventMap = EventMap> {
  /** Plugins to extend EventBus functionality with lifecycle hooks */
  plugins?: Plugin<TEventMap>[]
}

/**
 * Type-safe event bus for publishing and subscribing to events
 * Supports both exact matches and wildcard patterns
 * @template TEventMap - The event map defining available events and their payloads
 */
export interface EventBus<TEventMap extends EventMap = EventMap> {
  /**
   * Subscribe to an event
   * @param event - The event name to listen for
   * @param handler - Function to call when the event is emitted
   * @param options - Optional subscription settings (priority, once)
   * @returns Unsubscribe function
   * @example
   * ```ts
   * const unsubscribe = bus.on('user:login', (payload) => {
   *   console.log('User logged in:', payload.userId)
   * })
   * ```
   */
  on<K extends keyof TEventMap>(
    event: K,
    handler: ListenerHandler<TEventMap[K]>,
    options?: SubscribeOptions,
  ): () => void

  /**
   * Subscribe to an event pattern (supports wildcards like 'user:*')
   * @param pattern - The pattern to match (supports * wildcard)
   * @param handler - Function to call when matching events are emitted
   * @param options - Optional subscription settings (priority, once)
   * @returns Unsubscribe function
   * @example
   * ```ts
   * bus.onPattern('user:*', (payload) => {
   *   console.log('User event:', payload)
   * })
   * ```
   */
  onPattern(
    pattern: string,
    handler: ListenerHandler<unknown>,
    options?: SubscribeOptions,
  ): () => void

  /**
   * Subscribe to an event once (automatically unsubscribes after first call)
   * @param event - The event name to listen for
   * @param handler - Function to call when the event is emitted
   * @param options - Optional subscription settings (priority only)
   * @returns Unsubscribe function
   * @example
   * ```ts
   * bus.once('app:init', () => {
   *   console.log('App initialized')
   * })
   * ```
   */
  once<K extends keyof TEventMap>(
    event: K,
    handler: ListenerHandler<TEventMap[K]>,
    options?: Omit<SubscribeOptions, 'once'>,
  ): () => void

  /**
   * Emit an event to all matching listeners
   * Executes handlers sequentially in priority order (FIFO within same priority)
   * @param event - The event name to emit
   * @param payload - The data to send to listeners
   * @returns Promise that resolves when all handlers complete
   * @example
   * ```ts
   * await bus.emit('user:login', { userId: '123' })
   * ```
   */
  emit<K extends keyof TEventMap>(event: K, payload: TEventMap[K]): Promise<void>

  /**
   * Remove a specific listener by its ID
   * @param listenerId - The symbol ID returned from subscription methods
   */
  off(listenerId: symbol): void

  /**
   * Remove all listeners for an event (or all listeners if no event specified)
   * @param event - Optional event name to remove listeners for
   * @example
   * ```ts
   * bus.offAll('user:login') // Remove all user:login listeners
   * bus.offAll() // Remove ALL listeners
   * ```
   */
  offAll<K extends keyof TEventMap>(event?: K): void

  /**
   * Get all active listeners (optionally filtered by event)
   * Useful for debugging and introspection
   * @param event - Optional event name to filter listeners
   * @returns Map of patterns to their listener information
   */
  getListeners(event?: string): ListenerMap
}
