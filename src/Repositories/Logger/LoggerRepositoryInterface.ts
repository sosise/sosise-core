export default interface LoggerRepositoryInterface {
    /**
     * Log debug message
     */
    debug(message: string, params: any): void;

    /**
     * Log info message
     */
    info(message: string, params: any): void;

    /**
     * Log warning message
     */
    warning(message: string, params: any): void;

    /**
     * Log error message
     */
    error(message: string, params: any): void;

    /**
     * Log critical message
     */
    critical(message: string, params: any): void;
}
