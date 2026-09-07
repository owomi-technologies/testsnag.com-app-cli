export class ApiError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
    }
}

export function createClient({baseUrl, token}) {
    async function request(method, path, body) {
        const response = await fetch(`${baseUrl}/api/v1${path}`, {
            method,
            headers: {
                Accept: 'application/json',
                Authorization: `Bearer ${token}`,
                ...(body === undefined ? {} : {'Content-Type': 'application/json'}),
            },
            body: body === undefined ? undefined : JSON.stringify(body),
        });

        const text = await response.text();
        let payload = null;

        try {
            payload = text === '' ? null : JSON.parse(text);
        } catch {
            throw new ApiError(`${baseUrl} did not return JSON. Check the URL points at a TestSnag installation.`, response.status);
        }

        if (!response.ok) {
            throw new ApiError(payload?.message ?? `Request failed with status ${response.status}.`, response.status);
        }

        return payload;
    }

    return {
        me: () => request('GET', '/me'),
        tests: (type) => request('GET', type ? `/tests?type=${encodeURIComponent(type)}` : '/tests'),
        createBuild: (name, platform, size) => request('POST', '/builds', {name, platform, size}),
        completeBuild: (id) => request('POST', `/builds/${id}/complete`),
        bindBuild: (id, tests) => request('POST', `/builds/${id}/bind`, {tests}),
        startRun: (uuid) => request('POST', `/tests/${uuid}/runs`),
        run: (reference) => request('GET', `/runs/${encodeURIComponent(reference)}`),
    };
}

export async function uploadBuild(uploadUrl, filePath, size, onProgress, headers = {}) {
    const {createReadStream} = await import('node:fs');
    const {Readable} = await import('node:stream');

    // Counting has to happen as fetch pulls the file. A 'data' listener would
    // put the stream in flowing mode and consume bytes before they are sent.
    async function* body() {
        let sent = 0;

        for await (const chunk of createReadStream(filePath)) {
            sent += chunk.length;
            onProgress?.(sent, size);
            yield chunk;
        }
    }

    let response;

    try {
        response = await fetch(uploadUrl, {
            method: 'PUT',
            body: Readable.from(body()),
            duplex: 'half',
            headers: {...headers, 'Content-Length': String(size)},
        });
    } catch (error) {
        throw new ApiError(`The build could not be uploaded: ${error?.cause?.message ?? error.message}`, 0);
    }

    if (!response.ok) {
        throw new ApiError(`The upload was rejected with status ${response.status}.`, response.status);
    }
}
