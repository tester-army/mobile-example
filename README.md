# TesterArmy Mobile Testing Example

Example [Expo](https://expo.dev) app demonstrating [TesterArmy's](https://tester.army) AI-powered mobile testing. Built with Expo SDK 54, React Native 0.81, and React 19.

TesterArmy runs your app on cloud simulators and uses AI agents to click through it like real users — catching regressions without brittle selector-based tests.

## Prerequisites

- [Node.js](https://nodejs.org/)
- [Xcode](https://developer.apple.com/xcode/) (for iOS simulator builds)
- [TesterArmy account](https://tester.army/sign-in) + API key (Team Settings → API Keys)

## Getting Started

```bash
npm install
npx expo start
```

See [Expo docs](https://docs.expo.dev/) for emulator/simulator setup.

## Building for iOS Simulator

Generate the native project and build a simulator binary:

```bash
# Generate native iOS project
npx expo prebuild --platform ios

# Build for simulator
xcodebuild -workspace ios/testerarmy.xcworkspace \
  -scheme testerarmy \
  -configuration Debug \
  -sdk iphonesimulator \
  -derivedDataPath build \
  build

# The built app bundle will be available at:
# build/Build/Products/Debug-iphonesimulator/testerarmy.app
```

TesterArmy can upload the `.app` bundle directory directly, so you do not need to zip it first.

## Running Tests with EAS Workflows

This repo includes `.eas/workflows/testerarmy-mobile-tests.yml`. The workflow builds an iOS Simulator app with EAS Build, uploads the app with `testerarmy`, and runs your TesterArmy dashboard test group.

### 1. Configure EAS environment variables

Add these variables to the EAS environment you want to use, for example `preview`:

| Variable | Description |
|----------|-------------|
| `TESTERARMY_API_KEY` | API key from Team Settings -> API Keys |
| `TESTERARMY_PROJECT_ID` | Your TesterArmy project ID |
| `TESTERARMY_GROUP_ID` | TesterArmy dashboard test group ID |

The workflow also accepts `project_id` and `group_id` inputs, which override the EAS environment variables for manual runs.

### 2. Run the workflow

If the project and group IDs are configured in EAS env vars:

```bash
npx eas-cli@latest workflow:run .eas/workflows/testerarmy-mobile-tests.yml --wait
```

Or pass them explicitly:

```bash
npx eas-cli@latest workflow:run .eas/workflows/testerarmy-mobile-tests.yml \
  --wait \
  --input project_id=<testerarmy-project-id> \
  --input group_id=<testerarmy-group-id>
```

The workflow uses `npx --yes testerarmy@latest`, so it does not require adding the TesterArmy CLI to your app dependencies.

## Running Tests in GitHub Actions

This repo uses `.github/workflows/test-mobile-app.yml` to build the iOS simulator app and run TesterArmy automatically with `tester-army/mobile-github-action@v1.0.1`.

### 1. Add the required GitHub secrets

| Secret | Description |
|--------|-------------|
| `TESTERARMY_API_KEY` | API key from Team Settings → API Keys |
| `TESTERARMY_PROJECT_ID` | Your TesterArmy project ID |
| `TESTERARMY_WEBHOOK_URL` | Group webhook URL (includes secret) |

### 2. Use the action in your workflow

After building your `.app` bundle or downloading it from a previous job, call the shared action:

```yaml
- name: Upload app and run TesterArmy tests
  id: mobile
  uses: tester-army/mobile-github-action@v1.0.1
  with:
    app_path: .build/testerarmy.app
    api_key: ${{ secrets.TESTERARMY_API_KEY }}
    project_id: ${{ secrets.TESTERARMY_PROJECT_ID }}
    webhook_url: ${{ secrets.TESTERARMY_WEBHOOK_URL }}
    delete_app_after_run: "true"
    remove_after: "3600"
```

The action handles the full mobile flow for you: upload the app, trigger your test group through the webhook, wait for the runs to finish, and delete the uploaded app afterward.

### 3. Trigger the workflow

This example workflow runs on pull requests, on pushes to `main`, and manually through `workflow_dispatch`.

You do not need to upload the app in the TesterArmy dashboard or call the upload API yourself unless you want a custom integration outside GitHub Actions.

## Writing Tests

Create tests in the [TesterArmy dashboard](https://tester.army) with step-by-step prompts. Guide the agent like you would a human user.

**Weak prompt:** *"Check the explore tab"*

**Strong prompt:** *"Tap the Explore tab at the bottom, scroll down to the 'File-based routing' section, tap to expand it, verify the content is visible"*

Both work, but specific prompts produce more reliable tests.

## CI Notes

The full example lives in `.github/workflows/test-mobile-app.yml`. It builds the app on `macos-latest`, passes the `.app` artifact to a Linux job, and then runs the shared TesterArmy action there.

See the [CI Integration guide](https://tester.army/docs/mobile/ci-integration) for more details and additional workflow patterns.

## Links

- [TesterArmy — Mobile Testing Overview](https://tester.army/docs/mobile/overview)
- [TesterArmy — App Uploads](https://tester.army/docs/mobile/app-uploads)
- [TesterArmy — Writing Mobile Tests](https://tester.army/docs/mobile/writing-tests)
- [TesterArmy — CI Integration](https://tester.army/docs/mobile/ci-integration)
- [Expo Documentation](https://docs.expo.dev/)
