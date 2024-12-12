import { exec } from 'child_process';
import colors from 'colors';
import commander from 'commander';
import fs from 'fs';
import util from 'util';
import Helper from '../Helper/Helper';

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
                return element.includes('js') && element.includes('Command') && !element.includes('.map');
            });

            return listOfCommandFiles;
        } catch (error) {
            return [];
        }
    }

    /**
     * Get process by pid
     */
    private async checkIfProcessExistsByPidAndCmd(pid: number, cmd: string): Promise<boolean> {
        // Promisify exec
        const promiseExec = util.promisify(exec);

        // Execute ps
        const result = await promiseExec('ps');

        // Logic
        const psLines = result.stdout.split('\n');
        for (const line of psLines) {
            if (line.match(new RegExp(pid.toString(), 'i'))) {
                if (line.match(new RegExp(cmd, 'i'))) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Create or update (touch) command execution file
     * This is needed for monitoring, to ensure that command not frozen
     */
    private createOrUpdateCommandExecutionFile(commandFilename: string): void {
        // Get command name
        const commandFileNameWithoutExtension = commandFilename.replace('.js', '');

        // Get touch file path
        const touchFilePath = Helper.storagePath() + 'framework/';

        // In case storage/framework folder does not exists
        if (!fs.existsSync(touchFilePath)) {
            fs.mkdirSync(touchFilePath);
            fs.writeFileSync(touchFilePath + '.gitignore', '*\n!.gitignore');
        }

        // Touch or create file
        const currentDateTime = new Date();
        const fileBody = `[${commandFileNameWithoutExtension}] file created at ${currentDateTime}`;

        if (!fs.existsSync(touchFilePath + commandFileNameWithoutExtension)) {
            fs.writeFileSync(touchFilePath + commandFileNameWithoutExtension, fileBody);
        } else {
            fs.utimesSync(touchFilePath + commandFileNameWithoutExtension, currentDateTime, currentDateTime);
            fs.writeFileSync(touchFilePath + commandFileNameWithoutExtension, fileBody);
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
                this.command.command(colors.green('User-defined'));
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
                    .description(colors.dim(`${commandClassInstance.description}`))
                    .action(async (cli) => {
                        // Perform double execution prevention only if singleExecution param is set to true in current command
                        if (commandClassInstance.singleExecution) {
                            // Specify tmp directory
                            const tmpDirectory = '/tmp/';

                            // Get list of all *.pid files within tmp directory
                            let listOfPidFiles = fs.readdirSync(tmpDirectory);
                            listOfPidFiles = listOfPidFiles.filter((element) => {
                                return element.includes('.pid');
                            });

                            // Now open each of them and check if signature matches current execution
                            // If yes check if pid exists
                            const expiredPids: string[] = [];
                            for (const pidFile of listOfPidFiles) {
                                try {
                                    const fileContent = fs.readFileSync(tmpDirectory + pidFile, 'utf-8');
                                    const fileObject = JSON.parse(fileContent);

                                    // If pid file contains signature what we are executing right now
                                    if (fileObject.signature === commandClassInstance.signature) {
                                        // Check if process exists by pid and signature
                                        if (
                                            await this.checkIfProcessExistsByPidAndCmd(
                                                fileObject.pid,
                                                commandClassInstance.signature,
                                            )
                                        ) {
                                            // Yep the process is really ours, we should wait
                                            console.log(
                                                colors.yellow(
                                                    `Command ${commandClassInstance.signature} is running, do not run it until it's end`,
                                                ),
                                            );
                                            process.exit(1);
                                        }

                                        // At this point we know that: OS has occupied our PID !OR! the process does not exists anymore
                                        // Delete the PID file
                                        fs.rmSync(tmpDirectory + pidFile);
                                    }
                                } catch (error) {
                                    // File not in our format, just skip it
                                }
                            }

                            // At this point we know that process is not running, remove all expired pid files with our signature
                            expiredPids.map((value, index) => fs.rmSync(`${tmpDirectory}${value}`));

                            // Create pid file, may be used to prevent double execution
                            fs.writeFileSync(
                                tmpDirectory + process.pid + '.pid',
                                JSON.stringify({
                                    signature: commandClassInstance.signature,
                                    pid: process.pid,
                                }),
                            );
                        }

                        // Create or update (touch) command execution start file, this is needed for monitoring
                        // This ensures that command has started
                        this.createOrUpdateCommandExecutionFile(`${commandFile}-start`);

                        // Run handle method of the command
                        commandClassInstance
                            .handle(cli)
                            .then(() => {
                                // Create or update (touch) command execution start file, this is needed for monitoring
                                // This ensures that command has ended
                                this.createOrUpdateCommandExecutionFile(`${commandFile}-end`);

                                process.exit(0);
                            })
                            .catch(async (error) => {
                                const Handler = require(process.cwd() + '/build/app/Exceptions/Handler').default;
                                const exceptionHandler = new Handler();
                                await exceptionHandler.reportCommandException(error);
                                process.exit(1);
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
