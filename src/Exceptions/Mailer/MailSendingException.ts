import ExceptionResponse from '../../Types/ExceptionResponse';
import Exception from '../Exception';

export default class MailSendingException extends Exception {

    protected httpCode = 500;
    protected code = 3004;

    /**
     * Constructor
     */
    constructor(message: string) {
        super(message);
    }

    /**
     * Handle exception
     */
    public handle(exception: this): ExceptionResponse {
        const response: ExceptionResponse = {
            code: this.code,
            httpCode: this.httpCode,
            message: exception.message,
            data: null
        };
        return response;
    }
}
