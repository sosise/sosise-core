import Exception from '../Exception';
import HttpResponse from '../../Types/HttpResponse';

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
    public handle(exception: this): HttpResponse {
        // Prepare response
        const httpResponse: HttpResponse = {
            code: 105,
            message: exception.message,
            data: null
        };

        // Return response
        return httpResponse;
    }
}
