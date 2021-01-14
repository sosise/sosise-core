import Exception from "../Exception";
import HttpResponse from '../../Types/HttpResponse';

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
    public handle(exception: this): HttpResponse {
        // Prepare response
        const httpResponse: HttpResponse = {
            code: 102,
            message: exception.message,
            data: {
                connectionName: this.connectionName
            }
        };

        // Return response
        return httpResponse;
    }
}
