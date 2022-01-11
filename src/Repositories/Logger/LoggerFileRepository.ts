import dayjs from 'dayjs';
import fs from 'fs';
import LoggerStorageRepositoryInterface from './LoggerStorageRepositoryInterface';
import os from 'os';
import { inspect } from 'util';
import LoggingChannelDoesNotExistsException from '../../Exceptions/Logger/LoggingChannelDoesNotExistsException';

export default class LoggerFileRepository implements LoggerStorageRepositoryInterface {

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
    public debug(message: string, params: any, channel: string | undefined): void {
        fs.appendFileSync(this.getLogFilePath(channel), this.makePrettyStringNoColor('debug', message, params) + os.EOL);
    }

    /**
     * Log info message
     */
    public info(message: string, params: any, channel: string | undefined): void {
        fs.appendFileSync(this.getLogFilePath(channel), this.makePrettyStringNoColor('info', message, params) + os.EOL);
    }

    /**
     * Log warning message
     */
    public warning(message: string, params: any, channel: string | undefined): void {
        fs.appendFileSync(this.getLogFilePath(channel), this.makePrettyStringNoColor('warning', message, params) + os.EOL);
    }

    /**
     * Log error message
     */
    public error(message: string, params: any, channel: string | undefined): void {
        fs.appendFileSync(this.getLogFilePath(channel), this.makePrettyStringNoColor('error', message, params) + os.EOL);
    }

    /**
     * Log critical message
     */
    public critical(message: string, params: any, channel: string | undefined): void {
        fs.appendFileSync(this.getLogFilePath(channel), this.makePrettyStringNoColor('critical', message, params) + os.EOL);
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
    private getLogFilePath(channel: string | undefined): string {
        // If channel is given, try to get it from the config
        if (channel) {
            this.throwExceptionIfChannelDoesNotExists(channel);
            const specificLogFileNamePrefix = this.loggingConfig.channels[channel].logFileNamePrefix;
            return `${this.loggingConfig.logFilesDirectory}/${specificLogFileNamePrefix}-${dayjs().format('YYYY-MM-DD')}.log`;
        }

        this.throwExceptionIfChannelDoesNotExists('default');
        const defaultLogFileNamePrefix = this.loggingConfig.channels.default.logFileNamePrefix;
        return `${this.loggingConfig.logFilesDirectory}/${defaultLogFileNamePrefix}-${dayjs().format('YYYY-MM-DD')}.log`;
    }

    /**
     * Throws exception if channel does not exists
     */
    private throwExceptionIfChannelDoesNotExists(channel: string) {
        if (this.loggingConfig.channels[channel] !== undefined) {
            return;
        }
        throw new LoggingChannelDoesNotExistsException('Logging channel does not exists', channel);
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
