#!/usr/bin/env node
import {parseArgs, isInteractive} from '../util/args.js';
import {resolveCredentials} from '../config.js';
import {createClient} from '../util/api.js';
import {assertMobileAllowance, assertToken} from '../util/validate.js';
import {select} from '../prompts/index.js';
import {failure, info, setJsonMode} from '../util/output.js';
import {login} from '../commands/login.js';
import {run} from '../commands/run.js';
import {update} from '../commands/update.js';

const USAGE = `testsnag - run mobile tests against a new build

  npx @testsnag/cli                 pick what to do
  npx @testsnag/cli login           store an API token
  npx @testsnag/cli run             trigger tests
  npx @testsnag/cli update          upload a build, bind it to tests, run them

Options
  --test <uuid|name>   repeatable, or comma separated
  --build <path>       the build file to upload
  --run                run the tests after updating
  --wait               block until runs finish, and exit non-zero on failure
  --token <token>      overrides TESTSNAG_TOKEN
  --url <url>          the TestSnag installation
  --json               machine readable output, implies non-interactive
`;

async function chooseCommand(interactive) {
    if (!interactive) {
        return null;
    }

    return select('What do you want to do?', [
        {value: 'run', label: 'Run tests', hint: 'trigger tests that already have a build'},
        {value: 'update', label: 'Update build', hint: 'upload a new build, bind it, and run'},
    ]);
}

async function main() {
    const {command, flags} = parseArgs(process.argv.slice(2));

    setJsonMode(flags.json === true);

    if (flags.help === true || command === 'help') {
        info(USAGE);

        return 0;
    }

    const interactive = isInteractive(flags);

    if (command === 'login') {
        return login({flags, interactive});
    }

    const {token, baseUrl} = await resolveCredentials(flags);

    assertToken(token);

    const client = createClient({baseUrl, token});
    const action = command ?? (await chooseCommand(interactive));

    if (action === null) {
        info(USAGE);

        return 1;
    }

    if (action !== 'run' && action !== 'update') {
        throw new Error(`Unknown command "${action}". Run with --help to see what is available.`);
    }

    await assertMobileAllowance(client);

    return action === 'run' ? run({client, flags, interactive}) : update({client, flags, interactive});
}

main()
    .then((code) => process.exit(code ?? 0))
    .catch((error) => {
        const cause = error?.cause?.message;
        failure(cause && !String(error.message).includes(cause) ? `${error.message} (${cause})` : (error?.message ?? 'Something went wrong.'));
        process.exit(1);
    });
