import {stat, readdir} from 'node:fs/promises';
import {basename, extname, join, resolve} from 'node:path';

export const BUILD_TYPES = {
    '.zip': {platform: 'ios', runnable: true},
    '.tar.gz': {platform: 'ios', runnable: true},
    '.tgz': {platform: 'ios', runnable: true},
    '.ipa': {platform: 'ios', runnable: false},
    '.apk': {platform: 'android', runnable: true},
    '.apks': {platform: 'android', runnable: true},
    '.aab': {platform: 'android', runnable: false},
};

const SEARCH_DIRECTORIES = ['.', 'build', 'dist', 'ios/build', 'android/app/build/outputs/apk', 'android/app/build/outputs/apk/release'];

export function buildType(name) {
    const lower = name.toLowerCase();
    const extension = Object.keys(BUILD_TYPES).find((candidate) => lower.endsWith(candidate));

    return extension === undefined ? null : BUILD_TYPES[extension];
}

export function platformForFile(name) {
    return buildType(name)?.platform ?? null;
}

export function isRunnable(name) {
    return buildType(name)?.runnable === true;
}

export function rejectionReason(name) {
    const lower = name.toLowerCase();

    if (lower.endsWith('.ipa')) {
        return 'An .ipa is a device build and cannot run on a simulator. Build with "xcodebuild -sdk iphonesimulator" and zip the .app bundle.';
    }

    if (lower.endsWith('.aab')) {
        return 'An .aab cannot be installed directly. Convert it first: "bundletool build-apks --mode=universal".';
    }

    return `${basename(name)} is not a build TestSnag can run. Use a zipped simulator build for iOS, or an .apk or .apks for Android.`;
}

export async function discoverBuilds(cwd = process.cwd()) {
    const found = new Map();

    for (const directory of SEARCH_DIRECTORIES) {
        const absolute = resolve(cwd, directory);

        let entries = [];

        try {
            entries = await readdir(absolute, {withFileTypes: true});
        } catch {
            continue;
        }

        for (const entry of entries) {
            if (!entry.isFile() || buildType(entry.name) === null) {
                continue;
            }

            const path = join(absolute, entry.name);

            if (found.has(path)) {
                continue;
            }

            try {
                const info = await stat(path);
                found.set(path, {
                    path,
                    name: entry.name,
                    size: info.size,
                    modifiedAt: info.mtimeMs,
                    platform: platformForFile(entry.name),
                    runnable: isRunnable(entry.name),
                });
            } catch {
                continue;
            }
        }
    }

    return [...found.values()].sort((a, b) => b.modifiedAt - a.modifiedAt);
}

export async function describeBuild(path) {
    const absolute = resolve(path);
    const info = await stat(absolute);

    if (!info.isFile()) {
        throw new Error(`${absolute} is not a file.`);
    }

    if (info.size === 0) {
        throw new Error(`${absolute} is empty.`);
    }

    return {
        path: absolute,
        name: basename(absolute),
        size: info.size,
        platform: platformForFile(absolute),
        runnable: isRunnable(absolute),
        extension: extname(absolute),
    };
}

export function formatSize(bytes) {
    if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)}GB`;
    if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)}MB`;

    return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}
