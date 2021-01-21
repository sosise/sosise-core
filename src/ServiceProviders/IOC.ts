import IOCMakeException from '../Exceptions/IOC/IOCMakeException';

export default class IOC {
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

        // Nope requested name does not exists in ioc.ts config
        throw new IOCMakeException('IOC could not resolve class, please check your config/ioc.ts config and register needed name there', name);
    }
}
