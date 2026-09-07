import {select, confirm} from '../prompts/index.js';
import {assertTestsAreMobile} from '../util/validate.js';
import {emit, failure, info, muted, spinner, success, warn} from '../util/output.js';

const POLL_INTERVAL_MS = 3000;
const TERMINAL = new Set(['passed', 'failed', 'cancelled', 'skipped']);

function normalise(value) {
    return String(value ?? '')
        .trim()
        .toLowerCase();
}

function closestNames(entry, tests) {
    const needle = normalise(entry);

    return tests
        .filter((test) => normalise(test.name).includes(needle) || needle.includes(normalise(test.name)))
        .map((test) => test.name)
        .slice(0, 5);
}

export function resolveRequestedTests(requested, tests) {
    const resolved = [];

    for (const entry of requested) {
        const byId = tests.filter((test) => test.uuid === entry);
        const matches = byId.length > 0 ? byId : tests.filter((test) => normalise(test.name) === normalise(entry));

        if (matches.length === 0) {
            const suggestions = closestNames(entry, tests);

            throw new Error(
                `No test in this workspace matches "${entry}".` + (suggestions.length > 0 ? ` Did you mean: ${suggestions.join(', ')}?` : ''),
            );
        }

        if (matches.length > 1) {
            throw new Error(
                `"${entry}" matches ${matches.length} tests, so it is ambiguous. Use the id instead: ${matches.map((test) => test.uuid).join(', ')}.`,
            );
        }

        if (!resolved.some((test) => test.uuid === matches[0].uuid)) {
            resolved.push(matches[0]);
        }
    }

    return resolved;
}

export async function chooseTests(client, {flags, interactive, type = null, message = 'Which tests?'}) {
    const requested = flags.tests ?? [];
    const {data} = await client.tests(type);

    if (requested.length > 0) {
        return resolveRequestedTests(requested, data);
    }

    if (!interactive) {
        throw new Error('Pass --test <id or name>. Repeat the flag once per test.');
    }

    if (data.length === 0) {
        throw new Error(type ? `This workspace has no ${type} tests yet.` : 'This workspace has no tests yet.');
    }

    const chosen = await select(
        message,
        data.map((test) => ({
            value: test.uuid,
            label: test.name,
            hint: `${test.type}${test.build?.file_name ? ` · ${test.build.file_name}` : ''}`,
        })),
        {multi: true},
    );

    return data.filter((test) => chosen.includes(test.uuid));
}

export async function waitForRun(client, reference, onTick) {
    const startedAt = Date.now();

    for (;;) {
        const {data} = await client.run(reference);

        if (TERMINAL.has(data.status)) {
            return data;
        }

        onTick?.(data, Math.round((Date.now() - startedAt) / 1000));

        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
}

export async function runTests(client, tests, {wait}) {
    const started = [];

    for (const test of tests) {
        const {data} = await client.startRun(test.uuid);
        started.push({...data, test: test.name});
        info(`Started ${test.name} (${data.reference})`);
    }

    if (!wait) {
        muted('Not waiting for results. Pass --wait to block until they finish.');
        emit({runs: started});

        return 0;
    }

    muted('Runs happen on our servers, so you can close this at any time and they will finish without you.');

    const results = [];

    for (const run of started) {
        const label = run.test ?? run.reference;
        const progress = spinner(`Running ${label}`);
        const finished = await waitForRun(client, run.reference, (data, seconds) => {
            const steps = data.steps_total > 0 ? ` ${data.steps_passed + data.steps_failed}/${data.steps_total} steps` : '';
            progress.update(`Running ${label}${steps} (${seconds}s)`);
        });

        progress.stop();
        results.push(finished);

        if (finished.status === 'passed') {
            success(`${finished.test ?? run.test} passed (${finished.steps_passed}/${finished.steps_total} steps)`);
        } else {
            failure(`${finished.test ?? run.test} ${finished.status}: ${finished.error_message ?? 'no error reported'}`);
            muted(finished.url);
        }
    }

    emit({runs: results});

    const failed = results.filter((run) => run.status !== 'passed');

    if (failed.length > 0) {
        warn(`${failed.length} of ${results.length} runs did not pass.`);

        return 1;
    }

    return 0;
}

export async function run({client, flags, interactive}) {
    const tests = await chooseTests(client, {flags, interactive, message: 'Which tests do you want to run?'});

    if (tests.length === 0) {
        throw new Error('No tests selected.');
    }

    const wait = flags.wait === true || (interactive && (await confirm('Wait for the results?', true)));

    return runTests(client, tests, {wait});
}

export {assertTestsAreMobile};
