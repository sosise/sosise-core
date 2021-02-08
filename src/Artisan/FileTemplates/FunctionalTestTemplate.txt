/**
 * Jest test framework documentation: https://jestjs.io/docs/en/getting-started
 */
describe('Example test suit', () => {
    test('Example test', () => {
        const someVariable: number = 42;
        expect(someVariable).toEqual(42);
    });

    test('Example async test', async () => {
        const someVariable: number = 42;
        await expect(someVariable).resolves.toEqual(42);
    });
});
