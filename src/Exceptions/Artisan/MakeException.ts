import Exception from '../Exception';
import Response from '../../Types/Response';

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
    public handle(exception: this): Response {
        // Prepare response
        const response: Response = {
            code: 101,
            message: this.message,
            data: {
                stack: exception.stack!.split('\n')
            }
        };

        // Return response
        return response;
    }
}
