import ExceptionResponse from '../../Types/ExceptionResponse';
import Exception from '../Exception';

export default class IOCMakeException extends Exception {

    public className: string;
    protected httpCode = 500;
    protected code = 3001;

    /**
     * Constructor
     */
    constructor(message: string, className: string) {
        super(message);
        this.className = className;
    }

    /**
     * Handle exception
     */
    public handle(exception: this): ExceptionResponse {
        const response: ExceptionResponse = {
            code: this.code,
            httpCode: this.httpCode,
            message: exception.message,
            data: {
                classToResolve: this.className
            }
        };
        return response;
    }
}
