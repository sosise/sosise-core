export default interface CacheRepositoryInterface {
    /**
     * Get cache item
     */
    get(key: string): Promise<any | undefined>;

    /**
     * Get cache item and delete it from cache immediately
     */
    pull(key: string): Promise<any | undefined>;

    /**
     * Put data into cache for certain time
     */
    put(key: string, data: any, ttlInSeconds?: number): Promise<void>;

    /**
     * Put data into cache forever
     */
    putForever(key: string, data: any): Promise<void>;

    /**
     * Check whether the key exists in the cache
     */
    has(key: string): Promise<boolean>;

    /**
     * Get cache keys
     */
    keys(regex?: RegExp): Promise<string[]>;

    /**
     * Delete item from the cache
     */
    delete(key: string): Promise<void>;

    /**
     * Delete items from the cache
     */
    deleteMany(keys: string[]): Promise<void>;

    /**
     * Clear the entire cache
     */
    flush(): Promise<void>;

    /**
     * Get all cache keys with expiration timestamps
     */
    getAllCacheKeysWithTimestamps(): Promise<{ key: string, expiresAtTimestamp: number }[]>;
}
