import axios, { AxiosInstance, AxiosResponse } from 'axios';
import https, { AgentOptions } from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';
import Helper from '../Helper/Helper';
import HttpClientConfig from '../Types/HttpClientConfig';
import HttpClientRequestConfig from '../Types/HttpClientRequestConfig';
import HttpClientRetryConfig from '../Types/HttpClientRetryConfig';
import LoggerService from '../Services/Logger/LoggerService';
import IOC from '../ServiceProviders/IOC';

export default class HttpClient {
    public static DEFAULT_USER_AGENT = 'sosise http client';
    public static DEFAULT_REQUEST_MAX_RETRIES = 1;
    public static DEFAULT_TIMEOUT_IN_MILLISECONDS = 5000;
    public config?: HttpClientConfig;
    private axiosInstance: AxiosInstance;
    private loggerService: LoggerService;

    /**
     * Constructor
     */
    constructor(config?: HttpClientConfig) {
        this.config = config;
        this.axiosInstance = this.initializeAxios();
        this.loggerService = IOC.make(LoggerService);
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
            ...axiosConfig.headers,
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
        const timeout = setTimeout(
            () => {
                source.cancel('Timeout');
            },
            config.timeout || this.config?.timeout || HttpClient.DEFAULT_TIMEOUT_IN_MILLISECONDS,
        );

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
        const timeout = setTimeout(
            () => {
                source.cancel('Timeout');
            },
            config.timeout || this.config?.timeout || HttpClient.DEFAULT_TIMEOUT_IN_MILLISECONDS,
        );

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
    private async makeRequest(
        config: HttpClientRequestConfig,
        retryConfig?: HttpClientRetryConfig,
        retryCounter: number = 1,
    ): Promise<AxiosResponse> {
        // Log
        const requestConfigCopy = config;
        delete requestConfigCopy.cancelToken;
        this.log(`Doing HTTP Request`, 'info', {
            clientConfig: this.config,
            requestConfig: requestConfigCopy,
        });

        try {
            // Make request
            const response = await this.axiosInstance.request(config);

            // Log
            this.log(`Got Response`, 'info', {
                clientConfig: this.config,
                requestConfig: requestConfigCopy,
                response: {
                    status: response.status,
                },
            });

            // Return
            return response;
        } catch (error) {
            // Add method and url to error message, for better readability
            if (error.message[0] !== '[') {
                error.message =
                    `[${config.method?.toUpperCase()}] ${this.config?.baseURL ?? ''}${config.url!.split('?')[0]} ` + error.message;
            }

            // Log
            this.log(`Request Exception Occurred: ${error.message}`, 'warn', {
                clientConfig: this.config,
                requestConfig: requestConfigCopy,
            });

            // In case we have retries left
            if (
                retryConfig &&
                this.checkIfRequestShouldBeRetriedAccordingToHttpReturnCode(error.response?.status, retryConfig) &&
                retryCounter < retryConfig.requestMaxRetries
            ) {
                // Calculate next wait interval
                let waitInterval = 0;
                switch (retryConfig.requestRetryStrategy) {
                    case 'linear':
                        waitInterval = retryConfig.requestRetryInterval;

                        // Log
                        this.log(`Request will be retried 'linear'`, 'warn', {
                            clientConfig: this.config,
                            requestConfig: requestConfigCopy,
                            waitInterval,
                        });
                        break;
                    case 'exponential':
                        waitInterval = retryConfig.requestRetryInterval * Math.pow(2, retryCounter - 1);

                        // Log
                        this.log(`Request will be retried 'exponential'`, 'warn', {
                            clientConfig: this.config,
                            requestConfig: requestConfigCopy,
                            waitInterval,
                        });
                        break;
                }

                // Wait some milliseconds
                await Helper.sleep(waitInterval);

                // Retry
                return this.makeRequest(config, retryConfig, retryCounter + 1);
            } else {
                // Log
                this.log(`No retries left`, 'warn', {
                    clientConfig: this.config,
                    requestConfig: requestConfigCopy,
                });

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
                throw new config.defaultException(
                    error.response?.data?.message ?? error.message,
                    error.response.status,
                    error.response.data.data ?? null,
                );
            }
        }
    }

    /**
     * Check if request should be retried according to http return code
     */
    private checkIfRequestShouldBeRetriedAccordingToHttpReturnCode(
        httpCode: number | undefined,
        retryConfig: HttpClientRetryConfig,
    ): boolean {
        // In case there happened an error without httpCode, e.g. Timeout
        if (!httpCode) {
            // Yep we should retry
            return true;
        }

        // In case user did not specified http codes list in case when we do not have to retry
        if (!retryConfig.requestDoNotRetryForHttpCodes) {
            // Yep we should retry
            return true;
        }
        // In case returned http code is in the list of codes when we do not have to retry request
        if (retryConfig.requestDoNotRetryForHttpCodes.includes(httpCode)) {
            // Do not retry request
            return false;
        }

        // All other cases we have to retry request
        // That means the returned http code is not in the list of codes when we do not have to retry request
        return true;
    }

    /**
     * Log
     */
    private log(message: string, level: 'info' | 'warn', params?: any): void {
        if (this.isDebugEnabled()) {
            switch (level) {
                case 'info':
                    this.loggerService.info(message, params, this.config?.debug?.loggingChannel ?? 'default');
                    break;
                case 'warn':
                    this.loggerService.warning(message, params, this.config?.debug?.loggingChannel ?? 'default');
                    break;
            }
        }
    }

    /**
     * Checks if debug is enabled
     */
    private isDebugEnabled(): boolean {
        if (this.config && this.config.debug?.enabled === true) {
            return true;
        }
        return false;
    }
}
