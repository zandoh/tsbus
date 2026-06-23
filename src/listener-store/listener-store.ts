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
  /** Monotonic insertion order (lower = added earlier) */
  addedAt: number;
  /** Number of times this listener has been executed */
  executionCount: number;
  /** Total execution duration in milliseconds (for calculating average) */
  totalDuration: number;
}

const EMPTY_LISTENERS: Listener[] = [];

/**
 * Manages listener storage and retrieval
 * Separates exact matches from wildcard patterns for O(1) lookup performance
 */
interface ListenerStore {
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

/** Binary search for insertion index to maintain priority-FIFO order */
function findInsertIndex(listeners: Listener[], listener: Listener): number {
  let lo = 0;
  let hi = listeners.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const m = listeners[mid]!;
    // Sort by priority descending, then addedAt ascending
    if (
      m.priority > listener.priority ||
      (m.priority === listener.priority && m.addedAt <= listener.addedAt)
    ) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

/** Merge two pre-sorted listener arrays into a single sorted array in O(n+m) */
function mergeSorted(a: Listener[], b: Listener[]): Listener[] {
  const result: Listener[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const la = a[i]!;
    const lb = b[j]!;
    if (la.priority > lb.priority || (la.priority === lb.priority && la.addedAt <= lb.addedAt)) {
      result.push(la);
      i++;
    } else {
      result.push(lb);
      j++;
    }
  }
  while (i < a.length) {
    result.push(a[i++]!);
  }
  while (j < b.length) {
    result.push(b[j++]!);
  }
  return result;
}

export function createListenerStore(patternMatcher: PatternMatcher): ListenerStore {
  // Separate exact matches from wildcards for performance
  const exactMatches = new Map<string, Listener[]>();
  const wildcardPatterns = new Map<string, Listener[]>();
  const markedForRemoval = new Set<symbol>();

  // Reverse index: listenerId -> { map, pattern } for O(1) removeById
  const listenerIndex = new Map<symbol, { map: Map<string, Listener[]>; pattern: string }>();

  // Monotonic counter for deterministic FIFO ordering
  let nextId = 0;

  const getMapForPattern = (pattern: string) => {
    return patternMatcher.hasWildcard(pattern) ? wildcardPatterns : exactMatches;
  };

  const removeFromIndex = (listenerId: symbol): void => {
    listenerIndex.delete(listenerId);
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
        addedAt: nextId++,
        executionCount: 0,
        totalDuration: 0,
      };
      const listenerMap = getMapForPattern(pattern);
      const existing = listenerMap.get(pattern);

      if (existing) {
        // Binary search insertion to maintain sorted order
        const idx = findInsertIndex(existing, listener);
        existing.splice(idx, 0, listener);
      } else {
        listenerMap.set(pattern, [listener]);
      }

      // Populate reverse index
      listenerIndex.set(listenerId, { map: listenerMap, pattern });

      return listenerId;
    },

    remove(pattern: string, listenerId: symbol): boolean {
      const listenerMap = getMapForPattern(pattern);
      const existing = listenerMap.get(pattern);
      if (!existing) return false;

      const index = existing.findIndex((l) => l.id === listenerId);
      if (index === -1) return false;

      existing.splice(index, 1);
      if (existing.length === 0) {
        listenerMap.delete(pattern);
      }

      removeFromIndex(listenerId);
      return true;
    },

    removeById(listenerId: symbol): string | undefined {
      const entry = listenerIndex.get(listenerId);
      if (!entry) return undefined;

      const { map, pattern } = entry;
      const listeners = map.get(pattern);
      if (listeners) {
        const index = listeners.findIndex((l) => l.id === listenerId);
        if (index !== -1) {
          listeners.splice(index, 1);
          if (listeners.length === 0) {
            map.delete(pattern);
          }
        }
      }

      removeFromIndex(listenerId);
      return pattern;
    },

    removeAll(event?: string): Array<[string, symbol]> {
      if (event === undefined) {
        const removed = [
          ...collectAllListeners(exactMatches),
          ...collectAllListeners(wildcardPatterns),
        ];
        exactMatches.clear();
        wildcardPatterns.clear();
        listenerIndex.clear();

        return removed;
      }

      const listeners = exactMatches.get(event) ?? [];
      const removed: Array<[string, symbol]> = listeners.map((l) => [event, l.id]);

      // Clean reverse index for removed listeners
      for (const listener of listeners) {
        removeFromIndex(listener.id);
      }
      const wildcardListeners = wildcardPatterns.get(event);
      if (wildcardListeners) {
        for (const listener of wildcardListeners) {
          removed.push([event, listener.id]);
          removeFromIndex(listener.id);
        }
      }

      exactMatches.delete(event);
      wildcardPatterns.delete(event);

      return removed;
    },

    getMatching(event: string): Listener[] {
      const exactListeners = exactMatches.get(event);

      // Collect wildcard matches
      let wildcardListeners: Listener[] | undefined;
      if (wildcardPatterns.size > 0) {
        for (const [pattern, listeners] of wildcardPatterns.entries()) {
          if (patternMatcher.matches(pattern, event)) {
            if (!wildcardListeners) {
              wildcardListeners = listeners;
            } else {
              // Multiple wildcard sources — merge them
              wildcardListeners = mergeSorted(wildcardListeners, listeners);
            }
          }
        }
      }

      // No matches at all
      if (!exactListeners && !wildcardListeners) {
        return EMPTY_LISTENERS;
      }

      // Single source — return directly (zero copy)
      if (!wildcardListeners) {
        return exactListeners!;
      }
      if (!exactListeners) {
        return wildcardListeners;
      }

      // Both sources — merge pre-sorted arrays in O(n+m)
      return mergeSorted(exactListeners, wildcardListeners);
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
      const entry = listenerIndex.get(listenerId);
      if (!entry) return;

      const listeners = entry.map.get(entry.pattern);
      if (!listeners) return;

      const listener = listeners.find((l) => l.id === listenerId);
      if (listener) {
        listener.executionCount++;
        listener.totalDuration += duration;
      }
    },

    markForRemoval(listenerId: symbol): void {
      markedForRemoval.add(listenerId);
    },

    removeMarked(): void {
      if (markedForRemoval.size === 0) {
        return;
      }

      // Clean reverse index for marked listeners
      for (const listenerId of markedForRemoval) {
        removeFromIndex(listenerId);
      }

      removeMarkedFromMap(exactMatches);
      removeMarkedFromMap(wildcardPatterns);

      markedForRemoval.clear();
    },
  };
}
