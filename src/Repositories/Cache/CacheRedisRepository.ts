import RedisException from "../../Exceptions/Cache/RedisException";
import CacheRepositoryInterface from "./CacheRepositoryInterface";
import { RedisClient, createClient } from 'redis';
import { promisify } from 'util';

export default class CacheRedisRepository implements CacheRepositoryInterface {

    private cacheConfig: any;
    private cacheInstance: RedisClient;
    private getAsync: any;
    private setAsync: any;
    private expireAsync: any;
    private delAsync: any;
    private existsAsync: any;
    private keysAsync: any;
    private flushdbAsync: any;

    /**
     * Constructor
     */
    constructor(cacheConfig: any) {
        this.cacheConfig = cacheConfig;
        this.cacheInstance = createClient({
            host: this.cacheConfig.driverConfiguration.redis.host,
            port: this.cacheConfig.driverConfiguration.redis.port,
        });
        this.cacheInstance.on('error', (err) => {
            throw new RedisException(`Redis connection error! Error: ${err}`);
        });

        // Create promise wrappers for the set and get functions
        this.setAsync = promisify(this.cacheInstance.set).bind(this.cacheInstance);
        this.getAsync = promisify(this.cacheInstance.get).bind(this.cacheInstance);
        this.expireAsync = promisify(this.cacheInstance.expire).bind(this.cacheInstance);
        this.delAsync = promisify(this.cacheInstance.del).bind(this.cacheInstance);
        this.existsAsync = promisify(this.cacheInstance.exists).bind(this.cacheInstance);
        this.keysAsync = promisify(this.cacheInstance.keys).bind(this.cacheInstance);
        this.flushdbAsync = promisify(this.cacheInstance.flushdb).bind(this.cacheInstance);
    }

    /**
     * Get cache item
     */
    public async get(key: string): Promise<any | undefined> {
        // Get cached value
        const value = await this.getAsync(key);

        // In case cache not found
        if (value === null) {
            return undefined;
        }

        // Return
        return value;
    }

    /**
     * Get cache item and delete it from cache immediately
     */
    public async pull(key: string): Promise<any | undefined> {
        // Get cached value
        const value = await this.getAsync(key);

        // In case cache not found
        if (value === null) {
            return undefined;
        }

        // Delete cache by key
        await this.delAsync(key);

        // Return
        return value;
    }

    /**
     * Put data into cache for certain time
     */
    public async put(key: string, data: any, ttlInSeconds?: number): Promise<void> {
        // Set cache key
        await this.setAsync(key, data);

        // Get ttl
        const ttl = (!ttlInSeconds ? this.cacheConfig.defaultTTLInSeconds : ttlInSeconds);

        // Set cache ttl
        await this.expireAsync(key, ttl);
    }

    /**
     * Put data into cache forever
     */
    public putForever(key: string, data: any): Promise<void> {
        // Set cache key
        return this.setAsync(key, data);
    }

    /**
     * Check whether the key exists in the cache
     */
    public async has(key: string): Promise<boolean> {
        // Check if key exists
        const exists = await this.existsAsync(key);

        // In case redis returns zero
        if (exists === 0) {
            return false;
        }

        // Otherwise
        return true;
    }

    /**
     * Get cache keys
     */
    public async keys(regex: RegExp): Promise<string[]> {
        // First of all get all keys
        const allKeys = await this.keysAsync('*');

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
        return this.delAsync(key);
    }

    /**
     * Delete items from the cache
     */
    public async deleteMany(keys: string[]): Promise<void> {
        for (const key of keys) {
            await this.delAsync(key);
        }
    }

    /**
     * Clear the entire cache
     */
    public async flush(): Promise<void> {
        return this.flushdbAsync();
    }

    /**
     * Get all cache keys with timestamps
     */
    public async getAllCacheKeysWithTimestamps(): Promise<{ key: string, expiresAtTimestamp: number }[]> {
        // Not applicable for redis cache, since this method is only needed for cache expiration, which node-cache does out of the box
        return [];
    }
}
