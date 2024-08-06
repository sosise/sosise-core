import fs from "fs";
import CacheRepositoryInterface from "./CacheRepositoryInterface";

export default class CacheFileRepository implements CacheRepositoryInterface {

    private cacheConfig: any;
    private cacheFilePath: string;

    /**
     * Constructor
     */
    constructor(cacheConfig: any) {
        this.cacheConfig = cacheConfig;
        this.cacheFilePath = this.cacheConfig.driverConfiguration.fs.filePath;
    }

    /**
     * Get cache item
     */
    public async get(key: string): Promise<any | undefined> {
        // Check if cache file does not exists
        if (!this.checkIfCacheFileExists()) {
            // Create cache file
            this.createCacheFile();

            // Return undefined, since fresh created file cannot contain any cached items
            return undefined;
        }

        // Read cache file
        const cache = this.readCacheFileAndParse();

        // Search for key
        for (const [k, v] of Object.entries(cache) as any) {
            if (k === key) {
                return v.data;
            }
        }

        // Cached item was not found by key
        return undefined;
    }

    /**
     * Get cache item and delete it from cache immediately
     */
    public async pull(key: string): Promise<any | undefined> {
        // Check if cache file does not exists
        if (!this.checkIfCacheFileExists()) {
            // Create cache file
            this.createCacheFile();

            // Return undefined, since fresh created file cannot contain any cached items
            return undefined;
        }

        // Read cache file
        const cache = this.readCacheFileAndParse();

        // Search for key
        for (const [k, v] of Object.entries(cache) as any) {
            if (k === key) {
                // Key was found, put it into variable
                const result = v.data;

                // Now remove key from parsed object
                delete cache[key];

                // Write back to file
                fs.writeFileSync(this.cacheFilePath, JSON.stringify(cache));

                // Return found key
                return result;
            }
        }

        // Cached item was not found by key
        return undefined;
    }

    /**
     * Put data into cache for certain time
     */
    public async put(key: string, data: any, ttlInSeconds?: number): Promise<void> {
        // Check if cache file does not exists
        if (!this.checkIfCacheFileExists()) {
            // Create cache file
            this.createCacheFile();
        }

        // Read cache file
        const cache = this.readCacheFileAndParse();

        // Get ttl
        const ttl = (!ttlInSeconds ? this.cacheConfig.defaultTTLInSeconds : ttlInSeconds);

        // Put data into cache
        cache[key] = {
            data,
            expiresAtTimestamp: new Date().getTime() + ttl * 1000,
        };

        // Write back to file
        fs.writeFileSync(this.cacheFilePath, JSON.stringify(cache));
    }

    /**
     * Put data into cache forever
     */
    public async putForever(key: string, data: any): Promise<void> {
        // Check if cache file does not exists
        if (!this.checkIfCacheFileExists()) {
            // Create cache file
            this.createCacheFile();
        }

        // Read cache file
        const cache = this.readCacheFileAndParse();

        // Put data into cache
        cache[key] = {
            data,
            expiresAtTimestamp: 0,
        };

        // Write back to file
        fs.writeFileSync(this.cacheFilePath, JSON.stringify(cache));
    }

    /**
     * Check whether the key exists in the cache
     */
    public async has(key: string): Promise<boolean> {
        // Check if cache file does not exists
        if (!this.checkIfCacheFileExists()) {
            // Create cache file
            this.createCacheFile();

            // Return false, since fresh created file cannot contain any cached items
            return false;
        }

        // Read cache file
        const cache = this.readCacheFileAndParse();

        // Search for key
        for (const [k, v] of Object.entries(cache) as any) {
            if (k === key) {
                return true;
            }
        }

        // Cached item was not found by key
        return false;
    }

    /**
     * Get cache keys
     */
    public async keys(regex?: RegExp): Promise<string[]> {
        // Check if cache file does not exists
        if (!this.checkIfCacheFileExists()) {
            // Create cache file
            this.createCacheFile();

            // Return empty array, since fresh created file cannot contain any cached keys
            return [];
        }

        // Read cache file
        const cache = this.readCacheFileAndParse();

        // First of all get all keys
        const allKeys = Object.keys(cache);

        // In case user wants all cache keys
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
        // Check if cache file does not exists
        if (!this.checkIfCacheFileExists()) {
            // Create cache file
            this.createCacheFile();

            // Return nothing, since fresh created file cannot contain any cache and we cannot delete cache item
            return;
        }

        // Read cache file
        const cache = this.readCacheFileAndParse();

        // Search for key
        for (const [k, v] of Object.entries(cache) as any) {
            if (k === key) {
                // Delete key
                delete cache[key];

                // Write back to file
                fs.writeFileSync(this.cacheFilePath, JSON.stringify(cache));

                // Stop method execution
                return;
            }
        }
    }

    /**
     * Delete items from the cache
     */
    public async deleteMany(keys: string[]): Promise<void> {
        // Check if cache file does not exists
        if (!this.checkIfCacheFileExists()) {
            // Create cache file
            this.createCacheFile();

            // Return nothing, since fresh created file cannot contain any cache and we cannot delete cache item
            return;
        }

        // Read cache file
        const cache = this.readCacheFileAndParse();

        // Search for key
        for (const [k, v] of Object.entries(cache) as any) {
            for (const key of keys) {
                if (k === key) {
                    // Delete key
                    delete cache[key];
                }
            }
        }

        // Write back to file
        fs.writeFileSync(this.cacheFilePath, JSON.stringify(cache));
    }

    /**
     * Clear the entire cache
     */
    public async flush(): Promise<void> {
        fs.rmSync(this.cacheFilePath);
    }

    /**
     * Get all cache keys with timestamps
     */
    public async getAllCacheKeysWithTimestamps(): Promise<{ key: string, expiresAtTimestamp: number }[]> {
        // Check if cache file does not exists
        if (!this.checkIfCacheFileExists()) {
            // Create cache file
            this.createCacheFile();

            // Return empty array, since fresh created file cannot contain any cached items
            return [];
        }

        // Read cache file
        const cache = this.readCacheFileAndParse();

        // Initialize result variable
        const result: { key: string, expiresAtTimestamp: number }[] = [];

        // Fill resulting variable with data
        for (const [k, v] of Object.entries(cache) as any) {
            result.push({ key: k, expiresAtTimestamp: v.expiresAtTimestamp });
        }

        // Return
        return result;
    }

    /**
     * Read cache file and parse
     */
    private readCacheFileAndParse(): any {
        // Read whole cache file
        const cacheFileContent = fs.readFileSync(this.cacheFilePath, 'utf-8');

        // Convert JSON to object
        const cache = JSON.parse(cacheFileContent);

        // Return
        return cache;
    }

    /**
     * Check if cache file exists
     */
    private checkIfCacheFileExists(): boolean {
        if (!fs.existsSync(this.cacheFilePath)) {
            return false;
        }
        return true;
    }

    /**
     * Create cache file
     */
    private createCacheFile(): void {
        fs.writeFileSync(this.cacheFilePath, '{}');
    }
}
