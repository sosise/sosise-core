import ExceptionResponse from '../../Types/ExceptionResponse';
import Exception from '../Exception';

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
            code: 2001,
            message: this.message,
            data: {
                stack: exception.stack!.split('\n')
            }
        };
        return response;
    }
}
