import { createClient, RedisClientType } from "redis";
import CacheException from "../../Exceptions/Cache/CacheException";
import RedisException from "../../Exceptions/Cache/RedisException";
import CacheRepositoryInterface from "./CacheRepositoryInterface";

export default class CacheRedisRepository implements CacheRepositoryInterface {

    private cacheConfig: any;
    private cacheInstance: RedisClientType;

    /**
     * Constructor
     */
    constructor(cacheConfig: any) {
        this.cacheConfig = cacheConfig;
        this.cacheInstance = createClient({
            url: `redis://${this.cacheConfig.driverConfiguration.redis.host}:${this.cacheConfig.driverConfiguration.redis.port}`,
        });

        this.cacheInstance.on('error', (err) => {
            throw new RedisException(`Redis connection error! Error: ${err}`);
        });

        // Connect to Redis
        this.cacheInstance.connect().catch((err) => {
            throw new RedisException(`Failed to connect to Redis! Error: ${err}`);
        });
    }

    /**
     * Get cache item
     */
    public async get(key: string): Promise<any | undefined> {
        const value = await this.cacheInstance.get(key);

        if (value === null) {
            return undefined;
        }

        return JSON.parse(value);
    }

    /**
     * Get multiple cache items by multiple keys
     */
    public async getMany(keys: string[]): Promise<any[]> {
        const values = await this.cacheInstance.mGet(keys);

        // Map Redis values: parse JSON if value exists, replace null with undefined for missing keys
        return values.map(value => value === null ? undefined : JSON.parse(value));
    }

    /**
     * Get cache item and delete it from cache immediately
     */
    public async pull(key: string): Promise<any | undefined> {
        const value = await this.cacheInstance.get(key);

        if (value === null) {
            return undefined;
        }

        await this.cacheInstance.del(key);
        return JSON.parse(value);
    }

    /**
     * Put data into cache for certain time
     */
    public async put(key: string, data: any, ttlInSeconds?: number): Promise<void> {
        const ttl = ttlInSeconds || this.cacheConfig.defaultTTLInSeconds;
        await this.cacheInstance.set(key, JSON.stringify(data), { EX: ttl });
    }

    /**
     * Put multiple key-value pairs into cache for certain time
     */
    public async putMany(data: { key: string, value: any }[], ttlInSeconds?: number): Promise<void> {
        // Create pipeline
        const pipeline = this.cacheInstance.multi();

        // Add all keys and values to the Redis pipeline
        for (const { key, value } of data) {
            const ttl = ttlInSeconds || this.cacheConfig.defaultTTLInSeconds;
            pipeline.set(key, JSON.stringify(value), { EX: ttl });
        }

        // Execute the pipeline
        await pipeline.exec();
    }

    /**
     * Put data into cache forever
     */
    public async putForever(key: string, data: any): Promise<void> {
        await this.cacheInstance.set(key, JSON.stringify(data));
    }

    /**
     * Check whether the key exists in the cache
     */
    public async has(key: string): Promise<boolean> {
        const exists = await this.cacheInstance.exists(key);

        return exists === 1;
    }

    /**
     * Get cache keys
     */
    public async keys(regex?: RegExp): Promise<string[]> {
        // Get all keys from Redis
        const allKeys = await this.cacheInstance.keys('*');

        // If no regex is provided, return all keys
        if (!regex) {
            return allKeys;
        }

        // Filter keys based on the provided regex
        const filteredKeys = allKeys.filter(key => regex.test(key));

        return filteredKeys;
    }

    /**
     * Remove item from the cache
     */
    public async delete(key: string): Promise<void> {
        await this.cacheInstance.del(key);
    }

    /**
     * Delete items from the cache
     */
    public async deleteMany(keys: string[]): Promise<void> {
        if (keys.length > 0) {
            await this.cacheInstance.del(keys);
        }
    }

    /**
     * Clear the entire cache
     */
    public async flush(): Promise<void> {
        await this.cacheInstance.flushDb();
    }

    /**
     * Get all cache keys with timestamps
     */
    public async getAllCacheKeysWithTimestamps(): Promise<{ key: string, expiresAtTimestamp: number }[]> {
        throw new CacheException(`Not applicable for redis cache`);
    }
}
