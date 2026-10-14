type HttpTransportEnvironment = Record<string, string | undefined>;

export interface HttpTransportOptions {
    compression: boolean;
    jsonParser: boolean;
    urlencodedParser: boolean;
    rawParser: boolean;
    jsonBodyLimit: string;
    rawBodyLimit: string;
    shutdownTimeout: number;
    trustProxy: boolean | number | string | undefined;
}

/**
 * Resolve HTTP transport behaviour from the environment
 *
 * Every default preserves the historical framework behaviour, so an application that
 * sets none of these variables keeps compression and all global body parsers enabled.
 */
export default function resolveHttpTransportOptions(environment: HttpTransportEnvironment = process.env): HttpTransportOptions {
    return {
        compression: parseToggle(environment.HTTP_COMPRESSION, true, 'HTTP_COMPRESSION'),
        jsonParser: parseToggle(environment.HTTP_JSON_PARSER, true, 'HTTP_JSON_PARSER'),
        urlencodedParser: parseToggle(environment.HTTP_URLENCODED_PARSER, true, 'HTTP_URLENCODED_PARSER'),
        rawParser: parseToggle(environment.HTTP_RAW_PARSER, true, 'HTTP_RAW_PARSER'),
        jsonBodyLimit: parseBodyLimit(environment.HTTP_JSON_BODY_LIMIT, '10mb', 'HTTP_JSON_BODY_LIMIT'),
        rawBodyLimit: parseBodyLimit(environment.HTTP_RAW_BODY_LIMIT, '150mb', 'HTTP_RAW_BODY_LIMIT'),
        shutdownTimeout: parseShutdownTimeout(environment.HTTP_SHUTDOWN_TIMEOUT_MS, 10000, 'HTTP_SHUTDOWN_TIMEOUT_MS'),
        trustProxy: parseTrustProxy(environment.HTTP_TRUST_PROXY, 'HTTP_TRUST_PROXY'),
    };
}

/**
 * Read a boolean switch, rejecting anything but the two canonical spellings
 *
 * Loose parsing would silently turn a typo such as "flase" into an enabled middleware,
 * so an invalid value fails startup instead.
 */
function parseToggle(value: string | undefined, fallback: boolean, name: string): boolean {
    // Preserve the framework default when the variable is absent
    if (value === undefined) {
        return fallback;
    }

    const normalizedValue = value.trim();

    if (normalizedValue === 'true') {
        return true;
    }

    if (normalizedValue === 'false') {
        return false;
    }

    throw new Error(`${name} must be either "true" or "false".`);
}

/**
 * Read a body size limit understood by the Express body parsers
 */
function parseBodyLimit(value: string | undefined, fallback: string, name: string): string {
    // Preserve the framework default when the variable is absent
    if (value === undefined) {
        return fallback;
    }

    // Require a plain byte count or a size with a unit suffix, for example "10mb"
    const normalizedValue = value.trim();

    if (!/^\d+(\.\d+)?\s*(b|kb|mb|gb|tb|pb)?$/i.test(normalizedValue)) {
        throw new Error(`${name} must be a byte size such as "10mb" or a plain number of bytes.`);
    }

    return normalizedValue;
}

/**
 * Read the grace period granted to in-flight connections during shutdown
 */
function parseShutdownTimeout(value: string | undefined, fallback: number, name: string): number {
    // Preserve the framework default when the variable is absent
    if (value === undefined) {
        return fallback;
    }

    // Require a canonical non-negative integer value, zero meaning an immediate cut-off
    const normalizedValue = value.trim();
    const shutdownTimeout = Number(normalizedValue);

    if (!normalizedValue || !Number.isSafeInteger(shutdownTimeout) || shutdownTimeout < 0) {
        throw new Error(`${name} must be a non-negative integer number of milliseconds.`);
    }

    return shutdownTimeout;
}

/**
 * Read which proxies in front of the application Express may trust
 *
 * The value is what Express accepts for its "trust proxy" setting: "true" or "false", a number
 * of hops, or a comma-separated list of addresses, subnets and presets such as "loopback".
 * Express validates the list itself when the setting is applied, so a typo fails startup.
 * Leaving the variable out keeps the historical behaviour: one trusted hop when sessions are on.
 */
function parseTrustProxy(value: string | undefined, name: string): boolean | number | string | undefined {
    // Keep the historical behaviour when the variable is absent
    if (value === undefined) {
        return undefined;
    }

    const normalizedValue = value.trim();

    // Booleans trust every proxy or none of them
    if (normalizedValue === 'true') {
        return true;
    }

    if (normalizedValue === 'false') {
        return false;
    }

    // A plain number counts the hops between the application and the client
    if (/^\d+$/.test(normalizedValue)) {
        return Number(normalizedValue);
    }

    // Anything else is a list of trusted addresses, and an empty one is a mistake rather than a choice
    if (!normalizedValue) {
        throw new Error(`${name} must be "true", "false", a number of hops or a list of trusted addresses.`);
    }

    return normalizedValue;
}
