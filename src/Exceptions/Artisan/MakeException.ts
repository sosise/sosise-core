import Exception from '../Exception';
import ExceptionResponse from '../../Types/ExceptionResponse';

export default class MakeException extends Exception {
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
            message: this.message,
            data: {
                stack: exception.stack!.split('\n')
            }
        };
        return response;
    }
}
