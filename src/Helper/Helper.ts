import dayjs from 'dayjs';

export default class Helper {
    /**
     * Helper method which checks if given date is not null, casts to date format
     */
    public static parseDate(date: string): string | null {
        if (date === null || date.toString().trim() === '') {
            return null;
        }

        return dayjs(date).format('YYYY-MM-DD HH:mm:ss');
    }

    /**
     * Helper method which gets current date time
     */
    public static getCurrentDateTime(): string {
        return dayjs().format('YYYY-MM-DD HH:mm:ss');
    }
}
