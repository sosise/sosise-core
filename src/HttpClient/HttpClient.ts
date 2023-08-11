import HttpClientConfig from "../Types/HttpClientConfig";
import axios, { Axios, AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import https, { AgentOptions } from "https";
import { HttpsProxyAgent } from "https-proxy-agent";
import HttpClientRetryConfig from "../Types/HttpClientRetryConfig";
import Helper from "../Helper/Helper";

export default class HttpClient {

    public static DEFAULT_USER_AGENT = 'sosise http client';
    public static DEFAULT_REQUEST_MAX_RETRIES = 1;
    public static DEFAULT_TIMEOUT_IN_MILLISECONDS = 5000;
    public config?: HttpClientConfig;
    private axiosInstance: AxiosInstance;

    /**
     * Constructor
     */
    constructor(config?: HttpClientConfig) {
        this.config = config;
        this.axiosInstance = this.initializeAxios();
    }

    /**
     * Initialize axios instance
     */
    private initializeAxios(): AxiosInstance {
        // Prepare config
        const axiosConfig = { ...this.config };

        // Prepare headers
        axiosConfig.headers = {
            'User-Agent': this.getDefaultUserAgentOrConfiguredOne(),
            ...axiosConfig.headers
        };

        // Prepare https agent config
        const httpsAgentConfig: AgentOptions = {};
        if (axiosConfig.ignoreSelfSignedCertificates === true) {
            httpsAgentConfig.rejectUnauthorized = false;
        }

        // Prepare https agent
        let httpsAgent = new https.Agent(httpsAgentConfig);

        // In case https proxy is being used
        if (axiosConfig.proxy && axiosConfig.proxy.protocol && axiosConfig.proxy.protocol.toLocaleLowerCase() === 'https') {
            // Prepare https proxy agent config
            const httpsProxyAgentConfig: any = {
                host: axiosConfig.proxy.host,
                port: axiosConfig.proxy.port,
            };

            // If proxy server authentication is used
            if (axiosConfig.proxy.auth) {
                httpsProxyAgentConfig.username = axiosConfig.proxy.auth.username;
                httpsProxyAgentConfig.password = axiosConfig.proxy.auth.password;
            }

            // Instantiate https proxy agent
            // @ts-ignore
            httpsAgent = new HttpsProxyAgent(httpsProxyAgentConfig);

            // If self signed certificates should be used
            if (axiosConfig.ignoreSelfSignedCertificates === true) {
                httpsAgent.options.rejectUnauthorized = false;
            }

            // Remove proxy object from axiosConfig object, they will conflict with each other
            delete axiosConfig.proxy;
        }

        // Assign https agent to axios
        axiosConfig.httpsAgent = httpsAgent;

        // Return
        return axios.create(axiosConfig);
    }

    /**
     * Get default user agent or configured one
     */
    private getDefaultUserAgentOrConfiguredOne(): string {
        // In case no headers were configured
        // Return default user agent
        if (!this.config || !this.config.headers) {
            return HttpClient.DEFAULT_USER_AGENT;
        }

        // Otherwise, check if user-agent header was given or not
        for (const [key, value] of Object.entries(this.config.headers)) {
            if (key.toLocaleLowerCase() === 'user-agent') {
                return value;
            }
        }

        // No user-agent header was given, return default
        return HttpClient.DEFAULT_USER_AGENT;
    }

    /**
     * Make request
     */
    public async request(config: AxiosRequestConfig): Promise<AxiosResponse> {
        // Prepare cancel token for emergency timeout
        const source = axios.CancelToken.source();
        const timeout = setTimeout(() => {
            source.cancel('Timeout');
        }, config.timeout ?? HttpClient.DEFAULT_TIMEOUT_IN_MILLISECONDS);

        // Do request
        const response = await this.axiosInstance.request({ ...config, cancelToken: source.token });

        // Clear timeout, since request does not went into it
        clearTimeout(timeout);

        // Return response
        return response;
    }

    /**
     * Make request with retry
     */
    public async requestWithRetry(config: AxiosRequestConfig, retryConfig: HttpClientRetryConfig): Promise<AxiosResponse> {
        // Prepare cancel token for emergency timeout
        const source = axios.CancelToken.source();
        const timeout = setTimeout(() => {
            source.cancel('Timeout');
        }, config.timeout ?? HttpClient.DEFAULT_TIMEOUT_IN_MILLISECONDS);

        // Do request
        // const response = await this.makeRequest(config, retryConfig);
        const response = await this.makeRequest({ ...config, cancelToken: source.token }, retryConfig);

        // Clear timeout, since request does not went into it
        clearTimeout(timeout);

        // Return response
        return response;
    }

    /**
     * Make request
     */
    private async makeRequest(config: AxiosRequestConfig, retryConfig: HttpClientRetryConfig, retryCounter: number = 1): Promise<AxiosResponse> {
        try {
            // Make request
            const response = await this.axiosInstance.request(config);

            // Return
            return response;
        } catch (error) {
            // In case we have retries left
            if (retryCounter < retryConfig.requestMaxRetries) {
                // Calculate next wait interval
                let waitInterval = 0;
                switch (retryConfig.requestRetryStrategy) {
                    case 'linear':
                        waitInterval = retryConfig.requestRetryInterval;
                        break;
                    case 'exponential':
                        waitInterval = retryConfig.requestRetryInterval * Math.pow(2, retryCounter - 1);
                        break;
                }

                // Wait some milliseconds
                await Helper.sleep(waitInterval);

                // Retry
                return this.makeRequest(config, retryConfig, retryCounter + 1);
            } else {
                // No retries left, throw original exception
                throw error;
            }
        }
    }
}
