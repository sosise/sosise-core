import ExceptionResponse from "../../Types/ExceptionResponse";
import Exception from "../Exception";

export default class ValidationException extends Exception {

    // Validation errors
    public validationErrors: string[];

    // HTTP Code of the response with this exception
    protected httpCode = 422;

    // Error code which is rendered in the response
    protected code = 2002;

    // If set to false no exception will be sent to sentry
    protected sendToSentry = true;

    // In which logging channel should this exception be logged, see src/config/logging.ts
    protected loggingChannel = 'default';

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
    public handle(exception: this): ExceptionResponse {
        const response: ExceptionResponse = {
            code: exception.code,
            httpCode: exception.httpCode,
            message: exception.message,
            data: exception.validationErrors
        };
        return response;
    }
}
