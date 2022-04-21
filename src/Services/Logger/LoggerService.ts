import LoggerFileRepository from "../../Repositories/Logger/LoggerFileRepository";
import LoggerRepositoryInterface from "../../Repositories/Logger/LoggerRepositoryInterface";

export default class LoggerService {

    private repository: LoggerRepositoryInterface;
    private loggerFileRepository: LoggerFileRepository;
    private enableLoggingToConsole: boolean = false;
    private enableLoggingToFiles: boolean = false;

    /**
     * Constructor
     */
    constructor(repository: LoggerRepositoryInterface) {
        this.repository = repository;

        // Require logging configuration
        const loggingConfig = require(process.cwd() + '/build/config/logging').default;
        this.enableLoggingToConsole = loggingConfig.enableLoggingToConsole;
        this.enableLoggingToFiles = loggingConfig.enableLoggingToFiles;

        // Check if logging configuration file exists
        if (this.enableLoggingToFiles) {
            // Instantiate loggerFileRepository
            this.loggerFileRepository = new LoggerFileRepository(loggingConfig);
        }
    }
    /**
     * Log debug message
     */
    public debug(message: string, params: any = null, channel?: string | undefined): void {
        if (this.enableLoggingToConsole) {
            this.repository.debug(message, params);
        }

        if (this.enableLoggingToFiles) {
            this.logToFile('debug', message, params, channel);
        }
    }

    /**
     * Log info message
     */
    public info(message: string, params: any = null, channel?: string | undefined): void {
        if (this.enableLoggingToConsole) {
            this.repository.info(message, params);
        }

        if (this.enableLoggingToFiles) {
            this.logToFile('info', message, params, channel);
        }
    }

    /**
     * Log warning message
     */
    public warning(message: string, params: any = null, channel?: string | undefined): void {
        if (this.enableLoggingToConsole) {
            this.repository.warning(message, params);
        }

        if (this.enableLoggingToFiles) {
            this.logToFile('warning', message, params, channel);
        }
    }

    /**
     * Log error message
     */
    public error(message: string, params: any = null, channel?: string | undefined): void {
        if (this.enableLoggingToConsole) {
            this.repository.error(message, params);
        }

        if (this.enableLoggingToFiles) {
            this.logToFile('error', message, params, channel);
        }
    }

    /**
     * Log critical message
     */
    public critical(message: string, params: any = null, channel?: string | undefined): void {
        if (this.enableLoggingToConsole) {
            this.repository.critical(message, params);
        }

        if (this.enableLoggingToFiles) {
            this.logToFile('critical', message, params, channel);
        }
    }

    /**
     * Log to file if enabled
     */
    private logToFile(level: 'debug' | 'info' | 'warning' | 'error' | 'critical', message: string, params: any = null, channel?: string | undefined) {
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
