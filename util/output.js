const COLOURS = {reset: '\u001b[0m', dim: '\u001b[2m', red: '\u001b[31m', green: '\u001b[32m', yellow: '\u001b[33m'};

let jsonMode = false;

export function setJsonMode(value) {
    jsonMode = value === true;
}

function paint(colour, text) {
    return process.stdout.isTTY ? `${COLOURS[colour]}${text}${COLOURS.reset}` : text;
}

export function info(message) {
    if (!jsonMode) console.error(message);
}

export function muted(message) {
    if (!jsonMode) console.error(paint('dim', message));
}

export function success(message) {
    if (!jsonMode) console.error(`${paint('green', 'OK')} ${message}`);
}

export function warn(message) {
    if (!jsonMode) console.error(`${paint('yellow', '!')} ${message}`);
}

export function failure(message) {
    if (jsonMode) {
        process.stdout.write(JSON.stringify({error: message}, null, 2) + '\n');

        return;
    }

    console.error(`${paint('red', 'x')} ${message}`);
}

export function emit(payload) {
    if (jsonMode) process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
}
