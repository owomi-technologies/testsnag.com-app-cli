import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp, writeFile, mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {parseArgs, isInteractive} from '../util/args.js';
import {discoverBuilds, formatSize, isRunnable, platformForFile, rejectionReason, describeBuild} from '../util/builds.js';
import {assertPlatformMatches, assertTestsAreMobile, assertToken, assertMobileAllowance} from '../util/validate.js';
import {resolveRequestedTests} from '../commands/run.js';

const TESTS = [
    {uuid: 'aaa', name: 'Checkout, guest user', type: 'ios'},
    {uuid: 'bbb', name: 'Checkout smoke', type: 'ios'},
    {uuid: 'ccc', name: 'Checkout smoke', type: 'android'},
];

test('flags parse into camelCase, and repeated tests collect into a list', () => {
    const {command, flags} = parseArgs(['update', '--build', './a.apk', '--test', 'one', '--test', 'two', '--wait']);

    assert.equal(command, 'update');
    assert.equal(flags.build, './a.apk');
    assert.deepEqual(flags.tests, ['one', 'two']);
    assert.equal(flags.wait, true);
});

test('a test name containing a comma survives, because real names have commas', () => {
    const {flags} = parseArgs(['run', '--test', 'Checkout, guest user']);

    assert.deepEqual(flags.tests, ['Checkout, guest user']);
});

test('an inline flag value is accepted', () => {
    const {flags} = parseArgs(['--url=https://example.test']);

    assert.equal(flags.url, 'https://example.test');
});

test('json output forces non-interactive so CI never blocks on a prompt', () => {
    assert.equal(isInteractive({json: true}), false);
});

test('platform is resolved from the extension', () => {
    assert.equal(platformForFile('Acme.apk'), 'android');
    assert.equal(platformForFile('Acme.apks'), 'android');
    assert.equal(platformForFile('Acme.zip'), 'ios');
    assert.equal(platformForFile('Acme.tar.gz'), 'ios');
    assert.equal(platformForFile('Acme.txt'), null);
});

test('an ipa is rejected with the command that produces a simulator build', () => {
    assert.match(rejectionReason('Acme.ipa'), /iphonesimulator/);
});

test('an aab is rejected with the bundletool command', () => {
    assert.match(rejectionReason('Acme.aab'), /bundletool/);
});

test('sizes read in units a person recognises', () => {
    assert.equal(formatSize(300 * 1024 * 1024), '300MB');
    assert.equal(formatSize(2 * 1024 ** 3), '2.0GB');
});

test('builds are discovered in the usual output directories, newest first', async () => {
    const root = await mkdtemp(join(tmpdir(), 'testsnag-cli-'));
    await mkdir(join(root, 'android/app/build/outputs/apk'), {recursive: true});
    await writeFile(join(root, 'Old.apk'), 'x');
    await new Promise((resolve) => setTimeout(resolve, 10));
    await writeFile(join(root, 'android/app/build/outputs/apk/New.apk'), 'y');
    await writeFile(join(root, 'notes.txt'), 'ignored');

    const found = await discoverBuilds(root);

    assert.equal(found.length, 2);
    assert.equal(found[0].name, 'New.apk');
    assert.equal(found[0].platform, 'android');
});

test('an empty build file is refused before anything is uploaded', async () => {
    const root = await mkdtemp(join(tmpdir(), 'testsnag-cli-'));
    const path = join(root, 'Empty.apk');
    await writeFile(path, '');

    await assert.rejects(() => describeBuild(path), /is empty/);
});

test('a missing token names the command that fixes it', () => {
    assert.throws(() => assertToken(null), /login/);
});

test('a non-mobile test is refused by name', () => {
    assert.throws(() => assertTestsAreMobile([{name: 'Checkout', type: 'web'}]), /Checkout/);
});

test('a build cannot be bound to the other platform', () => {
    assert.throws(() => assertPlatformMatches('android', [{name: 'iOS smoke', type: 'ios'}]), /iOS smoke/);
});

test('the allowance is checked before an upload, not after', async () => {
    const exhausted = {me: async () => ({plan: 'pro', mobile_testing: true, mobile_minutes_used: 120, mobile_minutes_limit: 120})};

    await assert.rejects(() => assertMobileAllowance(exhausted), /device minutes/);
});

test('a plan without mobile testing is refused with the plan named', async () => {
    const basic = {me: async () => ({plan: 'starter', mobile_testing: false, mobile_minutes_used: 0, mobile_minutes_limit: 0})};

    await assert.rejects(() => assertMobileAllowance(basic), /starter/);
});

test('an unlimited allowance passes', async () => {
    const unlimited = {me: async () => ({plan: 'advance', mobile_testing: true, mobile_minutes_used: 999, mobile_minutes_limit: null})};

    assert.equal((await assertMobileAllowance(unlimited)).plan, 'advance');
});

test('a name matches whatever its capitalisation and spacing', () => {
    const [resolved] = resolveRequestedTests(['  checkout, GUEST user '], TESTS);

    assert.equal(resolved.uuid, 'aaa');
});

test('an id always wins, even when a name would also match', () => {
    const [resolved] = resolveRequestedTests(['bbb'], TESTS);

    assert.equal(resolved.uuid, 'bbb');
});

test('an ambiguous name fails rather than silently running both', () => {
    assert.throws(() => resolveRequestedTests(['Checkout smoke'], TESTS), /ambiguous/);
});

test('the ambiguity error names the ids to use instead', () => {
    assert.throws(() => resolveRequestedTests(['Checkout smoke'], TESTS), /bbb, ccc/);
});

test('an unknown name suggests the closest ones', () => {
    assert.throws(() => resolveRequestedTests(['Checkout'], TESTS), /Did you mean/);
});

test('an unknown name with nothing close just says so', () => {
    assert.throws(() => resolveRequestedTests(['Nothing like this'], TESTS), /No test in this workspace matches/);
});

test('the same test asked for twice is only run once', () => {
    assert.equal(resolveRequestedTests(['aaa', 'Checkout, guest user'], TESTS).length, 1);
});

test('a partial name is not accepted, so a typo cannot silently run the wrong test', () => {
    assert.throws(() => resolveRequestedTests(['Checkout sm'], TESTS), /No test in this workspace matches/);
});

test('an ipa is an iOS package that cannot be run, so it keeps its platform', () => {
    assert.equal(platformForFile('Acme.ipa'), 'ios');
    assert.equal(isRunnable('Acme.ipa'), false);
});

test('an aab is an Android package that cannot be run', () => {
    assert.equal(platformForFile('Acme.aab'), 'android');
    assert.equal(isRunnable('Acme.aab'), false);
});

test('a simulator build and an apk are runnable', () => {
    assert.equal(isRunnable('Acme.zip'), true);
    assert.equal(isRunnable('Acme.apk'), true);
});

test('upload only builds are discovered, so they can be stored without binding', async () => {
    const root = await mkdtemp(join(tmpdir(), 'testsnag-cli-'));
    await writeFile(join(root, 'Acme.ipa'), 'x');
    await writeFile(join(root, 'Acme.apk'), 'y');

    const found = await discoverBuilds(root);
    const ipa = found.find((build) => build.name === 'Acme.ipa');

    assert.equal(found.length, 2);
    assert.equal(ipa.platform, 'ios');
    assert.equal(ipa.runnable, false);
});

test('a flutter apk is discovered where flutter actually writes it', async () => {
    const root = await mkdtemp(join(tmpdir(), 'testsnag-cli-'));
    await mkdir(join(root, 'build/app/outputs/flutter-apk'), {recursive: true});
    await writeFile(join(root, 'build/app/outputs/flutter-apk/app-release.apk'), 'x');

    const found = await discoverBuilds(root);

    assert.equal(found.length, 1);
    assert.equal(found[0].name, 'app-release.apk');
});

test('a react native simulator build is discovered once zipped', async () => {
    const root = await mkdtemp(join(tmpdir(), 'testsnag-cli-'));
    await mkdir(join(root, 'ios/build/Build/Products/Debug-iphonesimulator'), {recursive: true});
    await writeFile(join(root, 'ios/build/Build/Products/Debug-iphonesimulator/App.zip'), 'x');

    const found = await discoverBuilds(root);

    assert.equal(found.length, 1);
    assert.equal(found[0].platform, 'ios');
});
