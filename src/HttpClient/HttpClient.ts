import axios, { Axios, AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import https, { AgentOptions } from "https";
import { HttpsProxyAgent } from "https-proxy-agent";
import Helper from "../Helper/Helper";
import HttpClientConfig from "../Types/HttpClientConfig";
import HttpClientRequestConfig from "../Types/HttpClientRequestConfig";
import HttpClientRetryConfig from "../Types/HttpClientRetryConfig";

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
        if (axiosConfig.keepAlive !== undefined) {
            httpsAgentConfig.keepAlive = axiosConfig.keepAlive;
        }
        if (axiosConfig.keepAliveMsecs !== undefined) {
            httpsAgentConfig.keepAliveMsecs = axiosConfig.keepAliveMsecs;
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

            // Prepare https agent (proxy agent) config
            if (axiosConfig.ignoreSelfSignedCertificates === true) {
                httpsAgent.options.rejectUnauthorized = false;
            }
            if (axiosConfig.keepAlive !== undefined) {
                httpsAgentConfig.keepAlive = axiosConfig.keepAlive;
            }
            if (axiosConfig.keepAliveMsecs !== undefined) {
                httpsAgentConfig.keepAliveMsecs = axiosConfig.keepAliveMsecs;
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
    public async request(config: HttpClientRequestConfig): Promise<AxiosResponse> {
        // Prepare cancel token for emergency timeout
        const source = axios.CancelToken.source();
        const timeout = setTimeout(() => {
            source.cancel('Timeout');
        }, config.timeout || this.config?.timeout || HttpClient.DEFAULT_TIMEOUT_IN_MILLISECONDS);

        // Do request
        const response = await this.makeRequest({ ...config, cancelToken: source.token });

        // Clear timeout, since request does not went into it
        clearTimeout(timeout);

        // Return response
        return response;
    }

    /**
     * Make request with retry
     */
    public async requestWithRetry(config: HttpClientRequestConfig, retryConfig: HttpClientRetryConfig): Promise<AxiosResponse> {
        // Prepare cancel token for emergency timeout
        const source = axios.CancelToken.source();
        const timeout = setTimeout(() => {
            source.cancel('Timeout');
        }, config.timeout || this.config?.timeout || HttpClient.DEFAULT_TIMEOUT_IN_MILLISECONDS);

        // Do request
        const response = await this.makeRequest({ ...config, cancelToken: source.token }, retryConfig);

        // Clear timeout, since request does not went into it
        clearTimeout(timeout);

        // Return response
        return response;
    }

    /**
     * Make request
     */
    private async makeRequest(config: HttpClientRequestConfig, retryConfig?: HttpClientRetryConfig, retryCounter: number = 1): Promise<AxiosResponse> {
        try {
            // Make request
            const response = await this.axiosInstance.request(config);

            // Return
            return response;
        } catch (error) {
            // In case we have retries left
            if (retryConfig && retryCounter < retryConfig.requestMaxRetries) {
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
                // No retries left
                // In case error does not contain response
                if (!error.response) {
                    // Determine which exception to throw, default axios exception or user given exception
                    if (!config.defaultException) {
                        throw error;
                    }

                    // Otherwise throw user given exception
                    throw new config.defaultException(error.message, 500, null);
                }

                // At this step we are sure that we've got a HTTP response, now we need to check if user gave us
                // Instructions what to return in case of httpCode's
                if (config.returnInCaseOfStatusCodes) {
                    for (const [httpCode, whatToReturn] of Object.entries(config.returnInCaseOfStatusCodes)) {
                        if (Number(error.response.status) === Number(httpCode)) {
                            return {
                                data: whatToReturn,
                                status: 200,
                                statusText: 'OK',
                                headers: error.response.headers,
                                // @ts-ignore
                                config: null,
                                request: null,
                            };
                        }
                    }
                }

                // Nope no instructions found
                // Determine which exception to throw, default axios exception or given user exception
                if (!config.defaultException) {
                    throw error;
                }

                // Otherwise throw user given exception
                throw new config.defaultException(error.response?.data?.message ?? error.message, error.response.status, error.response.data.data ?? null);
            }
        }
    }
}
