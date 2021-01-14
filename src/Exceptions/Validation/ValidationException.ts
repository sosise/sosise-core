import ExceptionResponse from '../../Types/ExceptionResponse';
import Exception from '../Exception';

export default class ValidationException extends Exception {

    public validationErrors: string[];

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
            code: 2006,
            httpCode: 422,
            message: exception.message,
            data: this.validationErrors
        };
        return response;
    }
}
