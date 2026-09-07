import readline from 'node:readline';

const HIDE_CURSOR = `\u001b[?25l`;
const SHOW_CURSOR = `\u001b[?25h`;
const CLEAR_LINE = `\u001b[2K`;

function paint(code, text) {
    return `\u001b[${code}m${text}\u001b[0m`;
}

function matches(haystack, needle) {
    return needle === '' || haystack.toLowerCase().includes(needle.toLowerCase());
}

function render(state) {
    const {title, filtered, cursor, query, selected, multi} = state;
    const lines = [`${paint(1, title)} ${paint(2, multi ? '(space to select, enter to confirm)' : '(type to filter, enter to choose)')}`];

    lines.push(`  ${paint(2, 'filter:')} ${query}${paint(2, '_')}`);

    if (filtered.length === 0) {
        lines.push(paint(33, '  nothing matches that filter'));
    }

    for (const [index, choice] of filtered.slice(0, 10).entries()) {
        const active = index === cursor;
        const mark = multi ? (selected.has(choice.value) ? '[x]' : '[ ]') : active ? '>' : ' ';
        const label = active ? paint(36, choice.label) : choice.label;
        const hint = choice.hint ? ` ${paint(2, choice.hint)}` : '';
        lines.push(`  ${active && multi ? paint(36, mark) : mark} ${label}${hint}`);
    }

    if (filtered.length > 10) {
        lines.push(paint(2, `  ...and ${filtered.length - 10} more, keep typing to narrow`));
    }

    return lines;
}

export function select(title, choices, {multi = false} = {}) {
    return new Promise((resolve, reject) => {
        if (choices.length === 0) {
            reject(new Error('There is nothing to choose from.'));

            return;
        }

        const state = {title, choices, query: '', cursor: 0, selected: new Set(), multi, filtered: choices};
        let painted = 0;

        readline.emitKeypressEvents(process.stdin);
        if (process.stdin.isTTY) process.stdin.setRawMode(true);

        const draw = () => {
            if (painted > 0) {
                process.stderr.write(`\u001b[${painted}A`);
            }

            const lines = render(state);

            for (const line of lines) {
                process.stderr.write(`${CLEAR_LINE}${line}\n`);
            }

            for (let i = lines.length; i < painted; i++) {
                process.stderr.write(`${CLEAR_LINE}\n`);
            }

            painted = Math.max(lines.length, painted);
        };

        const finish = (value, error) => {
            process.stdin.off('keypress', onKeypress);
            if (process.stdin.isTTY) process.stdin.setRawMode(false);
            process.stderr.write(SHOW_CURSOR);
            process.stdin.pause();
            error ? reject(error) : resolve(value);
        };

        function onKeypress(character, key) {
            if (key.ctrl && key.name === 'c') {
                finish(null, new Error('Cancelled.'));

                return;
            }

            if (key.name === 'up') state.cursor = Math.max(0, state.cursor - 1);
            else if (key.name === 'down') state.cursor = Math.min(state.filtered.length - 1, state.cursor + 1);
            else if (key.name === 'backspace') state.query = state.query.slice(0, -1);
            else if (key.name === 'space' && multi) {
                const choice = state.filtered[state.cursor];
                if (choice) state.selected.has(choice.value) ? state.selected.delete(choice.value) : state.selected.add(choice.value);
            } else if (key.name === 'return') {
                const choice = state.filtered[state.cursor];

                if (multi) {
                    const values = state.selected.size > 0 ? [...state.selected] : choice ? [choice.value] : [];

                    if (values.length === 0) return;

                    finish(values);

                    return;
                }

                if (!choice) return;

                finish(choice.value);

                return;
            } else if (character && !key.ctrl && !key.meta && key.name !== 'space') state.query += character;

            state.filtered = state.choices.filter((choice) => matches(`${choice.label} ${choice.hint ?? ''}`, state.query));
            state.cursor = Math.min(state.cursor, Math.max(0, state.filtered.length - 1));
            draw();
        }

        process.stderr.write(HIDE_CURSOR);
        process.stdin.resume();
        process.stdin.on('keypress', onKeypress);
        draw();
    });
}

export function ask(question, {defaultValue = ''} = {}) {
    const rl = readline.createInterface({input: process.stdin, output: process.stderr});

    return new Promise((resolve) => {
        rl.question(`${question}${defaultValue ? ` ${paint(2, `(${defaultValue})`)}` : ''} `, (answer) => {
            rl.close();
            resolve(answer.trim() === '' ? defaultValue : answer.trim());
        });
    });
}

export async function confirm(question, defaultYes = true) {
    const answer = await ask(`${question} ${paint(2, defaultYes ? '[Y/n]' : '[y/N]')}`, {defaultValue: defaultYes ? 'y' : 'n'});

    return answer.toLowerCase().startsWith('y');
}
