import colors from 'colors';
import dayjs from 'dayjs';
import { inspect } from 'util';
import LoggerRepositoryInterface from './LoggerRepositoryInterface';

export default class LoggerPrettyConsoleRepository implements LoggerRepositoryInterface {
    /**
     * Log info message
     */
    public debug(message: string, params: any): void {
        console.log(this.makePrettyString('debug', message, params));
    }

    /**
     * Log info message
     */
    public info(message: string, params: any): void {
        console.log(this.makePrettyString('info', message, params));
    }

    /**
     * Log warning message
     */
    public warning(message: string, params: any): void {
        console.log(this.makePrettyString('warning', message, params));
    }

    /**
     * Log error message
     */
    public error(message: string, params: any): void {
        console.log(this.makePrettyString('error', message, params));
    }

    /**
     * Log critical message
     */
    public critical(message: string, params: any): void {
        console.log(this.makePrettyString('critical', message, params));
    }

    /**
     * Compose and return a pretty string for logger
     */
    private makePrettyString(
        level: 'debug' | 'info' | 'warning' | 'error' | 'critical',
        message: string,
        params: any = null,
    ): string {
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
        const paramsString =
            params !== null ? inspect(params, { depth: null, maxArrayLength: null, colors: false }) : null;

        // Prepare a string
        const outputString: string = `${colors.dim(dayjs().format('YYYY-MM-DD HH:mm:ss'))} ${levelString} ${message} ${paramsString !== null ? colors.cyan(paramsString) : ''}`;

        // Return a composed string
        return outputString;
    }
}
