import { exec } from 'child_process';
import colors from 'colors';
import { Command } from 'commander';
import fs from 'fs';
import util from 'util';
import Helper from '../Helper/Helper';

export default class CommandRegistration {
    private command: Command;

    /**
     * Directory where single execution commands keep their pid files
     */
    private readonly pidDirectory = '/tmp/';

    /**
     * Output buffer for the process list, the 1 MB default of exec is exceeded on hosts with thousands of processes
     */
    private readonly processListMaxBuffer = 64 * 1024 * 1024;

    /**
     * Constructor
     */
    constructor(command: Command) {
        this.command = command;
    }

    /**
     * Register application commands
     */
    public registerApplicationCommands(): void {
        try {
            // Get all available commands
            const listOfCommandFiles = this.getListOfCommandFiles();

            // User-defined commands are registered below

            // Iterate through files
            for (const commandFile of this.getListOfCommandFiles()) {
                // Get command file path
                const commandFilePath = process.cwd() + '/build/app/Console/Commands/' + commandFile;

                // Import the command
                const commandClassImport = require(commandFilePath);

                // Instantiate
                const commandClassInstance = new commandClassImport.default();

                // Register command and specify what to do when command is executed
                const newCommand = new Command(commandClassInstance.signature)
                    .description(colors.dim(`${commandClassInstance.description}`))
                    .action(async (options, cli) => {
                        // Perform double execution prevention only if singleExecution param is set to true in current command
                        if (commandClassInstance.singleExecution) {
                            await this.preventDoubleExecution(commandClassInstance.signature);
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
                            .catch(async (error: unknown) => {
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
     * Exit when another execution of the command is still running, otherwise take a pid file for the current one
     */
    private async preventDoubleExecution(signature: string): Promise<void> {
        // Get list of all *.pid files within pid directory
        const listOfPidFiles = fs.readdirSync(this.pidDirectory).filter((element) => element.includes('.pid'));

        // Now open each of them and check if signature matches current execution
        // If yes check if pid exists
        for (const pidFile of listOfPidFiles) {
            try {
                const fileContent = fs.readFileSync(this.pidDirectory + pidFile, 'utf-8');
                const fileObject = JSON.parse(fileContent);

                // Pid files of other commands are skipped
                if (fileObject.signature !== signature) {
                    continue;
                }

                // Check if process exists by pid and signature
                if (await this.checkIfProcessExistsByPidAndCmd(fileObject.pid, signature)) {
                    // Yep the process is really ours, we should wait
                    console.log(colors.yellow(`Command ${signature} is running, do not run it until it's end`));
                    process.exit(1);
                }

                // At this point we know that: OS has occupied our PID !OR! the process does not exists anymore
                // Delete the PID file
                fs.rmSync(this.pidDirectory + pidFile);
            } catch (error) {
                // File not in our format, just skip it
            }
        }

        // Create pid file, may be used to prevent double execution
        this.createPidFile(signature);
    }

    /**
     * Check whether the process with the given pid is an execution of the given command
     */
    private async checkIfProcessExistsByPidAndCmd(pid: number, cmd: string): Promise<boolean> {
        // The pid file was left by an earlier execution whose pid the OS has given to this process or to its parent,
        // the parent is the "sh ./artisan <signature>" wrapper and carries the signature in its arguments too
        if (pid === process.pid || pid === process.ppid) {
            return false;
        }

        // Promisify exec
        const promiseExec = util.promisify(exec);

        // List every process with its full command line, plain ps on macOS and procps lists only
        // processes attached to the current terminal and misses a command started by cron
        const result = await promiseExec('ps -A -o pid=,args=', { maxBuffer: this.processListMaxBuffer });

        // Compare the whole PID column, matched anywhere in the line a stale pid also matches
        // the arguments of the command itself or a longer pid, and the command would never run again
        const psLines = result.stdout.split('\n');
        for (const line of psLines) {
            const linePid = Number(line.trim().split(/\s+/)[0]);
            if (linePid === pid && line.match(new RegExp(cmd, 'i'))) {
                return true;
            }
        }
        return false;
    }

    /**
     * Create the pid file of the current execution and remove it once the process exits
     */
    private createPidFile(signature: string): void {
        const pidFilePath = this.pidDirectory + process.pid + '.pid';

        fs.writeFileSync(
            pidFilePath,
            JSON.stringify({
                signature,
                pid: process.pid,
            }),
        );

        // Every next execution has to check a pid file left behind, so it is removed on any way out:
        // completion, failure, a failing exception handler or process.exit() called by the command itself
        // A killed process still leaves the file, the next execution removes it once the pid is gone
        process.once('exit', () => fs.rmSync(pidFilePath, { force: true }));
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
}
