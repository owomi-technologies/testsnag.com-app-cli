# TestSnag CLI

Upload a mobile build, point tests at it, and run them.

```bash
npx @testsnag/cli
```

## Getting started

Create a token in your workspace settings, under **API tokens**, then:

```bash
npx @testsnag/cli login
```

The token is stored in `~/.testsnag/config.json`. In CI, set `TESTSNAG_TOKEN` instead and skip the login step.

## Commands

| Command  | What it does                                   |
| -------- | ---------------------------------------------- |
| `login`  | Store an API token and the installation URL    |
| `run`    | Trigger tests that already have a build        |
| `update` | Upload a build, bind it to tests, and run them |

Run with no command to pick interactively.

## Options

| Flag                | Meaning                                                       |
| ------------------- | ------------------------------------------------------------- |
| `--test <id\|name>` | The test id, or its full name. Repeat the flag for each test. |
| `--build <path>`    | The build file to upload                                      |
| `--run`             | Run the tests after updating                                  |
| `--wait`            | Block until runs finish, exit non-zero on failure             |
| `--token <token>`   | Overrides `TESTSNAG_TOKEN`                                    |
| `--url <url>`       | The TestSnag installation                                     |
| `--json`            | Machine readable output, implies non-interactive              |

## In CI

Supply every input as a flag and there is no prompt, so it runs without a TTY:

```bash
TESTSNAG_TOKEN=$TESTSNAG_TOKEN npx @testsnag/cli update \
    --build ./android/app/build/outputs/apk/release/app-release.apk \
    --test "Checkout smoke" --test "Sign up" \
    --run --wait --json
```

The exit code is non-zero when a run fails, so the pipeline stops.

## Builds

iOS takes a zipped simulator build (`.zip`, `.tar.gz`, `.tgz`), produced with `xcodebuild -sdk iphonesimulator`. An `.ipa` is a
device build and is refused.

Android takes an `.apk` or `.apks`. An `.aab` is refused; convert it with `bundletool build-apks --mode=universal` first.

Interactively, the CLI lists build artifacts it finds in the working directory and the usual output directories, newest first.

## Development

```bash
npm test
npm run format
```

No build step, no TypeScript. Node 20 or newer.
