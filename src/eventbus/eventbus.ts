import type { Listener } from "../listener-store/listener-store";
import { createListenerStore } from "../listener-store/listener-store";
import type {
  ListenerHandler,
  ListenerMap,
  SubscribeOptions,
} from "../listener-store/listener-store.types";
import { createPatternMatcher } from "../pattern-matcher/pattern-matcher";
import { type PluginManager, createPluginManager } from "../plugin-manager/plugin-manager";
import type { EventBus, EventBusConfig, EventMap } from "./eventbus.types";

/** Cached resolved promise — avoids allocation on the sync fast path */
const RESOLVED: Promise<void> = Promise.resolve();

export function createEventBus<TEventMap extends EventMap = EventMap>(
  config?: EventBusConfig<TEventMap>,
): EventBus<TEventMap> {
  const patternMatcher = createPatternMatcher();
  const listenerStore = createListenerStore(patternMatcher);
  const trackStats = config?.trackStats ?? false;

  // Null plugin manager — only create when plugins are configured
  const hasPlugins = (config?.plugins?.length ?? 0) > 0;
  let pluginManager: PluginManager<TEventMap> | undefined;
  if (hasPlugins) {
    pluginManager = createPluginManager<TEventMap>(config!.plugins!);
    pluginManager.callHook("onInit");
  }

  const subscribe = (
    pattern: string,
    handler: ListenerHandler<unknown>,
    options: SubscribeOptions = {},
  ): (() => void) => {
    const listenerId = listenerStore.add(pattern, handler, options);

    if (hasPlugins) {
      pluginManager!.callHook("onSubscribe", pattern, listenerId);
    }

    return (): void => {
      listenerStore.remove(pattern, listenerId);
      if (hasPlugins) {
        pluginManager!.callHook("onUnsubscribe", pattern, listenerId);
      }
    };
  };

  const on = <K extends keyof TEventMap>(
    event: K,
    handler: ListenerHandler<TEventMap[K]>,
    options?: SubscribeOptions,
  ): (() => void) => {
    return subscribe(String(event), handler as ListenerHandler<unknown>, options);
  };

  const onPattern = (
    pattern: string,
    handler: ListenerHandler<unknown>,
    options?: SubscribeOptions,
  ): (() => void) => {
    return subscribe(pattern, handler, options);
  };

  const once = <K extends keyof TEventMap>(
    event: K,
    handler: ListenerHandler<TEventMap[K]>,
    options?: Omit<SubscribeOptions, "once">,
  ): (() => void) => {
    return subscribe(String(event), handler as ListenerHandler<unknown>, {
      ...options,
      once: true,
    });
  };

  /**
   * Async continuation for the fast path — called when a handler returns a thenable.
   * Finishes awaiting `pendingResult`, then continues the remaining listeners.
   */
  async function emitAsyncFrom<K extends keyof TEventMap>(
    _event: K,
    payload: TEventMap[K],
    listeners: Listener[],
    startIndex: number,
    pendingResult: PromiseLike<void>,
    currentListener: Listener,
  ): Promise<void> {
    // Finish the pending handler
    try {
      await pendingResult;
      currentListener.executionCount++;
      if (currentListener.once) {
        listenerStore.removeById(currentListener.id);
      }
    } catch {
      // Error in async handler — don't remove once-listener
    }

    for (let i = startIndex; i < listeners.length; i++) {
      const listener = listeners[i]!;
      try {
        const result = listener.handler(payload);
        if (result && typeof (result as PromiseLike<void>).then === "function") {
          try {
            // eslint-disable-next-line no-await-in-loop -- sequential execution preserves listener ordering guarantees
            await result;
            listener.executionCount++;
            if (listener.once) {
              listenerStore.removeById(listener.id);
            }
          } catch {
            // Error in async handler — don't remove once-listener
          }
        } else {
          listener.executionCount++;
          if (listener.once) {
            listenerStore.removeById(listener.id);
          }
        }
      } catch {
        // Error in sync handler — don't remove once-listener
      }
    }
  }

  /**
   * Slow path: emit with full plugin lifecycle.
   */
  async function emitWithPlugins<K extends keyof TEventMap>(
    event: K,
    payload: TEventMap[K],
  ): Promise<void> {
    const eventStr = String(event);
    await pluginManager!.callHook("onBeforeEmit", event, payload);

    const startTime = trackStats ? Date.now() : 0;
    const matchingListeners = listenerStore.getMatching(eventStr);

    const listenersToRemove: symbol[] = [];
    const errors: Array<{ error: unknown; listenerId: symbol }> = [];

    for (const listener of matchingListeners) {
      const handlerStart = trackStats ? Date.now() : 0;
      try {
        const result = listener.handler(payload);
        if (result && typeof (result as PromiseLike<void>).then === "function") {
          try {
            // eslint-disable-next-line no-await-in-loop -- sequential execution preserves listener ordering guarantees and per-handler timing accuracy
            await result;
            if (trackStats) {
              listener.totalDuration += Date.now() - handlerStart;
            }
            listener.executionCount++;
            if (listener.once) {
              listenersToRemove.push(listener.id);
            }
          } catch (error) {
            if (trackStats) {
              listener.totalDuration += Date.now() - handlerStart;
            }
            errors.push({ error, listenerId: listener.id });
          }
        } else {
          if (trackStats) {
            listener.totalDuration += Date.now() - handlerStart;
          }
          listener.executionCount++;
          if (listener.once) {
            listenersToRemove.push(listener.id);
          }
        }
      } catch (error) {
        if (trackStats) {
          listener.totalDuration += Date.now() - handlerStart;
        }
        errors.push({ error, listenerId: listener.id });
      }
    }

    const duration = trackStats ? Date.now() - startTime : 0;
    await pluginManager!.callHook(
      "onAfterEmit",
      event,
      payload,
      duration,
      matchingListeners.length,
    );

    for (const { error, listenerId } of errors) {
      // eslint-disable-next-line no-await-in-loop -- errors are reported to plugins sequentially so handlers can take corrective action in order
      await pluginManager!.callHook("onError", event, payload, error, listenerId);
    }

    for (const listenerId of listenersToRemove) {
      listenerStore.removeById(listenerId);
    }
  }

  /**
   * Sync-first emit. Returns a cached RESOLVED promise when all handlers are sync
   * and no plugins are configured — zero allocation on the hot path.
   */
  const emit = <K extends keyof TEventMap>(event: K, payload: TEventMap[K]): Promise<void> => {
    // Slow path: delegate to async emitWithPlugins
    if (hasPlugins) {
      return emitWithPlugins(event, payload);
    }

    // Fast path: no plugins — inline execution
    const eventStr = String(event);
    const matchingListeners = listenerStore.getMatching(eventStr);

    for (let i = 0; i < matchingListeners.length; i++) {
      const listener = matchingListeners[i]!;
      try {
        const result = listener.handler(payload);
        // Thenable detection — hand off to async continuation
        if (result && typeof (result as PromiseLike<void>).then === "function") {
          return emitAsyncFrom(
            event,
            payload,
            matchingListeners,
            i + 1,
            result as PromiseLike<void>,
            listener,
          );
        }
        listener.executionCount++;
        if (listener.once) {
          listenerStore.removeById(listener.id);
        }
      } catch {
        // Error in sync handler — don't remove once-listener, continue to next
      }
    }

    return RESOLVED;
  };

  const off = (listenerId: symbol): void => {
    const pattern = listenerStore.removeById(listenerId);
    if (pattern && hasPlugins) {
      pluginManager!.callHook("onUnsubscribe", pattern, listenerId);
    }
  };

  const offAll = <K extends keyof TEventMap>(event?: K): void => {
    const removed = listenerStore.removeAll(event ? String(event) : undefined);
    if (hasPlugins) {
      for (const [pattern, listenerId] of removed) {
        pluginManager!.callHook("onUnsubscribe", pattern, listenerId);
      }
    }
  };

  const getListeners = (event?: string): ListenerMap => {
    return listenerStore.getAll(event);
  };

  const bus: EventBus<TEventMap> = {
    on,
    onPattern,
    once,
    emit,
    off,
    offAll,
    getListeners,
  };

  return bus;
}
