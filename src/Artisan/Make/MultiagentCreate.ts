import colors from 'colors';
import fs from 'fs';
import MakeException from '../../Exceptions/Artisan/MakeException';
import Base from './Base';

/**
 * Make command for creating a new agent
 * Creates agent file and corresponding prompt file
 */
export default class MultiagentCreate extends Base {
    protected templatePath = __dirname + '/../FileTemplates/MultiagentAgentTemplate.txt';
    protected promptTemplatePath = __dirname + '/../FileTemplates/MultiagentPromptFileTemplate.txt';
    protected createPath = 'src/app/Services/MA/Agents';

    /**
     * Create agent file with customized content
     */
    public createFile(): void {
        try {
            // Ensure directory exists
            const dirPath = `${process.cwd()}/${this.createPath}`;
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }

            // Read template
            let templateFileContent = fs.readFileSync(this.templatePath, 'utf8');

            // Generate agent ID from name (e.g., MyAgent -> my-agent)
            const agentId = this.name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();

            // Capitalize first letter of name
            const capitalizedName = this.name.charAt(0).toUpperCase() + this.name.slice(1);

            // Replace placeholders
            templateFileContent = templateFileContent
                .replace(/%name%/g, capitalizedName)
                .replace(/%agentId%/g, agentId)
                .replace(/%agentName%/g, capitalizedName)
                .replace(/%nextAgent%/g, 'END')
                .replace(/%promptFile%/g, `${agentId}.txt`);

            // Write agent file
            const pathOfNewFile = `${process.cwd()}/${this.createPath}/${capitalizedName}.ts`;
            this.throwExceptionIfFileAlreadyExists(pathOfNewFile);
            fs.writeFileSync(pathOfNewFile, templateFileContent);
            console.log(colors.green('Created Agent:'), `${this.createPath}/${capitalizedName}.ts`);

            // Create prompt file
            this.createPromptFile(agentId);

            console.log(colors.dim("\nDon't forget to:"));
            console.log(colors.dim('1. Add agent to your Services/MA/MultiagentService.ts'));
            console.log(colors.dim('2. Update prompt in storage/prompts/' + agentId + '.txt'));
        } catch (error) {
            throw new MakeException((error as Error).message);
        }
    }

    /**
     * Create prompt file for the agent
     */
    private createPromptFile(agentId: string): void {
        // Ensure prompts directory exists
        const promptsDir = `${process.cwd()}/storage/prompts`;
        if (!fs.existsSync(promptsDir)) {
            fs.mkdirSync(promptsDir, { recursive: true });
        }

        // Create prompt file
        const promptPath = `${promptsDir}/${agentId}.txt`;
        if (!fs.existsSync(promptPath)) {
            const promptTemplate = fs.readFileSync(this.promptTemplatePath, 'utf8');
            fs.writeFileSync(promptPath, promptTemplate);
            console.log(colors.green('Created Prompt:'), `storage/prompts/${agentId}.txt`);
        } else {
            console.log(colors.yellow('Prompt already exists:'), `storage/prompts/${agentId}.txt`);
        }
    }
}
