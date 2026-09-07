const LIST_FLAGS = new Set(['test', 'tests']);

export function parseArgs(argv) {
    const flags = {};
    const positional = [];

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];

        if (!arg.startsWith('--')) {
            positional.push(arg);
            continue;
        }

        const [rawName, inlineValue] = arg.slice(2).split(/=(.*)/s);
        const name = rawName.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        const next = argv[i + 1];
        const value = inlineValue ?? (next !== undefined && !next.startsWith('--') ? argv[++i] : true);

        if (LIST_FLAGS.has(rawName)) {
            const values = String(value)
                .split(',')
                .map((entry) => entry.trim())
                .filter(Boolean);
            flags.tests = [...(flags.tests ?? []), ...values];
            continue;
        }

        flags[name] = value;
    }

    return {command: positional[0] ?? null, positional: positional.slice(1), flags};
}

export function isInteractive(flags = {}) {
    if (flags.json === true || flags.yes === true) {
        return false;
    }

    return process.stdin.isTTY === true && process.stdout.isTTY === true;
}
