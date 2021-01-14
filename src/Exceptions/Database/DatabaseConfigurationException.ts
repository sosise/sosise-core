import Exception from "../Exception";
import ExceptionResponse from "../../Types/ExceptionResponse";

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
    public handle(exception: this): ExceptionResponse {
        const response: ExceptionResponse = {
            code: 2002,
            message: exception.message,
            data: {
                connectionName: this.connectionName
            }
        };
        return response;
    }
}
