import ExceptionResponse from "../../Types/ExceptionResponse";
import Exception from "../Exception";

export default class FakeMailSendingException extends Exception {

    // HTTP Code of the response with this exception
    protected httpCode = 500;

    // Error code which is rendered in the response
    protected code = 2005;

    // If set to false no exception will be sent to sentry
    protected sendToSentry = true;

    // In which logging channel should this exception be logged, see src/config/logging.ts
    protected loggingChannel = 'default';

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
            code: exception.code,
            httpCode: exception.httpCode,
            message: exception.message,
            data: null
        };
        return response;
    }
}
