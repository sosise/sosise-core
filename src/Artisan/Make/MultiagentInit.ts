import colors from 'colors';
import fs from 'fs';
import MakeException from '../../Exceptions/Artisan/MakeException';

/**
 * Make command for initializing multi-agent system
 * Creates all necessary files and directories for a multiagent project
 */
export default class MultiagentInit {
    protected name: string;

    // Template paths
    protected serviceTemplatePath = __dirname + '/../FileTemplates/MultiagentServiceTemplate.txt';
    protected openaiRepoTemplatePath = __dirname + '/../FileTemplates/MultiagentOpenAIRepositoryTemplate.txt';
    protected groqRepoTemplatePath = __dirname + '/../FileTemplates/MultiagentGroqRepositoryTemplate.txt';
    protected promptRepoTemplatePath = __dirname + '/../FileTemplates/MultiagentPromptRepositoryTemplate.txt';
    protected commandTemplatePath = __dirname + '/../FileTemplates/MultiagentCommandTemplate.txt';
    protected llmInterfaceTemplatePath = __dirname + '/../FileTemplates/MultiagentLLMRepositoryInterfaceTemplate.txt';
    protected promptInterfaceTemplatePath = __dirname + '/../FileTemplates/MultiagentPromptRepositoryInterfaceTemplate.txt';
    protected completionTypeTemplatePath = __dirname + '/../FileTemplates/MultiagentCompletionResponseTypeTemplate.txt';
    protected chatMessageTypeTemplatePath = __dirname + '/../FileTemplates/MultiagentChatMessageTypeTemplate.txt';
    protected completionModelsEnumTemplatePath = __dirname + '/../FileTemplates/MultiagentCompletionModelsEnumTemplate.txt';

    // Worker-Validator pattern templates
    protected workerAgentTemplatePath = __dirname + '/../FileTemplates/MultiagentWorkerAgentTemplate.txt';
    protected validatorAgentTemplatePath = __dirname + '/../FileTemplates/MultiagentValidatorAgentTemplate.txt';
    protected workerPromptTemplatePath = __dirname + '/../FileTemplates/MultiagentWorkerPromptTemplate.txt';
    protected validatorPromptTemplatePath = __dirname + '/../FileTemplates/MultiagentValidatorPromptTemplate.txt';

    /**
     * Constructor
     * @param name - Name for the multiagent service (default: MultiagentService)
     */
    constructor(name: string = 'MultiagentService') {
        this.name = name;
    }

    /**
     * Create all multiagent files
     */
    public createFiles(): void {
        try {
            // Create directories
            this.createDirectories();

            // Create types
            this.createTypes();

            // Create enums
            this.createEnums();

            // Create interfaces
            this.createInterfaces();

            // Create repositories
            this.createRepositories();

            // Create service
            this.createService();

            // Create example agents
            this.createExampleAgents();

            // Create command
            this.createCommand();

            // Create example prompts
            this.createExamplePrompts();

            // Create .gitignore files
            this.createGitignoreFiles();

            console.log(colors.green('\nMulti-agent system initialized successfully!'));
            console.log();
            console.log(colors.dim('Run ./artisan ma:run to test the multiagent system'));
        } catch (error) {
            throw new MakeException((error as Error).message);
        }
    }

    /**
     * Create required directories
     */
    private createDirectories(): void {
        const dirs = [
            'src/app/Services/MA',
            'src/app/Services/MA/Agents',
            'src/app/Repositories/LLM',
            'src/app/Repositories/Prompt',
            'src/app/Types/LLM',
            'src/app/Enums/LLM',
            'src/app/Console/Commands',
            'storage/ma/prompts',
            'storage/ma',
        ];

        for (const dir of dirs) {
            const fullPath = `${process.cwd()}/${dir}`;
            if (!fs.existsSync(fullPath)) {
                fs.mkdirSync(fullPath, { recursive: true });
                console.log(colors.green('Created directory:'), dir);
            }
        }
    }

    /**
     * Create type files
     */
    private createTypes(): void {
        // ChatMessageType
        const chatMessageTemplate = fs.readFileSync(this.chatMessageTypeTemplatePath, 'utf8');
        const chatMessagePath = `${process.cwd()}/src/app/Types/LLM/ChatMessageType.ts`;
        this.writeFileIfNotExists(chatMessagePath, chatMessageTemplate, 'Types/LLM/ChatMessageType.ts');

        // CompletionResponseType
        const completionTemplate = fs.readFileSync(this.completionTypeTemplatePath, 'utf8');
        const completionPath = `${process.cwd()}/src/app/Types/LLM/CompletionResponseType.ts`;
        this.writeFileIfNotExists(completionPath, completionTemplate, 'Types/LLM/CompletionResponseType.ts');
    }

    /**
     * Create enum files
     */
    private createEnums(): void {
        // CompletionModelsEnum
        const enumTemplate = fs.readFileSync(this.completionModelsEnumTemplatePath, 'utf8');
        const enumPath = `${process.cwd()}/src/app/Enums/LLM/CompletionModelsEnum.ts`;
        this.writeFileIfNotExists(enumPath, enumTemplate, 'Enums/LLM/CompletionModelsEnum.ts');
    }

    /**
     * Create interface files
     */
    private createInterfaces(): void {
        // LLMRepositoryInterface
        const llmInterfaceTemplate = fs.readFileSync(this.llmInterfaceTemplatePath, 'utf8');
        const llmInterfacePath = `${process.cwd()}/src/app/Repositories/LLM/LLMRepositoryInterface.ts`;
        this.writeFileIfNotExists(llmInterfacePath, llmInterfaceTemplate, 'Repositories/LLM/LLMRepositoryInterface.ts');

        // PromptRepositoryInterface
        const promptInterfaceTemplate = fs.readFileSync(this.promptInterfaceTemplatePath, 'utf8');
        const promptInterfacePath = `${process.cwd()}/src/app/Repositories/Prompt/PromptRepositoryInterface.ts`;
        this.writeFileIfNotExists(promptInterfacePath, promptInterfaceTemplate, 'Repositories/Prompt/PromptRepositoryInterface.ts');
    }

    /**
     * Create repository files
     */
    private createRepositories(): void {
        // OpenAICompletionRepository
        const openaiTemplate = fs.readFileSync(this.openaiRepoTemplatePath, 'utf8');
        const openaiPath = `${process.cwd()}/src/app/Repositories/LLM/OpenAICompletionRepository.ts`;
        this.writeFileIfNotExists(openaiPath, openaiTemplate, 'Repositories/LLM/OpenAICompletionRepository.ts');

        // GroqCompletionRepository
        const groqTemplate = fs.readFileSync(this.groqRepoTemplatePath, 'utf8');
        const groqPath = `${process.cwd()}/src/app/Repositories/LLM/GroqCompletionRepository.ts`;
        this.writeFileIfNotExists(groqPath, groqTemplate, 'Repositories/LLM/GroqCompletionRepository.ts');

        // PromptRepository
        const promptRepoTemplate = fs.readFileSync(this.promptRepoTemplatePath, 'utf8');
        const promptRepoPath = `${process.cwd()}/src/app/Repositories/Prompt/PromptRepository.ts`;
        this.writeFileIfNotExists(promptRepoPath, promptRepoTemplate, 'Repositories/Prompt/PromptRepository.ts');
    }

    /**
     * Create main service file
     */
    private createService(): void {
        let template = fs.readFileSync(this.serviceTemplatePath, 'utf8');
        template = template.replace(/%name%/g, this.name);

        const filePath = `${process.cwd()}/src/app/Services/MA/${this.name}.ts`;
        this.writeFileIfNotExists(filePath, template, `Services/MA/${this.name}.ts`);
    }

    /**
     * Create example agents (Worker-Validator pattern)
     */
    private createExampleAgents(): void {
        // Create WorkerAgent
        const workerTemplate = fs.readFileSync(this.workerAgentTemplatePath, 'utf8');
        const workerPath = `${process.cwd()}/src/app/Services/MA/Agents/WorkerAgent.ts`;
        this.writeFileIfNotExists(workerPath, workerTemplate, 'Services/MA/Agents/WorkerAgent.ts');

        // Create ValidatorAgent
        const validatorTemplate = fs.readFileSync(this.validatorAgentTemplatePath, 'utf8');
        const validatorPath = `${process.cwd()}/src/app/Services/MA/Agents/ValidatorAgent.ts`;
        this.writeFileIfNotExists(validatorPath, validatorTemplate, 'Services/MA/Agents/ValidatorAgent.ts');
    }

    /**
     * Create run command
     */
    private createCommand(): void {
        let template = fs.readFileSync(this.commandTemplatePath, 'utf8');
        template = template.replace(/%serviceName%/g, this.name);

        const filePath = `${process.cwd()}/src/app/Console/Commands/MACommand.ts`;
        this.writeFileIfNotExists(filePath, template, 'Console/Commands/MACommand.ts');
    }

    /**
     * Create example prompt files (Worker-Validator pattern)
     */
    private createExamplePrompts(): void {
        // Worker agent prompt
        const workerPrompt = fs.readFileSync(this.workerPromptTemplatePath, 'utf8');
        this.writeFileIfNotExists(
            `${process.cwd()}/storage/ma/prompts/worker-agent.txt`,
            workerPrompt,
            'storage/ma/prompts/worker-agent.txt',
        );

        // Validator agent prompt
        const validatorPrompt = fs.readFileSync(this.validatorPromptTemplatePath, 'utf8');
        this.writeFileIfNotExists(
            `${process.cwd()}/storage/ma/prompts/validator-agent.txt`,
            validatorPrompt,
            'storage/ma/prompts/validator-agent.txt',
        );
    }

    /**
     * Create .gitignore files for storage directories
     */
    private createGitignoreFiles(): void {
        // For prompts directory
        const promptsGitignore = `${process.cwd()}/storage/ma/prompts/.gitignore`;
        const promptsContent = '# Keep this directory\n!.gitignore\n';
        this.writeFileIfNotExists(promptsGitignore, promptsContent, 'storage/ma/prompts/.gitignore');

        // For ma storage directory
        const maGitignore = `${process.cwd()}/storage/ma/.gitignore`;
        const maContent = '# Ignore all files in this directory\n*\n!.gitignore\n!prompts\n';
        this.writeFileIfNotExists(maGitignore, maContent, 'storage/ma/.gitignore');
    }

    /**
     * Write file if it doesn't exist
     */
    private writeFileIfNotExists(filePath: string, content: string, displayPath: string): void {
        if (fs.existsSync(filePath)) {
            console.log(colors.yellow('File already exists:'), displayPath);
            return;
        }
        fs.writeFileSync(filePath, content);
        console.log(colors.green('Created:'), displayPath);
    }
}
