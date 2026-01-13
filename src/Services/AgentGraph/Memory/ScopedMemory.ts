import { MemoryStorageInterface, ScopedMemoryInterface } from '../../../Types/AgentGraph/AgentGraphTypes';

/**
 * ScopedMemory - Wrapper over MemoryStorageInterface
 * Encapsulates threadId and agentId, providing simple key-based access for agents
 */
export default class ScopedMemory implements ScopedMemoryInterface {
    /**
     * Create a new ScopedMemory instance
     * @param storage - Underlying memory storage
     * @param threadId - Thread identifier
     * @param agentId - Agent identifier
     */
    constructor(
        private storage: MemoryStorageInterface,
        private threadId: string,
        private agentId: string,
    ) {}

    // ==================== Agent Private Memory ====================

    /**
     * Get agent private memory by key
     * @param key - Memory key
     * @returns Promise resolving to stored value or null
     */
    async get(key: string): Promise<any> {
        return this.storage.getAgentMemory(this.threadId, this.agentId, key);
    }

    /**
     * Set agent private memory by key (replaces existing value)
     * @param key - Memory key
     * @param data - Data to store
     */
    async set(key: string, data: any): Promise<void> {
        await this.storage.setAgentMemory(this.threadId, this.agentId, key, data);
    }

    // ==================== Shared Thread Memory ====================

    /**
     * Get shared thread memory by key (accessible by all agents in thread)
     * @param key - Memory key
     * @returns Promise resolving to stored value or null
     */
    async getShared(key: string): Promise<any> {
        return this.storage.getSharedMemory(this.threadId, key);
    }

    /**
     * Set shared thread memory by key (replaces existing value)
     * @param key - Memory key
     * @param data - Data to store
     */
    async setShared(key: string, data: any): Promise<void> {
        await this.storage.setSharedMemory(this.threadId, key, data);
    }

    // ==================== Global Memory ====================

    /**
     * Get global memory by key (accessible by all threads)
     * @param key - Memory key
     * @returns Promise resolving to stored value or null
     */
    async getGlobal(key: string): Promise<any> {
        return this.storage.getGlobalMemory(key);
    }

    /**
     * Set global memory by key (replaces existing value)
     * @param key - Memory key
     * @param data - Data to store
     */
    async setGlobal(key: string, data: any): Promise<void> {
        await this.storage.setGlobalMemory(key, data);
    }
}
