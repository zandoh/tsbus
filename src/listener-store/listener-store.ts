import type { PatternMatcher } from "../pattern-matcher/pattern-matcher";
import type {
  ListenerHandler,
  ListenerInfo,
  ListenerMap,
  SubscribeOptions,
} from "./listener-store.types";

/**
 * Internal listener structure with metadata
 * Contains additional tracking information not exposed publicly
 * @template T - The type of payload this listener handles
 */
export interface Listener<T = unknown> {
  /** Unique listener identifier */
  id: symbol;
  /** Event handler function */
  handler: ListenerHandler<T>;
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
  /** Total execution duration in milliseconds (for calculating average) */
  totalDuration: number;
}

/**
 * Manages listener storage and retrieval
 * Separates exact matches from wildcard patterns for O(1) lookup performance
 */
export interface ListenerStore {
  /** Add a new listener and return its unique ID */
  add(pattern: string, handler: ListenerHandler<unknown>, options: SubscribeOptions): symbol;
  /** Remove a listener by pattern and ID */
  remove(pattern: string, listenerId: symbol): boolean;
  /** Remove a listener by ID only, returns the pattern if found */
  removeById(listenerId: symbol): string | undefined;
  /** Remove all listeners for an event, or all listeners if no event specified */
  removeAll(event?: string): Array<[string, symbol]>;
  /** Get all listeners that match a given event */
  getMatching(event: string): Listener[];
  /** Get all registered listeners, optionally filtered by event */
  getAll(event?: string): ListenerMap;
  /** Update execution statistics for a listener */
  updateStats(listenerId: symbol, duration: number): void;
  /** Mark a listener for removal (batch operation) */
  markForRemoval(listenerId: symbol): void;
  /** Remove all marked listeners */
  removeMarked(): void;
}

export function createListenerStore(patternMatcher: PatternMatcher): ListenerStore {
  // Separate exact matches from wildcards for performance
  const exactMatches = new Map<string, Listener[]>();
  const wildcardPatterns = new Map<string, Listener[]>();
  const markedForRemoval = new Set<symbol>();

  const getMapForPattern = (pattern: string) => {
    return patternMatcher.hasWildcard(pattern) ? wildcardPatterns : exactMatches;
  };

  const sortByPriority = (listeners: Listener[]) => {
    return [...listeners].sort((a, b) => {
      // Sort by priority (higher first)
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      // Within same priority, maintain FIFO order (stable sort by addedAt)
      return a.addedAt - b.addedAt;
    });
  };

  const removeListenerById = (
    map: Map<string, Listener[]>,
    listenerId: symbol,
  ): string | undefined => {
    for (const [pattern, listeners] of map.entries()) {
      const index = listeners.findIndex((l) => l.id === listenerId);
      if (index !== -1) {
        const updated = listeners.filter((l) => l.id !== listenerId);
        if (updated.length === 0) {
          map.delete(pattern);
        } else {
          map.set(pattern, updated);
        }
        return pattern;
      }
    }
    return undefined;
  };

  const collectAllListeners = (map: Map<string, Listener[]>): Array<[string, symbol]> => {
    const collected: Array<[string, symbol]> = [];

    for (const [pattern, listeners] of map.entries()) {
      for (const listener of listeners) {
        collected.push([pattern, listener.id]);
      }
    }
    return collected;
  };

  const addMatchingToResult = (
    map: Map<string, Listener[]>,
    result: Map<string, ListenerInfo[]>,
    mapListeners: (listeners: Listener[]) => ListenerInfo[],
    event?: string,
  ): void => {
    for (const [pattern, listeners] of map.entries()) {
      if (event === undefined || patternMatcher.matches(pattern, event)) {
        result.set(pattern, mapListeners(listeners));
      }
    }
  };

  const removeMarkedFromMap = (map: Map<string, Listener[]>): void => {
    for (const [pattern, listeners] of map.entries()) {
      const updated = listeners.filter((l) => !markedForRemoval.has(l.id));

      if (updated.length === 0) {
        map.delete(pattern);
      } else if (updated.length !== listeners.length) {
        map.set(pattern, updated);
      }
    }
  };

  return {
    add(
      pattern: string,
      handler: ListenerHandler<unknown>,
      options: SubscribeOptions = {},
    ): symbol {
      const listenerId = Symbol(`listener:${pattern}`);
      const listener: Listener = {
        id: listenerId,
        handler,
        priority: options.priority ?? 0,
        once: options.once ?? false,
        pattern,
        addedAt: Date.now(),
        executionCount: 0,
        totalDuration: 0,
      };
      const listenerMap = getMapForPattern(pattern);
      const existing = listenerMap.get(pattern) ?? [];
      const updated = sortByPriority([...existing, listener]);

      listenerMap.set(pattern, updated);

      return listenerId;
    },

    remove(pattern: string, listenerId: symbol): boolean {
      const listenerMap = getMapForPattern(pattern);
      const existing = listenerMap.get(pattern) ?? [];
      const updated = existing.filter((l) => l.id !== listenerId);

      if (updated.length === 0) {
        listenerMap.delete(pattern);
      } else {
        listenerMap.set(pattern, updated);
      }

      return updated.length !== existing.length;
    },

    removeById(listenerId: symbol): string | undefined {
      // Check exact matches first, then wildcards
      return (
        removeListenerById(exactMatches, listenerId) ??
        removeListenerById(wildcardPatterns, listenerId)
      );
    },

    removeAll(event?: string): Array<[string, symbol]> {
      if (event === undefined) {
        const removed = [
          ...collectAllListeners(exactMatches),
          ...collectAllListeners(wildcardPatterns),
        ];
        exactMatches.clear();
        wildcardPatterns.clear();

        return removed;
      }

      const listeners = exactMatches.get(event) ?? [];
      const removed: Array<[string, symbol]> = listeners.map((l) => [event, l.id]);

      exactMatches.delete(event);
      wildcardPatterns.delete(event);

      return removed;
    },

    getMatching(event: string): Listener[] {
      const matching: Listener[] = [];
      const exactListeners = exactMatches.get(event);

      if (exactListeners) {
        matching.push(...exactListeners);
      }

      for (const [pattern, listeners] of wildcardPatterns.entries()) {
        if (patternMatcher.matches(pattern, event)) {
          matching.push(...listeners);
        }
      }

      return sortByPriority(matching);
    },

    getAll(event?: string): ListenerMap {
      const result = new Map<string, ListenerInfo[]>();

      const mapListeners = (listeners: Listener[]) =>
        listeners.map((l) => ({
          id: l.id,
          priority: l.priority,
          once: l.once,
          pattern: l.pattern,
          addedAt: l.addedAt,
          executionCount: l.executionCount,
          avgDuration: l.executionCount > 0 ? l.totalDuration / l.executionCount : 0,
        }));

      addMatchingToResult(exactMatches, result, mapListeners, event);
      addMatchingToResult(wildcardPatterns, result, mapListeners, event);

      return result;
    },

    updateStats(listenerId: symbol, duration: number): void {
      const findAndUpdate = (map: Map<string, Listener[]>) => {
        for (const listeners of map.values()) {
          const listener = listeners.find((l) => l.id === listenerId);

          if (listener) {
            listener.executionCount++;
            listener.totalDuration += duration;
            return true;
          }
        }
        return false;
      };

      if (!findAndUpdate(exactMatches)) {
        findAndUpdate(wildcardPatterns);
      }
    },

    markForRemoval(listenerId: symbol): void {
      markedForRemoval.add(listenerId);
    },

    removeMarked(): void {
      if (markedForRemoval.size === 0) {
        return;
      }
      removeMarkedFromMap(exactMatches);
      removeMarkedFromMap(wildcardPatterns);

      markedForRemoval.clear();
    },
  };
}
