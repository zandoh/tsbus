import { describe, expect, it, vi } from "vitest";
import { createPluginManager } from "./plugin-manager";
import type { Plugin } from "./plugin-manager.types";

interface TestEvents extends Record<string, unknown> {
  "test:event": { message: string };
}

describe("PluginManager", () => {
  describe("callHook", () => {
    it("should call all plugin hooks", async () => {
      const onInitSpy1 = vi.fn();
      const onInitSpy2 = vi.fn();

      const plugin1: Plugin<TestEvents> = {
        name: "plugin1",
        onInit: onInitSpy1,
      };

      const plugin2: Plugin<TestEvents> = {
        name: "plugin2",
        onInit: onInitSpy2,
      };

      const manager = createPluginManager([plugin1, plugin2]);
      await manager.callHook("onInit");

      expect(onInitSpy1).toHaveBeenCalledTimes(1);
      expect(onInitSpy2).toHaveBeenCalledTimes(1);
    });

    it("should pass arguments to hooks", async () => {
      const onSubscribeSpy = vi.fn();

      const plugin: Plugin<TestEvents> = {
        name: "plugin",
        onSubscribe: onSubscribeSpy,
      };

      const manager = createPluginManager([plugin]);
      const listenerId = Symbol("test");
      await manager.callHook("onSubscribe", "test:event", listenerId);

      expect(onSubscribeSpy).toHaveBeenCalledWith("test:event", listenerId);
    });

    it("should handle async hooks", async () => {
      const asyncHook = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      const plugin: Plugin<TestEvents> = {
        name: "plugin",
        onInit: asyncHook,
      };

      const manager = createPluginManager([plugin]);
      await manager.callHook("onInit");

      expect(asyncHook).toHaveBeenCalledTimes(1);
    });

    it("should handle sync hooks", async () => {
      const syncHook = vi.fn();

      const plugin: Plugin<TestEvents> = {
        name: "plugin",
        onInit: syncHook,
      };

      const manager = createPluginManager([plugin]);
      await manager.callHook("onInit");

      expect(syncHook).toHaveBeenCalledTimes(1);
    });

    it("should catch and log errors in hooks", async () => {
      const errorHook = vi.fn(() => {
        throw new Error("Plugin error");
      });
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const plugin: Plugin<TestEvents> = {
        name: "plugin",
        onInit: errorHook,
      };

      const manager = createPluginManager([plugin]);
      await manager.callHook("onInit");

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it("should not call hooks that do not exist", async () => {
      const onInitSpy = vi.fn();

      const plugin: Plugin<TestEvents> = {
        name: "plugin",
        onInit: onInitSpy,
        // No onSubscribe hook
      };

      const manager = createPluginManager([plugin]);
      await manager.callHook("onSubscribe", "test:event", Symbol("test"));

      expect(onInitSpy).not.toHaveBeenCalled();
    });

    it("should handle plugins without any hooks", async () => {
      const plugin: Plugin<TestEvents> = {
        name: "plugin",
      };

      const manager = createPluginManager([plugin]);
      await manager.callHook("onInit");

      // Should not throw
    });

    it("should execute multiple plugin hooks in parallel", async () => {
      const startTimes: number[] = [];
      const endTimes: number[] = [];

      const slowHook1 = vi.fn(async () => {
        startTimes.push(Date.now());
        await new Promise((resolve) => setTimeout(resolve, 50));
        endTimes.push(Date.now());
      });

      const slowHook2 = vi.fn(async () => {
        startTimes.push(Date.now());
        await new Promise((resolve) => setTimeout(resolve, 50));
        endTimes.push(Date.now());
      });

      const plugin1: Plugin<TestEvents> = { name: "plugin1", onInit: slowHook1 };
      const plugin2: Plugin<TestEvents> = { name: "plugin2", onInit: slowHook2 };

      const manager = createPluginManager([plugin1, plugin2]);
      const start = Date.now();
      await manager.callHook("onInit");
      const duration = Date.now() - start;

      // If executed in parallel, total duration should be ~50ms, not ~100ms
      expect(duration).toBeLessThan(100);
      expect(slowHook1).toHaveBeenCalledTimes(1);
      expect(slowHook2).toHaveBeenCalledTimes(1);
    });
  });
});
