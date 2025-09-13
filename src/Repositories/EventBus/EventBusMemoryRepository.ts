import { EventEmitter } from 'node:events';
import EventBusRepositoryInterface, { EventHandler, EventPayload } from './EventBusRepositoryInterface';
import EventBusException from '../../Exceptions/EventBus/EventBusException';
import IOC from '../../ServiceProviders/IOC';
import LoggerService from '../../Services/Logger/LoggerService';
import EventPatternMatcher from '../../Helper/EventPatternMatcher';

export default class EventBusMemoryRepository implements EventBusRepositoryInterface {
    private eventBusConfig: any;
    private emitter: EventEmitter;
    private wildcardHandlers: Map<string, Set<EventHandler>>;
    private logger: LoggerService;

    /**
     * Constructor
     */
    constructor(eventBusConfig: any) {
        this.eventBusConfig = eventBusConfig;
        this.emitter = new EventEmitter();
        this.wildcardHandlers = new Map();
        this.logger = IOC.makeSingleton(LoggerService) as LoggerService;
    }

    /**
     * Emit an event with optional data
     */
    public async emit(event: string, data?: any, ttlMinutes?: number): Promise<void> {
        try {
            // Create event payload
            const payload: EventPayload = {
                event: {
                    name: event,
                    timestamp: Date.now(),
                    expiresAt: ttlMinutes ? Date.now() + ttlMinutes * 60 * 1000 : undefined,
                },
                data,
            };

            // Emit the exact event
            this.emitter.emit(event, payload);

            // Handle wildcard patterns (always enabled)
            this.emitWildcardEvents(event, payload);
        } catch (error) {
            throw new EventBusException(`Failed to emit event "${event}": ${error.message}`, 'memory');
        }
    }

    /**
     * Subscribe to an event
     */
    public on(eventPattern: string, handler: EventHandler): void {
        if (this.isWildcardPattern(eventPattern)) {
            this.addWildcardHandler(eventPattern, handler);
        } else {
            this.emitter.on(eventPattern, handler);
        }
    }

    /**
     * Subscribe to an event with durable delivery (guaranteed delivery)
     * Not supported in Memory driver - use RabbitMQ for guaranteed delivery
     */
    public onDurable(_eventPattern: string, _handler: EventHandler): void {
        throw new EventBusException(
            'Durable subscriptions are not supported in Memory driver. Use RabbitMQ driver for guaranteed delivery.',
            'memory',
        );
    }

    /**
     * Unsubscribe from an event
     */
    public off(eventPattern: string, handler?: EventHandler): void {
        if (this.isWildcardPattern(eventPattern)) {
            if (handler) {
                this.removeWildcardHandler(eventPattern, handler);
            } else {
                this.wildcardHandlers.delete(eventPattern);
            }
        } else {
            if (handler) {
                this.emitter.off(eventPattern, handler);
            } else {
                this.emitter.removeAllListeners(eventPattern);
            }
        }
    }

    /**
     * Remove all listeners for an event or all events
     */
    public removeAllListeners(eventPattern?: string): void {
        if (eventPattern) {
            if (this.isWildcardPattern(eventPattern)) {
                this.wildcardHandlers.delete(eventPattern);
            } else {
                this.emitter.removeAllListeners(eventPattern);
            }
        } else {
            this.emitter.removeAllListeners();
            this.wildcardHandlers.clear();
        }
    }

    /**
     * Get the count of listeners for a specific event
     */
    public listenerCount(eventPattern: string): number {
        if (this.isWildcardPattern(eventPattern)) {
            const handlers = this.wildcardHandlers.get(eventPattern);
            return handlers ? handlers.size : 0;
        }
        return this.emitter.listenerCount(eventPattern);
    }

    /**
     * Get all event patterns that have listeners
     */
    public eventNames(): string[] {
        const regularEvents = this.emitter.eventNames().map((e) => String(e));
        const wildcardEvents = Array.from(this.wildcardHandlers.keys());
        return [...regularEvents, ...wildcardEvents];
    }

    /**
     * Check if a pattern contains wildcards
     */
    private isWildcardPattern(pattern: string): boolean {
        return EventPatternMatcher.isWildcardPattern(pattern);
    }

    /**
     * Add a wildcard handler
     */
    private addWildcardHandler(pattern: string, handler: EventHandler): void {
        if (!this.wildcardHandlers.has(pattern)) {
            this.wildcardHandlers.set(pattern, new Set());
        }
        this.wildcardHandlers.get(pattern)!.add(handler);
    }

    /**
     * Remove a wildcard handler
     */
    private removeWildcardHandler(pattern: string, handler: EventHandler): void {
        const handlers = this.wildcardHandlers.get(pattern);
        if (handlers) {
            handlers.delete(handler);
            if (handlers.size === 0) {
                this.wildcardHandlers.delete(pattern);
            }
        }
    }

    /**
     * Emit events to wildcard handlers
     */
    private emitWildcardEvents(event: string, payload: EventPayload): void {
        for (const [pattern, handlers] of this.wildcardHandlers) {
            if (this.matchesWildcard(event, pattern)) {
                for (const handler of handlers) {
                    try {
                        handler(payload);
                    } catch (error) {
                        this.logger.debug(`Error in wildcard handler for pattern "${pattern}"`, { error }, 'eventbus');
                    }
                }
            }
        }
    }

    /**
     * Check if an event matches a wildcard pattern
     */
    private matchesWildcard(event: string, pattern: string): boolean {
        return EventPatternMatcher.matchesPattern(event, pattern);
    }
}
