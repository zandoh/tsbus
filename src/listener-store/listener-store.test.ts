import { describe, expect, it } from "vitest";
import { createPatternMatcher } from "../pattern-matcher/pattern-matcher";
import { createListenerStore } from "./listener-store";

describe("ListenerStore", () => {
  describe("add", () => {
    it("should add a listener and return its id", () => {
      const matcher = createPatternMatcher();
      const store = createListenerStore(matcher);

      const handler = () => {};
      const id = store.add("test:event", handler, {});

      expect(typeof id).toBe("symbol");
    });

    it("should sort listeners by priority", () => {
      const matcher = createPatternMatcher();
      const store = createListenerStore(matcher);

      store.add("test:event", () => {}, { priority: 1 });
      store.add("test:event", () => {}, { priority: 10 });
      store.add("test:event", () => {}, { priority: 5 });

      const listeners = store.getMatching("test:event");
      expect(listeners[0]?.priority).toBe(10);
      expect(listeners[1]?.priority).toBe(5);
      expect(listeners[2]?.priority).toBe(1);
    });

    it("should separate exact matches from wildcards", () => {
      const matcher = createPatternMatcher();
      const store = createListenerStore(matcher);

      const exactId = store.add("test:event", () => {}, {});
      const wildcardId = store.add("test:*", () => {}, {});

      expect(exactId).toBeDefined();
      expect(wildcardId).toBeDefined();
    });
  });

  describe("remove", () => {
    it("should remove a listener by pattern and id", () => {
      const matcher = createPatternMatcher();
      const store = createListenerStore(matcher);

      const id = store.add("test:event", () => {}, {});
      const removed = store.remove("test:event", id);

      expect(removed).toBe(true);

      const listeners = store.getMatching("test:event");
      expect(listeners.length).toBe(0);
    });

    it("should return false if listener not found", () => {
      const matcher = createPatternMatcher();
      const store = createListenerStore(matcher);

      const fakeId = Symbol("fake");
      const removed = store.remove("test:event", fakeId);

      expect(removed).toBe(false);
    });
  });

  describe("removeById", () => {
    it("should remove a listener by id and return the pattern", () => {
      const matcher = createPatternMatcher();
      const store = createListenerStore(matcher);

      const id = store.add("test:event", () => {}, {});
      const pattern = store.removeById(id);

      expect(pattern).toBe("test:event");

      const listeners = store.getMatching("test:event");
      expect(listeners.length).toBe(0);
    });

    it("should return undefined if listener not found", () => {
      const matcher = createPatternMatcher();
      const store = createListenerStore(matcher);

      const fakeId = Symbol("fake");
      const pattern = store.removeById(fakeId);

      expect(pattern).toBeUndefined();
    });
  });

  describe("removeAll", () => {
    it("should remove all listeners when no event specified", () => {
      const matcher = createPatternMatcher();
      const store = createListenerStore(matcher);

      store.add("test:event1", () => {}, {});
      store.add("test:event2", () => {}, {});
      store.add("test:*", () => {}, {});

      const removed = store.removeAll();

      expect(removed.length).toBe(3);
      expect(store.getMatching("test:event1").length).toBe(0);
      expect(store.getMatching("test:event2").length).toBe(0);
    });

    it("should remove listeners for specific event", () => {
      const matcher = createPatternMatcher();
      const store = createListenerStore(matcher);

      store.add("test:event", () => {}, {});
      store.add("test:event", () => {}, {});
      store.add("other:event", () => {}, {});

      const removed = store.removeAll("test:event");

      expect(removed.length).toBe(2);
      expect(store.getMatching("test:event").length).toBe(0);
      expect(store.getMatching("other:event").length).toBe(1);
    });
  });

  describe("getMatching", () => {
    it("should find exact match listeners", () => {
      const matcher = createPatternMatcher();
      const store = createListenerStore(matcher);

      store.add("test:event", () => {}, {});
      const listeners = store.getMatching("test:event");

      expect(listeners.length).toBe(1);
      expect(listeners[0]?.pattern).toBe("test:event");
    });

    it("should find wildcard match listeners", () => {
      const matcher = createPatternMatcher();
      const store = createListenerStore(matcher);

      store.add("test:*", () => {}, {});
      const listeners = store.getMatching("test:login");

      expect(listeners.length).toBe(1);
      expect(listeners[0]?.pattern).toBe("test:*");
    });

    it("should combine exact and wildcard matches", () => {
      const matcher = createPatternMatcher();
      const store = createListenerStore(matcher);

      store.add("test:event", () => {}, {});
      store.add("test:*", () => {}, {});
      store.add("*", () => {}, {});

      const listeners = store.getMatching("test:event");

      expect(listeners.length).toBe(3);
    });

    it("should sort by priority across exact and wildcard matches", () => {
      const matcher = createPatternMatcher();
      const store = createListenerStore(matcher);

      store.add("test:event", () => {}, { priority: 5 });
      store.add("test:*", () => {}, { priority: 10 });
      store.add("*", () => {}, { priority: 1 });

      const listeners = store.getMatching("test:event");

      expect(listeners[0]?.priority).toBe(10);
      expect(listeners[1]?.priority).toBe(5);
      expect(listeners[2]?.priority).toBe(1);
    });
  });

  describe("getAll", () => {
    it("should return all listeners", () => {
      const matcher = createPatternMatcher();
      const store = createListenerStore(matcher);

      store.add("test:event", () => {}, {});
      store.add("test:*", () => {}, {});

      const all = store.getAll();

      expect(all.size).toBe(2);
      expect(all.has("test:event")).toBe(true);
      expect(all.has("test:*")).toBe(true);
    });

    it("should return listeners matching specific event", () => {
      const matcher = createPatternMatcher();
      const store = createListenerStore(matcher);

      store.add("test:event", () => {}, {});
      store.add("test:*", () => {}, {});
      store.add("other:event", () => {}, {});

      const matching = store.getAll("test:event");

      expect(matching.size).toBe(2);
      expect(matching.has("test:event")).toBe(true);
      expect(matching.has("test:*")).toBe(true);
      expect(matching.has("other:event")).toBe(false);
    });
  });

  describe("updateStats", () => {
    it("should update listener execution stats", () => {
      const matcher = createPatternMatcher();
      const store = createListenerStore(matcher);

      const id = store.add("test:event", () => {}, {});

      store.updateStats(id, 100);
      store.updateStats(id, 200);

      const listeners = store.getMatching("test:event");
      expect(listeners[0]?.executionCount).toBe(2);
      expect(listeners[0]?.totalDuration).toBe(300);
    });
  });

  describe("markForRemoval and removeMarked", () => {
    it("should mark and remove listeners", () => {
      const matcher = createPatternMatcher();
      const store = createListenerStore(matcher);

      const id1 = store.add("test:event", () => {}, {});
      const id2 = store.add("test:event", () => {}, {});

      store.markForRemoval(id1);
      store.removeMarked();

      const listeners = store.getMatching("test:event");
      expect(listeners.length).toBe(1);
      expect(listeners[0]?.id).toBe(id2);
    });

    it("should handle multiple marked listeners", () => {
      const matcher = createPatternMatcher();
      const store = createListenerStore(matcher);

      const id1 = store.add("test:event", () => {}, {});
      const id2 = store.add("test:event", () => {}, {});
      const id3 = store.add("test:event", () => {}, {});

      store.markForRemoval(id1);
      store.markForRemoval(id3);
      store.removeMarked();

      const listeners = store.getMatching("test:event");
      expect(listeners.length).toBe(1);
      expect(listeners[0]?.id).toBe(id2);
    });
  });
});
