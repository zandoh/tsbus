# tsbus

A lightweight, type-safe event bus for TypeScript applications. Built with zero dependencies and native web primitives.

## Features

- **Type-safe** - Full TypeScript support with strongly-typed event maps
- **Wildcard patterns** - Subscribe to multiple events using `user:*` or `*` patterns
- **Priority-based execution** - Control handler execution order with configurable priorities
- **Async/Sync handlers** - Support for both Promise-based and synchronous handlers
- **Plugin system** - Extend functionality with lifecycle hooks
- **Zero dependencies** - Built with native JavaScript/TypeScript
- **Lightweight** - Approximately 2KB minified and gzipped

## Installation

```bash
pnpm add tsbus
```

## Usage

```typescript
import { createEventBus } from "tsbus";

// Define your event types
interface AppEvents {
  "user:login": { id: string; email: string };
  "user:logout": { id: string };
  "app:init": Record<string, never>;
}

const bus = createEventBus<AppEvents>();

// Subscribe to events
bus.on("user:login", (payload) => {
  console.log("User logged in:", payload.email);
});

// Subscribe with wildcards
bus.onPattern("user:*", (payload) => {
  console.log("User event:", payload);
});

// Subscribe with priority (higher executes first)
bus.on(
  "user:login",
  (payload) => {
    console.log("High priority handler");
  },
  { priority: 10 },
);

// Emit events
await bus.emit("user:login", {
  id: "123",
  email: "user@example.com",
});

// One-time listeners
bus.once("app:init", () => {
  console.log("App initialized");
});

// Unsubscribe
const unsubscribe = bus.on("user:logout", handler);
unsubscribe();
```

## API Reference

### `createEventBus<TEventMap>(config?)`

Creates a new EventBus instance.

```typescript
const bus = createEventBus<AppEvents>({
  plugins: [loggingPlugin],
});
```

### `bus.on(event, handler, options?)`

Subscribe to an event. Returns an unsubscribe function.

**Options:**

- `priority` - Execution priority (default: 0, higher values execute first)
- `once` - Auto-remove after first execution (default: false)

```typescript
const unsubscribe = bus.on(
  "user:login",
  (payload) => {
    console.log("Login:", payload.email);
  },
  { priority: 10 },
);

unsubscribe();
```

### `bus.onPattern(pattern, handler, options?)`

Subscribe to events matching a wildcard pattern. Supports `*` for matching any segment.

```typescript
bus.onPattern("user:*", (payload) => {
  console.log("User event:", payload);
});
```

### `bus.once(event, handler, options?)`

Subscribe to an event that automatically unsubscribes after first execution.

```typescript
bus.once("app:init", () => {
  console.log("Initialized");
});
```

### `bus.emit(event, payload)`

Emit an event to all matching listeners. Returns a Promise that resolves after all handlers complete.

```typescript
await bus.emit("user:login", { id: "123", email: "user@example.com" });
```

### `bus.off(listenerId)`

Remove a specific listener by ID.

```typescript
const unsubscribe = bus.on("user:login", handler);
unsubscribe();
```

### `bus.offAll(event?)`

Remove all listeners for a specific event, or all listeners if no event is specified.

```typescript
bus.offAll("user:login"); // Remove all user:login listeners
bus.offAll(); // Remove all listeners
```

### `bus.getListeners(event?)`

Get active listeners for an event or all events.

```typescript
const listeners = bus.getListeners("user:login");
```

## Coming Soon: Plugins

Extend EventBus functionality with lifecycle hooks:

```typescript
import type { Plugin } from "tsbus";

const loggingPlugin: Plugin<AppEvents> = {
  name: "logger",
  onInit: () => console.log("EventBus initialized"),
  onBeforeEmit: (event, payload) => console.log(`Emitting ${String(event)}`, payload),
  onAfterEmit: (event, payload, duration, handlerCount) => {
    console.log(`${String(event)} completed in ${duration}ms (${handlerCount} handlers)`);
  },
  onError: (event, payload, error) => console.error(`Error in ${String(event)}:`, error),
};

const bus = createEventBus<AppEvents>({ plugins: [loggingPlugin] });
```

**Available hooks:**

- `onInit()` - EventBus initialization
- `onSubscribe(event, listenerId)` - Listener subscription
- `onUnsubscribe(event, listenerId)` - Listener removal
- `onBeforeEmit(event, payload)` - Before event emission
- `onAfterEmit(event, payload, duration, handlerCount)` - After event emission
- `onError(event, payload, error, handler?)` - Handler error

All hooks support both synchronous and async return types.

## TypeScript Support

Event maps provide full type safety for events and payloads:

```typescript
interface AppEvents {
  "user:login": { id: string; email: string };
  "user:logout": { id: string };
}

const bus = createEventBus<AppEvents>();

await bus.emit("user:login", { id: "123", email: "user@example.com" }); // Valid
await bus.emit("user:login", { id: 123 }); // Type error
await bus.emit("unknown:event", {}); // Type error
```

## License

MIT
