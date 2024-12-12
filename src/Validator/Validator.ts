import ValidatorRules from './ValidatorRules';

export default class Validator {
    public value: { [key: string]: unknown };
    public errors: string[] = [];

    /**
     * Constructor
     */
    constructor(value: { [key: string]: unknown }) {
        this.value = value;
    }

    /**
     * Initiates validation rules for a specific field in the value object.
     */
    public field(paramName: string): ValidatorRules {
        return new ValidatorRules(this, paramName);
    }

    /**
     * Adds an error message to the validator's list of errors.
     */
    public setError(message: string): void {
        this.errors.push(message);
    }

    /**
     * Determines whether the validation has failed, based on the presence of errors.
     */
    public fails(): boolean {
        return this.errors.length > 0;
    }
}
