export default interface HttpResponse {
    code: number;
    httpCode?: number;
    message: string;
    data: any;
}
