import Exception from '../Exception';
import HttpResponse from '../../Types/HttpResponse';

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
    public handle(exception: this): HttpResponse {
        // Prepare response
        const httpResponse: HttpResponse = {
            code: 101,
            message: this.message,
            data: {
                stack: exception.stack!.split('\n')
            }
        };

        // Return response
        return httpResponse;
    }
}
