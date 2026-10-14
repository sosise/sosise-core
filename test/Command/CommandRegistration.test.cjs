const assert = require('node:assert/strict');
const { execFile, spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const CommandRegistration = require('../../build/Command/CommandRegistration').default;

const SIGNATURE = 'sosise:pid-lock-test';
const MODULE_PATH = path.resolve(__dirname, '../../build/Command/CommandRegistration');
const PID_DIRECTORY = '/tmp/';

// Child scripts build the registration the same way, the signature reaches them as an argument
const CHILD_PRELUDE = `const fs = require('fs');
    const registration = new (require(${JSON.stringify(MODULE_PATH)}).default)(null);
    const signature = ${JSON.stringify(SIGNATURE)};`;

/**
 * Find a pid no process holds right now and no pid file is named after
 */
function findFreePid() {
    for (let pid = 4242; ; pid++) {
        if (fs.existsSync(pidFilePath(pid))) {
            continue;
        }
        try {
            process.kill(pid, 0);
        } catch (error) {
            if (error.code === 'ESRCH') {
                return pid;
            }
        }
    }
}

/**
 * Path of the pid file the framework writes for the given pid
 */
function pidFilePath(pid) {
    return PID_DIRECTORY + pid + '.pid';
}

/**
 * Start a long running process whose command line carries the signature and the given arguments
 */
async function startCommandProcess(t, args) {
    const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)', SIGNATURE, ...args], { stdio: 'ignore' });
    t.after(() => child.kill());
    await new Promise((resolve) => child.once('spawn', resolve));

    return child;
}

/**
 * Run a script in a child process whose command line carries the signature, resolve with its exit code and output
 */
function runScript(script) {
    return new Promise((resolve) => {
        execFile(process.execPath, ['-e', CHILD_PRELUDE + script, SIGNATURE], (error, stdout) => {
            resolve({ code: error ? error.code : 0, stdout });
        });
    });
}

test('a stale pid that appears in the arguments of a running command does not block it', async (t) => {
    let stalePid;
    let child;

    // The OS may hand the free pid to the child itself, then it is no longer stale
    do {
        stalePid = findFreePid();
        child = await startCommandProcess(t, ['--limit', String(stalePid)]);
    } while (child.pid === stalePid);

    const registration = new CommandRegistration(null);

    assert.equal(await registration.checkIfProcessExistsByPidAndCmd(stalePid, SIGNATURE), false);
});

test('a running command with the same signature is reported as running', async (t) => {
    const child = await startCommandProcess(t, []);

    const registration = new CommandRegistration(null);

    assert.equal(await registration.checkIfProcessExistsByPidAndCmd(child.pid, SIGNATURE), true);
});

test('a pid file holding the pid of the current process does not block it', async () => {
    const { stdout } = await runScript(`registration.checkIfProcessExistsByPidAndCmd(process.pid, signature)
        .then((result) => process.stdout.write(String(result)));`);

    assert.equal(stdout, 'false');
});

test('a pid file holding the pid of the "sh ./artisan" wrapper does not block it', async () => {
    const script = `${CHILD_PRELUDE} registration.checkIfProcessExistsByPidAndCmd(process.ppid, signature)
        .then((result) => process.stdout.write(String(result)));`;

    // The trailing "true" keeps sh alive as the parent, its command line carries the signature like ./artisan does
    const stdout = await new Promise((resolve, reject) => {
        execFile(
            'sh',
            ['-c', '"$NODE_BINARY" -e "$CHILD_SCRIPT"; true', SIGNATURE],
            { env: { ...process.env, NODE_BINARY: process.execPath, CHILD_SCRIPT: script } },
            (error, output) => (error ? reject(error) : resolve(output)),
        );
    });

    assert.equal(stdout, 'false');
});

test('the pid file exists while the command runs and is removed when it finishes', async () => {
    const { code, stdout } = await runScript(`registration.createPidFile(signature);
        process.stdout.write(process.pid + ' ' + fs.existsSync('/tmp/' + process.pid + '.pid'));`);
    const [pid, existedWhileRunning] = stdout.split(' ');

    assert.equal(code, 0);
    assert.equal(existedWhileRunning, 'true');
    assert.equal(fs.existsSync(pidFilePath(pid)), false);
});

test('the pid file is removed when reporting the failure of the command fails too', async () => {
    const { code, stdout } = await runScript(`registration.createPidFile(signature);
        process.stdout.write(String(process.pid));
        Promise.reject(new TypeError('exception handler failed'));`);

    // The pid is printed only after the pid file was created, so an empty output means the scenario never ran
    assert.equal(code, 1);
    assert.match(stdout, /^\d+$/);
    assert.equal(fs.existsSync(pidFilePath(stdout)), false);
});

test('a stale pid file of the same command is removed and the command runs', async (t) => {
    const stalePid = findFreePid();
    fs.writeFileSync(pidFilePath(stalePid), JSON.stringify({ signature: SIGNATURE, pid: stalePid }));
    t.after(() => fs.rmSync(pidFilePath(stalePid), { force: true }));

    const { code, stdout } = await runScript(`registration.preventDoubleExecution(signature)
        .then(() => process.stdout.write('ran'));`);

    assert.equal(code, 0);
    assert.equal(stdout, 'ran');
    assert.equal(fs.existsSync(pidFilePath(stalePid)), false);
});

test('a running execution of the same command blocks the next one', async (t) => {
    const script = `${CHILD_PRELUDE} registration.preventDoubleExecution(signature).then(() => {
        process.stdout.write('ready');
        setTimeout(() => {}, 30000);
    });`;
    const running = spawn(process.execPath, ['-e', script, SIGNATURE]);

    // A killed process leaves its pid file behind, exactly what the framework expects the next execution to handle
    t.after(() => {
        running.kill();
        fs.rmSync(pidFilePath(running.pid), { force: true });
    });
    await new Promise((resolve) => running.stdout.once('data', resolve));

    const { code, stdout } = await runScript(`registration.preventDoubleExecution(signature)
        .then(() => process.stdout.write('ran'));`);

    assert.equal(code, 1);
    assert.match(stdout, /is running/);
});
