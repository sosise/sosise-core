import commander from 'commander';
import fs from 'fs';
import findProcess from 'find-process';
import colors from 'colors';

export default class CommandRegistration {

    private commander: commander.Command;

    /**
     * Constructor
     */
    constructor(com: commander.Command) {
        this.commander = com;
    }

    /**
     * Get list of commands
     */
    public get listOfCommandFiles(): string[] {
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
            // Iterate through files
            for (const commandFile of this.listOfCommandFiles) {
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
                            const tmpDirectory = (process.env.TMPDIR || process.env.TEMP)!;

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
                                        if ((await findProcess('pid', fileObject.pid, true)).length > 0) {
                                            // Pid found in process list, exit prevent executing again
                                            console.log(colors.yellow(`Command ${commandClassInstance.signature} is running, do not run it until it's end`));
                                            process.exit(0);
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
                    newCommand.option(option.flag, option.description, option.default);
                }

                // Add to commander
                this.commander.addCommand(newCommand);
            }
        } catch (error) {
            // Do nothing, commands could not be registered
        }
    }
}
