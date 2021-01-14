import Exception from '../Exception';
import Response from '../../Types/Response';

export default class MigrationDoesNotExistsOnFilesystemException extends Exception {

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
            code: 106,
            message: exception.message,
            data: null
        };

        // Return response
        return response;
    }
}
