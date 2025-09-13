import { createClient, RedisClientType } from 'redis';
import CacheException from '../../Exceptions/Cache/CacheException';
import RedisException from '../../Exceptions/Cache/RedisException';
import CacheRepositoryInterface from './CacheRepositoryInterface';
import Helper from '../../Helper/Helper';
import IOC from '../../ServiceProviders/IOC';
import LoggerService from '../../Services/Logger/LoggerService';

export default class CacheRedisRepository implements CacheRepositoryInterface {
    private cacheConfig: any;
    private cacheInstance: RedisClientType;
    private isClientClosed: boolean = false;
    private connected: boolean = false;
    private reconnecting: boolean = false; // New flag to prevent multiple reconnects
    private logger: LoggerService;

    /**
     * Constructor
     */
    constructor(cacheConfig: any) {
        this.cacheConfig = cacheConfig;
        this.logger = IOC.makeSingleton(LoggerService) as LoggerService;
        this.initializeRedisClient();

        // Attempt initial connection
        this.connectToRedis();
    }

    /**
     * Initialize Redis client with reconnect strategy and event listeners
     */
    private initializeRedisClient() {
        this.cacheInstance = createClient({
            url: `redis://${this.cacheConfig.driverConfiguration.redis.host}:${this.cacheConfig.driverConfiguration.redis.port}`,
            socket: {
                reconnectStrategy: (retries) => {
                    this.logger.debug(`Reconnecting to Redis, attempt #${retries}`, null, 'cache');
                    return Math.min(retries * 100, 3000); // exponential backoff up to 3 seconds
                },
                connectTimeout: 10000, // Set connection timeout to 10 seconds
            },
        });

        this.setupEventListeners();
    }

    /**
     * Setup event listeners for Redis connection
     */
    private setupEventListeners() {
        this.cacheInstance.on('error', (err) => {
            this.logger.debug(`Connection error: ${err}`, null, 'cache');

            if (err.message.includes('Socket closed unexpectedly')) {
                this.logger.debug('Socket closed unexpectedly. Attempting to reconnect...', null, 'cache');
                this.reconnectRedisClient();
            }
        });

        this.cacheInstance.on('end', () => {
            this.logger.debug('Connection closed, attempting to reconnect...', null, 'cache');
            this.connected = false;
            this.reconnectRedisClient();
        });

        this.cacheInstance.on('connect', () => {
            this.logger.debug('Redis client connected', null, 'cache');
            this.connected = true;
            this.reconnecting = false; // Reset reconnecting flag on successful connection
        });
    }

    /**
     * Wait until the Redis client is connected
     */
    private async waitForConnection() {
        while (!this.connected) {
            // Log
            this.logger.debug('Waiting for Redis connection...', null, 'cache');

            // Check connection status every 100 ms
            await Helper.sleep(100);
        }
    }

    /**
     * Connect to Redis with error handling
     */
    private async connectToRedis() {
        try {
            await this.cacheInstance.connect();
            this.isClientClosed = false;
            this.connected = true;
            this.logger.debug('Connected to Redis successfully', null, 'cache');
        } catch (err) {
            this.logger.debug(`Failed to connect to Redis: ${err}`, null, 'cache');
            this.connected = false;
            throw new RedisException(`Redis connection error! Error: ${err}`);
        }
    }

    /**
     * Reconnect Redis client by reinitializing the client instance
     */
    private async reconnectRedisClient() {
        // Prevent multiple reconnect attempts if already reconnecting or connected
        if (this.reconnecting || this.connected) return;
        this.reconnecting = true;
        this.connected = false;

        if (this.isClientClosed) {
            this.logger.debug('Reinitializing Redis client...', null, 'cache');
            this.initializeRedisClient();
        }

        try {
            this.logger.debug('Attempting to reconnect to Redis...', null, 'cache');
            await this.connectToRedis();
        } catch (err) {
            this.logger.debug(`Error during Redis client reinitialization: ${err}`, null, 'cache');
        } finally {
            this.reconnecting = false; // Ensure flag resets after attempt
        }
    }

    /**
     * Get cache item
     */
    public async get(key: string): Promise<any | undefined> {
        // Wait for redis connection
        await this.waitForConnection();

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
        // Wait for redis connection
        await this.waitForConnection();

        const values = await this.cacheInstance.mGet(keys);

        // Map Redis values: parse JSON if value exists, replace null with undefined for missing keys
        return values.map((value) => (value === null ? undefined : JSON.parse(value)));
    }

    /**
     * Get cache item and delete it from cache immediately
     */
    public async pull(key: string): Promise<any | undefined> {
        // Wait for redis connection
        await this.waitForConnection();

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
        // Wait for redis connection
        await this.waitForConnection();

        const ttl = ttlInSeconds || this.cacheConfig.defaultTTLInSeconds;
        await this.cacheInstance.set(key, JSON.stringify(data), { EX: ttl });
    }

    /**
     * Put multiple key-value pairs into cache for certain time
     */
    public async putMany(data: { key: string; value: any }[], ttlInSeconds?: number): Promise<void> {
        // Wait for redis connection
        await this.waitForConnection();

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
        // Wait for redis connection
        await this.waitForConnection();

        await this.cacheInstance.set(key, JSON.stringify(data));
    }

    /**
     * Check whether the key exists in the cache
     */
    public async has(key: string): Promise<boolean> {
        // Wait for redis connection
        await this.waitForConnection();

        const exists = await this.cacheInstance.exists(key);

        return exists === 1;
    }

    /**
     * Get cache keys
     */
    public async keys(regex?: RegExp): Promise<string[]> {
        // Wait for redis connection
        await this.waitForConnection();

        // Get all keys from Redis
        const allKeys = await this.cacheInstance.keys('*');

        // If no regex is provided, return all keys
        if (!regex) {
            return allKeys;
        }

        // Filter keys based on the provided regex
        const filteredKeys = allKeys.filter((key) => regex.test(key));

        return filteredKeys;
    }

    /**
     * Remove item from the cache
     */
    public async delete(key: string): Promise<void> {
        // Wait for redis connection
        await this.waitForConnection();

        await this.cacheInstance.del(key);
    }

    /**
     * Delete items from the cache
     */
    public async deleteMany(keys: string[]): Promise<void> {
        // Wait for redis connection
        await this.waitForConnection();

        if (keys.length > 0) {
            await this.cacheInstance.del(keys);
        }
    }

    /**
     * Clear the entire cache
     */
    public async flush(): Promise<void> {
        // Wait for redis connection
        await this.waitForConnection();

        await this.cacheInstance.flushDb();
    }

    /**
     * Get all cache keys with timestamps
     */
    public async getAllCacheKeysWithTimestamps(): Promise<{ key: string; expiresAtTimestamp: number }[]> {
        throw new CacheException(`Not applicable for redis cache`);
    }
}
