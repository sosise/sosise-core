import Exception from '../Exception';
import HttpResponse from '../../Types/HttpResponse';

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
    public handle(exception: this): HttpResponse {
        // Prepare response
        const httpResponse: HttpResponse = {
            code: 104,
            message: exception.message,
            data: this.validationErrors
        };

        // Return response
        return httpResponse;
    }
}
