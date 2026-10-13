const assert = require('node:assert/strict');
const { execFile, spawn } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');
const CommandRegistration = require('../../build/Command/CommandRegistration').default;

const SIGNATURE = 'sosise:pid-lock-test';
const MODULE_PATH = path.resolve(__dirname, '../../build/Command/CommandRegistration');

// A pid no process holds right now
const findFreePid = () => {
    for (let pid = 4242; ; pid++) {
        try {
            process.kill(pid, 0);
        } catch (error) {
            if (error.code === 'ESRCH') {
                return pid;
            }
        }
    }
};

// A process whose command line carries the signature and the given arguments
const startCommandProcess = async (t, args) => {
    const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)', SIGNATURE, ...args], { stdio: 'ignore' });
    t.after(() => child.kill());
    await new Promise((resolve) => child.once('spawn', resolve));
    return child;
};

test('a stale pid that appears in the arguments of a running command does not block it', async (t) => {
    const stalePid = findFreePid();
    await startCommandProcess(t, ['--limit', String(stalePid)]);

    const registration = new CommandRegistration(null);

    assert.equal(await registration.checkIfProcessExistsByPidAndCmd(stalePid, SIGNATURE), false);
});

test('a running command with the same signature is reported as running', async (t) => {
    const child = await startCommandProcess(t, []);

    const registration = new CommandRegistration(null);

    assert.equal(await registration.checkIfProcessExistsByPidAndCmd(child.pid, SIGNATURE), true);
});

test('a pid file holding the pid of the current process does not block it', async () => {
    const script = `new (require(${JSON.stringify(MODULE_PATH)}).default)(null)
        .checkIfProcessExistsByPidAndCmd(process.pid, ${JSON.stringify(SIGNATURE)})
        .then((result) => process.stdout.write(String(result)));`;

    const output = await new Promise((resolve, reject) => {
        execFile(process.execPath, ['-e', script, SIGNATURE], (error, stdout) => (error ? reject(error) : resolve(stdout)));
    });

    assert.equal(output, 'false');
});
