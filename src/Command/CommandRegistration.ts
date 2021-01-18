import commander from 'commander';
import fs from 'fs';
import colors from 'colors';

export default class CommandRegistration {

    private command: commander.Command;

    /**
     * Constructor
     */
    constructor(command: commander.Command) {
        this.command = command;
    }

    /**
     * Get list of commands
     */
    private getListOfCommandFiles(): string[] {
        try {
            // Get list of command files
            let listOfCommandFiles = fs.readdirSync(process.cwd() + '/build/app/Console/Commands');

            // Filter out only js files with postfix Command
            listOfCommandFiles = listOfCommandFiles.filter((element) => {
                return (element.includes('js') && element.includes('Command')) && (!element.includes('map'));
            });

            return listOfCommandFiles;
        } catch (error) {
            return [];
        }
    }

    /**
     * Register application commands
     */
    public registerApplicationCommands(): void {
        try {
            // Get all available commands
            const listOfCommandFiles = this.getListOfCommandFiles();

            // Show user commands if they exist
            if (listOfCommandFiles.length > 0) {
                this.command.command('');
                this.command.command('User-defined'.green);
            }

            // Iterate through files
            for (const commandFile of this.getListOfCommandFiles()) {
                // Get command file path
                const commandFilePath = process.cwd() + '/build/app/Console/Commands/' + commandFile;

                // Import the command
                const commandClassImport = require(commandFilePath);

                // Instantiate
                const commandClassInstance = new commandClassImport.default();

                // Register command and specify what to do when command is executed
                const newCommand = commander
                    .command(commandClassInstance.signature)
                    .description(`${commandClassInstance.description}`.dim)
                    .action(async (cli) => {
                        // Perform double execution prevention only if singleExecution param is set to true in current command
                        if (commandClassInstance.singleExecution) {
                            // Specify tmp directory
                            const tmpDirectory = '/tmp/';

                            // Get list of all *.pid files within tmp directory
                            let listOfPidFiles = fs.readdirSync(tmpDirectory);
                            listOfPidFiles = listOfPidFiles.filter((element) => {
                                return (element.includes('.pid'));
                            });

                            // Now open each of them and check if signature matches current execution
                            // If yes check if pid exists
                            for (const pidFile of listOfPidFiles) {
                                try {
                                    const fileContent = fs.readFileSync(tmpDirectory + pidFile, 'utf-8');
                                    const fileObject = JSON.parse(fileContent);

                                    // If pid file contains signature what we are executing right now
                                    if (fileObject.signature === commandClassInstance.signature) {
                                        // Now check if pid exists
                                        try {
                                            // Try to send signal 0 to the pid
                                            process.kill(fileObject.pid, 0);

                                            // At this point we are sure that process exists
                                            // Pid found in process list, exit, preventing executing again
                                            console.log(colors.yellow(`Command ${commandClassInstance.signature} is running, do not run it until it's end`));
                                            process.exit(0);
                                        } catch (error) {
                                            // If pid not found, do nothing
                                        }
                                    }
                                } catch (error) {
                                    // File not in our format, just skip it
                                }
                            }

                            // Create pid file, may be used to prevent double execution
                            fs.writeFileSync(tmpDirectory + process.pid + '.pid', JSON.stringify({
                                signature: commandClassInstance.signature,
                                pid: process.pid
                            }));
                        }

                        // Run handle method of the command
                        commandClassInstance.handle(cli).then(() => {
                            process.exit(0);
                        }).catch((error) => {
                            const Handler = require(process.cwd() + '/build/app/Exceptions/Handler').default;
                            const exceptionHandler = new Handler();
                            exceptionHandler.reportCommandException(error);
                        });
                    });

                // Add options to new command
                for (const option of commandClassInstance.options) {
                    if (option.required === undefined || option.required === false) {
                        newCommand.option(option.flag, option.description, option.default);
                    } else {
                        newCommand.requiredOption(option.flag, option.description, option.default);
                    }
                }

                // Add to commander
                this.command.addCommand(newCommand);
            }
        } catch (error) {
            // Do nothing, commands could not be registered
        }
    }
}
