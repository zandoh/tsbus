import { describe, expect, it, vi } from "vitest";
import type { Listener } from "../listener-store/listener-store";
import { createHandlerExecutor } from "./handler-executor";

interface TestEvents extends Record<string, unknown> {
  "test:event": { message: string };
}

const createMockListener = (
  handler: (payload: TestEvents["test:event"]) => void | Promise<void>,
  options: { once?: boolean; priority?: number } = {},
): Listener => ({
  id: Symbol("test"),
  handler: handler as (payload: unknown) => void | Promise<void>,
  priority: options.priority ?? 0,
  once: options.once ?? false,
  pattern: "test:event",
  addedAt: Date.now(),
  executionCount: 0,
  totalDuration: 0,
});

describe("HandlerExecutor", () => {
  describe("priority-based FIFO execution", () => {
    it("should execute handlers in order (respecting priority)", async () => {
      const executor = createHandlerExecutor<TestEvents>();

      const order: number[] = [];

      // Create listeners with distinct timestamps to ensure FIFO ordering
      const baseTime = Date.now();

      const handler1 = async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        order.push(1);
      };
      const handler2 = async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        order.push(2);
      };
      const handler3 = () => {
        order.push(3);
      };

      const listener1: Listener = {
        id: Symbol("test-1"),
        handler: handler1,
        priority: 10,
        once: false,
        pattern: "test:event",
        addedAt: baseTime,
        executionCount: 0,
        totalDuration: 0,
      };

      const listener2: Listener = {
        id: Symbol("test-2"),
        handler: handler2,
        priority: 5,
        once: false,
        pattern: "test:event",
        addedAt: baseTime + 2,
        executionCount: 0,
        totalDuration: 0,
      };

      const listener3: Listener = {
        id: Symbol("test-3"),
        handler: handler3,
        priority: 10,
        once: false,
        pattern: "test:event",
        addedAt: baseTime + 1,
        executionCount: 0,
        totalDuration: 0,
      };

      // Pass listeners in priority order: listener1 (priority 10, added first), listener3 (priority 10, added second), listener2 (priority 5)
      await executor.execute("test:event", { message: "test" }, [listener1, listener3, listener2]);

      // Priority 10 listeners execute first (in FIFO order), then priority 5
      expect(order).toEqual([1, 3, 2]);
    });

    it("should update listener stats", async () => {
      const executor = createHandlerExecutor<TestEvents>();

      const listener = createMockListener(() => {});

      await executor.execute("test:event", { message: "test" }, [listener]);

      expect(listener.executionCount).toBe(1);
      expect(listener.totalDuration).toBeGreaterThanOrEqual(0);
    });

    it("should return listeners marked once for removal", async () => {
      const executor = createHandlerExecutor<TestEvents>();

      const listener1 = createMockListener(() => {}, { once: true });
      const listener2 = createMockListener(() => {}, { once: false });
      const listener3 = createMockListener(() => {}, { once: true });

      const result = await executor.execute("test:event", { message: "test" }, [
        listener1,
        listener2,
        listener3,
      ]);

      expect(result.listenersToRemove).toContain(listener1.id);
      expect(result.listenersToRemove).not.toContain(listener2.id);
      expect(result.listenersToRemove).toContain(listener3.id);
    });

    it("should handle sync handlers", async () => {
      const executor = createHandlerExecutor<TestEvents>();

      const syncHandler = vi.fn();
      const listener = createMockListener(syncHandler);

      await executor.execute("test:event", { message: "test" }, [listener]);

      expect(syncHandler).toHaveBeenCalledWith({ message: "test" });
    });

    it("should handle async handlers", async () => {
      const executor = createHandlerExecutor<TestEvents>();

      const asyncHandler = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      const listener = createMockListener(asyncHandler);

      await executor.execute("test:event", { message: "test" }, [listener]);

      expect(asyncHandler).toHaveBeenCalledWith({ message: "test" });
    });

    it("should catch handler errors", async () => {
      const executor = createHandlerExecutor<TestEvents>();

      const errorHandler = vi.fn(() => {
        throw new Error("Handler error");
      });
      const listener = createMockListener(errorHandler);

      await executor.execute("test:event", { message: "test" }, [listener]);

      expect(errorHandler).toHaveBeenCalled();
    });

    it("should not mark errored listeners for removal even if once", async () => {
      const executor = createHandlerExecutor<TestEvents>();

      const errorHandler = vi.fn(() => {
        throw new Error("Handler error");
      });
      const listener = createMockListener(errorHandler, { once: true });

      const result = await executor.execute("test:event", { message: "test" }, [listener]);

      expect(result.listenersToRemove).not.toContain(listener.id);
    });
  });

  describe("error handling", () => {
    it("should continue executing remaining handlers after error", async () => {
      const executor = createHandlerExecutor<TestEvents>();

      const errorHandler = vi.fn(() => {
        throw new Error("Handler error");
      });
      const successHandler = vi.fn();

      const listener1 = createMockListener(errorHandler);
      const listener2 = createMockListener(successHandler);

      await executor.execute("test:event", { message: "test" }, [listener1, listener2]);

      expect(errorHandler).toHaveBeenCalled();
      expect(successHandler).toHaveBeenCalled();
    });
  });
});
