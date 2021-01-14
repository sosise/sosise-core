import Exception from '../Exception';
import Response from '../../Types/Response';

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
    public handle(exception: this): Response {
        // Prepare response
        const response: Response = {
            code: 104,
            message: exception.message,
            data: this.validationErrors
        };

        // Return response
        return response;
    }
}
