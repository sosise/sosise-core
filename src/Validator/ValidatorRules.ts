import Validator from './Validator';

export default class ValidatorRules {
    private validator: Validator;
    private paramName: string;

    /**
     * Constructor
     */
    constructor(validator: Validator, paramName: string) {
        this.validator = validator;
        this.paramName = paramName;
    }

    /**
     * Ensures the parameter is present and not undefined.
     */
    public required(customErrorMessage?: string): this {
        const value = this.validator.value[this.paramName];
        if (value === undefined) {
            this.setError(`The ${this.paramName} field is required.`, customErrorMessage);
        }
        return this;
    }

    /**
     * A placeholder for future validation that may be conditionally applied.
     */
    public sometimes(): this {
        return this;
    }

    /**
     * Validates the minimum value or length of the parameter.
     * Supports strings, numbers, and arrays.
     */
    public min(num: number, customErrorMessage?: string): this {
        const value = this.validator.value[this.paramName];
        if (typeof value === 'string' && value.length < num) {
            this.setError(`The ${this.paramName} string must be at least ${num} characters long.`, customErrorMessage);
        } else if (typeof value === 'number' && value < num) {
            this.setError(`The ${this.paramName} number must be at least ${num}.`, customErrorMessage);
        } else if (Array.isArray(value) && value.length < num) {
            this.setError(`The ${this.paramName} array must contain at least ${num} element(s).`, customErrorMessage);
        }
        return this;
    }

    /**
     * Validates the maximum value or length of the parameter.
     * Supports strings, numbers, and arrays.
     */
    public max(num: number, customErrorMessage?: string): this {
        const value = this.validator.value[this.paramName];
        if (typeof value === 'string' && value.length > num) {
            this.setError(`The ${this.paramName} string must be maximum ${num} characters long.`, customErrorMessage);
        } else if (typeof value === 'number' && value > num) {
            this.setError(`The ${this.paramName} number must be maximum ${num}.`, customErrorMessage);
        } else if (Array.isArray(value) && value.length > num) {
            this.setError(`The ${this.paramName} array must contain maximum ${num} element(s).`, customErrorMessage);
        }
        return this;
    }

    /**
     * Ensures the parameter is not null.
     */
    public notNullable(customErrorMessage?: string): this {
        const value = this.validator.value[this.paramName];
        if (value === null) {
            this.setError(`The ${this.paramName} field cannot be null.`, customErrorMessage);
        }
        return this;
    }

    /**
     * Checks if the parameter value is of type string.
     */
    public shouldBeString(customErrorMessage?: string): this {
        const value = this.validator.value[this.paramName];
        if (value !== undefined && typeof value !== 'string') {
            this.setError(`The ${this.paramName} field must be a string.`, customErrorMessage);
        }
        return this;
    }

    /**
     * Checks if the parameter value is of type string or null
     */
    public shouldBeStringOrNull(customErrorMessage?: string): this {
        const value = this.validator.value[this.paramName];
        if (value !== undefined && value !== null && typeof value !== 'string') {
            this.setError(`The ${this.paramName} field must be a string or null.`, customErrorMessage);
        }
        return this;
    }

    /**
     * Checks if the parameter value is of type number
     */
    public shouldBeNumber(customErrorMessage?: string): this {
        const value = this.validator.value[this.paramName];
        if (value !== undefined && typeof value !== 'number') {
            this.setError(`The ${this.paramName} field must be a number.`, customErrorMessage);
        }
        return this;
    }

    /**
     * Checks if the parameter value is of type number or null
     */
    public shouldBeNumberOrNull(customErrorMessage?: string): this {
        const value = this.validator.value[this.paramName];
        if (value !== undefined && value !== null && typeof value !== 'number') {
            this.setError(`The ${this.paramName} field must be a number or null.`, customErrorMessage);
        }
        return this;
    }

    /**
     * Checks if the parameter value is of type boolean.
     */
    public shouldBeBoolean(customErrorMessage?: string): this {
        const value = this.validator.value[this.paramName];
        if (value !== undefined && typeof value !== 'boolean') {
            this.setError(`The ${this.paramName} field must be a boolean.`, customErrorMessage);
        }
        return this;
    }

    /**
     * Checks if the parameter value is of type boolean or null
     */
    public shouldBeBooleanOrNull(customErrorMessage?: string): this {
        const value = this.validator.value[this.paramName];
        if (value !== undefined && value !== null && typeof value !== 'boolean') {
            this.setError(`The ${this.paramName} field must be a boolean or null.`, customErrorMessage);
        }
        return this;
    }

    /**
     * Checks if the parameter value is an array.
     */
    public shouldBeArray(customErrorMessage?: string): this {
        const value = this.validator.value[this.paramName];
        if (value !== undefined && !Array.isArray(value)) {
            this.setError(`The ${this.paramName} field must be an array.`, customErrorMessage);
        }
        return this;
    }

    /**
     * Checks if the parameter value is an object (and not null or an array).
     */
    public shouldBeObject(customErrorMessage?: string): this {
        const value = this.validator.value[this.paramName];
        if (value !== undefined && (typeof value !== 'object' || value === null || Array.isArray(value))) {
            this.setError(`The ${this.paramName} field must be an object.`, customErrorMessage);
        }
        return this;
    }

    /**
     * Validates a single nested object using provided validation rules.
     */
    public validateObject(validationRules: (validator: Validator) => void): this {
        const value = this.validator.value[this.paramName];

        // Validate an object
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            const childValidator = new Validator(value as { [key: string]: unknown });
            validationRules(childValidator);
            this.mergeErrors(childValidator);
        }

        return this;
    }

    /**
     * Validates each object in an array of objects using provided validation rules.
     */
    public validateArrayOfObjects(validationRules: (validator: Validator) => void): this {
        const value = this.validator.value[this.paramName];

        // Validate each object in an array
        if (Array.isArray(value)) {
            value.forEach((obj, index) => {
                if (typeof obj === 'object' && obj !== null) {
                    const childValidator = new Validator(obj as { [key: string]: unknown });
                    validationRules(childValidator);
                    this.mergeErrors(childValidator, index);
                }
            });
        }

        return this;
    }

    /**
     * Validates each value to be a string in an array of strings
     */
    public validateArrayOfStrings(customErrorMessage?: string): this {
        const value = this.validator.value[this.paramName];
        if (Array.isArray(value)) {
            value.forEach((val, index) => {
                if (typeof val !== 'string') {
                    this.setError(`The ${this.paramName} array ${index}.element must be a string.`, customErrorMessage);
                }
            });
        }
        return this;
    }

    /**
     * Validates each value to be a string in an array of strings
     */
    public validateArrayOfNumbers(customErrorMessage?: string): this {
        const value = this.validator.value[this.paramName];
        if (Array.isArray(value)) {
            value.forEach((val, index) => {
                if (typeof val !== 'number') {
                    this.setError(`The ${this.paramName} array ${index}.element must be a number.`, customErrorMessage);
                }
            });
        }
        return this;
    }

    /**
     * Validates a value to ensure it is a valid email address.
     * Uses a regular expression to check the format of the value.
     */
    public email(customErrorMessage?: string): this {
        const value = this.validator.value[this.paramName];
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (typeof value === 'string' && !regex.test(value)) {
            this.setError(`The ${this.paramName} field must be a valid email address.`, customErrorMessage);
        }
        return this;
    }

    /**
     * Validates a value to ensure it is a valid email address or null.
     * Uses a regular expression to check the format of the value.
     */
    public emailOrNull(customErrorMessage?: string): this {
        const value = this.validator.value[this.paramName];
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (typeof value === 'string' && value !== null && !regex.test(value)) {
            this.setError(`The ${this.paramName} field must be a valid email address or null.`, customErrorMessage);
        }
        return this;
    }

    /**
     * Validates that the value is within a predefined list of values.
     */
    public inList(values: any[], customErrorMessage?: string): this {
        const value = this.validator.value[this.paramName];
        if (value !== undefined && !values.includes(value)) {
            this.setError(`The ${this.paramName} field must be one of the following values: ${values.join(', ')}.`, customErrorMessage);
        }
        return this;
    }

    /**
     * Validates the value against a custom regular expression pattern.
     */
    public regex(pattern: RegExp, customErrorMessage?: string): this {
        const value = this.validator.value[this.paramName];
        if (value !== undefined && typeof value === 'string' && !pattern.test(value)) {
            this.setError(`The ${this.paramName} field fails to match the required pattern: "${pattern}".`, customErrorMessage);
        }
        return this;
    }

    /**
     * Validates that the value of the current field is different from another field's value.
     */
    public different(otherParamName: string, customErrorMessage?: string): this {
        const currentValue = this.validator.value[this.paramName];
        const otherValue = this.validator.value[otherParamName];
        if (currentValue !== undefined || otherValue !== undefined) {
            if (currentValue === otherValue) {
                this.setError(`The ${this.paramName} field must be different from the ${otherParamName} field.`, customErrorMessage);
            }
        }
        return this;
    }

    /**
     * Validates that the value is one of the enum's values.
     * Useful for ensuring a value matches one of the predefined options in an enumeration.
     */
    public enum(enumObject: object, customErrorMessage?: string): this {
        const value = this.validator.value[this.paramName];
        if (value !== undefined) {
            const enumValues = Object.values(enumObject);
            if (!enumValues.includes(value)) {
                this.setError(`The ${this.paramName} field must be one of the enum values: ${enumValues.join(', ')}.`, customErrorMessage);
            }
        }
        return this;
    }

    /**
     * Allows for custom validation logic defined by the user.
     * The custom function provided should return true if the value passes the validation,
     * and false otherwise. An optional custom error message can be provided.
     */
    public customValidation(validationFunction: (value: any) => boolean, customErrorMessage?: string): this {
        const value = this.validator.value[this.paramName];
        if (!validationFunction(value)) {
            this.setError(`The ${this.paramName} field fails the custom validation.`, customErrorMessage);
        }
        return this;
    }

    /**
     * Merges errors from a child validator into the current validator, optionally with an index for array elements.
     */
    private mergeErrors(childValidator: Validator, index?: number): void {
        childValidator.errors.forEach((error) => {
            const indexedError = typeof index === 'number' ? `Item ${index + 1}: ${error}` : error;
            this.validator.setError(indexedError);
        });
    }

    /**
     * Sets an error message in the validator, allowing for an optional custom error message.
     */
    private setError(defaultErrorMessage: string, customErrorMessage?: string): void {
        if (customErrorMessage) {
            const msg = customErrorMessage.replace(':paramName', this.paramName);
            this.validator.setError(msg);
        } else {
            this.validator.setError(defaultErrorMessage);
        }
    }
}
