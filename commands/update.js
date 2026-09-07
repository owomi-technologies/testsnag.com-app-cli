import {uploadBuild} from '../util/api.js';
import {ask, confirm, select} from '../prompts/index.js';
import {chooseTests, runTests} from './run.js';
import {assertPlatformMatches, assertTestsAreMobile} from '../util/validate.js';
import {describeBuild, discoverBuilds, formatSize, platformForFile, rejectionReason} from '../util/builds.js';
import {emit, failure, info, muted, success} from '../util/output.js';

const PUBLISH_POLL_MS = 3000;
const PUBLISH_TIMEOUT_MS = 10 * 60 * 1000;

async function chooseBuild({flags, interactive}) {
    if (typeof flags.build === 'string') {
        return describeBuild(flags.build);
    }

    if (!interactive) {
        throw new Error('Pass --build <path to the build file>.');
    }

    const discovered = await discoverBuilds();

    if (discovered.length === 0) {
        const entered = await ask('Path to the build file');

        if (entered === '') {
            throw new Error('No build given.');
        }

        return describeBuild(entered);
    }

    const chosen = await select('Which build?', [
        ...discovered.map((build) => ({
            value: build.path,
            label: build.name,
            hint: `${build.platform} · ${formatSize(build.size)}`,
        })),
        {value: '', label: 'Enter a path instead', hint: ''},
    ]);

    if (chosen === '') {
        return describeBuild(await ask('Path to the build file'));
    }

    return describeBuild(chosen);
}

async function waitForPublish(client, tests) {
    const deadline = Date.now() + PUBLISH_TIMEOUT_MS;
    const pending = new Set(tests.map((test) => test.uuid));
    const failures = [];

    while (pending.size > 0 && Date.now() < deadline) {
        const {data} = await client.tests();

        for (const test of data) {
            if (!pending.has(test.uuid)) {
                continue;
            }

            if (test.build?.status === 'ready') {
                pending.delete(test.uuid);
                success(`${test.name} is ready`);
            } else if (test.build?.status === 'failed') {
                pending.delete(test.uuid);
                failures.push(test.name);
                failure(`${test.name} could not publish the build`);
            }
        }

        if (pending.size > 0) {
            await new Promise((resolve) => setTimeout(resolve, PUBLISH_POLL_MS));
        }
    }

    if (pending.size > 0) {
        throw new Error('The build was still publishing after 10 minutes. Check the dashboard.');
    }

    if (failures.length > 0) {
        throw new Error(`The build could not be published for: ${failures.join(', ')}.`);
    }
}

export async function update({client, flags, interactive}) {
    const build = await chooseBuild({flags, interactive});

    if (build.platform === null) {
        throw new Error(rejectionReason(build.name));
    }

    info(`${build.name} (${formatSize(build.size)}, ${build.platform})`);

    const tests = await chooseTests(client, {
        flags,
        interactive,
        type: build.platform,
        message: `Which tests should run ${build.name}?`,
    });

    if (tests.length === 0) {
        throw new Error('No tests selected.');
    }

    assertTestsAreMobile(tests);
    assertPlatformMatches(build.platform, tests);

    const {data: created} = await client.createBuild(build.name, build.platform, build.size);

    let lastPercent = -1;

    await uploadBuild(created.upload_url, build.path, build.size, (sent, total) => {
        const percent = Math.floor((sent / total) * 100);

        if (percent !== lastPercent && percent % 5 === 0) {
            lastPercent = percent;
            muted(`uploading ${percent}%`);
        }
    });

    await client.completeBuild(created.id);
    success(`Uploaded ${build.name}`);

    await client.bindBuild(
        created.id,
        tests.map((test) => test.uuid),
    );
    info(`Publishing to ${tests.length} ${tests.length === 1 ? 'test' : 'tests'}...`);

    await waitForPublish(client, tests);

    emit({build: {id: created.id, name: build.name}, tests: tests.map((test) => ({uuid: test.uuid, name: test.name}))});

    const shouldRun = flags.run === true || (interactive && (await confirm('Run these tests now?', true)));

    if (!shouldRun) {
        return 0;
    }

    const wait = flags.wait === true || interactive;

    return runTests(client, tests, {wait});
}
