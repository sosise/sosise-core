import commander from 'commander';

export interface OptionType {
    flag: string;
    description: string;
    default?: string | boolean | undefined | any;
    required?: boolean;
}

export default abstract class BaseCommand {
    /**
     * Command name
     */
    protected abstract signature: string;

    /**
     * Command description
     */
    protected abstract description: string;

    /**
     * When command is executed prevent from double execution
     */
    protected abstract singleExecution: boolean;

    /**
     * Command options
     */
    protected abstract options: OptionType[];

    /**
     * Execute the console command
     */
    public abstract handle(cli: commander.Command): void;
}
