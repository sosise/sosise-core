import Exception from '../Exception';
import Response from '../../Types/Response';

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
    public handle(exception: this): Response {
        // Prepare response
        const response: Response = {
            code: 105,
            message: exception.message,
            data: null
        };

        // Return response
        return response;
    }
}
