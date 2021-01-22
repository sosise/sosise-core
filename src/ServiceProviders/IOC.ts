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
    public static make(name: any): any {
        // Require ioc config
        const iocConfig = require(process.cwd() + '/build/config/ioc').default;

        // Check if requested name exists in ioc.ts config
        if (iocConfig.normal[name]) {
            return iocConfig.normal[name]();
        }

        // Check if requested name exists in local coreServices property
        if (this.coreServices.normal[name]) {
            return this.coreServices.normal[name]();
        }

        // Nope requested name does not exists in ioc.ts config
        throw new IOCMakeException('IOC could not resolve class, please check your config/ioc.ts config and register needed name there', name);
    }
}
