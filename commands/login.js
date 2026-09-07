import {createClient} from '../util/api.js';
import {ask} from '../prompts/index.js';
import {readConfig, writeConfig, DEFAULT_BASE_URL} from '../config.js';
import {emit, info, success} from '../util/output.js';

export async function login({flags, interactive}) {
    const stored = await readConfig();

    const baseUrl = (
        flags.url ??
        (interactive ? await ask('TestSnag URL', {defaultValue: stored.baseUrl ?? DEFAULT_BASE_URL}) : (stored.baseUrl ?? DEFAULT_BASE_URL))
    ).replace(/\/+$/, '');

    const token = flags.token ?? process.env.TESTSNAG_TOKEN ?? (interactive ? await ask('API token') : null);

    if (!token) {
        throw new Error('Pass --token, or set TESTSNAG_TOKEN. Create one in your workspace settings, under API tokens.');
    }

    const account = await createClient({baseUrl, token}).me();

    await writeConfig({...stored, baseUrl, token});

    success(`Signed in to ${account.workspace.name} as ${account.user.email}.`);
    info(`Token saved to ~/.testsnag/config.json`);
    emit({workspace: account.workspace, plan: account.plan});

    return 0;
}
