export default class Exception extends Error {

    public message: string;
    public code: string;

    /**
     * Constructor
     */
    constructor(message: string, status?: number, code?: string) {
        super(message);
    }
}
