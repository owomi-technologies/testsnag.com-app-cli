import {ApiError} from './api.js';

export function assertToken(token) {
    if (!token) {
        throw new Error('No API token. Run "npx @testsnag/cli login", or set TESTSNAG_TOKEN.');
    }
}

export async function assertMobileAllowance(client) {
    let account;

    try {
        account = await client.me();
    } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
            throw new Error('That API token is not valid. Run "npx @testsnag/cli login" to issue a new one.');
        }

        throw error;
    }

    if (account.mobile_testing !== true) {
        throw new Error(`Mobile testing is not included in the ${account.plan} plan. Upgrade the workspace to run mobile tests.`);
    }

    const limit = account.mobile_minutes_limit;

    if (limit !== null && account.mobile_minutes_used >= limit) {
        throw new Error(`This workspace has used all ${limit} device minutes this month. They reset at the start of next month.`);
    }

    return account;
}

export function assertTestsAreMobile(tests) {
    const wrong = tests.filter((test) => test.type !== 'ios' && test.type !== 'android');

    if (wrong.length > 0) {
        throw new Error(`Not a mobile test: ${wrong.map((test) => test.name).join(', ')}.`);
    }
}

export function assertPlatformMatches(platform, tests) {
    const mismatched = tests.filter((test) => test.type !== platform);

    if (mismatched.length > 0) {
        throw new Error(`This is an ${platform} build, so it cannot be bound to ${mismatched.map((test) => `"${test.name}"`).join(', ')}.`);
    }
}
