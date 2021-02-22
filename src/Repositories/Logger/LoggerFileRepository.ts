import dayjs from 'dayjs';
import colors from 'colors';
import fs from 'fs';
import os from 'os';
import { inspect } from 'util';
import LoggerRepositoryInterface from './LoggerRepositoryInterface';

export default class LoggerFileRepository implements LoggerRepositoryInterface {

    private loggingConfig: any;

    /**
     * Constructor
     */
    constructor(loggingConfig: any) {
        this.loggingConfig = loggingConfig;
        this.createLogFilesDirectoryIfItDoesNotExists();
    }

    /**
     * Log info message
     */
    public debug(message: string, params: any): void {
        if (this.loggingConfig.useColorizedOutputInLogFiles) {
            fs.appendFileSync(this.getLogFilePath(), this.makePrettyString('debug', message, params) + os.EOL);
        } else {
            fs.appendFileSync(this.getLogFilePath(), this.makePrettyStringNoColor('debug', message, params) + os.EOL);
        }
    }

    /**
     * Log info message
     */
    public info(message: string, params: any): void {
        if (this.loggingConfig.useColorizedOutputInLogFiles) {
            fs.appendFileSync(this.getLogFilePath(), this.makePrettyString('info', message, params) + os.EOL);
        } else {
            fs.appendFileSync(this.getLogFilePath(), this.makePrettyStringNoColor('info', message, params) + os.EOL);
        }
    }

    /**
     * Log warning message
     */
    public warning(message: string, params: any): void {
        if (this.loggingConfig.useColorizedOutputInLogFiles) {
            fs.appendFileSync(this.getLogFilePath(), this.makePrettyString('warning', message, params) + os.EOL);
        } else {
            fs.appendFileSync(this.getLogFilePath(), this.makePrettyStringNoColor('warning', message, params) + os.EOL);
        }
    }

    /**
     * Log error message
     */
    public error(message: string, params: any): void {
        if (this.loggingConfig.useColorizedOutputInLogFiles) {
            fs.appendFileSync(this.getLogFilePath(), this.makePrettyString('error', message, params) + os.EOL);
        } else {
            fs.appendFileSync(this.getLogFilePath(), this.makePrettyStringNoColor('error', message, params) + os.EOL);
        }
    }

    /**
     * Log critical message
     */
    public critical(message: string, params: any): void {
        if (this.loggingConfig.useColorizedOutputInLogFiles) {
            fs.appendFileSync(this.getLogFilePath(), this.makePrettyString('critical', message, params) + os.EOL);
        } else {
            fs.appendFileSync(this.getLogFilePath(), this.makePrettyStringNoColor('critical', message, params) + os.EOL);
        }
    }

    /**
     * Creates log files directory if needed
     */
    private createLogFilesDirectoryIfItDoesNotExists(): void {
        if (!fs.existsSync(this.loggingConfig.logFilesDirectory)) {
            fs.mkdirSync(this.loggingConfig.logFilesDirectory);
        }
    }

    /**
     * Get current logfilepath
     */
    private getLogFilePath(): string {
        return `${this.loggingConfig.logFilesDirectory}/sosise-${dayjs().format('YYYY-MM-DD')}.log`;
    }

    /**
     * Compose and return a pretty string for logger
     */
    private makePrettyString(level: 'debug' | 'info' | 'warning' | 'error' | 'critical', message: string, params: any = null): string {
        const levelString: string = (() => {
            switch (level) {
                case 'debug':
                    return colors.magenta('DEBUG');
                case 'info':
                    return colors.green('INFO ');
                case 'warning':
                    return colors.yellow('WARN ');
                case 'error':
                    return colors.red('ERROR');
                case 'critical':
                    return colors.bgRed('CRIT ');
            }
        })();

        // Prepare params string
        const paramsString = (params !== null ? inspect(params, { depth: null, maxArrayLength: null, colors: false }) : '');

        // Prepare a string
        const outputString: string = `${colors.dim(dayjs().format('YYYY-MM-DD HH:mm:ss'))} ${levelString} ${message} ${colors.cyan(paramsString)}`;

        // Return a composed string
        return outputString;
    }

    /**
     * Compose and return a pretty string for logger (b&w)
     */
    private makePrettyStringNoColor(level: 'debug' | 'info' | 'warning' | 'error' | 'critical', message: string, params: any = null): string {
        const levelString: string = (() => {
            switch (level) {
                case 'debug':
                    return 'DEBUG';
                case 'info':
                    return 'INFO ';
                case 'warning':
                    return 'WARN ';
                case 'error':
                    return 'ERROR';
                case 'critical':
                    return 'CRIT ';
            }
        })();

        // Prepare params string
        const paramsString = (params !== null ? inspect(params, { depth: null, maxArrayLength: null, colors: false }) : '');

        // Prepare a string
        const outputString: string = `${dayjs().format('YYYY-MM-DD HH:mm:ss')} ${levelString} ${message} ${paramsString}`;

        // Return a composed string
        return outputString;
    }
}
