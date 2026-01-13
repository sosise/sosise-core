import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { AgentMessageType, GraphStorageInterface, ThreadStateType } from '../../../Types/AgentGraph/AgentGraphTypes';

/**
 * File-based implementation of GraphStorageInterface
 * Stores all data in JSON files on disk
 * Note: Data persists across process restarts
 */
export default class FileStorageService implements GraphStorageInterface {
    /**
     * Create a new FileStorageService instance
     * @param basePath - Base directory for storing files
     */
    constructor(private basePath: string) {}

    // ==================== Private Helpers ====================

    /**
     * Get file path for agent memory
     */
    private getAgentFilePath(threadId: string, agentId: string, key: string): string {
        return path.join(this.basePath, 'agents', threadId, agentId, `${key}.json`);
    }

    /**
     * Get file path for shared memory
     */
    private getSharedFilePath(threadId: string, key: string): string {
        return path.join(this.basePath, 'shared', threadId, `${key}.json`);
    }

    /**
     * Get file path for global memory
     * @param key - Memory key
     */
    private getGlobalFilePath(key: string): string {
        return path.join(this.basePath, 'global', `${key}.json`);
    }

    /**
     * Get file path for thread history
     */
    private getHistoryFilePath(threadId: string): string {
        return path.join(this.basePath, 'history', `${threadId}.json`);
    }

    /**
     * Get file path for thread state
     */
    private getStateFilePath(threadId: string): string {
        return path.join(this.basePath, 'states', `${threadId}.json`);
    }

    /**
     * Read JSON from file
     */
    private async readJson(filePath: string): Promise<any> {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(content);
        } catch {
            return null;
        }
    }

    /**
     * Write JSON to file
     */
    private async writeJson(filePath: string, data: any): Promise<void> {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    }

    // ==================== Agent Memory ====================

    /**
     * Get agent private memory by key
     * @param threadId - Thread identifier
     * @param agentId - Agent identifier
     * @param key - Memory key
     * @returns Promise resolving to stored value or null
     */
    async getAgentMemory(threadId: string, agentId: string, key: string): Promise<any> {
        return this.readJson(this.getAgentFilePath(threadId, agentId, key));
    }

    /**
     * Set agent private memory by key (replaces existing value)
     * @param threadId - Thread identifier
     * @param agentId - Agent identifier
     * @param key - Memory key
     * @param data - Data to store
     */
    async setAgentMemory(threadId: string, agentId: string, key: string, data: any): Promise<void> {
        await this.writeJson(this.getAgentFilePath(threadId, agentId, key), data);
    }

    // ==================== Shared Memory ====================

    /**
     * Get shared thread memory by key
     * @param threadId - Thread identifier
     * @param key - Memory key
     * @returns Promise resolving to stored value or null
     */
    async getSharedMemory(threadId: string, key: string): Promise<any> {
        return this.readJson(this.getSharedFilePath(threadId, key));
    }

    /**
     * Set shared thread memory by key (replaces existing value)
     * @param threadId - Thread identifier
     * @param key - Memory key
     * @param data - Data to store
     */
    async setSharedMemory(threadId: string, key: string, data: any): Promise<void> {
        await this.writeJson(this.getSharedFilePath(threadId, key), data);
    }

    // ==================== Global Memory ====================

    /**
     * Get global memory by key (accessible by all threads)
     * @param key - Memory key
     * @returns Promise resolving to stored value or null
     */
    async getGlobalMemory(key: string): Promise<any> {
        return this.readJson(this.getGlobalFilePath(key));
    }

    /**
     * Set global memory by key (replaces existing value)
     * @param key - Memory key
     * @param data - Data to store
     */
    async setGlobalMemory(key: string, data: any): Promise<void> {
        await this.writeJson(this.getGlobalFilePath(key), data);
    }

    // ==================== History ====================

    /**
     * Get message history for a thread
     * @param threadId - Thread identifier
     * @returns Promise resolving to array of messages
     */
    async getHistory(threadId: string): Promise<AgentMessageType[]> {
        const history = await this.readJson(this.getHistoryFilePath(threadId));
        return (history as AgentMessageType[]) ?? [];
    }

    /**
     * Add a message to thread history
     * @param threadId - Thread identifier
     * @param message - Message to add
     */
    async addMessage(threadId: string, message: AgentMessageType): Promise<void> {
        const history = await this.getHistory(threadId);
        history.push(message);
        await this.writeJson(this.getHistoryFilePath(threadId), history);
    }

    // ==================== Thread State ====================

    /**
     * Get thread state
     * @param threadId - Thread identifier
     * @returns Promise resolving to thread state or null if not found
     */
    async getThreadState(threadId: string): Promise<ThreadStateType | null> {
        return this.readJson(this.getStateFilePath(threadId)) as Promise<ThreadStateType | null>;
    }

    /**
     * Set thread state
     * @param threadId - Thread identifier
     * @param state - State to set
     */
    async setThreadState(threadId: string, state: ThreadStateType): Promise<void> {
        await this.writeJson(this.getStateFilePath(threadId), state);
    }
}
