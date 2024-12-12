import ExceptionResponse from '../../Types/ExceptionResponse';
import Exception from '../Exception';

export default class DatabaseMigrationsNotSupported extends Exception {
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
            message: exception.message,
            data: null,
        };
        return response;
    }
}
