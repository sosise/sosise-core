import IOCMakeException from "../Exceptions/IOC/IOCMakeException";
import CacheService from "../Services/Cache/CacheService";
import LoggerService from "../Services/Logger/LoggerService";

export default class IOC {

    public static singletonInstances: { serviceName: string, instance: any }[] = [];

    /**
     * Core services are services what sosise-core provides out of the box.
     * When user tries to get instance with make method the order is the following:
     * 1. IOC tries to find the name in user defined config ioc.ts
     * 2. If the first try fails, IOC tries to find the name in the coreServices
     * 3. When the first and second steps fails exception will be raised
     */
    private static coreServices = {
        // Singleton services
        singletons: {
            /**
             * LoggerService
             */
            LoggerService: () => {
                return new LoggerService();
            },
            CacheService: () => {
                return new CacheService();
            }
        },

        // Non singleton services
        nonSingletons: {
            /**
             * LoggerService
             */
            LoggerService: () => {
                return new LoggerService();
            }
        },
    };

    /**
     * Get service from IOC
     */
    public static make<T>(serviceName: { new(): T } | string): T {
        // Require ioc config
        const iocConfig = require(process.cwd() + '/build/config/ioc').default;

        // Initialize config key
        let configKey = '';

        // Decide what to do depending on which type was given
        if (typeof serviceName !== 'string' && (serviceName as any).name !== undefined) {
            configKey = (serviceName as any).name;
        } else {
            configKey = serviceName as any;
        }

        // Check if requested name exists in ioc.ts config
        if (iocConfig.nonSingletons[configKey]) {
            return iocConfig.nonSingletons[configKey]() as T;
        }

        // Check if requested name exists in local coreServices property
        if (this.coreServices.nonSingletons[configKey]) {
            return this.coreServices.nonSingletons[configKey]() as T;
        }

        // Nope requested name does not exists in ioc.ts config
        throw new IOCMakeException('IOC could not resolve class, please check your config/ioc.ts config and register needed name there', configKey);
    }

    /**
     * Get service singleton from IOC
     */
    public static makeSingleton<T>(serviceName: { new(): T } | string): T {
        // Require ioc config
        const iocConfig = require(process.cwd() + '/build/config/ioc').default;

        // Initialize config key
        let configKey = '';

        // Decide what to do depending on which type was given
        if (typeof serviceName !== 'string' && (serviceName as any).name !== undefined) {
            configKey = (serviceName as any).name;
        } else {
            configKey = serviceName as any;
        }

        // Iterate through singleton instances and try to find already instantiated one
        // If found return it
        for (const element of IOC.singletonInstances) {
            if (element.serviceName === configKey && element.instance !== null) {
                return element.instance as T;
            }
        }

        // Check if requested name exists in ioc.ts config
        if (iocConfig.singletons[configKey]) {
            const userDefinedServiceInstance = iocConfig.singletons[configKey]() as T;
            IOC.singletonInstances.push({
                serviceName: configKey,
                instance: userDefinedServiceInstance
            });
            return userDefinedServiceInstance;
        }

        // Check if requested name exists in local coreServices property
        if (this.coreServices.singletons[configKey]) {
            const coreDefinedServiceInstance = this.coreServices.singletons[configKey]() as T;
            IOC.singletonInstances.push({
                serviceName: configKey,
                instance: coreDefinedServiceInstance
            });
            return coreDefinedServiceInstance;
        }

        // Nope requested name does not exists in ioc.ts config
        throw new IOCMakeException('IOC could not resolve singleton class, please check your config/ioc.ts config and register needed name there', configKey);
    }
}
