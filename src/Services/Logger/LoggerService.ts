import LoggerRepositoryInterface from '../../Repositories/Logger/LoggerRepositoryInterface';

export default class LoggerService {

    private repository: LoggerRepositoryInterface;

    /**
     * Constructor
     */
    constructor(repository: LoggerRepositoryInterface) {
        this.repository = repository;
    }

    /**
     * Log info message
     */
    public info(message: string, params: any = null): void {
        this.repository.info(message, params);
    }

    /**
     * Log warning message
     */
    public warning(message: string, params: any = null): void {
        this.repository.warning(message, params);
    }

    /**
     * Log error message
     */
    public error(message: string, params: any = null): void {
        this.repository.error(message, params);
    }
}