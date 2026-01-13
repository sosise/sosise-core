import { AgentMessageType, GraphStorageInterface, ThreadStateType } from '../../../Types/AgentGraph/AgentGraphTypes';

/**
 * In-memory implementation of GraphStorageInterface
 * Stores all data in RAM using Maps
 * Note: Data is lost when the process restarts
 */
export default class InMemoryStorageService implements GraphStorageInterface {
    /**
     * Agent private memory storage
     * Key: "threadId:agentId:key", Value: stored data
     */
    private agentMemory: Map<string, any> = new Map();

    /**
     * Shared thread memory storage
     * Key: "threadId:key", Value: stored data
     */
    private sharedMemory: Map<string, any> = new Map();

    /**
     * Global memory (accessible by all threads)
     * Key: memory key, Value: stored data
     */
    private globalMemory: Map<string, any> = new Map();

    /**
     * Thread message history storage
     * Key: threadId, Value: array of messages
     */
    private threads: Map<string, AgentMessageType[]> = new Map();

    /**
     * Thread state storage
     * Key: threadId, Value: thread state
     */
    private states: Map<string, ThreadStateType> = new Map();

    // ==================== Agent Memory ====================

    /**
     * Get agent private memory by key
     * @param threadId - Thread identifier
     * @param agentId - Agent identifier
     * @param key - Memory key
     * @returns Promise resolving to stored value or null
     */
    async getAgentMemory(threadId: string, agentId: string, key: string): Promise<any> {
        const compositeKey = `${threadId}:${agentId}:${key}`;
        return this.agentMemory.get(compositeKey) ?? null;
    }

    /**
     * Set agent private memory by key (replaces existing value)
     * @param threadId - Thread identifier
     * @param agentId - Agent identifier
     * @param key - Memory key
     * @param data - Data to store
     */
    async setAgentMemory(threadId: string, agentId: string, key: string, data: any): Promise<void> {
        const compositeKey = `${threadId}:${agentId}:${key}`;
        this.agentMemory.set(compositeKey, data);
    }

    // ==================== Shared Memory ====================

    /**
     * Get shared thread memory by key
     * @param threadId - Thread identifier
     * @param key - Memory key
     * @returns Promise resolving to stored value or null
     */
    async getSharedMemory(threadId: string, key: string): Promise<any> {
        const compositeKey = `${threadId}:${key}`;
        return this.sharedMemory.get(compositeKey) ?? null;
    }

    /**
     * Set shared thread memory by key (replaces existing value)
     * @param threadId - Thread identifier
     * @param key - Memory key
     * @param data - Data to store
     */
    async setSharedMemory(threadId: string, key: string, data: any): Promise<void> {
        const compositeKey = `${threadId}:${key}`;
        this.sharedMemory.set(compositeKey, data);
    }

    // ==================== Global Memory ====================

    /**
     * Get global memory by key (accessible by all threads)
     * @param key - Memory key
     * @returns Promise resolving to stored value or null
     */
    async getGlobalMemory(key: string): Promise<any> {
        return this.globalMemory.get(key) ?? null;
    }

    /**
     * Set global memory by key (replaces existing value)
     * @param key - Memory key
     * @param data - Data to store
     */
    async setGlobalMemory(key: string, data: any): Promise<void> {
        this.globalMemory.set(key, data);
    }

    // ==================== History ====================

    /**
     * Get message history for a thread
     * @param threadId - Thread identifier
     * @returns Promise resolving to array of messages
     */
    async getHistory(threadId: string): Promise<AgentMessageType[]> {
        return this.threads.get(threadId) ?? [];
    }

    /**
     * Add a message to thread history
     * @param threadId - Thread identifier
     * @param message - Message to add
     */
    async addMessage(threadId: string, message: AgentMessageType): Promise<void> {
        const history = this.threads.get(threadId) ?? [];
        history.push(message);
        this.threads.set(threadId, history);
    }

    // ==================== Thread State ====================

    /**
     * Get thread state
     * @param threadId - Thread identifier
     * @returns Promise resolving to thread state or null if not found
     */
    async getThreadState(threadId: string): Promise<ThreadStateType | null> {
        return this.states.get(threadId) ?? null;
    }

    /**
     * Set thread state
     * @param threadId - Thread identifier
     * @param state - State to set
     */
    async setThreadState(threadId: string, state: ThreadStateType): Promise<void> {
        this.states.set(threadId, state);
    }

    // ==================== Cleanup ====================

    /**
     * Clear all data for a thread
     * @param threadId - Thread identifier
     */
    async clear(threadId: string): Promise<void> {
        this.threads.delete(threadId);
        this.states.delete(threadId);

        // Clear all agent memory for this thread
        for (const key of this.agentMemory.keys()) {
            if (key.startsWith(`${threadId}:`)) {
                this.agentMemory.delete(key);
            }
        }

        // Clear all shared memory for this thread
        for (const key of this.sharedMemory.keys()) {
            if (key.startsWith(`${threadId}:`)) {
                this.sharedMemory.delete(key);
            }
        }
    }
}
