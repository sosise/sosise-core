import Exception from "../Exception";
import Response from '../../Types/Response';

export default class DatabaseConfigurationException extends Exception {

    public connectionName: string;

    /**
     * Constructor
     */
    constructor(message: string, connectionName: string) {
        super(message);
        this.connectionName = connectionName;
    }

    /**
     * Handle exception
     */
    public handle(exception: this): Response {
        // Prepare response
        const response: Response = {
            code: 102,
            message: exception.message,
            data: {
                connectionName: this.connectionName
            }
        };

        // Return response
        return response;
    }
}
