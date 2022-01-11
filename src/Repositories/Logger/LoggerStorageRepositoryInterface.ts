export default interface LoggerStorageRepositoryInterface {
    /**
     * Log debug message
     */
    debug(message: string, params: any, channel: string | undefined): void;

    /**
     * Log info message
     */
    info(message: string, params: any, channel: string | undefined): void;

    /**
     * Log warning message
     */
    warning(message: string, params: any, channel: string | undefined): void;

    /**
     * Log error message
     */
    error(message: string, params: any, channel: string | undefined): void;

    /**
     * Log critical message
     */
    critical(message: string, params: any, channel: string | undefined): void;
}
