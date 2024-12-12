import Helper from '../../Helper/Helper';
import CacheFileRepository from '../../Repositories/Cache/CacheFileRepository';
import CacheMemoryRepository from '../../Repositories/Cache/CacheMemoryRepository';
import CacheRedisRepository from '../../Repositories/Cache/CacheRedisRepository';
import CacheRepositoryInterface from '../../Repositories/Cache/CacheRepositoryInterface';

export default class CacheService {
    private cacheRepository: CacheRepositoryInterface;
    private cacheConfig: any;

    /**
     * Constructor
     */
    constructor() {
        // Require cache configuration
        this.cacheConfig = require(process.cwd() + '/build/config/cache').default;

        // Instantiate cache repository depending on driver
        switch (this.cacheConfig.driver) {
            case 'memory':
                this.cacheRepository = new CacheMemoryRepository(this.cacheConfig);
                break;
            case 'fs':
                this.cacheRepository = new CacheFileRepository(this.cacheConfig);
                this.cacheExpirationLoop();
                break;
            case 'redis':
                this.cacheRepository = new CacheRedisRepository(this.cacheConfig);
                break;
            default:
                this.cacheRepository = new CacheMemoryRepository(this.cacheConfig);
                break;
        }
    }

    /**
     * Get cache item
     */
    public get(key: string): Promise<any | null> {
        return this.cacheRepository.get(key);
    }

    /**
     * Get multiple cache items by multiple keys
     */
    public getMany(keys: string[]): Promise<any[] | undefined[]> {
        return this.cacheRepository.getMany(keys);
    }

    /**
     * Get cache item and delete it from cache immediately
     */
    public pull(key: string): Promise<any | null> {
        return this.cacheRepository.pull(key);
    }

    /**
     * Put data into cache for certain time
     */
    public put(key: string, data: any, ttlInSeconds?: number): Promise<void> {
        return this.cacheRepository.put(key, data, ttlInSeconds);
    }

    /**
     * Put multiple key-value pairs into cache for certain time
     */
    public putMany(data: { key: string; value: any }[], ttlInSeconds?: number): Promise<void> {
        return this.cacheRepository.putMany(data, ttlInSeconds);
    }

    /**
     * Put data into cache forever
     */
    public putForever(key: string, data: any): Promise<void> {
        return this.cacheRepository.putForever(key, data);
    }

    /**
     * Check whether the key exists in the cache
     */
    public has(key: string): Promise<boolean> {
        return this.cacheRepository.has(key);
    }

    /**
     * Get cache keys
     */
    public keys(regex?: RegExp): Promise<string[]> {
        return this.cacheRepository.keys(regex);
    }

    /**
     * Remove item from the cache
     */
    public delete(key: string): Promise<void> {
        return this.cacheRepository.delete(key);
    }

    /**
     * Delete items from the cache
     */
    public deleteMany(keys: string[]): Promise<void> {
        return this.cacheRepository.deleteMany(keys);
    }

    /**
     * Clear the entire cache
     */
    public flush(): Promise<void> {
        return this.cacheRepository.flush();
    }

    /**
     * Internal method which runs in endless loop and expires cache items
     */
    private async cacheExpirationLoop(): Promise<void> {
        while (true) {
            // Get all cache keys with timestamps
            const keysWithTimestamps = await this.cacheRepository.getAllCacheKeysWithTimestamps();

            // Initialize array of keys which should be deleted
            const keysToDelete: string[] = [];

            // Now fill the keysToDelete array
            for (const element of keysWithTimestamps) {
                // Skip cache elements where expiresAtTimestamp equals zero
                // This means it's a forever cache
                if (element.expiresAtTimestamp === 0) {
                    continue;
                }

                if (element.expiresAtTimestamp < new Date().getTime()) {
                    keysToDelete.push(element.key);
                }
            }

            // Remove all the expired keys
            await this.cacheRepository.deleteMany(keysToDelete);

            // Wait before next expiration wave
            await Helper.sleep(this.cacheConfig.checkperiodInSeconds * 1000);
        }
    }
}
