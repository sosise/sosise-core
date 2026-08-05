const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { after, test } = require('node:test');

const redis = require('redis');
const IOC = require('../../build/ServiceProviders/IOC').default;
const Helper = require('../../build/Helper/Helper').default;

const originalCreateClient = redis.createClient;
const originalMakeSingleton = IOC.makeSingleton;
const originalSleep = Helper.sleep;
const clientQueue = [];
let activeLogger;

redis.createClient = () => {
    const client = clientQueue.shift();
    assert.ok(client, 'expected a queued fake Redis client');
    return client;
};
IOC.makeSingleton = () => activeLogger;
Helper.sleep = async () => undefined;

const EventBusMemoryRepository = require('../../build/Repositories/EventBus/EventBusMemoryRepository').default;
const EventBusRedisRepository = require('../../build/Repositories/EventBus/EventBusRedisRepository').default;
const EventBusService = require('../../build/Services/EventBus/EventBusService').default;

after(() => {
    redis.createClient = originalCreateClient;
    IOC.makeSingleton = originalMakeSingleton;
    Helper.sleep = originalSleep;
});

class FakeLogger {
    constructor() {
        this.entries = [];
    }

    debug(message, params, channel) {
        this.entries.push({ level: 'debug', message, params, channel });
    }

    info(message, params, channel) {
        this.entries.push({ level: 'info', message, params, channel });
    }

    warning(message, params, channel) {
        this.entries.push({ level: 'warning', message, params, channel });
    }

    error(message, params, channel) {
        this.entries.push({ level: 'error', message, params, channel });
    }
}

class FakeRedisServer {
    constructor() {
        this.clients = new Set();
        this.lists = new Map();
        this.values = new Map();
        this.rangeCalls = [];
        this.rangeGates = new Map();
        this.publishGates = new Map();
        this.scanCalls = [];
        this.transactions = [];
        this.atomicWakeChecks = [];
    }

    lPush(key, value) {
        const list = this.lists.get(key) || [];
        list.unshift(value);
        this.lists.set(key, list);
        return list.length;
    }

    async publish(channel, message) {
        const gate = this.publishGates.get(channel);
        if (gate) {
            gate.started.resolve();
            await gate.release.promise;
            this.publishGates.delete(channel);
        }

        for (const client of this.clients) {
            if (!client.isReady) continue;

            for (const listener of client.subscriptions.get(channel) || []) listener(message, channel);
            for (const [pattern, listeners] of client.patternSubscriptions) {
                if (!matchesRedisPattern(channel, pattern)) continue;
                for (const listener of listeners) listener(message, channel);
            }
        }
    }
}

class FakeRedisMulti {
    constructor(client) {
        this.client = client;
        this.commands = [];
    }

    lPush(key, value) {
        this.commands.push({ command: 'lPush', key, value });
        return this;
    }

    publish(channel, message) {
        this.commands.push({ command: 'publish', channel, message });
        return this;
    }

    exec() {
        return this.client.executeMulti(this.commands);
    }
}

class FakeRedisClient extends EventEmitter {
    constructor(server, role, options = {}) {
        super();
        this.server = server;
        this.role = role;
        this.connectGate = options.connectGate;
        this.subscribeGates = options.subscribeGates || new Map();
        this.unsubscribeGates = options.unsubscribeGates || new Map();
        this.failSubscribePatterns = options.failSubscribePatterns || new Set();
        this.failExecAfterCommit = options.failExecAfterCommit || 0;
        this.closed = deferred();
        this.commandQueue = Promise.resolve();
        this.isOpen = false;
        this.isReady = false;
        this.subscriptions = new Map();
        this.patternSubscriptions = new Map();
        this.calls = { connect: 0, destroy: 0, quit: 0, subscribe: [], pSubscribe: [], unsubscribe: [], pUnsubscribe: [] };
        server.clients.add(this);
    }

    enqueue(command) {
        const operation = this.commandQueue.then(command);
        this.commandQueue = operation.catch(() => undefined);
        return operation;
    }

    multi() {
        return new FakeRedisMulti(this);
    }

    executeMulti(commands) {
        return this.enqueue(async () => {
            const transaction = [];
            const results = [];

            for (const command of commands) {
                transaction.push(command.command);
                if (command.command === 'lPush') {
                    results.push(this.server.lPush(command.key, command.value));
                } else {
                    this.server.atomicWakeChecks.push(
                        (this.server.lists.get(`durable:${command.channel.substring('live:'.length)}`) || []).includes(command.message),
                    );
                    results.push(await this.server.publish(command.channel, command.message));
                }
            }

            this.server.transactions.push(transaction);
            if (this.failExecAfterCommit > 0) {
                this.failExecAfterCommit--;
                throw new Error('EXEC result lost after commit');
            }
            return results;
        });
    }

    async waitGate(gate) {
        if (!gate) return;
        gate.started?.resolve();
        const gatePromise = gate.release ? gate.release.promise : gate.promise;
        const completed = await Promise.race([gatePromise.then(() => true), this.closed.promise.then(() => false)]);
        if (!completed) throw new Error('Client was destroyed while waiting');
    }

    async connect() {
        if (this.isOpen) throw new Error('Socket already opened');
        this.calls.connect++;
        this.isOpen = true;
        this.emit('connect');
        await this.waitGate(this.connectGate);
        if (!this.isOpen) throw new Error('Client was destroyed while connecting');
        this.isReady = true;
        this.emit('ready');
        return this;
    }

    async quit() {
        if (!this.isOpen) throw new Error('Client is closed');
        this.calls.quit++;
        this.close();
        return 'OK';
    }

    destroy() {
        if (!this.isOpen) throw new Error('Client is closed');
        this.calls.destroy++;
        this.close();
    }

    close() {
        this.isOpen = false;
        this.isReady = false;
        this.subscriptions.clear();
        this.patternSubscriptions.clear();
        this.closed.resolve();
        this.emit('end');
    }

    transientDisconnect() {
        this.isReady = false;
        this.emit('error', new Error(`${this.role} transient disconnect`));
    }

    transientReady() {
        this.isReady = true;
        this.emit('ready');
    }

    async subscribe(pattern, listener) {
        this.calls.subscribe.push(pattern);
        return this.enqueue(() => this.finishSubscription(pattern, listener, this.subscriptions));
    }

    async pSubscribe(pattern, listener) {
        this.calls.pSubscribe.push(pattern);
        return this.enqueue(() => this.finishSubscription(pattern, listener, this.patternSubscriptions));
    }

    async finishSubscription(pattern, listener, subscriptions) {
        if (!this.isReady) throw new Error('Client is not ready');
        await this.waitGate(this.subscribeGates.get(pattern));
        if (this.failSubscribePatterns.has(pattern)) throw new Error(`subscribe failed for ${pattern}`);
        if (!subscriptions.has(pattern)) subscriptions.set(pattern, new Set());
        subscriptions.get(pattern).add(listener);
    }

    async unsubscribe(pattern, listener) {
        this.calls.unsubscribe.push(pattern);
        return this.enqueue(() => this.finishUnsubscription(pattern, listener, this.subscriptions));
    }

    async pUnsubscribe(pattern, listener) {
        this.calls.pUnsubscribe.push(pattern);
        return this.enqueue(() => this.finishUnsubscription(pattern, listener, this.patternSubscriptions));
    }

    async finishUnsubscription(pattern, listener, subscriptions) {
        if (!this.isReady) throw new Error('Client is not ready');
        await this.waitGate(this.unsubscribeGates.get(pattern));
        if (!listener) {
            subscriptions.delete(pattern);
            return;
        }

        const listeners = subscriptions.get(pattern);
        listeners?.delete(listener);
        if (listeners?.size === 0) subscriptions.delete(pattern);
    }

    async lPush(key, value) {
        return this.enqueue(() => this.server.lPush(key, value));
    }

    async publish(channel, message) {
        return this.enqueue(() => this.server.publish(channel, message));
    }

    async lRange(key, start, end) {
        return this.enqueue(async () => {
            const callNumber = this.server.rangeCalls.length + 1;
            this.server.rangeCalls.push({ key, start, end });
            const gate = this.server.rangeGates.get(callNumber);
            await this.waitGate(gate);

            const list = [...(this.server.lists.get(key) || [])];
            const normalizedStart = start < 0 ? list.length + start : start;
            const normalizedEnd = end < 0 ? list.length + end : end;
            if (normalizedStart < 0 || normalizedEnd < normalizedStart) return [];
            return list.slice(normalizedStart, normalizedEnd + 1);
        });
    }

    async scan(_cursor, options) {
        return this.enqueue(() => {
            this.server.scanCalls.push(options.MATCH);
            const keys = new Set([...this.server.lists.keys(), ...this.server.values.keys()]);
            return { cursor: '0', keys: Array.from(keys).filter((key) => matchesRedisPattern(key, options.MATCH)) };
        });
    }

    async get(key) {
        return this.enqueue(() => (this.server.values.has(key) ? this.server.values.get(key) : null));
    }

    async set(key, value) {
        return this.enqueue(() => {
            this.server.values.set(key, value);
            return 'OK';
        });
    }
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((promiseResolve, promiseReject) => {
        resolve = promiseResolve;
        reject = promiseReject;
    });
    return { promise, resolve, reject };
}

function barrier() {
    return { started: deferred(), release: deferred() };
}

function matchesRedisPattern(value, pattern) {
    let regex = '';
    for (let index = 0; index < pattern.length; index++) {
        const character = pattern[index];
        if (character === '\\' && index + 1 < pattern.length) {
            regex += escapeRegexCharacter(pattern[++index]);
        } else if (character === '*') {
            regex += '.*';
        } else if (character === '?') {
            regex += '.';
        } else {
            regex += escapeRegexCharacter(character);
        }
    }
    return new RegExp(`^${regex}$`).test(value);
}

function escapeRegexCharacter(character) {
    return /[.*+?^${}()|[\]\\]/.test(character) ? `\\${character}` : character;
}

async function waitFor(predicate, message = 'condition was not met') {
    for (let attempt = 0; attempt < 300; attempt++) {
        if (predicate()) return;
        await new Promise((resolve) => setImmediate(resolve));
    }
    assert.fail(message);
}

function createHarness(options = {}) {
    const server = options.server || new FakeRedisServer();
    const logger = new FakeLogger();
    const pairs = [];

    const queuePair = (pairOptions = {}) => {
        const pair = {
            publisher: new FakeRedisClient(server, `publisher-${pairs.length}`, pairOptions.publisher),
            subscriber: new FakeRedisClient(server, `subscriber-${pairs.length}`, pairOptions.subscriber),
        };
        pairs.push(pair);
        clientQueue.push(pair.publisher, pair.subscriber);
        return pair;
    };

    const initialPair = queuePair(options.initialPair);
    activeLogger = logger;
    const repository = new EventBusRedisRepository({
        driverConfiguration: { redis: { host: 'fake', port: 6379, db: 0, serviceName: 'eventbus-test' } },
    });

    return { initialPair, logger, pairs, queuePair, repository, server };
}

function eventMessage(event, id, expiresAt = null) {
    return JSON.stringify({ event, data: { id }, timestamp: 1000 + Number(id), expiresAt });
}

function seedEvents(server, event, ids) {
    for (const id of ids) server.lPush(`durable:${event}`, eventMessage(event, id));
}

function positionKey(event) {
    return `position:durable:${event}:eventbus-test`;
}

test('executes LPUSH before PUBLISH atomically and reuses one message on retry', async (context) => {
    const harness = createHarness({ initialPair: { publisher: { failExecAfterCommit: 1 } } });
    context.after(() => harness.repository.disconnect());
    await harness.repository.connect();

    await harness.repository.emit('atomic.emit', { id: 1 });

    const messages = harness.server.lists.get('durable:atomic.emit');
    assert.equal(messages.length, 2);
    assert.equal(messages[0], messages[1]);
    assert.deepEqual(harness.server.transactions, [
        ['lPush', 'publish'],
        ['lPush', 'publish'],
    ]);
    assert.deepEqual(harness.server.atomicWakeChecks, [true, true]);
});

test('includes an LPUSH immediately before the atomic LRANGE snapshot', async (context) => {
    const server = new FakeRedisServer();
    seedEvents(server, 'atomic.event', [1, 2]);
    server.values.set(positionKey('atomic.event'), '0');
    const rangeGate = barrier();
    server.rangeGates.set(1, rangeGate);
    const harness = createHarness({ server });
    context.after(() => harness.repository.disconnect());

    const received = [];
    const setup = harness.repository.subscribeDurable('atomic.event', async (payload) => received.push(payload.data.id));
    await rangeGate.started.promise;
    server.lPush('durable:atomic.event', eventMessage('atomic.event', 3));
    rangeGate.release.resolve();
    await setup;

    assert.deepEqual(received, [2, 3]);
    assert.deepEqual(server.rangeCalls[0], { key: 'durable:atomic.event', start: 0, end: -2 });
    assert.equal(server.values.get(positionKey('atomic.event')), '2');
});

test('keeps cursor zero valid and replays later LPUSH batches chronologically', async (context) => {
    const server = new FakeRedisServer();
    seedEvents(server, 'batch.event', [1, 2, 3]);
    server.values.set(positionKey('batch.event'), '0');
    const harness = createHarness({ server });
    context.after(() => harness.repository.disconnect());

    const first = [];
    const firstHandler = async (payload) => first.push(payload.data.id);
    await harness.repository.subscribeDurable('batch.event', firstHandler);
    assert.deepEqual(first, [2, 3]);

    harness.repository.off('batch.event', firstHandler);
    await waitFor(() => !harness.initialPair.subscriber.subscriptions.has('live:batch.event'));
    seedEvents(server, 'batch.event', [4, 5]);

    const second = [];
    await harness.repository.subscribeDurable('batch.event', async (payload) => second.push(payload.data.id));
    assert.deepEqual(second, [4, 5]);
    assert.equal(server.values.get(positionKey('batch.event')), '4');
});

test('coalesces durable wakeups and advances each event exactly once', async (context) => {
    const harness = createHarness();
    context.after(() => harness.repository.disconnect());
    const received = [];
    await harness.repository.subscribeDurable('wake.event', async (payload) => received.push(payload.data.id));

    const rangeGate = barrier();
    harness.server.rangeGates.set(1, rangeGate);
    await harness.repository.emit('wake.event', { id: 1 });
    await rangeGate.started.promise;

    harness.server.lPush('durable:wake.event', eventMessage('wake.event', 2));
    await harness.server.publish('live:wake.event', eventMessage('wake.event', 2));
    rangeGate.release.resolve();

    await waitFor(() => harness.server.values.get(positionKey('wake.event')) === '1');
    await waitFor(() => harness.server.rangeCalls.length >= 2);
    assert.deepEqual(received, [1, 2]);

    await harness.server.publish('live:wake.event', eventMessage('wake.event', 2));
    await waitFor(() => harness.server.rangeCalls.length >= 3);
    assert.deepEqual(received, [1, 2]);
});

test('drains events emitted during a transient reconnect gap', async (context) => {
    const harness = createHarness();
    context.after(() => harness.repository.disconnect());
    const received = [];
    await harness.repository.subscribeDurable('reconnect.event', async (payload) => received.push(payload.data.id));

    harness.initialPair.publisher.transientDisconnect();
    harness.initialPair.subscriber.transientDisconnect();
    harness.server.lPush('durable:reconnect.event', eventMessage('reconnect.event', 1));
    harness.initialPair.publisher.transientReady();
    harness.initialPair.subscriber.transientReady();

    await waitFor(() => received.length === 1);
    assert.deepEqual(received, [1]);
    assert.equal(harness.server.values.get(positionKey('reconnect.event')), '0');
    assert.deepEqual(harness.initialPair.subscriber.calls.subscribe, ['live:reconnect.event']);
});

test('keeps an initially failing durable consumer registered for a later wakeup', async (context) => {
    const server = new FakeRedisServer();
    seedEvents(server, 'retry.event', [1]);
    const connectGate = deferred();
    const handlerStarted = deferred();
    const handlerRelease = deferred();
    const harness = createHarness({
        server,
        initialPair: { publisher: { connectGate }, subscriber: { connectGate } },
    });
    context.after(() => harness.repository.disconnect());
    const attempts = [];
    let shouldFail = true;
    const setup = harness.repository.subscribeDurable('retry.event', async (payload) => {
        attempts.push(payload.data.id);
        if (shouldFail) {
            shouldFail = false;
            handlerStarted.resolve();
            await handlerRelease.promise;
            throw new Error('handler failed');
        }
    });
    const rejection = assert.rejects(setup, /handler failed/);

    connectGate.resolve();
    await handlerStarted.promise;
    await new Promise((resolve) => setImmediate(resolve));
    handlerRelease.resolve();
    await rejection;

    assert.equal(harness.repository.listenerCount('retry.event'), 1);
    assert.equal(harness.initialPair.subscriber.subscriptions.has('live:retry.event'), true);
    assert.equal(server.values.has(positionKey('retry.event')), false);
    assert.deepEqual(attempts, [1]);
    assert.equal(harness.server.rangeCalls.length, 1);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(attempts, [1]);
    assert.equal(harness.server.rangeCalls.length, 1);

    await server.publish('live:retry.event', eventMessage('retry.event', 1));
    await waitFor(() => server.values.get(positionKey('retry.event')) === '0');
    assert.deepEqual(attempts, [1, 1]);
});

test('detaches a stale drain when a durable handler is removed and re-added', async (context) => {
    const harness = createHarness();
    context.after(() => harness.repository.disconnect());
    const oldStarted = deferred();
    const oldRelease = deferred();
    const oldHandler = async () => {
        oldStarted.resolve();
        await oldRelease.promise;
    };
    await harness.repository.subscribeDurable('generation.event', oldHandler);

    await harness.repository.emit('generation.event', { id: 1 });
    await oldStarted.promise;
    harness.repository.off('generation.event', oldHandler);

    const replacementCalls = [];
    await harness.repository.subscribeDurable('generation.event', async (payload) => replacementCalls.push(payload.data.id));
    assert.deepEqual(replacementCalls, [1]);
    assert.equal(harness.server.values.get(positionKey('generation.event')), '0');

    const rangeCount = harness.server.rangeCalls.length;
    oldRelease.resolve();
    await waitFor(() => harness.logger.entries.some(({ message }) => message.includes('removed during replay')));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(harness.server.rangeCalls.length, rangeCount);
});

test('registers synchronously so off before the first await cancels setup', async (context) => {
    const connectGate = deferred();
    const harness = createHarness({
        initialPair: { publisher: { connectGate }, subscriber: { connectGate } },
    });
    context.after(() => harness.repository.disconnect());

    let calls = 0;
    const handler = async () => calls++;
    const setup = harness.repository.subscribeDurable('cancel.event', handler);
    assert.equal(harness.repository.listenerCount('cancel.event'), 1);
    harness.repository.off('cancel.event', handler);
    connectGate.resolve();

    await assert.rejects(setup, /removed during replay/);
    assert.equal(calls, 0);
    assert.equal(harness.repository.listenerCount('cancel.event'), 0);
    assert.deepEqual(harness.initialPair.subscriber.calls.subscribe, []);
});

test('dispatches exact and wildcard live listeners once with expiresAt', async (context) => {
    const harness = createHarness();
    context.after(() => harness.repository.disconnect());
    await harness.repository.connect();
    const exact = [];
    const wildcard = [];
    harness.repository.on('orders.created', async (payload) => exact.push(payload));
    harness.repository.on('orders.*', async (payload) => wildcard.push(payload));
    await waitFor(
        () =>
            harness.initialPair.subscriber.subscriptions.has('live:orders.created') &&
            harness.initialPair.subscriber.patternSubscriptions.has('live:orders.*'),
    );

    await harness.server.publish('live:orders.created.extra', eventMessage('orders.created.extra', 9));
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(exact, []);
    assert.deepEqual(wildcard, []);

    await harness.repository.emit('orders.created', { id: 1 }, 5);
    await waitFor(() => exact.length === 1 && wildcard.length === 1);

    assert.equal(exact.length, 1);
    assert.equal(wildcard.length, 1);
    assert.equal(typeof exact[0].event.expiresAt, 'number');
    assert.equal(wildcard[0].event.expiresAt, exact[0].event.expiresAt);

    const escaped = [];
    harness.repository.on('meta.*.item?[x]', async (payload) => escaped.push(payload.data.id));
    await waitFor(() => harness.initialPair.subscriber.calls.pSubscribe.includes('live:meta.*.item\\?\\[x\\]'));
    await harness.server.publish('live:meta.one.item?[x]', eventMessage('meta.one.item?[x]', 2));
    await harness.server.publish('live:meta.one.itemX', eventMessage('meta.one.itemX', 3));
    await waitFor(() => escaped.length === 1);
    assert.deepEqual(escaped, [2]);

    const literalQuestion = [];
    const literalStar = [];
    harness.repository.on('literal.?', async (payload) => literalQuestion.push(payload.data.id));
    harness.repository.on('literal.a*b', async (payload) => literalStar.push(payload.data.id));
    await waitFor(
        () =>
            harness.initialPair.subscriber.subscriptions.has('live:literal.?') &&
            harness.initialPair.subscriber.subscriptions.has('live:literal.a*b'),
    );
    assert.equal(harness.initialPair.subscriber.calls.subscribe.includes('live:literal.?'), true);
    assert.equal(harness.initialPair.subscriber.calls.subscribe.includes('live:literal.a*b'), true);
    assert.equal(harness.initialPair.subscriber.calls.pSubscribe.includes('live:literal.?'), false);
    assert.equal(harness.initialPair.subscriber.calls.pSubscribe.includes('live:literal.a*b'), false);
    await harness.server.publish('live:literal.?', eventMessage('literal.?', 4));
    await harness.server.publish('live:literal.a*b', eventMessage('literal.a*b', 5));
    await waitFor(() => literalQuestion.length === 1 && literalStar.length === 1);
    assert.deepEqual(literalQuestion, [4]);
    assert.deepEqual(literalStar, [5]);
});

test('unsubscribes only one listener when public patterns share a Redis glob', async (context) => {
    const harness = createHarness();
    context.after(() => harness.repository.disconnect());
    await harness.repository.connect();

    const subscribeGate = barrier();
    const unsubscribeGate = barrier();
    let singleSegmentCalls = 0;
    let deepCalls = 0;
    const singleSegmentHandler = async () => singleSegmentCalls++;
    harness.repository.on('orders.*', singleSegmentHandler);
    await waitFor(() => harness.initialPair.subscriber.patternSubscriptions.get('live:orders.*')?.size === 1);

    harness.initialPair.subscriber.subscribeGates.set('live:orders.*', subscribeGate);
    harness.initialPair.subscriber.unsubscribeGates.set('live:orders.*', unsubscribeGate);
    harness.repository.on('orders.**', async () => deepCalls++);
    await subscribeGate.started.promise;
    harness.repository.off('orders.*', singleSegmentHandler);
    assert.equal(harness.initialPair.subscriber.calls.pUnsubscribe.length, 0);

    subscribeGate.release.resolve();
    await unsubscribeGate.started.promise;
    await harness.server.publish('live:orders.created', eventMessage('orders.created', 1));
    await waitFor(() => deepCalls === 1);
    unsubscribeGate.release.resolve();
    await waitFor(() => harness.initialPair.subscriber.patternSubscriptions.get('live:orders.*')?.size === 1);

    await harness.server.publish('live:orders.updated', eventMessage('orders.updated', 2));
    await waitFor(() => deepCalls === 2);
    assert.equal(singleSegmentCalls, 0);
    assert.equal(deepCalls, 2);
    assert.equal(harness.repository.listenerCount('orders.*'), 0);
    assert.equal(harness.repository.listenerCount('orders.**'), 1);
    assert.equal(harness.initialPair.subscriber.patternSubscriptions.has('live:orders.*'), true);
});

test('reconciles off and re-add while transient unsubscribe is delayed', async (context) => {
    const unsubscribeGate = barrier();
    const harness = createHarness({
        initialPair: { subscriber: { unsubscribeGates: new Map([['live:race.event', unsubscribeGate]]) } },
    });
    context.after(() => harness.repository.disconnect());
    await harness.repository.connect();

    let oldCalls = 0;
    let newCalls = 0;
    const oldHandler = async () => oldCalls++;
    harness.repository.on('race.event', oldHandler);
    await waitFor(() => harness.initialPair.subscriber.subscriptions.has('live:race.event'));

    harness.initialPair.subscriber.transientDisconnect();
    harness.repository.off('race.event', oldHandler);
    harness.initialPair.subscriber.transientReady();
    await unsubscribeGate.started.promise;

    harness.repository.on('race.event', async () => newCalls++);
    unsubscribeGate.release.resolve();
    await waitFor(() => harness.initialPair.subscriber.calls.subscribe.length === 2);
    await waitFor(() => harness.initialPair.subscriber.subscriptions.has('live:race.event'));

    await harness.server.publish('live:race.event', eventMessage('race.event', 1));
    await waitFor(() => newCalls === 1);
    assert.equal(oldCalls, 0);
    assert.equal(newCalls, 1);
    assert.equal(harness.initialPair.subscriber.subscriptions.get('live:race.event').size, 1);
});

test('filters overmatched durable keys through the application matcher', async (context) => {
    const server = new FakeRedisServer();
    seedEvents(server, 'catalog.one', [1]);
    seedEvents(server, 'catalog.one.extra', [2]);
    const harness = createHarness({ server });
    context.after(() => harness.repository.disconnect());

    const received = [];
    await harness.repository.subscribeDurable('catalog.*', async (payload) => received.push(payload.data.id));

    assert.deepEqual(received, [1]);
    assert.equal(server.values.get(positionKey('catalog.one')), '0');
    assert.equal(server.values.has(positionKey('catalog.one.extra')), false);
    assert.equal(server.scanCalls.includes('durable:catalog.*'), true);
});

test('rejects only intersecting durable segment patterns', async (context) => {
    const harness = createHarness();
    context.after(() => harness.repository.disconnect());

    await harness.repository.subscribeDurable('payment.success', async () => undefined);
    await harness.repository.subscribeDurable('payment.failed', async () => undefined);
    await assert.rejects(
        harness.repository.subscribeDurable('payment.success', async () => undefined),
        /overlaps/,
    );
    await assert.rejects(
        harness.repository.subscribeDurable('payment.*', async () => undefined),
        /overlaps/,
    );

    const ordersSingleHandler = async () => undefined;
    const usersSingleHandler = async () => undefined;
    await harness.repository.subscribeDurable('orders.*', ordersSingleHandler);
    await harness.repository.subscribeDurable('users.*', usersSingleHandler);
    await assert.rejects(
        harness.repository.subscribeDurable('orders.created', async () => undefined),
        /overlaps/,
    );
    harness.repository.off('orders.*', ordersSingleHandler);
    harness.repository.off('users.*', usersSingleHandler);

    const createdHandler = async () => undefined;
    const cancelledHandler = async () => undefined;
    await harness.repository.subscribeDurable('orders.*.created', createdHandler);
    await harness.repository.subscribeDurable('orders.*.cancelled', cancelledHandler);
    await assert.rejects(
        harness.repository.subscribeDurable('orders.**.created', async () => undefined),
        /overlaps/,
    );
    harness.repository.off('orders.*.created', createdHandler);
    harness.repository.off('orders.*.cancelled', cancelledHandler);

    await harness.repository.subscribeDurable('orders.**', async () => undefined);
    await harness.repository.subscribeDurable('users.**', async () => undefined);
    assert.equal(harness.initialPair.subscriber.patternSubscriptions.has('live:orders.*'), true);
    assert.equal(harness.initialPair.subscriber.patternSubscriptions.has('live:users.*'), true);

    await harness.repository.subscribeDurable('audit.**', async () => undefined);
    await harness.repository.subscribeDurable('audit', async () => undefined);
    assert.equal(harness.initialPair.subscriber.calls.pSubscribe.includes('live:audit.*'), true);
    assert.equal(harness.server.scanCalls.includes('durable:audit.*'), true);
    await assert.rejects(
        harness.repository.subscribeDurable('audit.entry.*', async () => undefined),
        /overlaps/,
    );
    await assert.rejects(
        harness.repository.subscribeDurable('audit.', async () => undefined),
        /overlaps/,
    );
    await assert.rejects(
        harness.repository.subscribeDurable('audit.entry', async () => undefined),
        /overlaps/,
    );

    await harness.repository.subscribeDurable('blank.*', async () => undefined);
    await harness.repository.subscribeDurable('blank.', async () => undefined);
});

test('disconnect-connect-disconnect cancels the queued connect and preserves final state', async (context) => {
    const neverConnect = deferred();
    const harness = createHarness({
        initialPair: { publisher: { connectGate: neverConnect }, subscriber: { connectGate: neverConnect } },
    });
    context.after(() => harness.repository.disconnect());

    let restoredCalls = 0;
    harness.repository.on('restore.live', async () => restoredCalls++);
    const initialConnect = harness.repository.connect();
    await waitFor(() => harness.initialPair.publisher.calls.connect === 1 && harness.initialPair.subscriber.calls.connect === 1);
    const firstDisconnect = harness.repository.disconnect();
    const queuedConnect = harness.repository.connect();
    assert.equal(firstDisconnect, harness.repository.disconnect());

    await assert.rejects(initialConnect, /cancelled|destroyed/);
    await firstDisconnect;
    await assert.rejects(queuedConnect, /cancelled/);
    assert.equal(harness.repository.isConnected(), false);
    assert.equal(harness.pairs.length, 1);

    const freshPair = harness.queuePair();
    await harness.repository.connect();
    assert.equal(harness.repository.isConnected(), true);
    assert.equal(freshPair.publisher.calls.connect, 1);
    assert.equal(freshPair.subscriber.calls.connect, 1);
    await harness.server.publish('live:restore.live', eventMessage('restore.live', 1));
    await waitFor(() => restoredCalls === 1);
    await harness.repository.disconnect();
    assert.equal(harness.repository.isConnected(), false);
});

test('fresh connect attempts every subscription before reporting reconciliation failure', async (context) => {
    const harness = createHarness();
    context.after(() => harness.repository.disconnect());
    await harness.repository.connect();
    harness.repository.on('restore.fail', async () => undefined);
    harness.repository.on('restore.ok', async () => undefined);
    await waitFor(() => harness.initialPair.subscriber.subscriptions.size === 2);
    await harness.repository.disconnect();

    const freshPair = harness.queuePair({ subscriber: { failSubscribePatterns: new Set(['live:restore.fail']) } });
    await assert.rejects(harness.repository.connect(), /restore.fail/);

    assert.equal(freshPair.subscriber.calls.subscribe.includes('live:restore.fail'), true);
    assert.equal(freshPair.subscriber.calls.subscribe.includes('live:restore.ok'), true);
    assert.equal(freshPair.subscriber.subscriptions.has('live:restore.ok'), true);
});

test('validates persisted cursors and keeps the optional API compatible', async (context) => {
    const server = new FakeRedisServer();
    seedEvents(server, 'invalid.cursor', [1]);
    server.values.set(positionKey('invalid.cursor'), '1.5');
    const harness = createHarness({ server });
    context.after(() => harness.repository.disconnect());
    await assert.rejects(
        harness.repository.subscribeDurable('invalid.cursor', async () => undefined),
        /Invalid persisted cursor/,
    );

    const logger = new FakeLogger();
    activeLogger = logger;
    const memoryRepository = new EventBusMemoryRepository({});
    assert.throws(() => memoryRepository.onDurable('memory.event', async () => undefined), /not supported in Memory driver/);
    await assert.rejects(
        memoryRepository.subscribeDurable('memory.event', async () => undefined),
        /not supported in Memory driver/,
    );

    const service = Object.create(EventBusService.prototype);
    service.eventBusRepository = {};
    service.eventBusConfig = { driver: 'third-party' };
    await assert.rejects(
        service.subscribeDurable('third-party.event', async () => undefined),
        /not supported by this repository/,
    );
});
