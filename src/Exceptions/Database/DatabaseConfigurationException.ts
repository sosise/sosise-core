import Exception from '../Exception';
import ExceptionResponse from '../../Types/ExceptionResponse';

export default class DatabaseConfigurationException extends Exception {

    public connectionName: string;
    protected httpCode = 500;
    protected code = 3000;

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
            code: this.code,
            httpCode: this.httpCode,
            message: exception.message,
            data: {
                connectionName: this.connectionName
            }
        };
        return response;
    }
}
