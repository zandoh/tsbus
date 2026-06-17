import type { EventMap } from "../eventbus/eventbus.types";
import { logger } from "../logger/logger";
import type { Plugin } from "./plugin-manager.types";

/**
 * Manages plugin execution with error handling
 * Note: Currently not integrated into EventBus, preserved for future use
 * @template TEventMap - The event map defining available events
 */
export interface PluginManager<TEventMap extends EventMap> {
  /**
   * Call a specific hook on all registered plugins
   * Executes all plugin hooks in parallel with error handling
   * @param hookName - The name of the hook to call
   * @param args - Arguments to pass to the hook
   */
  callHook<Args extends unknown[]>(hookName: keyof Plugin<TEventMap>, ...args: Args): Promise<void>;
}

/**
 * Creates a plugin manager that safely executes plugin hooks
 * Handles errors gracefully without interrupting other plugins
 *
 * @template TEventMap - The event map defining available events
 * @param plugins - Array of plugins to manage
 * @returns PluginManager instance
 */
export function createPluginManager<TEventMap extends EventMap>(
  plugins: Plugin<TEventMap>[],
): PluginManager<TEventMap> {
  return {
    async callHook<Args extends unknown[]>(
      hookName: keyof Plugin<TEventMap>,
      ...args: Args
    ): Promise<void> {
      const hookPromises = plugins
        .map((plugin) => {
          const hook = plugin[hookName];
          if (hook) {
            try {
              return (hook as (...args: unknown[]) => void | Promise<void>)(...args);
            } catch (error) {
              logger.error(`Error in plugin "${plugin.name}" hook "${String(hookName)}":`, error);
              return undefined;
            }
          }
          return undefined;
        })
        .filter((p): p is Promise<void> | void => p !== undefined);

      // Wait for all plugin hooks to complete
      await Promise.all(hookPromises);
    },
  };
}
