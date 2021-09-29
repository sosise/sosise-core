import Exception from '../Exception';
import ExceptionResponse from '../../Types/ExceptionResponse';

export default class DatabaseMigrationsNotSupported extends Exception {
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
            message: exception.message,
            data: null
        };
        return response;
    }
}
