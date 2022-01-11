import fs from 'fs';
import LoggerFileRepository from '../../Repositories/Logger/LoggerFileRepository';
import LoggerRepositoryInterface from '../../Repositories/Logger/LoggerRepositoryInterface';

export default class LoggerService {

    private repository: LoggerRepositoryInterface;
    private loggerFileRepository: LoggerFileRepository | null = null;

    /**
     * Constructor
     */
    constructor(repository: LoggerRepositoryInterface) {
        this.repository = repository;

        // Check if logging configuration file exists
        if (fs.existsSync(process.cwd() + '/build/config/logging.js')) {
            // Require logging configuration
            const loggingConfig = require(process.cwd() + '/build/config/logging').default;

            // Check if logging to file is enabled
            if (loggingConfig.enableLoggingToFiles) {
                // Instantiate loggerFileRepository
                this.loggerFileRepository = new LoggerFileRepository(loggingConfig);
            }
        }
    }
    /**
     * Log debug message
     */
    public debug(message: string, params: any = null, channel?: string | undefined): void {
        this.repository.debug(message, params);
        this.logToFileIfEnabled('debug', message, params, channel);
    }

    /**
     * Log info message
     */
    public info(message: string, params: any = null, channel?: string | undefined): void {
        this.repository.info(message, params);
        this.logToFileIfEnabled('info', message, params, channel);
    }

    /**
     * Log warning message
     */
    public warning(message: string, params: any = null, channel?: string | undefined): void {
        this.repository.warning(message, params);
        this.logToFileIfEnabled('warning', message, params, channel);
    }

    /**
     * Log error message
     */
    public error(message: string, params: any = null, channel?: string | undefined): void {
        this.repository.error(message, params);
        this.logToFileIfEnabled('error', message, params, channel);
    }

    /**
     * Log critical message
     */
    public critical(message: string, params: any = null, channel?: string | undefined): void {
        this.repository.critical(message, params);
        this.logToFileIfEnabled('critical', message, params, channel);
    }

    /**
     * Log to file if enabled
     */
    private logToFileIfEnabled(level: 'debug' | 'info' | 'warning' | 'error' | 'critical', message: string, params: any = null, channel?: string | undefined) {
        // Do nothing if loggerFileRepository is null
        if (!this.loggerFileRepository) {
            return;
        }

        switch (level) {
            case 'debug':
                this.loggerFileRepository.debug(message, params, channel);
                break;
            case 'info':
                this.loggerFileRepository.info(message, params, channel);
                break;
            case 'warning':
                this.loggerFileRepository.warning(message, params, channel);
                break;
            case 'error':
                this.loggerFileRepository.error(message, params, channel);
                break;
            case 'critical':
                this.loggerFileRepository.critical(message, params, channel);
                break;
        }
    }
}
