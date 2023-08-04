import { CreateAxiosDefaults } from "axios";

export default interface HttpClientConfig extends CreateAxiosDefaults {
    ignoreSelfSignedCertificates?: boolean;
}
