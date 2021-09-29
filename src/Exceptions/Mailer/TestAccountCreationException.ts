import Exception from '../Exception';
import ExceptionResponse from '../../Types/ExceptionResponse';

export default class TestAccountCreationException extends Exception {

    protected httpCode = 500;
    protected code = 3003;

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
