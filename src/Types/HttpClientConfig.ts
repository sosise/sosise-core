import { CreateAxiosDefaults } from 'axios';

export default interface HttpClientConfig extends CreateAxiosDefaults {
    ignoreSelfSignedCertificates?: boolean;
    keepAlive?: boolean; // Keep alive HTTPs connection, default=false
    keepAliveMsecs?: number; // Keep alive HTTPs connection, default=1000 only if keepAlive is true
    debug?: {
        enabled: boolean;
        loggingChannel?: string;
    };
}
