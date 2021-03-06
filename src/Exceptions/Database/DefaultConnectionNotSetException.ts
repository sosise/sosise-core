import ExceptionResponse from '../../Types/ExceptionResponse';
import Exception from '../Exception';

export default class DefaultConnectionNotSetException extends Exception {
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
