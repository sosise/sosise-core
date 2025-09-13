import EventBusMemoryRepository from '../../Repositories/EventBus/EventBusMemoryRepository';
import EventBusRedisRepository from '../../Repositories/EventBus/EventBusRedisRepository';
import EventBusRepositoryInterface, { EventHandler } from '../../Repositories/EventBus/EventBusRepositoryInterface';
import EventBusException from '../../Exceptions/EventBus/EventBusException';

export default class EventBusService {
    private eventBusRepository: EventBusRepositoryInterface;
    private eventBusConfig: any;

    /**
     * Constructor
     */
    constructor() {
        // Require event bus configuration
        this.eventBusConfig = require(process.cwd() + '/build/config/eventbus').default;

        // Instantiate event bus repository depending on driver
        switch (this.eventBusConfig.driver) {
            case 'memory':
                this.eventBusRepository = new EventBusMemoryRepository(this.eventBusConfig);
                break;
            case 'redis':
                this.eventBusRepository = new EventBusRedisRepository(this.eventBusConfig);
                break;
            default:
                // Default to memory driver
                this.eventBusRepository = new EventBusMemoryRepository(this.eventBusConfig);
                break;
        }
    }

    /**
     * Emit an event with optional data
     */
    public async emit(event: string, data?: any, ttlMinutes?: number): Promise<void> {
        return this.eventBusRepository.emit(event, data, ttlMinutes);
    }

    /**
     * Emit an event synchronously (for memory driver only)
     */
    public emitSync(event: string, data?: any, ttlMinutes?: number): void {
        if (this.eventBusConfig.driver !== 'memory') {
            throw new EventBusException('Synchronous emit is only available for memory driver', this.eventBusConfig.driver);
        }

        // For memory driver, emit returns a Promise but executes synchronously
        this.eventBusRepository.emit(event, data, ttlMinutes);
    }

    /**
     * Subscribe to an event
     */
    public on(eventPattern: string, handler: EventHandler): void {
        return this.eventBusRepository.on(eventPattern, handler);
    }

    /**
     * Subscribe to an event with durable delivery (guaranteed delivery)
     * Supported in Redis driver
     */
    public onDurable(eventPattern: string, handler: EventHandler): void {
        return this.eventBusRepository.onDurable(eventPattern, handler);
    }

    /**
     * Unsubscribe from an event
     */
    public off(eventPattern: string, handler?: EventHandler): void {
        return this.eventBusRepository.off(eventPattern, handler);
    }

    /**
     * Remove all listeners for an event or all events
     */
    public removeAllListeners(eventPattern?: string): void {
        return this.eventBusRepository.removeAllListeners(eventPattern);
    }

    /**
     * Get the count of listeners for a specific event
     */
    public listenerCount(eventPattern: string): number {
        return this.eventBusRepository.listenerCount(eventPattern);
    }

    /**
     * Get all event patterns that have listeners
     */
    public eventNames(): string[] {
        return this.eventBusRepository.eventNames();
    }

    /**
     * Connect to the event bus (for distributed drivers)
     */
    public async connect(): Promise<void> {
        if (this.eventBusRepository.connect) {
            return this.eventBusRepository.connect();
        }
    }

    /**
     * Disconnect from the event bus (for distributed drivers)
     */
    public async disconnect(): Promise<void> {
        if (this.eventBusRepository.disconnect) {
            return this.eventBusRepository.disconnect();
        }
    }

    /**
     * Check if connected (for distributed drivers)
     */
    public isConnected(): boolean {
        if (this.eventBusRepository.isConnected) {
            return this.eventBusRepository.isConnected();
        }
        // Memory driver is always connected
        return true;
    }

    /**
     * Get the current driver name
     */
    public getDriver(): string {
        return this.eventBusConfig.driver;
    }
}
