import { createHandlerExecutor } from '../handler-executor/handler-executor'
import { createListenerStore } from '../listener-store/listener-store'
import type {
  ListenerHandler,
  ListenerMap,
  SubscribeOptions,
} from '../listener-store/listener-store.types'
import { createPatternMatcher } from '../pattern-matcher/pattern-matcher'
import { createPluginManager } from '../plugin-manager/plugin-manager'
import type { EventBus, EventBusConfig, EventMap } from './eventbus.types'

export function createEventBus<TEventMap extends EventMap = EventMap>(
  config?: EventBusConfig<TEventMap>,
): EventBus<TEventMap> {
  const patternMatcher = createPatternMatcher()
  const listenerStore = createListenerStore(patternMatcher)
  const handlerExecutor = createHandlerExecutor<TEventMap>()
  const pluginManager = createPluginManager<TEventMap>(config?.plugins ?? [])

  pluginManager.callHook('onInit')

  const subscribe = (
    pattern: string,
    handler: ListenerHandler<unknown>,
    options: SubscribeOptions = {},
  ): (() => void) => {
    const listenerId = listenerStore.add(pattern, handler, options)

    pluginManager.callHook('onSubscribe', pattern, listenerId)

    return (): void => {
      listenerStore.remove(pattern, listenerId)
      pluginManager.callHook('onUnsubscribe', pattern, listenerId)
    }
  }

  const on = <K extends keyof TEventMap>(
    event: K,
    handler: ListenerHandler<TEventMap[K]>,
    options?: SubscribeOptions,
  ): (() => void) => {
    return subscribe(String(event), handler as ListenerHandler<unknown>, options)
  }

  const onPattern = (
    pattern: string,
    handler: ListenerHandler<unknown>,
    options?: SubscribeOptions,
  ): (() => void) => {
    return subscribe(pattern, handler, options)
  }

  const once = <K extends keyof TEventMap>(
    event: K,
    handler: ListenerHandler<TEventMap[K]>,
    options?: Omit<SubscribeOptions, 'once'>,
  ): (() => void) => {
    return subscribe(String(event), handler as ListenerHandler<unknown>, { ...options, once: true })
  }

  const emit = async <K extends keyof TEventMap>(
    event: K,
    payload: TEventMap[K],
  ): Promise<void> => {
    const eventStr = String(event)

    await pluginManager.callHook('onBeforeEmit', event, payload)

    const startTime = Date.now()
    const matchingListeners = listenerStore.getMatching(eventStr)

    const { listenersToRemove, errors } = await handlerExecutor.execute(
      event,
      payload,
      matchingListeners,
    )

    const duration = Date.now() - startTime
    await pluginManager.callHook(
      'onAfterEmit',
      event,
      payload,
      duration,
      matchingListeners.length,
    )

    for (const { error, listenerId } of errors) {
      await pluginManager.callHook('onError', event, payload, error, listenerId)
    }

    // Remove once listeners
    for (const listenerId of listenersToRemove) {
      listenerStore.removeById(listenerId)
    }
  }

  const off = (listenerId: symbol): void => {
    const pattern = listenerStore.removeById(listenerId)
    if (pattern) {
      pluginManager.callHook('onUnsubscribe', pattern, listenerId)
    }
  }

  const offAll = <K extends keyof TEventMap>(event?: K): void => {
    const removed = listenerStore.removeAll(event ? String(event) : undefined)
    for (const [pattern, listenerId] of removed) {
      pluginManager.callHook('onUnsubscribe', pattern, listenerId)
    }
  }

  const getListeners = (event?: string): ListenerMap => {
    return listenerStore.getAll(event)
  }

  const bus: EventBus<TEventMap> = {
    on,
    onPattern,
    once,
    emit,
    off,
    offAll,
    getListeners,
  }

  return bus
}
