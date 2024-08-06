import ExceptionResponse from "../../Types/ExceptionResponse";
import Exception from "../Exception";

export default class IOCMakeException extends Exception {

    // Class name which could't be found in the IOC
    public className: string;

    // HTTP Code of the response with this exception
    protected httpCode = 500;

    // Error code which is rendered in the response
    protected code = 2001;

    // If set to false no exception will be sent to sentry
    protected sendToSentry = true;

    // In which logging channel should this exception be logged, see src/config/logging.ts
    protected loggingChannel = 'default';

    /**
     * Constructor
     */
    constructor(message: string, className: string) {
        super(message);
        this.className = className;
    }

    /**
     * Handle exception
     */
    public handle(exception: this): ExceptionResponse {
        const response: ExceptionResponse = {
            code: exception.code,
            httpCode: exception.httpCode,
            message: exception.message,
            data: {
                classToResolve: exception.className
            }
        };
        return response;
    }
}
