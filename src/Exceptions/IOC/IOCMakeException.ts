import Exception from '../Exception';
import HttpResponse from '../../Types/HttpResponse';

export default class IOCMakeException extends Exception {

    public className: string;

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
    public handle(exception: this): HttpResponse {
        // Prepare response
        const httpResponse: HttpResponse = {
            code: 103,
            message: exception.message,
            data: {
                classToResolve: this.name
            }
        };

        // Return response
        return httpResponse;
    }
}
