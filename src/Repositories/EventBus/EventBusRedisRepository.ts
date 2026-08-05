import { createClient, RedisClientType } from 'redis';
import EventBusRepositoryInterface, { EventHandler, EventPayload } from './EventBusRepositoryInterface';
import EventBusException from '../../Exceptions/EventBus/EventBusException';
import IOC from '../../ServiceProviders/IOC';
import LoggerService from '../../Services/Logger/LoggerService';
import Helper from '../../Helper/Helper';
import EventPatternMatcher from '../../Helper/EventPatternMatcher';

interface HandlerInfo {
    handler: EventHandler;
    active: boolean;
    durable: boolean;
    readyForDrain: boolean;
    queue: Promise<void>;
}

interface DrainState {
    handlerInfo: HandlerInfo;
    requested: boolean;
    promise: Promise<void> | null;
    token: object | null;
}

interface PatternTransition {
    next: number;
    literal: string | null;
    acceptsEmpty: boolean;
}

export default class EventBusRedisRepository implements EventBusRepositoryInterface {
    private eventBusConfig: any;
    private publishClient: RedisClientType;
    private subscribeClient: RedisClientType;
    private handlers: Map<string, Set<HandlerInfo>> = new Map();
    private connected: boolean = false;
    private clientsNeedInitialization: boolean = false;
    private subscribedPatterns: Set<string> = new Set();
    private pendingUnsubscribePatterns: Set<string> = new Set();
    private subscriptionListeners: Map<string, (message: string, channel: string) => void> = new Map();
    private subscriptionOperations: Map<string, Promise<void>> = new Map();
    private drainStates: Map<string, DrainState> = new Map();
    private processedPositions: Map<string, number> = new Map();
    private positionsLoaded: boolean = false;
    private positionsLoadingPromise: Promise<void> | null = null;
    private connectPromise: Promise<void> | null = null;
    private connectToken: object | null = null;
    private disconnectPromise: Promise<void> | null = null;
    private disconnectToken: object | null = null;
    private serviceName: string;
    private loggerService: LoggerService;

    /**
     * Constructor
     */
    constructor(eventBusConfig: any) {
        this.eventBusConfig = eventBusConfig;
        this.serviceName = eventBusConfig.driverConfiguration.redis.serviceName || 'default-service';
        this.loggerService = IOC.makeSingleton(LoggerService) as LoggerService;

        this.logInfo(`initialized for service: "${this.serviceName}"`);
        this.initializeRedisClients();
        this.connect().catch((error) => {
            this.logError(`Failed to connect to Redis: ${error.message}`);
        });
    }

    /**
     * Initialize Redis clients for pub/sub
     */
    private initializeRedisClients(): void {
        const redisConfig = this.eventBusConfig.driverConfiguration.redis;
        const connectionOptions: any = {
            url: `redis://${redisConfig.host}:${redisConfig.port}`,
            database: redisConfig.db,
            socket: {
                reconnectStrategy: (retries: number) => {
                    this.logWarning(`Reconnecting, attempt #${retries}`);
                    return Math.min(retries * 100, 3000);
                },
                connectTimeout: 10000,
            },
        };

        if (redisConfig.password) connectionOptions.password = redisConfig.password;

        this.publishClient = createClient(connectionOptions);
        this.subscribeClient = createClient(connectionOptions);
        this.setupEventListeners(this.publishClient, this.subscribeClient);
    }

    /**
     * Setup event listeners for a Redis client pair
     */
    private setupEventListeners(publishClient: RedisClientType, subscribeClient: RedisClientType): void {
        publishClient.on('error', (error) => {
            if (this.publishClient !== publishClient) return;
            this.connected = false;
            this.logError(`Publish client connection error: ${error}`);
        });
        publishClient.on('end', () => {
            if (this.publishClient !== publishClient) return;
            this.connected = false;
            this.logError('Publish client connection closed');
        });
        publishClient.on('connect', () => {
            if (this.publishClient === publishClient) this.logInfo('Publish client connected');
        });
        publishClient.on('ready', () => this.handleClientsReady(publishClient, subscribeClient));

        subscribeClient.on('error', (error) => {
            if (this.subscribeClient !== subscribeClient) return;
            this.connected = false;
            this.logError(`Subscribe client connection error: ${error}`);
        });
        subscribeClient.on('end', () => {
            if (this.subscribeClient !== subscribeClient) return;
            this.connected = false;
            this.logInfo('Subscribe client connection closed');
        });
        subscribeClient.on('connect', () => {
            if (this.subscribeClient === subscribeClient) this.logInfo('Subscribe client connected');
        });
        subscribeClient.on('ready', () => this.handleClientsReady(publishClient, subscribeClient));
    }

    /**
     * Reconcile desired subscriptions and durable cursors after reconnect
     */
    private handleClientsReady(publishClient: RedisClientType, subscribeClient: RedisClientType): void {
        if (this.publishClient !== publishClient || this.subscribeClient !== subscribeClient) return;
        if (!publishClient.isReady || !subscribeClient.isReady) return;

        const shouldReconcile = !this.connected;
        this.connected = true;

        if (shouldReconcile && !this.connectPromise && !this.disconnectPromise) {
            void this.reconcileAfterReady();
        }
    }

    private async waitForConnection(): Promise<void> {
        if (this.connected && this.publishClient.isReady && this.subscribeClient.isReady && !this.disconnectPromise) return;

        await this.connect();
        if (!this.publishClient.isReady || !this.subscribeClient.isReady) {
            throw new EventBusException('Redis clients did not become ready', 'redis');
        }
    }

    private async connectClient(client: RedisClientType): Promise<void> {
        if (client.isReady) return;
        if (!client.isOpen) {
            await client.connect();
            return;
        }

        await new Promise<void>((resolve, reject) => {
            const onReady = () => {
                cleanup();
                resolve();
            };
            const onEnd = () => {
                cleanup();
                reject(new Error('Redis connection closed before becoming ready'));
            };
            const cleanup = () => {
                client.off('ready', onReady);
                client.off('end', onEnd);
            };

            client.on('ready', onReady);
            client.on('end', onEnd);
        });
    }

    /**
     * Connect to Redis
     */
    public connect(): Promise<void> {
        if (this.connectPromise) return this.connectPromise;

        const token = {};
        const pendingDisconnect = this.disconnectPromise;
        const operationPromise = Promise.resolve().then(async () => {
            if (pendingDisconnect) await pendingDisconnect.catch(() => undefined);
            if (this.connectToken !== token) throw new Error('Redis connection attempt cancelled');

            if (this.clientsNeedInitialization) {
                this.initializeRedisClients();
                this.clientsNeedInitialization = false;
            }

            await Promise.all([this.connectClient(this.publishClient), this.connectClient(this.subscribeClient)]);
            if (this.connectToken !== token) throw new Error('Redis connection attempt cancelled');

            this.connected = true;
            await this.reconcileSubscriptions();
            this.scheduleDurableCatchUp();
        });
        const connectPromise = operationPromise
            .catch((error) => {
                this.connected = this.publishClient.isReady && this.subscribeClient.isReady;
                throw new EventBusException(`Failed to connect to Redis: ${error.message}`, 'redis');
            })
            .finally(() => {
                if (this.connectToken === token) {
                    this.connectToken = null;
                    this.connectPromise = null;
                }
            });

        this.connectToken = token;
        this.connectPromise = connectPromise;
        return connectPromise;
    }

    private async closeClient(client: RedisClientType): Promise<void> {
        if (!client.isOpen) return;
        if (!client.isReady) {
            client.destroy();
            return;
        }

        try {
            await client.quit();
        } catch (error) {
            if (client.isOpen) client.destroy();
            throw error;
        }
    }

    private cancelConnectAttempt(): Promise<void> | null {
        const pendingConnect = this.connectPromise;
        this.connectToken = null;
        this.connectPromise = null;
        return pendingConnect;
    }

    /**
     * Disconnect from Redis and cancel any queued reconnect
     */
    public disconnect(): Promise<void> {
        if (this.disconnectPromise) {
            this.cancelConnectAttempt();
            return this.disconnectPromise;
        }

        const token = {};
        const pendingConnect = this.cancelConnectAttempt();
        const clients = [this.publishClient, this.subscribeClient];
        let closeError: any = null;
        this.connected = false;

        const operationPromise = (async () => {
            await Promise.all([
                ...clients.map((client) =>
                    this.closeClient(client).catch((error) => {
                        closeError = closeError ?? error;
                    }),
                ),
                pendingConnect ? pendingConnect.catch(() => undefined) : Promise.resolve(),
            ]);

            this.connected = false;
            this.clientsNeedInitialization = true;
            this.subscribedPatterns.clear();
            this.subscriptionOperations.clear();

            if (closeError) {
                throw new EventBusException(`Failed to disconnect from Redis: ${closeError.message}`, 'redis');
            }
        })();
        const disconnectPromise = operationPromise.finally(() => {
            if (this.disconnectToken === token) {
                this.disconnectToken = null;
                this.disconnectPromise = null;
            }
        });

        this.disconnectToken = token;
        this.disconnectPromise = disconnectPromise;
        return disconnectPromise;
    }

    public isConnected(): boolean {
        return this.connected;
    }

    /**
     * Save an event to its durable list and publish a wake-up
     */
    public async emit(event: string, data?: any, ttlMinutes?: number): Promise<void> {
        let retries = 0;
        const maxRetries = 3;
        const message = JSON.stringify({
            event,
            data,
            timestamp: Date.now(),
            expiresAt: ttlMinutes ? Date.now() + ttlMinutes * 60 * 1000 : null,
        });
        const durableKey = `durable:${event}`;
        const liveChannel = `live:${event}`;

        while (retries <= maxRetries) {
            try {
                await this.waitForConnection();
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
                await Helper.sleep(1000);
            }
        }
    }

    /**
     * Subscribe to an event (real-time only)
     */
    public on(eventPattern: string, handler: EventHandler): void {
        this.addHandler(eventPattern, this.createHandlerInfo(handler, false));
        this.ensurePatternSubscribed(eventPattern).catch((error) => {
            this.logError(`Failed to subscribe to "${eventPattern}": ${error.message}`);
        });
    }

    /**
     * Register one cursor-driven durable consumer
     */
    public async subscribeDurable(eventPattern: string, handler: EventHandler): Promise<void> {
        this.validateDurablePattern(eventPattern);
        const handlerInfo = this.createHandlerInfo(handler, true);
        this.addHandler(eventPattern, handlerInfo);

        try {
            await this.waitForConnection();
            this.assertHandlerActive(handlerInfo);
            await this.ensurePatternSubscribed(eventPattern);
            this.assertHandlerActive(handlerInfo);
        } catch (error) {
            try {
                await this.rollbackHandler(eventPattern, handlerInfo);
            } catch (rollbackError) {
                this.logError(`Failed to roll back durable subscription for "${eventPattern}": ${rollbackError.message}`);
            }
            throw new EventBusException(`Failed to create durable subscription for "${eventPattern}": ${error.message}`, 'redis');
        }

        handlerInfo.readyForDrain = true;
        try {
            await this.scheduleDrain(eventPattern);
            this.assertHandlerActive(handlerInfo);
            this.logInfo(`Durable subscription created for pattern "${eventPattern}"`);
        } catch (error) {
            throw new EventBusException(`Failed to drain durable subscription for "${eventPattern}": ${error.message}`, 'redis');
        }
    }

    public onDurable(eventPattern: string, handler: EventHandler): void {
        this.subscribeDurable(eventPattern, handler).catch((error) => {
            this.logError(`Failed to setup durable subscription for "${eventPattern}": ${error.message}`);
        });
    }

    private createHandlerInfo(handler: EventHandler, durable: boolean): HandlerInfo {
        return { handler, active: true, durable, readyForDrain: !durable, queue: Promise.resolve() };
    }

    private addHandler(pattern: string, handlerInfo: HandlerInfo): void {
        if (!this.handlers.has(pattern)) this.handlers.set(pattern, new Set());
        this.handlers.get(pattern)!.add(handlerInfo);
    }

    private validateDurablePattern(pattern: string): void {
        for (const [existingPattern, handlerSet] of this.handlers) {
            const hasDurableHandler = Array.from(handlerSet).some((handlerInfo) => handlerInfo.active && handlerInfo.durable);
            if (hasDurableHandler && this.durablePatternsOverlap(pattern, existingPattern)) {
                throw new EventBusException(`Durable pattern "${pattern}" overlaps active durable pattern "${existingPattern}"`, 'redis');
            }
        }
    }

    private durablePatternsOverlap(firstPattern: string, secondPattern: string): boolean {
        if (!this.hasSegmentWildcard(firstPattern) && !this.hasSegmentWildcard(secondPattern)) {
            return firstPattern === secondPattern;
        }

        const firstSegments = firstPattern.split('.');
        const secondSegments = secondPattern.split('.');
        const pending: Array<[number, number]> = [[0, 0]];
        const visited = new Set<string>();

        while (pending.length > 0) {
            const [firstIndex, secondIndex] = pending.shift()!;
            const stateKey = `${firstIndex}:${secondIndex}`;
            if (visited.has(stateKey)) continue;
            visited.add(stateKey);

            if (firstIndex === firstSegments.length && secondIndex === secondSegments.length) return true;

            for (const firstTransition of this.getPatternTransitions(firstSegments, firstIndex)) {
                for (const secondTransition of this.getPatternTransitions(secondSegments, secondIndex)) {
                    if (this.patternTransitionsOverlap(firstTransition, secondTransition)) {
                        pending.push([firstTransition.next, secondTransition.next]);
                    }
                }
            }
        }

        return false;
    }

    private getPatternTransitions(segments: string[], index: number): PatternTransition[] {
        if (index >= segments.length) return [];
        if (segments[index] === '**') {
            return [
                { next: index, literal: null, acceptsEmpty: true },
                { next: index + 1, literal: null, acceptsEmpty: true },
            ];
        }
        if (segments[index] === '*') return [{ next: index + 1, literal: null, acceptsEmpty: false }];
        return [{ next: index + 1, literal: segments[index], acceptsEmpty: segments[index].length === 0 }];
    }

    private patternTransitionsOverlap(first: PatternTransition, second: PatternTransition): boolean {
        if (first.literal !== null && second.literal !== null) return first.literal === second.literal;
        if (first.literal !== null) return first.literal.length > 0 || second.acceptsEmpty;
        if (second.literal !== null) return second.literal.length > 0 || first.acceptsEmpty;
        return true;
    }

    private getDurableHandler(pattern: string, readyForDrain: boolean = false): HandlerInfo | undefined {
        return Array.from(this.handlers.get(pattern) ?? []).find(
            (handlerInfo) => handlerInfo.active && handlerInfo.durable && (!readyForDrain || handlerInfo.readyForDrain),
        );
    }

    private async rollbackHandler(pattern: string, handlerInfo: HandlerInfo): Promise<void> {
        this.removeHandler(pattern, handlerInfo);
        await this.reconcilePattern(pattern);
    }

    private removeHandler(pattern: string, handlerInfo: HandlerInfo): void {
        handlerInfo.active = false;
        const handlerSet = this.handlers.get(pattern);
        if (!handlerSet) return;

        handlerSet.delete(handlerInfo);
        if (handlerSet.size === 0) this.handlers.delete(pattern);

        if (handlerInfo.durable) this.detachDrainState(pattern, handlerInfo);
    }

    /**
     * Serialize Redis commands that target the same transport subscription
     */
    private reconcilePattern(pattern: string): Promise<void> {
        const operationKey = this.getSubscriptionOperationKey(pattern);
        const previousOperation = this.subscriptionOperations.get(operationKey) ?? Promise.resolve();
        const operation = previousOperation.catch(() => undefined).then(() => this.reconcilePatternNow(pattern));
        const clearOperation = () => {
            if (this.subscriptionOperations.get(operationKey) === operation) this.subscriptionOperations.delete(operationKey);
        };

        this.subscriptionOperations.set(operationKey, operation);
        operation.then(clearOperation, clearOperation);
        return operation;
    }

    private getSubscriptionOperationKey(pattern: string): string {
        const subscribeMethod = this.hasSegmentWildcard(pattern) ? 'pSubscribe' : 'subscribe';
        return `${subscribeMethod}:${this.toLiveRedisPattern(pattern)}`;
    }

    private async reconcilePatternNow(pattern: string): Promise<void> {
        while (true) {
            const desired = this.handlers.has(pattern);
            if (!this.subscribeClient.isReady) {
                if (desired) this.pendingUnsubscribePatterns.delete(pattern);
                else this.pendingUnsubscribePatterns.add(pattern);
                return;
            }

            if (desired) {
                this.pendingUnsubscribePatterns.delete(pattern);
                if (this.subscribedPatterns.has(pattern)) return;

                const listener = this.getSubscriptionListener(pattern);
                const subscribeMethod = this.hasSegmentWildcard(pattern) ? 'pSubscribe' : 'subscribe';
                const subscribeClient = this.subscribeClient;
                await subscribeClient[subscribeMethod](this.toLiveRedisPattern(pattern), listener);
                if (this.subscribeClient !== subscribeClient) return;
                this.subscribedPatterns.add(pattern);
                continue;
            }

            if (!this.subscribedPatterns.has(pattern) && !this.pendingUnsubscribePatterns.has(pattern)) {
                this.subscriptionListeners.delete(pattern);
                return;
            }

            this.pendingUnsubscribePatterns.add(pattern);
            const listener = this.subscriptionListeners.get(pattern);
            if (!listener) {
                this.subscribedPatterns.delete(pattern);
                this.pendingUnsubscribePatterns.delete(pattern);
                return;
            }
            const unsubscribeMethod = this.hasSegmentWildcard(pattern) ? 'pUnsubscribe' : 'unsubscribe';
            const subscribeClient = this.subscribeClient;
            await subscribeClient[unsubscribeMethod](this.toLiveRedisPattern(pattern), listener);
            if (this.subscribeClient !== subscribeClient) return;
            this.subscribedPatterns.delete(pattern);
            this.pendingUnsubscribePatterns.delete(pattern);

            if (!this.handlers.has(pattern)) this.subscriptionListeners.delete(pattern);
        }
    }

    private getSubscriptionListener(pattern: string): (message: string, channel: string) => void {
        let listener = this.subscriptionListeners.get(pattern);
        if (!listener) {
            listener = (message: string, channel: string) => this.handlePatternMessage(pattern, channel, message);
            this.subscriptionListeners.set(pattern, listener);
        }
        return listener;
    }

    private async ensurePatternSubscribed(pattern: string): Promise<void> {
        await this.waitForConnection();
        await this.reconcilePattern(pattern);

        if (!this.handlers.has(pattern) || !this.subscribedPatterns.has(pattern)) {
            throw new EventBusException(`Subscription for pattern "${pattern}" is no longer active`, 'redis');
        }
    }

    /**
     * Dispatch only handlers owned by the Redis listener's public pattern
     */
    private handlePatternMessage(pattern: string, channel: string, message: string): void {
        if (!channel.startsWith('live:') || !this.matchesPattern(channel.substring('live:'.length), pattern)) return;

        const handlerSet = this.handlers.get(pattern);
        if (!handlerSet) return;

        if (this.getDurableHandler(pattern, true)) {
            this.scheduleDrain(pattern).catch((error) => {
                // Keep the failed cursor in place; a later wake-up or reconnect retries it.
                this.logError(`Failed to drain durable pattern "${pattern}": ${error.message}`, { error });
            });
        }

        const liveHandlers = Array.from(handlerSet).filter((handlerInfo) => handlerInfo.active && !handlerInfo.durable);
        if (liveHandlers.length === 0) return;

        try {
            const payload = this.createEventPayload(message);
            for (const handlerInfo of liveHandlers) {
                this.runHandler(handlerInfo, payload).catch((error) => {
                    if (handlerInfo.active) this.logError(`Error in handler for pattern "${pattern}": ${error.message}`, { error });
                });
            }
        } catch (error) {
            this.logError(`Failed to handle message for pattern "${pattern}": ${error.message}`, { error });
        }
    }

    private assertHandlerActive(handlerInfo: HandlerInfo): void {
        if (!handlerInfo.active) throw new EventBusException('Event handler was removed during replay', 'redis');
    }

    private runHandler(handlerInfo: HandlerInfo, payload: EventPayload): Promise<void> {
        const executionPromise = handlerInfo.queue.then(async () => {
            this.assertHandlerActive(handlerInfo);
            await handlerInfo.handler(payload);
            this.assertHandlerActive(handlerInfo);
        });
        handlerInfo.queue = executionPromise.catch(() => undefined);
        return executionPromise;
    }

    /**
     * Coalesce wake-ups while guaranteeing one more drain after an active drain
     */
    private scheduleDrain(pattern: string): Promise<void> {
        const handlerInfo = this.getDurableHandler(pattern, true);
        if (!handlerInfo) return Promise.resolve();

        let state = this.drainStates.get(pattern);
        if (!state || state.handlerInfo !== handlerInfo) {
            if (state) {
                state.requested = false;
                state.token = null;
            }
            state = { handlerInfo, requested: false, promise: null, token: null };
            this.drainStates.set(pattern, state);
        }

        state.requested = true;
        return state.promise ?? this.startDrain(pattern, state);
    }

    private startDrain(pattern: string, state: DrainState): Promise<void> {
        const token = {};
        const operation = (async () => {
            while (state.requested) {
                state.requested = false;
                await this.drainPattern(pattern, state.handlerInfo);
            }
        })();
        const promise = operation.finally(() => {
            if (state.token !== token || this.drainStates.get(pattern) !== state) return;

            state.promise = null;
            state.token = null;
            if (state.requested && this.getDurableHandler(pattern, true)) {
                this.startDrain(pattern, state).catch((error) => {
                    this.logError(`Failed to drain durable pattern "${pattern}": ${error.message}`, { error });
                });
            }
        });

        state.token = token;
        state.promise = promise;
        return promise;
    }

    private async drainPattern(pattern: string, handlerInfo: HandlerInfo): Promise<void> {
        this.assertHandlerActive(handlerInfo);
        await this.ensurePositionsLoaded();
        this.assertHandlerActive(handlerInfo);
        await this.readPastEvents(pattern, handlerInfo);
    }

    private detachDrainState(pattern: string, handlerInfo: HandlerInfo): void {
        const state = this.drainStates.get(pattern);
        if (!state || state.handlerInfo !== handlerInfo) return;

        this.drainStates.delete(pattern);
        state.requested = false;
        state.token = null;
    }

    /**
     * Unsubscribe from an event
     */
    public off(eventPattern: string, handler?: EventHandler): void {
        const handlerSet = this.handlers.get(eventPattern);
        if (!handlerSet) return;

        const toRemove = handler ? Array.from(handlerSet).filter((handlerInfo) => handlerInfo.handler === handler) : Array.from(handlerSet);
        for (const handlerInfo of toRemove) this.removeHandler(eventPattern, handlerInfo);

        this.reconcilePattern(eventPattern).catch((error) => {
            this.logError(`Failed to reconcile pattern "${eventPattern}": ${error.message}`, { error });
        });
    }

    public removeAllListeners(eventPattern?: string): void {
        if (eventPattern) {
            this.off(eventPattern);
            return;
        }

        for (const pattern of Array.from(this.handlers.keys())) this.off(pattern);
    }

    public listenerCount(eventPattern: string): number {
        return this.handlers.get(eventPattern)?.size ?? 0;
    }

    public eventNames(): string[] {
        return Array.from(this.handlers.keys());
    }

    private getReconciliationPatterns(): Set<string> {
        return new Set([
            ...this.handlers.keys(),
            ...this.pendingUnsubscribePatterns,
            ...this.subscribedPatterns,
            ...this.subscriptionListeners.keys(),
        ]);
    }

    /**
     * Attempt every subscription transition before reporting any failures
     */
    private async reconcileSubscriptions(): Promise<void> {
        const patterns = Array.from(this.getReconciliationPatterns());
        const results = await Promise.allSettled(patterns.map((pattern) => this.reconcilePattern(pattern)));
        const failures = results
            .map((result, index) => ({ result, pattern: patterns[index] }))
            .filter(({ result }) => result.status === 'rejected') as Array<{ result: PromiseRejectedResult; pattern: string }>;

        if (failures.length > 0) {
            const details = failures.map(({ result, pattern }) => `"${pattern}": ${result.reason?.message ?? result.reason}`).join('; ');
            throw new EventBusException(`Failed to reconcile Redis patterns: ${details}`, 'redis');
        }
    }

    /**
     * Catch-up is asynchronous so connect readiness never waits for handlers
     */
    private scheduleDurableCatchUp(): void {
        for (const pattern of this.handlers.keys()) {
            if (!this.getDurableHandler(pattern, true) || !this.subscribedPatterns.has(pattern)) continue;
            this.scheduleDrain(pattern).catch((error) => {
                // Keep the failed cursor in place; a later wake-up or reconnect retries it.
                this.logError(`Failed to drain durable pattern "${pattern}": ${error.message}`, { error });
            });
        }
    }

    private async reconcileAfterReady(): Promise<void> {
        try {
            await this.reconcileSubscriptions();
            this.scheduleDurableCatchUp();
        } catch (error) {
            this.logError(`Failed to reconcile Redis subscriptions after reconnect: ${error.message}`, { error });
        }
    }

    /*
     * Redis pattern matching is only a broad transport filter. EventPatternMatcher
     * remains authoritative for callbacks and discovered durable keys.
     */
    private hasSegmentWildcard(pattern: string): boolean {
        return pattern.split('.').some((segment) => segment === '*' || segment === '**');
    }

    private matchesPattern(event: string, pattern: string): boolean {
        return EventPatternMatcher.matchesPattern(event, pattern);
    }

    private toRedisGlob(pattern: string): string {
        return pattern
            .split('.')
            .map((segment) => {
                if (segment === '*' || segment === '**') return '*';
                return Array.from(segment)
                    .map((character) => (['*', '?', '[', ']', '\\'].includes(character) ? `\\${character}` : character))
                    .join('');
            })
            .join('.');
    }

    private toLiveRedisPattern(pattern: string): string {
        return `live:${this.hasSegmentWildcard(pattern) ? this.toRedisGlob(pattern) : pattern}`;
    }

    /**
     * Replay the unprocessed LPUSH prefix in chronological order
     */
    private async readPastEvents(pattern: string, handlerInfo: HandlerInfo): Promise<void> {
        const durableKeys = await this.findDurableKeys(pattern);

        for (const key of durableKeys) {
            let lastProcessedIndex = this.processedPositions.get(key) ?? -1;
            const messages = await this.publishClient.lRange(key, 0, -(lastProcessedIndex + 2));

            for (const message of messages.reverse()) {
                this.assertHandlerActive(handlerInfo);
                const parsed = JSON.parse(message);

                if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
                    this.logInfo(`Skipping expired event "${parsed.event}" (expired at ${new Date(parsed.expiresAt).toISOString()})`);
                } else {
                    await this.runHandler(handlerInfo, this.createEventPayload(message));
                }

                this.assertHandlerActive(handlerInfo);
                const newProcessedIndex = lastProcessedIndex + 1;
                await this.saveProcessedPosition(key, newProcessedIndex);
                this.processedPositions.set(key, newProcessedIndex);
                lastProcessedIndex = newProcessedIndex;
            }
        }
    }

    private async findDurableKeys(pattern: string): Promise<string[]> {
        const keys: string[] = [];
        let cursor = '0';

        do {
            const result = await this.publishClient.scan(cursor, { MATCH: `durable:${this.toRedisGlob(pattern)}`, COUNT: 100 });
            cursor = result.cursor;
            keys.push(
                ...result.keys.filter(
                    (key) => key.startsWith('durable:') && this.matchesPattern(key.substring('durable:'.length), pattern),
                ),
            );
        } while (cursor !== '0');

        return keys;
    }

    private createEventPayload(message: string): EventPayload {
        const { event, data, timestamp, expiresAt } = JSON.parse(message);
        return {
            event: {
                name: event,
                timestamp: timestamp || Date.now(),
                expiresAt: expiresAt ?? undefined,
            },
            data,
        };
    }

    private async ensurePositionsLoaded(): Promise<void> {
        if (this.positionsLoaded) return;
        if (this.positionsLoadingPromise) return this.positionsLoadingPromise;

        const loadingPromise = this.loadPersistedPositions();
        this.positionsLoadingPromise = loadingPromise;

        try {
            await loadingPromise;
            this.positionsLoaded = true;
        } finally {
            if (this.positionsLoadingPromise === loadingPromise) this.positionsLoadingPromise = null;
        }
    }

    private async loadPersistedPositions(): Promise<void> {
        await this.waitForConnection();
        const positionKeys = await this.findPositionKeys();

        for (const positionKey of positionKeys) {
            const position = await this.publishClient.get(positionKey);
            if (position === null) continue;

            const prefix = 'position:';
            const suffix = `:${this.serviceName}`;
            const durableKey = positionKey.substring(prefix.length, positionKey.length - suffix.length);
            const positionValue = Number(position);
            if (!/^-?\d+$/.test(position) || !Number.isSafeInteger(positionValue) || positionValue < -1) {
                throw new EventBusException(`Invalid persisted cursor "${position}" for "${durableKey}"`, 'redis');
            }
            this.processedPositions.set(durableKey, positionValue);
        }
    }

    private async findPositionKeys(): Promise<string[]> {
        const keys: string[] = [];
        let cursor = '0';

        do {
            const result = await this.publishClient.scan(cursor, { MATCH: `position:durable:*:${this.serviceName}`, COUNT: 100 });
            cursor = result.cursor;
            keys.push(...result.keys);
        } while (cursor !== '0');

        return keys;
    }

    private async saveProcessedPosition(durableKey: string, position: number): Promise<void> {
        await this.publishClient.set(`position:${durableKey}:${this.serviceName}`, position.toString());
    }

    private logInfo(message: string, params?: any): void {
        this.loggerService.info(`[Redis - EventBus] ${message}`, params, 'eventbus');
    }

    private logError(message: string, params?: any): void {
        this.loggerService.error(`[Redis - EventBus] ${message}`, params, 'eventbus');
    }

    private logWarning(message: string, params?: any): void {
        this.loggerService.warning(`[Redis - EventBus] ${message}`, params, 'eventbus');
    }
}
