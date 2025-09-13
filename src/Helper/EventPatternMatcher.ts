export default class EventPatternMatcher {
    /**
     * Check if a pattern contains wildcards
     */
    public static isWildcardPattern(pattern: string): boolean {
        return pattern.includes('*') || pattern.includes('?');
    }

    /**
     * Check if an event matches a wildcard pattern
     */
    public static matchesPattern(event: string, pattern: string): boolean {
        if (!this.isWildcardPattern(pattern)) {
            return event === pattern;
        }

        // Convert wildcard pattern to regex
        const regexPattern = pattern
            .split('.')
            .map((part) => {
                if (part === '*') return '[^.]+';
                if (part === '**') return '.*';
                return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            })
            .join('\\.');

        const regex = new RegExp(`^${regexPattern}$`);
        return regex.test(event);
    }

    /**
     * Find all patterns that match the given event
     */
    public static findMatchingPatterns(event: string, patterns: string[]): string[] {
        return patterns.filter((pattern) => this.matchesPattern(event, pattern));
    }
}
