import NodeCache from "node-cache";
import CacheException from "../../Exceptions/Cache/CacheException";
import CacheRepositoryInterface from "./CacheRepositoryInterface";

export default class CacheMemoryRepository implements CacheRepositoryInterface {

    private cacheConfig: any;
    private cacheInstance: NodeCache;

    /**
     * Constructor
     */
    constructor(cacheConfig: any) {
        this.cacheConfig = cacheConfig;
        this.cacheInstance = new NodeCache({
            stdTTL: this.cacheConfig.defaultTTLInSeconds,
            checkperiod: this.cacheConfig.checkperiodInSeconds,
        });
    }

    /**
     * Get cache item
     */
    public async get(key: string): Promise<any | undefined> {
        // Get cache item
        const cache = this.cacheInstance.get(key);

        // Otherwise
        return cache;
    }

    /**
     * Get multiple cache items by multiple keys
     */
    public getMany(keys: string[]): Promise<any[] | undefined[]> {
        throw new CacheException(`Not implemented in cache memory repository`);
    }

    /**
     * Get cache item and delete it from cache immediately
     */
    public async pull(key: string): Promise<any | undefined> {
        // Get cache item
        const cache = this.cacheInstance.take(key);

        // Otherwise
        return cache;
    }

    /**
     * Put data into cache for certain time
     */
    public async put(key: string, data: any, ttlInSeconds?: number): Promise<void> {
        // When ttl in seconds is given
        if (ttlInSeconds) {
            this.cacheInstance.set(key, data, ttlInSeconds);
            return;
        }

        // Otherwise use default ttl
        this.cacheInstance.set(key, data);
    }

    /**
     * Put data into cache forever
     */
    public async putForever(key: string, data: any): Promise<void> {
        // 157680000seconds = 5 years
        this.cacheInstance.set(key, data, 157680000);
    }

    /**
     * Check whether the key exists in the cache
     */
    public async has(key: string): Promise<boolean> {
        return this.cacheInstance.has(key);
    }

    /**
     * Get cache keys
     */
    public async keys(regex: RegExp): Promise<string[]> {
        // First of all get all keys
        const allKeys = this.cacheInstance.keys();

        // In case regex is not given, return all keys
        if (!regex) {
            return allKeys;
        }

        // Otherwise we need to filter keys
        const filteredKeys = allKeys.filter(key => regex.test(key));

        // Return
        return filteredKeys;
    }

    /**
     * Remove item from the cache
     */
    public async delete(key: string): Promise<void> {
        this.cacheInstance.del(key);
    }

    /**
     * Delete items from the cache
     */
    public async deleteMany(keys: string[]): Promise<void> {
        this.cacheInstance.del(keys);
    }

    /**
     * Clear the entire cache
     */
    public async flush(): Promise<void> {
        this.cacheInstance.flushAll();
    }

    /**
     * Get all cache keys with timestamps
     */
    public async getAllCacheKeysWithTimestamps(): Promise<{ key: string, expiresAtTimestamp: number }[]> {
        throw new CacheException(`Not applicable for memory cache`);
    }
}
