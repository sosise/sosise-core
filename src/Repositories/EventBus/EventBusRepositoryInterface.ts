export interface EventPayload {
    event: {
        name: string;
        timestamp: number;
        expiresAt?: number;
    };
    data?: any;
}

export type EventHandler = (payload: EventPayload) => void | Promise<void>;

export default interface EventBusRepositoryInterface {
    /**
     * Emit an event with optional data
     */
    emit(event: string, data?: any, ttlMinutes?: number): Promise<void>;

    /**
     * Subscribe to an event
     */
    on(eventPattern: string, handler: EventHandler): void;

    /**
     * Subscribe to an event with durable delivery (guaranteed delivery)
     * Supported in Redis driver
     */
    onDurable(eventPattern: string, handler: EventHandler): void;

    /**
     * Unsubscribe from an event
     */
    off(eventPattern: string, handler?: EventHandler): void;

    /**
     * Remove all listeners for an event or all events
     */
    removeAllListeners(eventPattern?: string): void;

    /**
     * Get the count of listeners for a specific event
     */
    listenerCount(eventPattern: string): number;

    /**
     * Get all event patterns that have listeners
     */
    eventNames(): string[];

    /**
     * Connect to the event bus (for distributed drivers)
     */
    connect?(): Promise<void>;

    /**
     * Disconnect from the event bus (for distributed drivers)
     */
    disconnect?(): Promise<void>;

    /**
     * Check if connected (for distributed drivers)
     */
    isConnected?(): boolean;
}
