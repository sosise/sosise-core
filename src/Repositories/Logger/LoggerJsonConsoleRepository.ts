import dayjs from 'dayjs';
import LoggerRepositoryInterface from './LoggerRepositoryInterface';

export default class LoggerJsonConsoleRepository implements LoggerRepositoryInterface {
    /**
     * Log debug message
     */
    public debug(message: string, params: any): void {
        const output: any = {
            level: 5,
            logLevel: 'debug',
            timestamp: dayjs().unix(),
            message,
            ...params
        };
        console.log(JSON.stringify(output));
    }

    /**
     * Log info message
     */
    public info(message: string, params: any): void {
        const output: any = {
            level: 4,
            logLevel: 'info',
            timestamp: dayjs().unix(),
            message,
            ...params
        };
        console.log(JSON.stringify(output));
    }

    /**
     * Log warning message
     */
    public warning(message: string, params: any): void {
        const output: any = {
            level: 3,
            logLevel: 'warning',
            timestamp: dayjs().unix(),
            message,
            ...params
        };
        console.log(JSON.stringify(output));
    }

    /**
     * Log error message
     */
    public error(message: string, params: any): void {
        const output: any = {
            level: 2,
            logLevel: 'error',
            timestamp: dayjs().unix(),
            message,
            ...params
        };
        console.log(JSON.stringify(output));
    }

    /**
     * Log error message
     */
    public critical(message: string, params: any): void {
        const output: any = {
            level: 1,
            logLevel: 'critical',
            timestamp: dayjs().unix(),
            message,
            ...params
        };
        console.log(JSON.stringify(output));
    }
}
