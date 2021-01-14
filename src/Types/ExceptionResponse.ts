export default interface ExceptionResponse {
    code: number;
    httpCode?: number;
    message: string;
    data: any;
}
