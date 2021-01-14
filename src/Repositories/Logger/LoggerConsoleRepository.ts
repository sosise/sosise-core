import dayjs from 'dayjs';
import LoggerRepositoryInterface from './LoggerRepositoryInterface';

export default class LoggerConsoleRepository implements LoggerRepositoryInterface {
    /**
     * Log info message
     */
    public info(message: string, params: any): void {
        const output: any = {
            level: 1,
            verbosity: 'info',
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
            level: 1,
            verbosity: 'warning',
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
            level: 1,
            verbosity: 'error',
            timestamp: dayjs().unix(),
            message,
            ...params
        };
        console.log(JSON.stringify(output));
    }
}
