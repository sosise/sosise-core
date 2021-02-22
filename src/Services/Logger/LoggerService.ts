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
            if (loggingConfig.enableLoggingToFile) {
                // Instantiate loggerFileRepository
                this.loggerFileRepository = new LoggerFileRepository(loggingConfig);
            }
        }
    }
    /**
     * Log debug message
     */
    public debug(message: string, params: any = null): void {
        this.repository.debug(message, params);
        this.logToFileIfEnabled('debug', message, params);
    }

    /**
     * Log info message
     */
    public info(message: string, params: any = null): void {
        this.repository.info(message, params);
        this.logToFileIfEnabled('info', message, params);
    }

    /**
     * Log warning message
     */
    public warning(message: string, params: any = null): void {
        this.repository.warning(message, params);
        this.logToFileIfEnabled('warning', message, params);
    }

    /**
     * Log error message
     */
    public error(message: string, params: any = null): void {
        this.repository.error(message, params);
        this.logToFileIfEnabled('error', message, params);
    }

    /**
     * Log critical message
     */
    public critical(message: string, params: any = null): void {
        this.repository.critical(message, params);
        this.logToFileIfEnabled('critical', message, params);
    }

    /**
     * Log to file if enabled
     */
    private logToFileIfEnabled(level: 'debug' | 'info' | 'warning' | 'error' | 'critical', message: string, params: any = null) {
        // Do nothing if loggerFileRepository is undefined
        if (!this.loggerFileRepository) {
            return;
        }

        switch (level) {
            case 'debug':
                this.loggerFileRepository.debug(message, params);
                break;
            case 'info':
                this.loggerFileRepository.info(message, params);
                break;
            case 'warning':
                this.loggerFileRepository.warning(message, params);
                break;
            case 'error':
                this.loggerFileRepository.error(message, params);
                break;
            case 'critical':
                this.loggerFileRepository.critical(message, params);
                break;
        }
    }
}
