import { createClient, RedisClientType } from 'redis';
import EventBusRepositoryInterface, { EventHandler, EventPayload } from './EventBusRepositoryInterface';
import EventBusException from '../../Exceptions/EventBus/EventBusException';
import IOC from '../../ServiceProviders/IOC';
import LoggerService from '../../Services/Logger/LoggerService';
import Helper from '../../Helper/Helper';
import EventPatternMatcher from '../../Helper/EventPatternMatcher';

interface HandlerInfo {
    handler: EventHandler;
    pattern: string;
}

export default class EventBusRedisRepository implements EventBusRepositoryInterface {
    private eventBusConfig: any;
    private publishClient: RedisClientType;
    private subscribeClient: RedisClientType;
    private handlers: Map<string, Set<HandlerInfo>>;
    private connected: boolean = false;
    private reconnecting: boolean = false;
    private subscribedPatterns: Set<string> = new Set();
    private processedPositions: Map<string, number> = new Map();
    private positionsLoaded: boolean = false;
    private positionsLoadingPromise: Promise<void> | null = null;
    private serviceName: string;
    private loggerService: LoggerService;

    /**
     * Constructor
     */
    constructor(eventBusConfig: any) {
        this.eventBusConfig = eventBusConfig;
        this.handlers = new Map();
        this.serviceName = eventBusConfig.driverConfiguration.redis.serviceName || 'default-service';
        this.loggerService = IOC.makeSingleton(LoggerService) as LoggerService;

        // Log
        this.logInfo(`initialized for service: "${this.serviceName}"`);

        // Initialize Redis clients
        this.initializeRedisClients();

        // Connect to Redis
        this.connect();
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
                connectTimeout: 10000,
            },
        };

        if (redisConfig.password) {
            connectionOptions.password = redisConfig.password;
        }

        // Create publish client
        this.publishClient = createClient(connectionOptions);

        // Create subscribe client (separate connection for subscriptions)
        this.subscribeClient = createClient(connectionOptions);

        // Setup event listeners
        this.setupEventListeners();
    }

    /**
     * Setup event listeners for Redis clients
     */
    private setupEventListeners(): void {
        // Publish client events
        this.publishClient.on('error', (err) => {
            this.logError(`Publish client connection error: ${err}`);
            this.connected = false;
        });

        this.publishClient.on('end', () => {
            this.logError('Publish client connection closed');
            this.connected = false;
            this.subscribedPatterns.clear();
        });

        this.publishClient.on('connect', () => {
            this.logError('Publish client connected');
        });

        this.publishClient.on('ready', () => {
            this.logInfo('Publish client ready');

            // Only set connected if both clients are ready
            if (this.publishClient.isReady && this.subscribeClient.isReady) {
                this.connected = true;
                this.reconnecting = false;
            }
        });

        // Subscribe client events
        this.subscribeClient.on('error', (err) => {
            this.logError(`Subscribe client connection error: ${err}`);
            this.connected = false;
        });

        this.subscribeClient.on('end', () => {
            this.logInfo('Subscribe client connection closed');
            this.connected = false;
            this.subscribedPatterns.clear();
        });

        this.subscribeClient.on('connect', () => {
            this.logInfo('Subscribe client connected');
        });

        this.subscribeClient.on('ready', () => {
            this.logInfo('Subscribe client ready');

            // Only set connected if both clients are ready
            if (this.publishClient.isReady && this.subscribeClient.isReady) {
                this.connected = true;
                this.reconnecting = false;

                // Re-subscribe to all patterns after reconnection
                this.resubscribeToPatterns();
            }
        });
    }

    /**
     * Wait until Redis is connected
     */
    private async waitForConnection(): Promise<void> {
        while (!this.connected) {
            // Log
            this.logWarning('Waiting for connection...');

            // Check connection status every 1000 ms
            await Helper.sleep(1000);
        }
    }

    /**
     * Connect to Redis
     */
    public async connect(): Promise<void> {
        try {
            await Promise.all([this.publishClient.connect(), this.subscribeClient.connect()]);
            this.connected = true;
        } catch (error) {
            throw new EventBusException(`Failed to connect to Redis: ${error.message}`, 'redis');
        }
    }

    /**
     * Disconnect from Redis
     */
    public async disconnect(): Promise<void> {
        try {
            await Promise.all([this.publishClient.quit(), this.subscribeClient.quit()]);
            this.connected = false;
        } catch (error) {
            throw new EventBusException(`Failed to disconnect from Redis: ${error.message}`, 'redis');
        }
    }

    /**
     * Reconnect Redis clients
     */
    private async reconnectRedisClients(): Promise<void> {
        // Prevent multiple reconnect attempts if already reconnecting or connected
        if (this.reconnecting || this.connected) return;
        this.reconnecting = true;
        this.connected = false;

        try {
            this.logWarning('Attempting to reconnect...');

            // Wait before reconnecting to avoid rapid reconnection attempts
            await new Promise((resolve) => setTimeout(resolve, 2000));

            // Attempt to reconnect existing clients
            await this.connect();
        } catch (err) {
            this.logError(`Error during reconnection: ${err}`);
            // Retry reconnection
            setTimeout(() => {
                this.reconnecting = false;
                this.reconnectRedisClients();
            }, 5000);
        }
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

        while (retries <= maxRetries) {
            try {
                // Wait for Redis connection
                await this.waitForConnection();

                const eventData = {
                    event,
                    data,
                    timestamp: Date.now(),
                    expiresAt: ttlMinutes ? Date.now() + ttlMinutes * 60 * 1000 : null,
                };

                const message = JSON.stringify(eventData);

                // 1. Save to durable list for guaranteed delivery
                const durableKey = `durable:${event}`;
                await this.publishClient.lPush(durableKey, message);

                // 2. Publish to live channel for real-time subscribers
                const liveKey = `live:${event}`;
                await this.publishClient.publish(liveKey, message);

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
        this.addLiveHandler(eventPattern, handler);
    }

    /**
     * Subscribe to an event with durable delivery (guaranteed delivery)
     * Reads all past events from Redis Lists + subscribes to new events
     */
    public onDurable(eventPattern: string, handler: EventHandler): void {
        // Start async operations but return immediately
        this.setupDurableSubscription(eventPattern, handler).catch((error) => {
            this.logError(`Failed to setup durable subscription for "${eventPattern}": ${error.message}`);
        });
    }

    /**
     * Setup durable subscription asynchronously
     */
    private async setupDurableSubscription(eventPattern: string, handler: EventHandler): Promise<void> {
        try {
            // Wait for Redis connection
            await this.waitForConnection();

            // Load persisted positions before reading past events
            await this.ensurePositionsLoaded();

            // 1. Read all past events from durable lists
            await this.readPastEvents(eventPattern, handler);

            // 2. Subscribe to future live events
            this.addLiveHandler(eventPattern, handler);

            // Log
            this.logInfo(`Durable subscription created for pattern "${eventPattern}"`);
        } catch (error) {
            throw new EventBusException(`Failed to create durable subscription for "${eventPattern}": ${error.message}`, 'redis');
        }
    }

    /**
     * Add a handler for an event pattern
     */
    private addHandler(pattern: string, handler: EventHandler): void {
        if (!this.handlers.has(pattern)) {
            this.handlers.set(pattern, new Set());

            // Subscribe to the pattern in Redis
            this.subscribeToPattern(pattern);
        }

        this.handlers.get(pattern)!.add({ handler, pattern });
    }

    /**
     * Subscribe to a pattern in Redis
     */
    private async subscribeToPattern(pattern: string): Promise<void> {
        // Wait for Redis connection
        await this.waitForConnection();

        // Check if already subscribed to this pattern
        if (this.subscribedPatterns.has(pattern)) {
            this.logWarning(`Already subscribed to pattern "${pattern}", skipping...`);
            return;
        }

        try {
            const subscribeMethod = this.isWildcardPattern(pattern) ? 'pSubscribe' : 'subscribe';

            await this.subscribeClient[subscribeMethod](pattern, (message: string, channel: string) => {
                this.handleMessage(channel, message);
            });

            // Mark pattern as subscribed
            this.subscribedPatterns.add(pattern);
            this.logInfo(`Successfully subscribed to pattern "${pattern}"`);
        } catch (error) {
            this.logError(`Failed to subscribe to "${pattern}"`, { error });
        }
    }

    /**
     * Handle incoming messages from Redis
     */
    private handleMessage(channel: string, message: string): void {
        try {
            const { event, data, timestamp } = JSON.parse(message);

            // Create event payload
            const payload: EventPayload = {
                event: {
                    name: event,
                    timestamp: timestamp || Date.now(),
                },
                data,
            };

            // Find matching handlers
            for (const [pattern, handlerSet] of this.handlers) {
                if (this.matchesPattern(channel, pattern)) {
                    for (const handlerInfo of handlerSet) {
                        try {
                            handlerInfo.handler(payload);
                        } catch (error) {
                            this.logError(`Error in handler for pattern "${pattern}"`, { error });
                        }
                    }
                }
            }
        } catch (error) {
            this.logError('Failed to handle message', { error });
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
            const toRemove = Array.from(handlerSet).filter((h) => h.handler === handler);
            for (const handlerInfo of toRemove) {
                handlerSet.delete(handlerInfo);
            }
        } else {
            // Remove all handlers
            handlerSet.clear();
        }

        // If no handlers left, unsubscribe from pattern
        if (handlerSet.size === 0) {
            this.handlers.delete(eventPattern);
            this.unsubscribeFromPattern(eventPattern);
        }
    }

    /**
     * Unsubscribe from a pattern in Redis
     */
    private async unsubscribeFromPattern(pattern: string): Promise<void> {
        if (!this.connected) {
            return;
        }

        try {
            const unsubscribeMethod = this.isWildcardPattern(pattern) ? 'pUnsubscribe' : 'unsubscribe';
            await this.subscribeClient[unsubscribeMethod](pattern);

            // Remove pattern from subscribed patterns
            this.subscribedPatterns.delete(pattern);
        } catch (error) {
            this.logError(`Failed to unsubscribe from pattern "${pattern}"`, { error });
        }
    }

    /**
     * Remove all listeners for an event or all events
     */
    public removeAllListeners(eventPattern?: string): void {
        if (eventPattern) {
            this.off(eventPattern);
        } else {
            // Unsubscribe from all patterns
            for (const pattern of this.handlers.keys()) {
                this.unsubscribeFromPattern(pattern);
            }
            this.handlers.clear();
            this.subscribedPatterns.clear();
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
     * Re-subscribe to all patterns after reconnection
     */
    private async resubscribeToPatterns(): Promise<void> {
        for (const pattern of this.handlers.keys()) {
            await this.subscribeToPattern(pattern);
        }
    }

    /**
     * Check if a pattern contains wildcards
     */
    private isWildcardPattern(pattern: string): boolean {
        return EventPatternMatcher.isWildcardPattern(pattern);
    }

    /**
     * Check if a channel matches a pattern
     */
    private matchesPattern(channel: string, pattern: string): boolean {
        return EventPatternMatcher.matchesPattern(channel, pattern);
    }

    /**
     * Add handler for live events (pub/sub)
     */
    private addLiveHandler(pattern: string, handler: EventHandler): void {
        const livePattern = `live:${pattern}`;
        this.addHandler(livePattern, handler);
    }

    /**
     * Read past events from Redis Lists based on pattern
     */
    private async readPastEvents(pattern: string, handler: EventHandler): Promise<void> {
        try {
            // Find all durable keys matching the pattern
            const durableKeys = await this.findDurableKeys(pattern);

            // Read new messages from matching lists
            for (const key of durableKeys) {
                // Get last processed position for this key
                const lastProcessedIndex = this.processedPositions.get(key) || -1;

                this.logDebug(`Looking for position of key "${key}" in Map`);

                // Get total list length
                const listLength = await this.publishClient.lLen(key);

                this.logDebug(`Processing key "${key}": lastIndex=${lastProcessedIndex}, listLength=${listLength}`);

                if (listLength > lastProcessedIndex + 1) {
                    // Read only new messages starting from lastProcessedIndex + 1
                    const startIndex = lastProcessedIndex + 1;
                    const messages = await this.publishClient.lRange(key, startIndex, -1);

                    this.logDebug(`Reading ${messages.length} new messages from index ${startIndex} for key "${key}"`);

                    // Process messages in chronological order (reverse since Redis lists are LIFO)
                    for (let i = messages.length - 1; i >= 0; i--) {
                        try {
                            const parsed = JSON.parse(messages[i]);

                            // Check TTL - skip expired events
                            if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
                                this.logInfo(
                                    `Skipping expired event "${parsed.event}" (expired at ${new Date(parsed.expiresAt).toISOString()})`,
                                );
                                continue;
                            }

                            const payload = this.createEventPayload(messages[i]);
                            handler(payload);
                        } catch (error) {
                            this.logError(`Error processing past event from key "${key}"`, { error });
                        }
                    }

                    // Update processed position after all messages are processed
                    const newProcessedIndex = listLength - 1;
                    this.processedPositions.set(key, newProcessedIndex);

                    // Log
                    this.logDebug(`Service "${this.serviceName}" updating position for key "${key}" to ${newProcessedIndex}`);

                    // Persist position to Redis
                    await this.saveProcessedPosition(key, newProcessedIndex);
                } else {
                    this.logDebug(`No new messages for key "${key}" (already processed up to ${lastProcessedIndex}`);
                }
            }
        } catch (error) {
            this.logError(`Error reading past events for pattern "${pattern}"`, { error });
        }
    }

    /**
     * Find Redis keys matching durable pattern
     */
    private async findDurableKeys(pattern: string): Promise<string[]> {
        const durablePattern = `durable:${pattern}`;
        const keys: string[] = [];

        // Use SCAN to find matching keys (safe for large datasets)
        let cursor = 0;
        do {
            const result = await this.publishClient.scan(cursor, { MATCH: durablePattern, COUNT: 100 });
            cursor = result.cursor;
            keys.push(...result.keys);
        } while (cursor !== 0);

        return keys;
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
     * Ensure positions are loaded (load only once)
     */
    private async ensurePositionsLoaded(): Promise<void> {
        if (this.positionsLoaded) {
            return;
        }

        // If already loading, wait for existing promise
        if (this.positionsLoadingPromise) {
            await this.positionsLoadingPromise;
            return;
        }

        // Start loading and save promise to prevent race conditions
        this.positionsLoadingPromise = this.loadPersistedPositions();
        await this.positionsLoadingPromise;
        this.positionsLoaded = true;
        this.positionsLoadingPromise = null;
    }

    /**
     * Load persisted positions from Redis
     */
    private async loadPersistedPositions(): Promise<void> {
        try {
            await this.waitForConnection();

            // Find all position keys
            const positionKeys = await this.findPositionKeys();

            // Load each position
            for (const positionKey of positionKeys) {
                const position = await this.publishClient.get(positionKey);
                if (position !== null) {
                    // Extract durable key from position key (remove 'position:' prefix and ':{serviceName}' suffix)
                    const prefix = 'position:';
                    const suffix = `:${this.serviceName}`;
                    const durableKey = positionKey.substring(prefix.length, positionKey.length - suffix.length);
                    const positionValue = parseInt(position);
                    this.processedPositions.set(durableKey, positionValue);

                    // Log
                    this.logDebug(`Service "${this.serviceName}" loaded position for "${durableKey}": ${positionValue}`);
                }
            }

            // Log
            this.logDebug(`Service "${this.serviceName}" loaded ${this.processedPositions.size} persisted positions`);

            // Debug: log all keys in processedPositions Map
            for (const [mapKey, mapValue] of this.processedPositions) {
                this.logDebug(`Service "${this.serviceName}" Map contains key "${mapKey}" with value ${mapValue}`);
            }
        } catch (error) {
            // Log
            this.logError(`Error loading persisted positions: ${error.message}`);
        }
    }

    /**
     * Find all position keys in Redis
     */
    private async findPositionKeys(): Promise<string[]> {
        const keys: string[] = [];
        let cursor = 0;

        do {
            const result = await this.publishClient.scan(cursor, { MATCH: `position:durable:*:${this.serviceName}`, COUNT: 100 });
            cursor = result.cursor;
            keys.push(...result.keys);
        } while (cursor !== 0);

        return keys;
    }

    /**
     * Save processed position to Redis
     */
    private async saveProcessedPosition(durableKey: string, position: number): Promise<void> {
        try {
            const positionKey = `position:${durableKey}:${this.serviceName}`;
            await this.publishClient.set(positionKey, position.toString());
            this.logDebug(`Service "${this.serviceName}" saved position for "${durableKey}": ${position} (key: "${positionKey}")`);
        } catch (error) {
            this.logError(`Error saving position for key "${durableKey}": ${error.message}`);
        }
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
