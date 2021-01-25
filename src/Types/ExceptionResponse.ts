export default interface ExceptionResponse {
    message: string;
    data: any;
    code?: number;
    httpCode?: number;
}
