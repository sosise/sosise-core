export default class Exception extends Error {
    public message: string;

    /**
     * Constructor
     */
    constructor(message: string) {
        super(message);
        this.message = message;
    }
}
