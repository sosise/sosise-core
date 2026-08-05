const assert = require('node:assert/strict');
const test = require('node:test');
const resolveHttpTransportOptions = require('../../build/Server/HttpTransportOptions').default;

test('keeps every transport feature enabled when no variable is set', () => {
    assert.deepEqual(resolveHttpTransportOptions({}), {
        compression: true,
        jsonParser: true,
        urlencodedParser: true,
        rawParser: true,
        jsonBodyLimit: '10mb',
        rawBodyLimit: '150mb',
        shutdownTimeout: 10000,
    });
});

test('applies explicit transport values', () => {
    assert.deepEqual(
        resolveHttpTransportOptions({
            HTTP_COMPRESSION: 'false',
            HTTP_JSON_PARSER: 'false',
            HTTP_URLENCODED_PARSER: 'false',
            HTTP_RAW_PARSER: 'false',
            HTTP_JSON_BODY_LIMIT: '25mb',
            HTTP_RAW_BODY_LIMIT: '1gb',
            HTTP_SHUTDOWN_TIMEOUT_MS: '0',
        }),
        {
            compression: false,
            jsonParser: false,
            urlencodedParser: false,
            rawParser: false,
            jsonBodyLimit: '25mb',
            rawBodyLimit: '1gb',
            shutdownTimeout: 0,
        },
    );
});

test('disables a single parser without touching the others', () => {
    const options = resolveHttpTransportOptions({ HTTP_RAW_PARSER: 'false' });

    assert.equal(options.rawParser, false);
    assert.equal(options.jsonParser, true);
    assert.equal(options.urlencodedParser, true);
    assert.equal(options.compression, true);
});

for (const [name, environment] of [
    ['empty toggle', { HTTP_COMPRESSION: '' }],
    ['misspelled toggle', { HTTP_JSON_PARSER: 'flase' }],
    ['numeric toggle', { HTTP_RAW_PARSER: '1' }],
    ['uppercase toggle', { HTTP_URLENCODED_PARSER: 'TRUE' }],
]) {
    test(`rejects ${name}`, () => {
        assert.throws(() => resolveHttpTransportOptions(environment), /must be either "true" or "false"/);
    });
}

for (const [name, environment] of [
    ['empty body limit', { HTTP_JSON_BODY_LIMIT: '' }],
    ['unit only body limit', { HTTP_JSON_BODY_LIMIT: 'mb' }],
    ['unknown unit body limit', { HTTP_RAW_BODY_LIMIT: '10megabytes' }],
]) {
    test(`rejects ${name}`, () => {
        assert.throws(() => resolveHttpTransportOptions(environment), /must be a byte size/);
    });
}

test('accepts a plain byte count as a body limit', () => {
    assert.equal(resolveHttpTransportOptions({ HTTP_JSON_BODY_LIMIT: '1048576' }).jsonBodyLimit, '1048576');
});

for (const [name, environment] of [
    ['empty shutdown timeout', { HTTP_SHUTDOWN_TIMEOUT_MS: '' }],
    ['negative shutdown timeout', { HTTP_SHUTDOWN_TIMEOUT_MS: '-1' }],
    ['fractional shutdown timeout', { HTTP_SHUTDOWN_TIMEOUT_MS: '1.5' }],
    ['non-numeric shutdown timeout', { HTTP_SHUTDOWN_TIMEOUT_MS: 'never' }],
]) {
    test(`rejects ${name}`, () => {
        assert.throws(() => resolveHttpTransportOptions(environment), /must be a non-negative integer/);
    });
}
