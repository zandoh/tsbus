import EventEmitter3 from "eventemitter3";
import mitt from "mitt";
import { bench, describe } from "vitest";
import { createEventBus } from "./eventbus";

interface TestEvents extends Record<string, unknown> {
	"test:event": { message: string };
}

type MittEvents = {
	"test:event": { message: string };
};

const payload = { message: "hello" };

describe("emit to 1 sync handler, no plugins, no wildcards", () => {
	const bus = createEventBus<TestEvents>();
	bus.on("test:event", () => {});

	const m = mitt<MittEvents>();
	m.on("test:event", () => {});

	const ee3 = new EventEmitter3();
	ee3.on("test:event", () => {});

	const fn = () => {};

	bench("tsbus", () => {
		bus.emit("test:event", payload);
	});

	bench("mitt", () => {
		m.emit("test:event", payload);
	});

	bench("eventemitter3", () => {
		ee3.emit("test:event", payload);
	});

	bench("baseline: direct function call", () => {
		fn();
	});
});

describe("emit to 10 sync handlers", () => {
	const bus = createEventBus<TestEvents>();
	for (let i = 0; i < 10; i++) {
		bus.on("test:event", () => {});
	}

	const m = mitt<MittEvents>();
	for (let i = 0; i < 10; i++) {
		m.on("test:event", () => {});
	}

	const ee3 = new EventEmitter3();
	for (let i = 0; i < 10; i++) {
		ee3.on("test:event", () => {});
	}

	bench("tsbus", () => {
		bus.emit("test:event", payload);
	});

	bench("mitt", () => {
		m.emit("test:event", payload);
	});

	bench("eventemitter3", () => {
		ee3.emit("test:event", payload);
	});
});

describe("emit to 1 async handler", () => {
	const bus = createEventBus<TestEvents>();
	bus.on("test:event", async () => {});

	bench("tsbus", async () => {
		await bus.emit("test:event", payload);
	});
});

describe("emit with plugins", () => {
	const bus = createEventBus<TestEvents>({
		plugins: [
			{
				name: "noop",
				onBeforeEmit: () => {},
				onAfterEmit: () => {},
			},
		],
	});
	bus.on("test:event", () => {});

	bench("tsbus (with plugin)", () => {
		bus.emit("test:event", payload);
	});
});

describe("emit with wildcard patterns", () => {
	const bus = createEventBus<TestEvents>();
	bus.onPattern("test:*", () => {});

	bench("tsbus (wildcard)", () => {
		bus.emit("test:event", payload);
	});
});

describe("subscribe + unsubscribe cycle", () => {
	const bus = createEventBus<TestEvents>();
	const handler = () => {};

	const m = mitt<MittEvents>();

	const ee3 = new EventEmitter3();

	bench("tsbus", () => {
		const unsub = bus.on("test:event", handler);
		unsub();
	});

	bench("mitt", () => {
		m.on("test:event", handler);
		m.off("test:event", handler);
	});

	bench("eventemitter3", () => {
		ee3.on("test:event", handler);
		ee3.off("test:event", handler);
	});
});
