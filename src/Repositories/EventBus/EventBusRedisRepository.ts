import { createClient, RedisClientType } from 'redis';
import EventBusRepositoryInterface, { EventHandler, EventPayload } from './EventBusRepositoryInterface';
import EventBusException from '../../Exceptions/EventBus/EventBusException';
import IOC from '../../ServiceProviders/IOC';
import LoggerService from '../../Services/Logger/LoggerService';
import Helper from '../../Helper/Helper';
import EventPatternMatcher from '../../Helper/EventPatternMatcher';

/**
 * Redis key layout
 * - durable:{event}                        list of every emitted event, newest first (LPUSH)
 * - live:{event}                           pub/sub channel used as a wake-up signal
 * - position:durable:{event}:{serviceName} how many events this service already processed
 */
const LIVE_CHANNEL_PREFIX = 'live:';
const DURABLE_KEY_PREFIX = 'durable:';
const POSITION_KEY_PREFIX = 'position:';

/**
 * How long a client may take to become ready before a caller gives up
 */
const CLIENT_READY_TIMEOUT_MS = 10000;

type SubscriptionListener = (message: string, channel: string) => void;

interface HandlerInfo {
    handler: EventHandler;
    durable: boolean;
}

interface DrainQueue {
    promise: Promise<void>;
    rerunRequested: boolean;
}

export default class EventBusRedisRepository implements EventBusRepositoryInterface {
    private eventBusConfig: any;
    private publishClient: RedisClientType;
    private subscribeClient: RedisClientType;
    private handlers: Map<string, Set<HandlerInfo>> = new Map();
    private connected: boolean = false;
    private clientsNeedInitialization: boolean = false;
    private connectPromise: Promise<void> | null = null;
    private subscribedPatterns: Set<string> = new Set();
    private subscriptionListeners: Map<string, SubscriptionListener> = new Map();
    private pendingSubscriptions: Map<string, Promise<void>> = new Map();
    private drainQueues: Map<string, DrainQueue> = new Map();
    private serviceName: string;
    private loggerService: LoggerService;

    /**
     * Constructor
     */
    constructor(eventBusConfig: any) {
        this.eventBusConfig = eventBusConfig;
        this.serviceName = eventBusConfig.driverConfiguration.redis.serviceName || 'default-service';
        this.loggerService = IOC.makeSingleton(LoggerService) as LoggerService;

        // Log
        this.logInfo(`initialized for service: "${this.serviceName}"`);

        // Initialize Redis clients
        this.initializeRedisClients();

        // Connect to Redis without blocking construction
        this.connect().catch((error) => {
            this.logError(`Failed to connect to Redis: ${error.message}`, { error });
        });
    }

    /**
     * Initialize Redis clients for pub/sub
     */
    private initializeRedisClients(): void {
        // Get config
        const redisConfig = this.eventBusConfig.driverConfiguration.redis;

        // Prepare redis url
        const redisUrl = `redis://${redisConfig.host}:${redisConfig.port}`;

        // Initialize connection options
        const connectionOptions: any = {
            url: redisUrl,
            database: redisConfig.db,
            socket: {
                reconnectStrategy: (retries: number) => {
                    this.logWarning(`Reconnecting, attempt #${retries}`);
                    return Math.min(retries * 100, 3000);
                },
                connectTimeout: CLIENT_READY_TIMEOUT_MS,
            },
        };

        if (redisConfig.password) {
            connectionOptions.password = redisConfig.password;
        }

        // Create publish client
        this.publishClient = createClient(connectionOptions);

        // Create subscribe client (separate connection for subscriptions)
        this.subscribeClient = createClient(connectionOptions);

        // A subscription belongs to the connection that made it, a fresh pair holds none
        this.subscribedPatterns.clear();
        this.subscriptionListeners.clear();

        // Setup event listeners
        this.setupEventListeners(this.publishClient, this.subscribeClient);
    }

    /**
     * Setup event listeners for a pair of Redis clients
     *
     * The clients are passed explicitly because disconnect() replaces them, and the
     * listeners of a replaced client must no longer touch the repository state.
     */
    private setupEventListeners(publishClient: RedisClientType, subscribeClient: RedisClientType): void {
        // Publish client events
        publishClient.on('error', (error) => {
            if (this.publishClient !== publishClient) {
                return;
            }
            this.logError(`Publish client connection error: ${error}`);
            this.connected = false;
        });

        publishClient.on('end', () => {
            if (this.publishClient !== publishClient) {
                return;
            }
            this.logError('Publish client connection closed');
            this.connected = false;
        });

        publishClient.on('connect', () => {
            if (this.publishClient === publishClient) {
                this.logInfo('Publish client connected');
            }
        });

        publishClient.on('ready', () => {
            this.logInfo('Publish client ready');
            this.handleClientsReady(publishClient, subscribeClient);
        });

        // Subscribe client events
        subscribeClient.on('error', (error) => {
            if (this.subscribeClient !== subscribeClient) {
                return;
            }
            this.logError(`Subscribe client connection error: ${error}`);
            this.connected = false;
        });

        subscribeClient.on('end', () => {
            if (this.subscribeClient !== subscribeClient) {
                return;
            }
            this.logInfo('Subscribe client connection closed');
            this.connected = false;
        });

        subscribeClient.on('connect', () => {
            if (this.subscribeClient === subscribeClient) {
                this.logInfo('Subscribe client connected');
            }
        });

        subscribeClient.on('ready', () => {
            this.logInfo('Subscribe client ready');
            this.handleClientsReady(publishClient, subscribeClient);
        });
    }

    /**
     * Mark the connection as usable once both clients are ready
     *
     * Node-redis restores the subscriptions of a client that reconnected on its own, so the
     * repository must not subscribe again here. Only the durable cursors need to catch up on
     * whatever was emitted while the connection was down. Clients replaced by an explicit
     * disconnect carry no subscription at all, which connect() reconciles separately.
     */
    private handleClientsReady(publishClient: RedisClientType, subscribeClient: RedisClientType): void {
        // Ignore clients that were replaced by a later disconnect
        if (this.publishClient !== publishClient || this.subscribeClient !== subscribeClient) {
            return;
        }

        if (!publishClient.isReady || !subscribeClient.isReady) {
            return;
        }

        const wasDisconnected = !this.connected;
        this.connected = true;

        if (wasDisconnected) {
            this.scheduleDurableCatchUp();
        }
    }

    /**
     * Connect to Redis
     *
     * Resolves only once both clients are usable and every registered pattern is subscribed
     * again. Connecting is therefore also the point where the subscriptions of the transport
     * are reconciled with the handlers the application registered.
     */
    public async connect(): Promise<void> {
        // Both clients are already usable
        if (this.publishClient.isReady && this.subscribeClient.isReady) {
            this.connected = true;
            await this.restoreSubscriptions();
            return;
        }

        // Serialize concurrent callers onto a single attempt
        if (!this.connectPromise) {
            const operation = this.connectClients();
            const clearOperation = () => {
                if (this.connectPromise === operation) {
                    this.connectPromise = null;
                }
            };

            this.connectPromise = operation;
            operation.then(clearOperation, clearOperation);
        }

        await this.connectPromise;
    }

    /**
     * Bring both clients up
     */
    private async connectClients(): Promise<void> {
        try {
            // A client that was quit cannot be reopened, start from fresh ones
            if (this.clientsNeedInitialization) {
                this.initializeRedisClients();
                this.clientsNeedInitialization = false;
            }

            await Promise.all([this.connectClient(this.publishClient), this.connectClient(this.subscribeClient)]);
            this.connected = true;
        } catch (error) {
            throw new EventBusException(`Failed to connect to Redis: ${error.message}`, 'redis');
        }

        // The clients may have just been created, subscriptions do not survive a replacement
        await this.restoreSubscriptions();
    }

    /**
     * Subscribe every registered pattern the current subscribe client does not hold yet
     *
     * This is a no-op for a client that reconnected on its own, because node-redis restores
     * its subscriptions and the bookkeeping still lists them. After an explicit disconnect
     * the clients are replaced and nothing is subscribed, so without this the live channel
     * stops reaching handlers and durable drains stop being woken up.
     *
     * Every pattern is attempted even when one of them fails, and a failed pattern simply
     * stays unsubscribed, which makes the next connect or reconnect try it again.
     */
    private async restoreSubscriptions(): Promise<void> {
        const failedPatterns: string[] = [];
        let firstErrorMessage = '';

        for (const pattern of Array.from(this.handlers.keys())) {
            if (this.subscribedPatterns.has(pattern)) {
                continue;
            }

            try {
                await this.ensureSubscribed(pattern);
            } catch (error) {
                failedPatterns.push(pattern);
                firstErrorMessage = firstErrorMessage || error.message;
                this.logError(`Failed to restore subscription for pattern "${pattern}": ${error.message}`, { error });
            }
        }

        if (failedPatterns.length > 0) {
            throw new EventBusException(`Failed to restore subscriptions for ${failedPatterns.join(', ')}: ${firstErrorMessage}`, 'redis');
        }
    }

    /**
     * Open a single client, or wait for the one that is already opening
     */
    private async connectClient(client: RedisClientType): Promise<void> {
        if (client.isReady) {
            return;
        }

        // Never opened, or closed and reopenable
        if (!client.isOpen) {
            await client.connect();
            return;
        }

        // Opened but still handshaking or reconnecting on its own
        await this.waitForClientReady(client);
    }

    /**
     * Wait until a client reports readiness, giving up instead of hanging forever
     */
    private waitForClientReady(client: RedisClientType): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const cleanup = () => {
                clearTimeout(readyTimeout);
                client.off('ready', onReady);
                client.off('end', onEnd);
            };
            const onReady = () => {
                cleanup();
                resolve();
            };
            const onEnd = () => {
                cleanup();
                reject(new Error('Redis connection closed before becoming ready'));
            };
            const readyTimeout = setTimeout(() => {
                cleanup();
                reject(new Error(`Redis client did not become ready within ${CLIENT_READY_TIMEOUT_MS} ms`));
            }, CLIENT_READY_TIMEOUT_MS);

            client.on('ready', onReady);
            client.on('end', onEnd);
        });
    }

    /**
     * Wait until Redis is usable
     */
    private async waitForConnection(): Promise<void> {
        if (this.connected && this.publishClient.isReady && this.subscribeClient.isReady) {
            return;
        }

        // Log
        this.logWarning('Waiting for connection...');

        await this.connect();
    }

    /**
     * Check if connected to Redis
     */
    public isConnected(): boolean {
        return this.connected;
    }

    /**
     * Emit an event with optional data
     * Saves to Redis List for guaranteed delivery + publishes for real-time subscribers
     */
    public async emit(event: string, data?: any, ttlMinutes?: number): Promise<void> {
        let retries = 0;
        const maxRetries = 3;
        const retryDelay = 1000;

        const eventData = {
            event,
            data,
            timestamp: Date.now(),
            expiresAt: ttlMinutes ? Date.now() + ttlMinutes * 60 * 1000 : null,
        };
        const message = JSON.stringify(eventData);
        const durableKey = `${DURABLE_KEY_PREFIX}${event}`;
        const liveChannel = `${LIVE_CHANNEL_PREFIX}${event}`;

        while (retries <= maxRetries) {
            try {
                // Wait for Redis connection
                await this.waitForConnection();

                // Store the event and publish its wake-up in one transaction, so a subscriber
                // is never woken up for an event that is not in the durable list yet
                await this.publishClient.multi().lPush(durableKey, message).publish(liveChannel, message).exec();

                const ttlInfo = ttlMinutes ? ` (TTL: ${ttlMinutes} min)` : '';
                this.logInfo(`Event "${event}" saved to durable list and published live${ttlInfo}`);
                return;
            } catch (error) {
                retries++;
                this.logError(`Emit attempt ${retries} failed for event "${event}": ${error.message}`);

                if (retries > maxRetries) {
                    throw new EventBusException(`Failed to emit event "${event}" after ${maxRetries} retries: ${error.message}`, 'redis');
                }

                // Wait before retrying
                await Helper.sleep(retryDelay);
            }
        }
    }

    /**
     * Subscribe to an event (real-time only)
     */
    public on(eventPattern: string, handler: EventHandler): void {
        this.addHandler(eventPattern, { handler, durable: false });

        this.subscribeToPattern(eventPattern).catch((error) => {
            this.logError(`Failed to subscribe to pattern "${eventPattern}": ${error.message}`, { error });
        });
    }

    /**
     * Subscribe to an event with durable delivery (guaranteed delivery)
     *
     * Awaiting the returned promise tells the caller that past events were replayed and the
     * subscription is live, which is what an application wants during startup. Ignoring it
     * keeps the historical fire and forget behaviour.
     */
    public onDurable(eventPattern: string, handler: EventHandler): Promise<void> {
        const subscription = this.subscribeDurably(eventPattern, handler);

        // Report the failure on behalf of callers that do not await. Attaching the handler
        // also marks the rejection as handled, so an ignored promise cannot crash the
        // process, while a caller that does await still receives the error.
        subscription.catch((error) => {
            this.logError(`Failed to setup durable subscription for "${eventPattern}": ${error.message}`);
        });

        return subscription;
    }

    /**
     * Register the durable subscription and replay what the cursor has not seen
     *
     * Durable handlers are fed exclusively by the persisted cursor, never directly by
     * the live channel, so an event is only ever marked as processed after the handler
     * actually returned. Delivery is at-least-once and handlers must be idempotent.
     */
    private async subscribeDurably(eventPattern: string, handler: EventHandler): Promise<void> {
        const handlerInfo: HandlerInfo = { handler, durable: true };
        this.addHandler(eventPattern, handlerInfo);

        try {
            // Subscribe before draining, so events emitted during the drain still wake it up
            await this.subscribeToPattern(eventPattern);
            await this.scheduleDrain(eventPattern);
        } catch (error) {
            this.removeHandler(eventPattern, handlerInfo);
            throw new EventBusException(`Failed to create durable subscription for "${eventPattern}": ${error.message}`, 'redis');
        }

        // Log
        this.logInfo(`Durable subscription created for pattern "${eventPattern}"`);
    }

    /**
     * Add a handler for an event pattern
     */
    private addHandler(pattern: string, handlerInfo: HandlerInfo): void {
        if (!this.handlers.has(pattern)) {
            this.handlers.set(pattern, new Set());
        }

        this.handlers.get(pattern)!.add(handlerInfo);
    }

    /**
     * Subscribe to a pattern once Redis is usable
     */
    private async subscribeToPattern(pattern: string): Promise<void> {
        // Wait for Redis connection
        await this.waitForConnection();

        await this.ensureSubscribed(pattern);
    }

    /**
     * Subscribe to a pattern in Redis, joining an attempt that is already running
     *
     * Deliberately does not wait for the connection: connecting restores subscriptions
     * itself, and a subscription waiting for the connect while the connect waits for that
     * very subscription would deadlock.
     */
    private ensureSubscribed(pattern: string): Promise<void> {
        // Check if already subscribed to this pattern
        if (this.subscribedPatterns.has(pattern)) {
            return Promise.resolve();
        }

        const pendingSubscription = this.pendingSubscriptions.get(pattern);

        if (pendingSubscription) {
            return pendingSubscription;
        }

        const operation = this.subscribeToPatternNow(pattern);
        const clearOperation = () => {
            if (this.pendingSubscriptions.get(pattern) === operation) {
                this.pendingSubscriptions.delete(pattern);
            }
        };

        this.pendingSubscriptions.set(pattern, operation);
        operation.then(clearOperation, clearOperation);
        return operation;
    }

    /**
     * Perform the Redis subscription
     */
    private async subscribeToPatternNow(pattern: string): Promise<void> {
        const client = this.subscribeClient;
        const listener = this.getSubscriptionListener(pattern);
        const subscribeMethod = this.hasSegmentWildcard(pattern) ? 'pSubscribe' : 'subscribe';

        await client[subscribeMethod](this.toLiveChannelPattern(pattern), listener);

        // The connection was replaced while subscribing, so the subscription went with it and
        // must not be recorded, otherwise the reconciliation would consider it restored
        if (this.subscribeClient !== client) {
            throw new EventBusException(`Connection was replaced while subscribing to pattern "${pattern}"`, 'redis');
        }

        // Mark pattern as subscribed
        this.subscribedPatterns.add(pattern);
        this.logInfo(`Successfully subscribed to pattern "${pattern}"`);
    }

    /**
     * Get the listener of a pattern, creating it on first use
     *
     * The very same function object has to be handed to unsubscribe later, otherwise
     * node-redis keeps the old listener attached to the channel.
     */
    private getSubscriptionListener(pattern: string): SubscriptionListener {
        let listener = this.subscriptionListeners.get(pattern);

        if (!listener) {
            listener = (message: string, channel: string) => this.handlePatternMessage(pattern, channel, message);
            this.subscriptionListeners.set(pattern, listener);
        }

        return listener;
    }

    /**
     * Handle an incoming message of one subscription
     *
     * Only the handlers of the pattern whose subscription fired are dispatched. Scanning
     * every registered pattern here would deliver a message twice whenever two overlapping
     * patterns are subscribed.
     */
    private handlePatternMessage(pattern: string, channel: string, message: string): void {
        if (!channel.startsWith(LIVE_CHANNEL_PREFIX)) {
            return;
        }

        // The Redis glob is broader than the framework matcher, drop what does not really match
        const event = channel.substring(LIVE_CHANNEL_PREFIX.length);
        if (!this.matchesPattern(event, pattern)) {
            return;
        }

        const handlerSet = this.handlers.get(pattern);
        if (!handlerSet) {
            return;
        }

        // Durable handlers are fed by the cursor, the live message is only a wake-up
        if (this.getDurableHandlers(pattern).length > 0) {
            this.scheduleDrain(pattern).catch((error) => {
                // Leave the cursor where it is, a later wake-up or reconnect retries it
                this.logError(`Failed to drain durable pattern "${pattern}": ${error.message}`, { error });
            });
        }

        const liveHandlers = Array.from(handlerSet).filter((handlerInfo) => !handlerInfo.durable);
        if (liveHandlers.length === 0) {
            return;
        }

        try {
            const payload = this.createEventPayload(message);

            for (const handlerInfo of liveHandlers) {
                // Wrap the call so a rejected async handler is reported instead of going unhandled
                Promise.resolve(handlerInfo.handler(payload)).catch((error) => {
                    this.logError(`Error in handler for pattern "${pattern}": ${error.message}`, { error });
                });
            }
        } catch (error) {
            this.logError(`Failed to handle message for pattern "${pattern}": ${error.message}`, { error });
        }
    }

    /**
     * Get the durable handlers registered for a pattern
     */
    private getDurableHandlers(pattern: string): HandlerInfo[] {
        return Array.from(this.handlers.get(pattern) ?? []).filter((handlerInfo) => handlerInfo.durable);
    }

    /**
     * Request a drain of a durable pattern
     *
     * Wake-ups are coalesced: while a drain runs, further wake-ups only ask it to make one
     * more pass, so an event emitted mid-drain is never missed and never starts a second
     * concurrent drain of the same cursor.
     */
    private scheduleDrain(pattern: string): Promise<void> {
        const runningQueue = this.drainQueues.get(pattern);

        if (runningQueue) {
            runningQueue.rerunRequested = true;
            return runningQueue.promise;
        }

        const queue: DrainQueue = { promise: Promise.resolve(), rerunRequested: false };
        this.drainQueues.set(pattern, queue);

        queue.promise = this.runDrainPasses(pattern, queue).finally(() => {
            if (this.drainQueues.get(pattern) === queue) {
                this.drainQueues.delete(pattern);
            }
        });

        return queue.promise;
    }

    /**
     * Keep draining while new wake-ups arrive
     */
    private async runDrainPasses(pattern: string, queue: DrainQueue): Promise<void> {
        do {
            queue.rerunRequested = false;
            await this.drainPattern(pattern);
        } while (queue.rerunRequested);
    }

    /**
     * Deliver everything the cursor has not seen yet
     */
    private async drainPattern(pattern: string): Promise<void> {
        await this.waitForConnection();
        await this.readPastEvents(pattern);
    }

    /**
     * Read the events a durable pattern has not processed yet
     *
     * Events are prepended with LPUSH, so index 0 holds the newest one and the cursor counts
     * how many entries at the tail were already processed. Counting from the tail keeps the
     * cursor valid even when new events are pushed while this drain is running.
     */
    private async readPastEvents(pattern: string): Promise<void> {
        // Find all durable keys matching the pattern
        const durableKeys = await this.findDurableKeys(pattern);

        for (const key of durableKeys) {
            let lastProcessedIndex = await this.readProcessedPosition(key);

            // The durable list only ever grows, so a list shorter than the cursor claims can
            // only mean Redis lost data. Trusting the cursor then would silently skip events
            const listLength = await this.publishClient.lLen(key);
            if (listLength <= lastProcessedIndex) {
                this.logWarning(
                    `Durable key "${key}" holds ${listLength} events but the cursor is at ${lastProcessedIndex}, replaying what is left`,
                );
                lastProcessedIndex = -1;
            }

            // Read the unprocessed head of the list
            const messages = await this.publishClient.lRange(key, 0, -(lastProcessedIndex + 2));

            if (messages.length === 0) {
                this.logDebug(`No new messages for key "${key}" (already processed up to ${lastProcessedIndex})`);
                continue;
            }

            this.logDebug(`Reading ${messages.length} new messages for key "${key}", lastIndex=${lastProcessedIndex}`);

            // Redis lists are LIFO, reverse to process in chronological order
            for (const message of messages.reverse()) {
                const durableHandlers = this.getDurableHandlers(pattern);

                // The subscription was removed while draining
                if (durableHandlers.length === 0) {
                    return;
                }

                if (!(await this.deliverPastEvent(key, message, durableHandlers))) {
                    // A handler failed, leave the cursor untouched so the event is redelivered
                    return;
                }

                // Advance the cursor only after the event was fully handled
                lastProcessedIndex++;
                await this.saveProcessedPosition(key, lastProcessedIndex);
            }
        }
    }

    /**
     * Read where this service left off in one durable key
     *
     * Deliberately read from Redis on every drain instead of caching it in the process. A
     * cached cursor outlives the data it points at: when Redis is restarted without
     * persistence, flushed, or fails over to an empty replica, the key disappears while the
     * process keeps counting, and every event until the list grew back would be skipped.
     */
    private async readProcessedPosition(durableKey: string): Promise<number> {
        const positionKey = `${POSITION_KEY_PREFIX}${durableKey}:${this.serviceName}`;
        const position = await this.publishClient.get(positionKey);

        // Nothing processed yet, or the cursor is gone together with the data it described
        if (position === null) {
            return -1;
        }

        const positionValue = Number(position);

        // A corrupt cursor must fail loudly, silently falling back would replay everything.
        // Only this key is affected, subscriptions to other keys keep working
        if (!/^-?\d+$/.test(position) || !Number.isSafeInteger(positionValue) || positionValue < -1) {
            throw new EventBusException(`Invalid persisted position "${position}" for durable key "${durableKey}"`, 'redis');
        }

        return positionValue;
    }

    /**
     * Deliver one stored event to every durable handler of the pattern
     *
     * Returns false when the cursor must not advance. An unparseable entry can never be
     * delivered, so it is reported and skipped instead of blocking the cursor forever.
     */
    private async deliverPastEvent(key: string, message: string, durableHandlers: HandlerInfo[]): Promise<boolean> {
        let payload: EventPayload;
        let expiresAt: number | null;

        try {
            payload = this.createEventPayload(message);
            expiresAt = JSON.parse(message).expiresAt ?? null;
        } catch (error) {
            this.logError(`Skipping unreadable event in durable key "${key}": ${error.message}`, { error });
            return true;
        }

        // Check TTL - skip expired events
        if (expiresAt && Date.now() > expiresAt) {
            this.logInfo(`Skipping expired event "${payload.event.name}" (expired at ${new Date(expiresAt).toISOString()})`);
            return true;
        }

        try {
            // Every durable handler of the pattern shares one cursor, so all of them must
            // succeed before the event counts as processed
            for (const handlerInfo of durableHandlers) {
                await handlerInfo.handler(payload);
            }
        } catch (error) {
            this.logError(`Error processing past event from key "${key}": ${error.message}`, { error });
            return false;
        }

        return true;
    }

    /**
     * Find Redis keys matching durable pattern
     */
    private async findDurableKeys(pattern: string): Promise<string[]> {
        const keys: string[] = [];
        let cursor = '0';

        // Use SCAN to find matching keys (safe for large datasets)
        do {
            const result = await this.publishClient.scan(cursor, {
                MATCH: `${DURABLE_KEY_PREFIX}${this.toRedisGlob(pattern)}`,
                COUNT: 100,
            });
            cursor = result.cursor;

            // The Redis glob spans dots, keep only what the framework matcher accepts too
            keys.push(...result.keys.filter((key) => this.matchesPattern(key.substring(DURABLE_KEY_PREFIX.length), pattern)));
        } while (cursor !== '0');

        return keys;
    }

    /**
     * Save processed position to Redis
     */
    private async saveProcessedPosition(durableKey: string, position: number): Promise<void> {
        const positionKey = `${POSITION_KEY_PREFIX}${durableKey}:${this.serviceName}`;
        await this.publishClient.set(positionKey, position.toString());
        this.logDebug(`Service "${this.serviceName}" saved position for "${durableKey}": ${position} (key: "${positionKey}")`);
    }

    /**
     * Create EventPayload from Redis message
     */
    private createEventPayload(message: string): EventPayload {
        const { event, data, timestamp, expiresAt } = JSON.parse(message);
        return {
            event: {
                name: event,
                timestamp: timestamp || Date.now(),
                expiresAt: expiresAt || undefined,
            },
            data,
        };
    }

    /**
     * Catch up every durable cursor after a reconnect
     */
    private scheduleDurableCatchUp(): void {
        for (const pattern of this.handlers.keys()) {
            if (this.getDurableHandlers(pattern).length === 0) {
                continue;
            }

            this.scheduleDrain(pattern).catch((error) => {
                // Leave the cursor where it is, a later wake-up retries it
                this.logError(`Failed to drain durable pattern "${pattern}": ${error.message}`, { error });
            });
        }
    }

    /**
     * Unsubscribe from an event
     */
    public off(eventPattern: string, handler?: EventHandler): void {
        const handlerSet = this.handlers.get(eventPattern);

        if (!handlerSet) {
            return;
        }

        if (handler) {
            // Remove specific handler
            for (const handlerInfo of Array.from(handlerSet)) {
                if (handlerInfo.handler === handler) {
                    handlerSet.delete(handlerInfo);
                }
            }
        } else {
            // Remove all handlers
            handlerSet.clear();
        }

        // If no handlers left, unsubscribe from pattern
        if (handlerSet.size === 0) {
            this.handlers.delete(eventPattern);

            this.unsubscribeFromPattern(eventPattern).catch((error) => {
                this.logError(`Failed to unsubscribe from pattern "${eventPattern}": ${error.message}`, { error });
            });
        }
    }

    /**
     * Remove a single handler, dropping its subscription when it was the last one
     */
    private removeHandler(pattern: string, handlerInfo: HandlerInfo): void {
        const handlerSet = this.handlers.get(pattern);

        if (!handlerSet) {
            return;
        }

        handlerSet.delete(handlerInfo);

        if (handlerSet.size === 0) {
            this.handlers.delete(pattern);

            this.unsubscribeFromPattern(pattern).catch((error) => {
                this.logError(`Failed to unsubscribe from pattern "${pattern}": ${error.message}`, { error });
            });
        }
    }

    /**
     * Unsubscribe from a pattern in Redis
     */
    private async unsubscribeFromPattern(pattern: string): Promise<void> {
        const listener = this.subscriptionListeners.get(pattern);
        this.subscriptionListeners.delete(pattern);

        if (!this.subscribedPatterns.has(pattern)) {
            return;
        }

        // Remove pattern from subscribed patterns
        this.subscribedPatterns.delete(pattern);

        if (!listener || !this.subscribeClient.isReady) {
            return;
        }

        const unsubscribeMethod = this.hasSegmentWildcard(pattern) ? 'pUnsubscribe' : 'unsubscribe';
        await this.subscribeClient[unsubscribeMethod](this.toLiveChannelPattern(pattern), listener);
    }

    /**
     * Remove all listeners for an event or all events
     */
    public removeAllListeners(eventPattern?: string): void {
        if (eventPattern) {
            this.off(eventPattern);
            return;
        }

        for (const pattern of Array.from(this.handlers.keys())) {
            this.off(pattern);
        }
    }

    /**
     * Get the count of listeners for a specific event
     */
    public listenerCount(eventPattern: string): number {
        const handlerSet = this.handlers.get(eventPattern);
        return handlerSet ? handlerSet.size : 0;
    }

    /**
     * Get all event patterns that have listeners
     */
    public eventNames(): string[] {
        return Array.from(this.handlers.keys());
    }

    /**
     * Disconnect from Redis
     */
    public async disconnect(): Promise<void> {
        try {
            await Promise.all([this.closeClient(this.publishClient), this.closeClient(this.subscribeClient)]);
        } catch (error) {
            throw new EventBusException(`Failed to disconnect from Redis: ${error.message}`, 'redis');
        } finally {
            this.connected = false;
            this.subscribedPatterns.clear();
            this.subscriptionListeners.clear();

            // A subscription still in flight belongs to the connection being closed, joining it
            // would make the reconciliation of the next connect fail for nothing
            this.pendingSubscriptions.clear();

            // Node-redis cannot reopen a client that was quit, the next connect builds new ones
            this.clientsNeedInitialization = true;
        }
    }

    /**
     * Close a single client
     */
    private async closeClient(client: RedisClientType): Promise<void> {
        if (!client.isOpen) {
            return;
        }

        // A client that never became ready cannot process QUIT
        if (!client.isReady) {
            client.destroy();
            return;
        }

        await client.quit();
    }

    /**
     * Check whether a whole segment of the pattern is a wildcard
     *
     * EventPatternMatcher only treats a complete "*" or "**" segment as a wildcard, so the
     * transport must use the same rule when choosing between subscribe and pSubscribe.
     */
    private hasSegmentWildcard(pattern: string): boolean {
        return pattern.split('.').some((segment) => segment === '*' || segment === '**');
    }

    /**
     * Translate a framework pattern into a Redis glob
     *
     * The glob is only a broad transport filter, it spans dots where the framework matcher
     * does not. EventPatternMatcher stays authoritative for both callbacks and scanned keys.
     */
    private toRedisGlob(pattern: string): string {
        return pattern
            .split('.')
            .map((segment) => {
                if (segment === '*' || segment === '**') {
                    return '*';
                }

                return Array.from(segment)
                    .map((character) => (['*', '?', '[', ']', '\\'].includes(character) ? `\\${character}` : character))
                    .join('');
            })
            .join('.');
    }

    /**
     * Build the live channel or channel pattern of an event pattern
     */
    private toLiveChannelPattern(pattern: string): string {
        return `${LIVE_CHANNEL_PREFIX}${this.hasSegmentWildcard(pattern) ? this.toRedisGlob(pattern) : pattern}`;
    }

    /**
     * Check if an event matches a pattern
     */
    private matchesPattern(event: string, pattern: string): boolean {
        return EventPatternMatcher.matchesPattern(event, pattern);
    }

    /**
     * Log info
     */
    private logInfo(message: string, params?: any): void {
        this.loggerService.info(`[Redis - EventBus] ${message}`, params, 'eventbus');
    }

    /**
     * Log debug
     */
    private logDebug(message: string, params?: any): void {
        this.loggerService.debug(`[Redis - EventBus] ${message}`, params, 'eventbus');
    }

    /**
     * Log error
     */
    private logError(message: string, params?: any): void {
        this.loggerService.error(`[Redis - EventBus] ${message}`, params, 'eventbus');
    }

    /**
     * Log warning
     */
    private logWarning(message: string, params?: any): void {
        this.loggerService.warning(`[Redis - EventBus] ${message}`, params, 'eventbus');
    }
}
