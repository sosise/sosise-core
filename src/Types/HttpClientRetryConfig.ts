type Milliseconds = number;

export default interface HttpClientRetryConfig {
    requestMaxRetries: number;
    requestRetryInterval: Milliseconds;
    requestRetryStrategy: 'linear' | 'exponential';
}
