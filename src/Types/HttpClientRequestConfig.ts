import { AxiosRequestConfig } from 'axios';
import Exception from '../Exceptions/Exception';

export default interface HttpClientRequestConfig extends AxiosRequestConfig {
    returnInCaseOfStatusCodes?: {
        [key: number]: any;
    };
    defaultException?: new (message: string, httpCode: number, data: any) => Exception;
}
