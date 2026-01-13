import AgentMessageTypeEnum from '../../Enums/AgentGraph/AgentMessageTypeEnum';
import ThreadStatusEnum from '../../Enums/AgentGraph/ThreadStatusEnum';

// Re-export enums for convenience
export { AgentMessageTypeEnum, ThreadStatusEnum };

// ==================== Memory Interfaces ====================

export interface ScopedMemoryInterface {
    get(key: string): Promise<any>;
    set(key: string, data: any): Promise<void>;
    getShared(key: string): Promise<any>;
    setShared(key: string, data: any): Promise<void>;
    getGlobal(key: string): Promise<any>;
    setGlobal(key: string, data: any): Promise<void>;
}

export interface MemoryStorageInterface {
    getAgentMemory(threadId: string, agentId: string, key: string): Promise<any>;
    setAgentMemory(threadId: string, agentId: string, key: string, data: any): Promise<void>;
    getSharedMemory(threadId: string, key: string): Promise<any>;
    setSharedMemory(threadId: string, key: string, data: any): Promise<void>;
    getGlobalMemory(key: string): Promise<any>;
    setGlobalMemory(key: string, data: any): Promise<void>;
}

// ==================== Run Options & Result ====================

export interface RunOptionsType {
    threadId: string;
    timeout?: number;
}

export interface GraphResultType {
    status: 'completed' | 'error';
    content: any;
    threadId: string;
    error?: string;
}

// ==================== Message & Thread State ====================

export interface AgentMessageFromType {
    name: string;
    id: string;
}

export interface AgentMessageType {
    from: AgentMessageFromType;
    type: AgentMessageTypeEnum;
    content: any;
    metadata?: any;
}

export interface ThreadStateType {
    threadId: string;
    status: ThreadStatusEnum;
    currentAgent: string;
    createdAt: Date;
    updatedAt: Date;
}

// ==================== Agent Context & Response ====================

export interface AgentContextType {
    threadId: string;
    message: AgentMessageType;
    history: AgentMessageType[];
    memory: ScopedMemoryInterface;
    initialMessage: string;
    currentAgentIterations: number;
    totalIterations: number;
}

export interface AgentResponseType {
    content: any;
    type: AgentMessageTypeEnum;
    next: string | 'END';
    metadata?: any;
}

// ==================== Agent Interface ====================

export interface BaseAgentInterface {
    readonly id: string;
    readonly name: string;
    process(context: AgentContextType): Promise<AgentResponseType>;
}

// ==================== Storage & Config ====================

export interface GraphStorageInterface extends MemoryStorageInterface {
    getHistory(threadId: string): Promise<AgentMessageType[]>;
    addMessage(threadId: string, message: AgentMessageType): Promise<void>;
    getThreadState(threadId: string): Promise<ThreadStateType | null>;
    setThreadState(threadId: string, state: ThreadStateType): Promise<void>;
}

export interface AgentGraphConfigType {
    agents: BaseAgentInterface[];
    start: BaseAgentInterface;
    memory?: GraphStorageInterface;
}
