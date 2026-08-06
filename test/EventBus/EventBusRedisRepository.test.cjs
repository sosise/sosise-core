const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');

const redis = require('redis');
const IOC = require('../../build/ServiceProviders/IOC').default;
const Helper = require('../../build/Helper/Helper').default;

/**
 * Translate a Redis glob into a regular expression, honouring backslash escapes
 */
function globToRegExp(glob) {
    let source = '';

    for (let index = 0; index < glob.length; index++) {
        const character = glob[index];

        if (character === '\\') {
            source += (glob[++index] ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            continue;
        }

        if (character === '*') {
            source += '.*';
            continue;
        }

        if (character === '?') {
            source += '.';
            continue;
        }

        source += character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    return new RegExp(`^${source}$`);
}

/**
 * In-memory stand-in for a Redis server, shared by every client of one test
 */
class FakeRedisServer {
    constructor() {
        this.lists = new Map();
        this.strings = new Map();
        this.channelListeners = new Map();
        this.patternListeners = new Map();
        this.publishedChannels = [];
    }

    lPush(key, message) {
        const list = this.lists.get(key) ?? [];
        list.unshift(message);
        this.lists.set(key, list);
    }

    lRange(key, start, stop) {
        const list = this.lists.get(key) ?? [];
        const length = list.length;

        let first = start < 0 ? length + start : start;
        let last = stop < 0 ? length + stop : stop;

        if (first < 0) {
            first = 0;
        }
        if (last >= length) {
            last = length - 1;
        }
        if (first > last || first >= length) {
            return [];
        }

        return list.slice(first, last + 1);
    }

    publish(channel, message) {
        this.publishedChannels.push(channel);

        for (const listener of this.channelListeners.get(channel) ?? []) {
            listener(message, channel);
        }

        for (const [pattern, listeners] of this.patternListeners) {
            if (!globToRegExp(pattern).test(channel)) {
                continue;
            }

            for (const listener of listeners) {
                listener(message, channel);
            }
        }
    }

    subscribe(registry, key, listener) {
        if (!registry.has(key)) {
            registry.set(key, new Set());
        }
        registry.get(key).add(listener);
    }

    unsubscribe(registry, key, listener) {
        const listeners = registry.get(key);

        if (!listeners) {
            return;
        }

        listeners.delete(listener);

        if (listeners.size === 0) {
            registry.delete(key);
        }
    }

    scan(match) {
        const matcher = globToRegExp(match);
        return [...this.lists.keys(), ...this.strings.keys()].filter((key) => matcher.test(key));
    }

    /**
     * Count how many listeners would receive a message on a channel
     */
    listenerCountForChannel(channel) {
        let count = (this.channelListeners.get(channel) ?? new Set()).size;

        for (const [pattern, listeners] of this.patternListeners) {
            if (globToRegExp(pattern).test(channel)) {
                count += listeners.size;
            }
        }

        return count;
    }
}

class FakeRedisClient extends EventEmitter {
    constructor(server) {
        super();
        this.server = server;
        this.isOpen = false;
        this.isReady = false;
    }

    async connect() {
        this.isOpen = true;
        this.emit('connect');
        this.isReady = true;
        this.emit('ready');
    }

    async quit() {
        this.isOpen = false;
        this.isReady = false;
        this.emit('end');
    }

    destroy() {
        this.isOpen = false;
        this.isReady = false;
        this.emit('end');
    }

    multi() {
        const operations = [];
        const chain = {
            lPush: (key, message) => {
                operations.push(() => this.server.lPush(key, message));
                return chain;
            },
            publish: (channel, message) => {
                operations.push(() => this.server.publish(channel, message));
                return chain;
            },
            exec: async () => operations.map((operation) => operation()),
        };

        return chain;
    }

    async subscribe(channel, listener) {
        this.server.subscribe(this.server.channelListeners, channel, listener);
    }

    async pSubscribe(pattern, listener) {
        this.server.subscribe(this.server.patternListeners, pattern, listener);
    }

    async unsubscribe(channel, listener) {
        this.server.unsubscribe(this.server.channelListeners, channel, listener);
    }

    async pUnsubscribe(pattern, listener) {
        this.server.unsubscribe(this.server.patternListeners, pattern, listener);
    }

    async scan(cursor, options) {
        return { cursor: '0', keys: this.server.scan(options.MATCH) };
    }

    async lRange(key, start, stop) {
        return this.server.lRange(key, start, stop);
    }

    async get(key) {
        return this.server.strings.has(key) ? this.server.strings.get(key) : null;
    }

    async set(key, value) {
        this.server.strings.set(key, value);
    }
}

// Route every client the repository creates to the server of the running test
let activeServer = null;
redis.createClient = () => new FakeRedisClient(activeServer);

// The repository resolves its logger through the container, which needs application config
const collectedErrors = [];
IOC.makeSingleton = () => ({
    info: () => undefined,
    debug: () => undefined,
    warning: () => undefined,
    error: (message) => collectedErrors.push(message),
});

// Keep the emit retry backoff out of the test runtime
Helper.sleep = async () => undefined;

const EventBusMemoryRepository = require('../../build/Repositories/EventBus/EventBusMemoryRepository').default;
const EventBusRedisRepository = require('../../build/Repositories/EventBus/EventBusRedisRepository').default;

const CONFIG = {
    driverConfiguration: {
        redis: { host: 'localhost', port: 6379, db: 0, serviceName: 'test-service' },
    },
};

/**
 * Let every pending fire and forget continuation run
 */
async function flush() {
    for (let index = 0; index < 5; index++) {
        await new Promise((resolve) => setImmediate(resolve));
    }
}

/**
 * Start a fresh server and repository
 */
function createRepository(server) {
    activeServer = server;
    return new EventBusRedisRepository(CONFIG);
}

function positionKey(event) {
    return `position:durable:${event}:test-service`;
}

test('durable subscription replays stored events once and records the cursor', async () => {
    const server = new FakeRedisServer();
    const repository = createRepository(server);
    const received = [];

    await repository.emit('order.created', { id: 1 });
    await repository.onDurable('order.created', (payload) => {
        received.push(payload.data.id);
    });

    assert.deepEqual(received, [1]);
    assert.equal(server.strings.get(positionKey('order.created')), '0');
});

test('a live event advances the cursor instead of bypassing it', async () => {
    const server = new FakeRedisServer();
    const repository = createRepository(server);
    const received = [];

    await repository.onDurable('order.created', (payload) => {
        received.push(payload.data.id);
    });

    await repository.emit('order.created', { id: 1 });
    await flush();
    await repository.emit('order.created', { id: 2 });
    await flush();

    assert.deepEqual(received, [1, 2]);
    assert.equal(server.strings.get(positionKey('order.created')), '1');
});

test('restarting the service does not replay already processed events', async () => {
    const server = new FakeRedisServer();
    const first = createRepository(server);

    await first.emit('order.created', { id: 1 });
    await first.onDurable('order.created', () => undefined);
    await first.emit('order.created', { id: 2 });
    await flush();

    const replayed = [];
    const second = createRepository(server);
    await second.onDurable('order.created', (payload) => {
        replayed.push(payload.data.id);
    });

    assert.deepEqual(replayed, []);
});

test('a persisted cursor of zero is not treated as an absent cursor', async () => {
    const server = new FakeRedisServer();
    server.lists.set('durable:order.created', [JSON.stringify({ event: 'order.created', data: { id: 1 }, timestamp: 1 })]);
    server.strings.set(positionKey('order.created'), '0');

    const repository = createRepository(server);
    const received = [];

    await repository.onDurable('order.created', (payload) => {
        received.push(payload.data.id);
    });

    assert.deepEqual(received, []);
});

test('an invalid persisted cursor fails loudly instead of replaying everything', async () => {
    const server = new FakeRedisServer();
    server.lists.set('durable:order.created', [JSON.stringify({ event: 'order.created', data: {}, timestamp: 1 })]);
    server.strings.set(positionKey('order.created'), 'not-a-number');

    const repository = createRepository(server);

    await assert.rejects(() => repository.onDurable('order.created', () => undefined), /Invalid persisted position/);
});

test('an invalid cursor of one key does not break subscriptions to other keys', async () => {
    const server = new FakeRedisServer();
    server.lists.set('durable:order.created', [JSON.stringify({ event: 'order.created', data: { id: 1 }, timestamp: 1 })]);
    server.strings.set(positionKey('order.created'), 'not-a-number');
    server.lists.set('durable:user.created', [JSON.stringify({ event: 'user.created', data: { id: 2 }, timestamp: 1 })]);

    const repository = createRepository(server);
    const received = [];

    // The position scan covers every key of the service, an unrelated damaged cursor
    // must not take this subscription down
    await repository.onDurable('user.created', (payload) => {
        received.push(payload.data.id);
    });

    assert.deepEqual(received, [2]);
    await assert.rejects(() => repository.onDurable('order.created', () => undefined), /Invalid persisted position/);
});

test('an ignored durable subscription failure is logged instead of crashing the process', async () => {
    const server = new FakeRedisServer();
    server.lists.set('durable:order.created', [JSON.stringify({ event: 'order.created', data: {}, timestamp: 1 })]);
    server.strings.set(positionKey('order.created'), 'not-a-number');

    const repository = createRepository(server);
    collectedErrors.length = 0;

    // Deliberately not awaited, the historical fire and forget usage
    repository.onDurable('order.created', () => undefined);

    // An unhandled rejection would fail this test run
    await flush();

    assert.ok(
        collectedErrors.some((message) => message.includes('Failed to setup durable subscription')),
        `expected a logged failure, got ${JSON.stringify(collectedErrors)}`,
    );
});

test('a failing handler leaves the cursor untouched and the event is redelivered', async () => {
    const server = new FakeRedisServer();
    const repository = createRepository(server);
    const attempts = [];
    let shouldFail = true;

    await repository.emit('order.created', { id: 1 });
    await repository.onDurable('order.created', (payload) => {
        attempts.push(payload.data.id);

        if (shouldFail) {
            throw new Error('handler exploded');
        }
    });

    assert.deepEqual(attempts, [1]);
    assert.equal(server.strings.has(positionKey('order.created')), false);

    // The next wake-up retries the event that was never acknowledged
    shouldFail = false;
    await repository.emit('order.created', { id: 2 });
    await flush();

    assert.deepEqual(attempts, [1, 1, 2]);
    assert.equal(server.strings.get(positionKey('order.created')), '1');
});

test('every durable handler of a pattern receives the event', async () => {
    const server = new FakeRedisServer();
    const repository = createRepository(server);
    const firstReceived = [];
    const secondReceived = [];

    await repository.onDurable('order.created', (payload) => {
        firstReceived.push(payload.data.id);
    });
    await repository.onDurable('order.created', (payload) => {
        secondReceived.push(payload.data.id);
    });

    await repository.emit('order.created', { id: 1 });
    await flush();

    assert.deepEqual(firstReceived, [1]);
    assert.deepEqual(secondReceived, [1]);
});

test('an unreadable durable entry is skipped instead of blocking the cursor', async () => {
    const server = new FakeRedisServer();
    server.lists.set('durable:order.created', [
        JSON.stringify({ event: 'order.created', data: { id: 2 }, timestamp: 2 }),
        'definitely not json',
    ]);

    const repository = createRepository(server);
    const received = [];

    await repository.onDurable('order.created', (payload) => {
        received.push(payload.data.id);
    });

    assert.deepEqual(received, [2]);
    assert.equal(server.strings.get(positionKey('order.created')), '1');
});

test('an expired event is skipped but still acknowledged', async () => {
    const server = new FakeRedisServer();
    server.lists.set('durable:order.created', [
        JSON.stringify({ event: 'order.created', data: { id: 1 }, timestamp: 1, expiresAt: Date.now() - 1000 }),
    ]);

    const repository = createRepository(server);
    const received = [];

    await repository.onDurable('order.created', (payload) => {
        received.push(payload.data.id);
    });

    assert.deepEqual(received, []);
    assert.equal(server.strings.get(positionKey('order.created')), '0');
});

test('emit stores the event and publishes its wake-up', async () => {
    const server = new FakeRedisServer();
    const repository = createRepository(server);

    await repository.emit('order.created', { id: 1 });

    assert.equal(server.lists.get('durable:order.created').length, 1);
    assert.deepEqual(server.publishedChannels, ['live:order.created']);
});

test('live handlers receive events without touching any cursor', async () => {
    const server = new FakeRedisServer();
    const repository = createRepository(server);
    const received = [];

    repository.on('order.created', (payload) => {
        received.push(payload.data.id);
    });
    await flush();

    await repository.emit('order.created', { id: 1 });
    await flush();

    assert.deepEqual(received, [1]);
    assert.equal(server.strings.has(positionKey('order.created')), false);
});

test('overlapping patterns do not deliver the same event twice', async () => {
    const server = new FakeRedisServer();
    const repository = createRepository(server);
    const exact = [];
    const wildcard = [];

    repository.on('order.created', () => exact.push(1));
    repository.on('order.*', () => wildcard.push(1));
    await flush();

    await repository.emit('order.created', { id: 1 });
    await flush();

    assert.deepEqual(exact, [1]);
    assert.deepEqual(wildcard, [1]);
});

test('a reconnect does not attach a second listener to the same channel', async () => {
    const server = new FakeRedisServer();
    const repository = createRepository(server);

    repository.on('order.created', () => undefined);
    await flush();

    const listenersBefore = server.listenerCountForChannel('live:order.created');

    // Simulate the driver dropping and restoring the connection on its own
    repository.subscribeClient.emit('end');
    repository.subscribeClient.emit('ready');
    repository.publishClient.emit('ready');
    await flush();

    assert.equal(server.listenerCountForChannel('live:order.created'), listenersBefore);
});

test('a single segment wildcard does not match a deeper durable key', async () => {
    const server = new FakeRedisServer();
    const repository = createRepository(server);

    await repository.emit('order.created', { id: 1 });
    await repository.emit('order.created.v2', { id: 2 });

    const received = [];
    await repository.onDurable('order.*', (payload) => {
        received.push(payload.data.id);
    });

    assert.deepEqual(received, [1]);
});

test('off, listenerCount and eventNames use the plain pattern', async () => {
    const server = new FakeRedisServer();
    const repository = createRepository(server);
    const handler = () => undefined;

    repository.on('order.created', handler);
    await flush();

    assert.deepEqual(repository.eventNames(), ['order.created']);
    assert.equal(repository.listenerCount('order.created'), 1);

    repository.off('order.created', handler);
    await flush();

    assert.deepEqual(repository.eventNames(), []);
    assert.equal(repository.listenerCount('order.created'), 0);
    assert.equal(server.listenerCountForChannel('live:order.created'), 0);
});

test('removeAllListeners drops every subscription', async () => {
    const server = new FakeRedisServer();
    const repository = createRepository(server);

    repository.on('order.created', () => undefined);
    repository.on('user.*', () => undefined);
    await flush();

    repository.removeAllListeners();
    await flush();

    assert.deepEqual(repository.eventNames(), []);
    assert.equal(server.listenerCountForChannel('live:order.created'), 0);
    assert.equal(server.listenerCountForChannel('live:user.updated'), 0);
});

test('the memory driver rejects durable subscriptions synchronously', () => {
    const repository = new EventBusMemoryRepository({ driverConfiguration: {} });

    // Throws right away rather than returning a rejected promise, so choosing the wrong
    // driver surfaces even when the caller does not await
    assert.throws(() => repository.onDurable('order.created', () => undefined), /not supported in Memory driver/);
});
