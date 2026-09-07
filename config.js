import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir, readFile, writeFile} from 'node:fs/promises';

export const DEFAULT_BASE_URL = 'https://testsnag.com';
export const CONFIG_DIR = join(homedir(), '.testsnag');
export const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

export async function readConfig() {
    try {
        return JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
    } catch {
        return {};
    }
}

export async function writeConfig(config) {
    await mkdir(CONFIG_DIR, {recursive: true});
    await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', {mode: 0o600});
}

export async function resolveCredentials(flags = {}) {
    const stored = await readConfig();

    return {
        token: flags.token ?? process.env.TESTSNAG_TOKEN ?? stored.token ?? null,
        baseUrl: (flags.url ?? process.env.TESTSNAG_URL ?? stored.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, ''),
    };
}
