import { AgentContextType, AgentResponseType, BaseAgentInterface } from '../../Types/AgentGraph/AgentGraphTypes';

/**
 * Base abstract class for all agents in the system
 * Each agent must implement the process method to handle incoming messages
 */
export default abstract class AbstractBaseAgent implements BaseAgentInterface {
    /**
     * Unique identifier for the agent (used for routing)
     */
    abstract readonly id: string;

    /**
     * Human-readable name for the agent (used in message history for easy search)
     */
    abstract readonly name: string;

    /**
     * LLM providers object for AI completions
     * Access via this.llm['providerKey']
     */
    protected llm: Record<string, any>;

    /**
     * Prompt repository for loading prompt templates from storage
     */
    protected promptRepository: any;

    /**
     * Create a new agent instance
     * @param llm - Object with named LLM repositories
     * @param promptRepository - Prompt repository for loading prompts
     */
    constructor(llm: Record<string, any>, promptRepository: any) {
        this.llm = llm;
        this.promptRepository = promptRepository;
    }

    /**
     * Process an incoming message and return a response
     * This is the main method that each agent must implement
     *
     * @param context - The context containing message, history, and memory
     * @returns Promise resolving to the agent's response
     */
    abstract process(context: AgentContextType): Promise<AgentResponseType>;
}
