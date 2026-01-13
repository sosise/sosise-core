import {
    AgentContextType,
    AgentGraphConfigType,
    AgentMessageFromType,
    AgentMessageType,
    AgentMessageTypeEnum,
    BaseAgentInterface,
    GraphResultType,
    GraphStorageInterface,
    RunOptionsType,
    ThreadStateType,
    ThreadStatusEnum,
} from '../../Types/AgentGraph/AgentGraphTypes';
import InMemoryStorageService from './Memory/InMemoryStorageService';
import ScopedMemory from './Memory/ScopedMemory';

/**
 * AgentGraphService - Main orchestrator for multi-agent systems
 * Manages agent execution flow, memory, and message passing
 */
export default class AgentGraphService {
    private agents: Record<string, BaseAgentInterface>;
    private startAgent: string;
    private memory: GraphStorageInterface;
    private maxIterations: number;

    // Unicode box drawing characters for visual formatting
    private readonly BOX = {
        VERTICAL: '┃',
        VERTICAL_INNER: '|',
        BRANCH: '├─',
        CORNER: '└─',
        SEPARATOR: '━',
    } as const;

    // Status icons for different message types
    private readonly STATUS_ICONS: Record<string, string> = {
        [AgentMessageTypeEnum.TASK]: '📋',
        [AgentMessageTypeEnum.RESULT]: '✅',
        [AgentMessageTypeEnum.FEEDBACK]: '🔄',
    };

    // ANSI color codes for terminal output
    private readonly COLORS = {
        RESET: '\x1b[0m',
        BRIGHT: '\x1b[1m',
        DIM: '\x1b[2m',
        CYAN: '\x1b[36m',
        GREEN: '\x1b[32m',
        YELLOW: '\x1b[33m',
        BLUE: '\x1b[34m',
        MAGENTA: '\x1b[35m',
        WHITE: '\x1b[37m',
        GRAY: '\x1b[90m',
        RED: '\x1b[31m',
    } as const;

    // Color mapping for message types
    private readonly TYPE_COLORS: Record<string, string> = {
        [AgentMessageTypeEnum.TASK]: '\x1b[34m',
        [AgentMessageTypeEnum.RESULT]: '\x1b[32m',
        [AgentMessageTypeEnum.FEEDBACK]: '\x1b[33m',
    };

    /**
     * Format date for logging in YYYY-MM-DD HH:mm:ss format
     * @param date - Date to format
     * @returns Formatted date string
     */
    private formatDate(date: Date): string {
        const pad = (n: number) => n.toString().padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    }

    /**
     * Create a new AgentGraphService instance
     * @param config - Graph configuration with agents and start agent
     */
    constructor(config: AgentGraphConfigType) {
        // Build agents map by agent.id for efficient lookup
        this.agents = {};
        for (const agent of config.agents) {
            this.agents[agent.id] = agent;
        }

        this.startAgent = config.start.id;
        this.memory = config.memory ?? new InMemoryStorageService();
        this.maxIterations = 50;
    }

    /**
     * Run the agent graph with the given input
     * @param input - Initial user input/task
     * @param options - Run options including threadId
     * @returns Promise resolving to the graph result
     */
    async run(input: string, options: RunOptionsType): Promise<GraphResultType> {
        const { threadId } = options;
        const threadStartTime = Date.now();

        try {
            // Initialize thread state
            await this.initializeThread(threadId);

            // Log thread start
            this.logThreadStart(threadId, this.startAgent, input);

            // Create initial user message
            const userMessage: AgentMessageType = {
                from: { name: 'user', id: 'user' },
                type: AgentMessageTypeEnum.TASK,
                content: input,
            };
            await this.memory.addMessage(threadId, userMessage);

            // Start with the configured start agent
            let currentAgentId = this.startAgent;
            let lastContent = '';
            let iterations = 0;
            const agentIterationsMap: Record<string, number> = {};

            // Main execution loop
            while (currentAgentId !== 'END' && iterations < this.maxIterations) {
                iterations++;

                const agent = this.agents[currentAgentId];
                if (!agent) {
                    throw new Error(`Agent not found: ${currentAgentId}`);
                }

                // Increment agent-specific iteration counter
                if (!agentIterationsMap[currentAgentId]) {
                    agentIterationsMap[currentAgentId] = 0;
                }
                agentIterationsMap[currentAgentId]++;

                // Prepare context for the agent
                const context = await this.prepareContext(threadId, agent, input, agentIterationsMap[currentAgentId], iterations);

                // Update thread state
                await this.updateThreadState(threadId, currentAgentId, ThreadStatusEnum.RUNNING);

                // Execute the agent and measure time
                const agentStartTime = Date.now();
                const response = await agent.process(context);
                const agentExecutionTime = Date.now() - agentStartTime;

                // Create response message with optional metadata
                const responseMessage: AgentMessageType = {
                    from: { name: agent.name, id: agent.id },
                    type: response.type,
                    content: response.content,
                    metadata: response.metadata,
                };
                await this.memory.addMessage(threadId, responseMessage);

                // Log agent execution block (combined input/output)
                this.logAgentBlock({
                    iteration: iterations,
                    agentName: agent.name,
                    agentId: agent.id,
                    from: context.message.from,
                    type: context.message.type,
                    next: response.next,
                    input: context.message.content,
                    output: response.content,
                    executionTime: agentExecutionTime,
                    agentIteration: agentIterationsMap[currentAgentId],
                });

                // Update for next iteration
                lastContent = response.content;
                currentAgentId = response.next;
            }

            // Check for max iterations exceeded
            if (iterations >= this.maxIterations) {
                const totalTime = Date.now() - threadStartTime;
                const errorMessage = `Max iterations exceeded (${this.maxIterations})`;
                this.logThreadEnd(threadId, iterations, totalTime, 'error', errorMessage);
                await this.updateThreadState(threadId, currentAgentId, ThreadStatusEnum.ERROR);
                return {
                    status: 'error',
                    content: lastContent,
                    threadId,
                    error: errorMessage,
                };
            }

            // Mark thread as completed
            await this.updateThreadState(threadId, 'END', ThreadStatusEnum.COMPLETED);

            // Log thread completion
            const totalTime = Date.now() - threadStartTime;
            this.logThreadEnd(threadId, iterations, totalTime, 'completed');

            return {
                status: 'completed',
                content: lastContent,
                threadId,
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const totalTime = Date.now() - threadStartTime;
            this.logThreadEnd(threadId, 0, totalTime, 'error', errorMessage);

            await this.updateThreadState(threadId, '', ThreadStatusEnum.ERROR);

            return {
                status: 'error',
                content: '',
                threadId,
                error: errorMessage,
            };
        }
    }

    /**
     * Get the current state of a thread
     * @param threadId - Thread identifier
     * @returns Promise resolving to thread state or null
     */
    async getState(threadId: string): Promise<ThreadStateType | null> {
        return this.memory.getThreadState(threadId);
    }

    /**
     * Get the message history for a thread
     * @param threadId - Thread identifier
     * @returns Promise resolving to array of messages
     */
    async getHistory(threadId: string): Promise<AgentMessageType[]> {
        return this.memory.getHistory(threadId);
    }

    /**
     * Initialize a new thread
     * @param threadId - Thread identifier
     */
    private async initializeThread(threadId: string): Promise<void> {
        const existingState = await this.memory.getThreadState(threadId);
        if (!existingState) {
            const state: ThreadStateType = {
                threadId,
                status: ThreadStatusEnum.RUNNING,
                currentAgent: this.startAgent,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            await this.memory.setThreadState(threadId, state);
        }
    }

    /**
     * Update thread state
     * @param threadId - Thread identifier
     * @param currentAgent - Current agent ID
     * @param status - New status
     */
    private async updateThreadState(threadId: string, currentAgent: string, status: ThreadStatusEnum): Promise<void> {
        const existingState = await this.memory.getThreadState(threadId);
        const state: ThreadStateType = {
            threadId,
            status,
            currentAgent,
            createdAt: existingState?.createdAt ?? new Date(),
            updatedAt: new Date(),
        };
        await this.memory.setThreadState(threadId, state);
    }

    /**
     * Prepare context for an agent
     * @param threadId - Thread identifier
     * @param agent - Agent to prepare context for
     * @param initialMessage - Initial user message for this thread
     * @param currentAgentIterations - Current agent's iteration count
     * @param totalIterations - Total iterations across all agents
     * @returns Promise resolving to agent context
     */
    private async prepareContext(
        threadId: string,
        agent: BaseAgentInterface,
        initialMessage: string,
        currentAgentIterations: number,
        totalIterations: number,
    ): Promise<AgentContextType> {
        const history = await this.memory.getHistory(threadId);
        const lastMessage = history[history.length - 1];

        // Create scoped memory for the agent (encapsulates threadId and agentId)
        const scopedMemory = new ScopedMemory(this.memory, threadId, agent.id);

        return {
            threadId,
            message: lastMessage,
            history,
            memory: scopedMemory,
            initialMessage,
            currentAgentIterations,
            totalIterations,
        };
    }

    /**
     * Format content with tree symbol prefix, handling multiline content
     * @param content - Content to format (string or object)
     * @param firstLinePrefix - Prefix for first line (e.g., '├─ IN:  ')
     * @param continuationPrefix - Prefix for continuation lines
     * @returns Formatted string with all lines
     */
    private formatContentWithTreeSymbol(content: any, firstLinePrefix: string, continuationPrefix: string): string {
        const V = this.BOX.VERTICAL;
        const baseIndent = `         ${V}     `;

        // Convert content to string
        const contentStr = typeof content === 'object' ? JSON.stringify(content, null, 2) : String(content);
        const lines = contentStr.split('\n');
        const result: string[] = [];

        // First line with tree symbol
        result.push(`${baseIndent}${firstLinePrefix}${lines[0]}`);

        // Continuation lines with proper indentation
        for (let i = 1; i < lines.length; i++) {
            result.push(`${baseIndent}${continuationPrefix}${lines[i]}`);
        }

        return result.join('\n');
    }

    /**
     * Format thread start block with modern visual style and colors
     * @param threadId - Thread identifier
     * @param startAgent - Starting agent ID
     * @param input - Initial user input
     * @returns Object with separators and content for separate logging
     */
    private formatThreadStart(
        threadId: string,
        startAgent: string,
        input: string,
    ): { topSeparator: string; content: string; bottomSeparator: string } {
        const V = this.BOX.VERTICAL;
        const C = this.COLORS;
        const separator = this.BOX.SEPARATOR.repeat(80);
        const startAgentName = this.agents[startAgent]?.name || startAgent;

        // Format input (full content, no truncation)
        const inputStr = typeof input === 'object' ? JSON.stringify(input, null, 2) : input;
        const inputLines = inputStr.split('\n');

        const contentLines = [
            `         ${V} ${C.CYAN}${C.BRIGHT}🚀 THREAD STARTED${C.RESET}`,
            `         ${V}     ${C.GRAY}ID:${C.RESET} ${threadId}`,
            `         ${V}     ${C.GRAY}START:${C.RESET} ${C.CYAN}${startAgentName}${C.RESET}`,
        ];

        // Add input lines with proper indentation
        contentLines.push(`         ${V}     ${C.GRAY}INPUT:${C.RESET} ${inputLines[0]}`);
        for (let i = 1; i < inputLines.length; i++) {
            contentLines.push(`         ${V}            ${inputLines[i]}`);
        }

        return {
            topSeparator: `${C.CYAN}${separator}${C.RESET}`,
            content: contentLines.join('\n'),
            bottomSeparator: `${C.CYAN}${separator}${C.RESET}`,
        };
    }

    /**
     * Format agent execution block with modern visual style and colors
     * @param params - Agent block parameters
     * @returns Object with separators and content for separate logging
     */
    private formatAgentBlock(params: {
        iteration: number;
        agentName: string;
        agentId: string;
        from: AgentMessageFromType;
        type: AgentMessageTypeEnum;
        next: string;
        input: any;
        output: any;
        executionTime: number;
        agentIteration: number;
    }): { topSeparator: string; content: string; bottomSeparator: string } {
        const icon = this.STATUS_ICONS[params.type] || '●';
        const V = this.BOX.VERTICAL;
        const C = this.COLORS;

        // Build iteration indicator (only show if agentIteration > 1)
        const iterIndicator = params.agentIteration > 1 ? ` iter:${params.agentIteration}` : '';

        // Resolve next agent name (could be 'END' or agent id)
        const nextName = params.next === 'END' ? 'END' : this.agents[params.next]?.name || params.next;

        // Get color for message type
        const typeColor = this.TYPE_COLORS[params.type] || C.WHITE;

        // Horizontal separator line (cyan like thread start)
        const separatorLine = `${C.CYAN}${this.BOX.SEPARATOR.repeat(80)}${C.RESET}`;

        // Build header line - agent name without padding, no execution time
        const headerLine = `         ${V} #${params.iteration} ${icon} ${C.CYAN}${params.agentName}${C.RESET}${iterIndicator}`;

        // Build metadata lines with colors
        const dateLine = `         ${V}     ${C.GRAY}DATE:${C.RESET} ${this.formatDate(new Date())} INFO`;
        const executionLine = `         ${V}     ${C.GRAY}EXECUTION:${C.RESET} ${params.executionTime}ms`;
        const fromLine = `         ${V}     ${C.GRAY}FROM:${C.RESET} ${params.from.name}`;
        const typeLine = `         ${V}     ${C.GRAY}TYPE:${C.RESET} ${typeColor}${params.type}${C.RESET}`;
        const nextLine = `         ${V}     ${C.GRAY}NEXT:${C.RESET} ${C.MAGENTA}${nextName}${C.RESET}`;

        // Vertical separator lines between sections (using simple | for inner lines)
        const verticalSeparator = `         ${V}     ${this.BOX.VERTICAL_INNER}`;

        // Format input with tree branch
        const inputLines = this.formatContentWithTreeSymbol(params.input, `${this.BOX.BRANCH} IN:  `, '       ');

        // Format output with tree corner
        const outputLines = this.formatContentWithTreeSymbol(params.output, `${this.BOX.CORNER} OUT: `, '       ');

        // Empty line separator
        const emptyLine = `         ${V}`;

        const contentLines = [
            headerLine,
            dateLine,
            executionLine,
            fromLine,
            typeLine,
            nextLine,
            verticalSeparator,
            verticalSeparator,
            inputLines,
            verticalSeparator,
            verticalSeparator,
            outputLines,
            emptyLine,
        ];

        return {
            topSeparator: separatorLine,
            content: contentLines.join('\n'),
            bottomSeparator: separatorLine,
        };
    }

    /**
     * Format thread completion or error block with modern visual style and colors
     * @param threadId - Thread identifier
     * @param iterations - Total number of iterations
     * @param totalTime - Total execution time in ms
     * @param status - Thread status (completed or error)
     * @param error - Error message (if status is error)
     * @returns Object with separators and content for separate logging
     */
    private formatThreadEnd(
        threadId: string,
        iterations: number,
        totalTime: number,
        status: 'completed' | 'error',
        error?: string,
    ): { topSeparator: string; content: string; bottomSeparator: string } {
        const V = this.BOX.VERTICAL;
        const C = this.COLORS;
        const separator = this.BOX.SEPARATOR.repeat(80);

        const icon = status === 'error' ? '❌' : '✅';
        const statusText = status === 'error' ? 'THREAD FAILED' : 'THREAD COMPLETED';
        const statusColor = status === 'error' ? C.RED : C.GREEN;

        const contentLines = [
            `         ${V} ${statusColor}${C.BRIGHT}${icon} ${statusText}${C.RESET}`,
            `         ${V}     ${C.GRAY}ID:${C.RESET} ${threadId}`,
            `         ${V}     ${C.GRAY}ITERATIONS:${C.RESET} ${iterations}`,
            `         ${V}     ${C.GRAY}TOTAL TIME:${C.RESET} ${totalTime}ms`,
        ];

        if (status === 'error' && error) {
            contentLines.push(`         ${V}     ${C.RED}ERROR:${C.RESET} ${error}`);
        }

        return {
            topSeparator: `${statusColor}${separator}${C.RESET}`,
            content: contentLines.join('\n'),
            bottomSeparator: `${statusColor}${separator}${C.RESET}`,
        };
    }

    /**
     * Log thread start - visual output to console, brief info to file logger
     * @param threadId - Thread identifier
     * @param startAgent - Starting agent ID
     * @param input - Initial user input
     */
    private logThreadStart(threadId: string, startAgent: string, input: string): void {
        const formatted = this.formatThreadStart(threadId, startAgent, input);

        // Visual output to console (no timestamp)
        console.log(formatted.topSeparator);
        console.log(formatted.content);
        console.log(formatted.bottomSeparator);
    }

    /**
     * Log agent block - visual output to console, brief info to file logger
     * @param params - Agent block parameters
     */
    private logAgentBlock(params: {
        iteration: number;
        agentName: string;
        agentId: string;
        from: AgentMessageFromType;
        type: AgentMessageTypeEnum;
        next: string;
        input: any;
        output: any;
        executionTime: number;
        agentIteration: number;
    }): void {
        const formatted = this.formatAgentBlock(params);

        // Visual output to console (no timestamp)
        console.log(formatted.topSeparator);
        console.log(formatted.content);
        console.log(formatted.bottomSeparator);
    }

    /**
     * Log thread end - visual output to console
     * @param threadId - Thread identifier
     * @param iterations - Total number of iterations
     * @param totalTime - Total execution time in ms
     * @param status - Thread status (completed or error)
     * @param error - Error message (if status is error)
     */
    private logThreadEnd(threadId: string, iterations: number, totalTime: number, status: 'completed' | 'error', error?: string): void {
        const formatted = this.formatThreadEnd(threadId, iterations, totalTime, status, error);

        // Visual output to console (no timestamp)
        console.log(formatted.topSeparator);
        console.log(formatted.content);
        console.log(formatted.bottomSeparator);
    }
}
