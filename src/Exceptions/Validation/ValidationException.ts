import ExceptionResponse from '../../Types/ExceptionResponse';
import Exception from '../Exception';

export default class ValidationException extends Exception {

    public validationErrors: string[];
    protected httpCode = 422;
    protected code = 3002;

    /**
     * Constructor
     */
    constructor(message: string, validationErrors: string[]) {
        super(message);
        this.validationErrors = validationErrors;
    }

    /**
     * Handle exception
     */
    public handle(exception: this): ExceptionResponse {
        const response: ExceptionResponse = {
            code: this.httpCode,
            httpCode: this.httpCode,
            message: exception.message,
            data: this.validationErrors
        };
        return response;
    }
}
