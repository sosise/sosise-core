import dayjs from 'dayjs';
import { inspect } from 'util';

export default class Helper {
    /**
     * Check if given date is not null, casts to date format
     * @return YYYY-MM-DD
     */
    public static parseDate(date: string): string | null {
        if (date === null || date.toString().trim() === '') {
            return null;
        }

        return dayjs(date).format('YYYY-MM-DD');
    }

    /**
     * Check if given date time is not null, casts to date time format
     * @return YYYY-MM-DD HH:mm:ss
     */
    public static parseDateTime(date: string): string | null {
        if (date === null || date.toString().trim() === '') {
            return null;
        }

        return dayjs(date).format('YYYY-MM-DD HH:mm:ss');
    }

    /**
     * Get current date time
     * @return YYYY-MM-DD HH:mm:ss
     */
    public static getCurrentDateTime(): string {
        return dayjs().format('YYYY-MM-DD HH:mm:ss');
    }

    /**
     * Die and dump
     */
    public static dd(...params: any): void {
        if (params.length === 1) {
            params = params[0];
        } else if (params.length === 0) {
            params = undefined;
        }

        console.log(inspect(params, {
            depth: null,
            maxArrayLength: null,
            colors: true
        }));
        process.exit(0);
    }

    /**
     * Dump
     */
    public static dump(...params: any): void {
        if (params.length === 1) {
            params = params[0];
        } else if (params.length === 0) {
            params = undefined;
        }

        console.log(inspect(params, {
            depth: null,
            maxArrayLength: null,
            colors: true
        }));
    }

    /**
     * Sleep amount of milliseconds
     */
    public static sleep(milliseconds: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, milliseconds));
    }

    /**
     * Path to the project with ending slash
     * @return e.g. /tmp/myproject/
     */
    public static projectPath(): string {
        return process.cwd() + '/';
    }

    /**
     * Path to the storage with ending slash
     * @return e.g. /tmp/myproject/storage/
     */
    public static storagePath(): string {
        return process.cwd() + '/storage/';
    }

    /**
     * Pluck fields from object or from array of objects
     * @return object or array with needed fields
     *
     * @example
     * Helper.pluckMany([{name: 'alex', age: 10}, {name: 'sharon', age: 11}], ['age']) -> [{age: 10}, {age: 11}]
     *
     * @example
     * Helper.pluckMany({name: 'igor', age: 33, birthday: 'foobar'}, ['age', 'birthday']) -> {age: 33, birthday: 'foobar'}
     */
    public static pluckMany(collection: unknown, fields: string[]): unknown {
        if (collection instanceof Array) {
            const result: any[] = [];
            for (const element of collection) {
                const tmp: any = {};
                for (const field of fields) {
                    if (element[field] !== undefined) {
                        tmp[field] = element[field];
                    }
                }
                result.push(tmp);
            }
            return result;
        }

        if (collection instanceof Object) {
            const result: any = {};
            for (const field of fields) {
                if (collection[field] !== undefined) {
                    result[field] = collection[field];
                }
            }
            return result;
        }
    }

    /**
     * Start profiling
     * Creates a time measurement label
     */
    public static timeMeasurementLabel = 1;
    public static startProfiling() {
        console.time(Helper.timeMeasurementLabel.toString());
    }

    /**
     * Stop profiling
     * Displays past time after last startProfiling method call
     */
    public static stopProfiling() {
        console.timeEnd(Helper.timeMeasurementLabel.toString());
        Helper.timeMeasurementLabel++;
    }

    /**
     * Paginate any array with data
     * @return part of array on specific page and size
     */
    public static paginateArray(data: any[], page: number, pageSize: number): any[] {
        return data.slice((page - 1) * pageSize, page * pageSize);
    }

    /**
     * Assemble pagination
     * @return pagination object
     */
    public static assemblePagination(data: any[], page: number, pageSize: number): { page: number, pageSize: number, totalPages: number, totalElements: number } {
        // Create pagination object
        const pagination: { page: number, pageSize: number, totalPages: number, totalElements: number } = {
            page,
            pageSize,
            totalPages: Math.ceil(data.length / pageSize),
            totalElements: data.length
        };

        // Return
        return pagination;
    }
}
