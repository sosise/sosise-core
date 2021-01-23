import IOCMakeException from '../Exceptions/IOC/IOCMakeException';
import LoggerJsonConsoleRepository from '../Repositories/Logger/LoggerJsonConsoleRepository';
import LoggerPrettyConsoleRepository from '../Repositories/Logger/LoggerPrettyConsoleRepository';
import LoggerService from '../Services/Logger/LoggerService';

export default class IOC {
    /**
     * Core services are services what sosise-core provides out of the box.
     * When user tries to get instance with make method the order is the following:
     * 1. IOC tries to find the name in user defined config ioc.ts
     * 2. If the first try fails, IOC tries to find the name in the coreServices
     * 3. When the first and second steps fails exception will be raised
     */
    private static coreServices = {
        // Normal means, that these registrations are non-singletons (sigletons are not supported atm.)
        normal: {
            /**
             * LoggerService
             */
            LoggerService: () => {
                if (process.env.APP_ENV === 'local') {
                    return new LoggerService(new LoggerPrettyConsoleRepository());
                }
                return new LoggerService(new LoggerJsonConsoleRepository());
            }
        },
    };

    /**
     * Get object from IOC
     */
    public static make<T>(serviceName: T): any {
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
        if (iocConfig.normal[configKey]) {
            return iocConfig.normal[configKey]();
        }

        // Check if requested name exists in local coreServices property
        if (this.coreServices.normal[configKey]) {
            return this.coreServices.normal[configKey]();
        }

        // Nope requested name does not exists in ioc.ts config
        throw new IOCMakeException('IOC could not resolve class, please check your config/ioc.ts config and register needed name there', configKey);
    }
}
