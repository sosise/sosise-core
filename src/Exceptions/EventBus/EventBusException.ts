import Exception from '../Exception';

export default class EventBusException extends Exception {
    /**
     * Constructor
     */
    constructor(message: string, driver?: string) {
        let fullMessage = message;
        if (driver) {
            fullMessage = `[EventBus Driver: ${driver}] ${message}`;
        }
        super(fullMessage);
    }
}
