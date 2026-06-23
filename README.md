# TesterArmy Mobile Testing Example

Example [Expo](https://expo.dev) app demonstrating [TesterArmy's](https://tester.army) AI-powered mobile testing. Built with Expo SDK 54, React Native 0.81, and React 19.

TesterArmy runs your app on cloud simulators/emulators and uses AI agents to click through it like real users — catching regressions without brittle selector-based tests.

## Prerequisites

- [Node.js](https://nodejs.org/)
- [Xcode](https://developer.apple.com/xcode/) (for iOS simulator builds)
- Android SDK/JDK (for local Android app builds)
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

## Building for Android

Generate the native project and build a release APK:

```bash
# Generate native Android project
npx expo prebuild --platform android --no-install

# Build a release APK with the JavaScript bundle and assets embedded
cd android
./gradlew :app:assembleRelease

# The built APK will be available under:
# android/app/build/outputs/apk/release/
```

TesterArmy runs Android builds without a Metro dev server, so use a release APK rather than a debug APK.

## Running Tests with EAS Workflows

This repo uses `.eas/workflows/testerarmy-mobile-tests.yml` to build the iOS simulator app and Android app, then run TesterArmy automatically with `npx --yes testerarmy@latest`.

### 1. Add the required EAS environment variables

Add these variables to the EAS environment you want to use, for example `preview`:

| Variable | Description |
|----------|-------------|
| `TESTERARMY_API_KEY` | API key from Team Settings → API Keys |
| `TESTERARMY_PROJECT_ID` | Your TesterArmy project ID |
| `TESTERARMY_GROUP_ID` | TesterArmy dashboard test group ID |
| `TESTERARMY_DYNAMIC_AGENT_ENABLED` | Optional. Defaults to `true`; set to `false` to skip the dynamic PR agent on pull requests |

### 2. Use the CLI in your EAS workflow

For dashboard-only workflows, after building or downloading your `.app` bundle or `.apk` in EAS Workflows, upload it and run your dashboard group:

```yaml
- name: Upload app
  id: upload_app
  run: |
    npx --yes testerarmy@latest upload-app \
      --app-path "$APP_PATH" \
      --project "$TESTERARMY_PROJECT_ID" \
      --remove-after 86400 \
      --output .testerarmy/upload.json

    set-output upload_result "$(tr -d '\n' < .testerarmy/upload.json)"

- name: Run TesterArmy tests
  run: |
    npx --yes testerarmy@latest ci \
      --group "$TESTERARMY_GROUP_ID" \
      --project "$TESTERARMY_PROJECT_ID" \
      --platform ios \
      --app-id "${{ fromJSON(steps.upload_app.outputs.upload_result).uploadedAppId }}" \
      --delete-app-after-run \
      --output .testerarmy/ci-result.json
```

On pull requests, you can also run the dynamic PR agent against the same uploaded app from a separate job:

```yaml
run_ios_dynamic_agent:
  name: Run iOS TesterArmy dynamic agent
  needs: [upload_ios_app]
  if: ${{ github.event_name == 'pull_request' }}
  environment: preview
  env:
    APP_ID: ${{ needs.upload_ios_app.outputs.app_id }}
    COMMIT_SHA: ${{ github.sha }}
    PR_NUMBER: ${{ github.event.pull_request.number || '' }}
    PR_TITLE: ${{ github.event.pull_request.title || '' }}
  steps:
    - uses: eas/checkout

    - name: Run dynamic PR agent
      run: |
        if [ "${TESTERARMY_DYNAMIC_AGENT_ENABLED:-true}" = "false" ]; then
          echo "TesterArmy dynamic agent is disabled."
          exit 0
        fi

        npx --yes testerarmy@latest pr run-dynamic \
          --project "$TESTERARMY_PROJECT_ID" \
          --platform ios \
          --app-id "$APP_ID" \
          --pr-number "$PR_NUMBER" \
          --pr-title "$PR_TITLE" \
          --commit-sha "$COMMIT_SHA" \
          --output .testerarmy/dynamic-result.json
```

If the dynamic planner determines that a pull request does not change user-observable app behavior, `testerarmy@latest` counts the dynamic run as `skipped`, keeps the summary result passing, and exits successfully. Real run failures and user cancellations still fail the job.

Use `--platform android` for Android app runs. The full example workflow calculates Expo fingerprints, reuses existing matching iOS and Android builds when possible, uploads each app once, and runs the dashboard group and dynamic PR agent as separate EAS jobs.

In the full EAS workflow, the dashboard test jobs do not pass `--delete-app-after-run` because the dynamic agent may also need the shared upload on pull requests. The upload step uses `--remove-after 86400`, so TesterArmy removes the app automatically.

### 3. Trigger the workflow

```bash
npx eas-cli@latest workflow:run .eas/workflows/testerarmy-mobile-tests.yml --wait
```

The workflow also runs on pull requests and pushes to `main`. You do not need to add the TesterArmy CLI to your app dependencies.

## Running Tests in GitHub Actions

This repo uses `.github/workflows/test-mobile-app.yml` to build the iOS simulator app and Android app, then run TesterArmy automatically with `tester-army/mobile-github-action`.

### 1. Add the required GitHub secrets

| Secret | Description |
|--------|-------------|
| `TESTERARMY_API_KEY` | API key from Team Settings → API Keys |
| `TESTERARMY_PROJECT_ID` | Your TesterArmy project ID |
| `TESTERARMY_GROUP_ID` | TesterArmy dashboard test group ID |

### 2. Use the action in your workflow

After building your `.app` bundle or Android `.apk`, upload it once, then run dashboard tests and the PR-only dynamic agent against the uploaded app ID. The dynamic agent is enabled by adding a separate job with `mode: dynamic_agent`:

```yaml
upload_ios:
  runs-on: ubuntu-latest
  outputs:
    app_id: ${{ steps.mobile.outputs.app_id }}
  steps:
    # Download or build .build/testerarmy.app first.
    - name: Upload app
      id: mobile
      # TODO: Switch back to @main after tester-army/mobile-github-action#4 merges.
      uses: tester-army/mobile-github-action@36005f70a05f421b1c5e0c9535b651cd1e6ed00b
      with:
        mode: upload
        app_path: .build/testerarmy.app
        api_key: ${{ secrets.TESTERARMY_API_KEY }}
        project_id: ${{ secrets.TESTERARMY_PROJECT_ID }}
        remove_after: "86400"

test_ios:
  needs: upload_ios
  runs-on: ubuntu-latest
  steps:
    - name: Run TesterArmy tests
      # TODO: Switch back to @main after tester-army/mobile-github-action#4 merges.
      uses: tester-army/mobile-github-action@36005f70a05f421b1c5e0c9535b651cd1e6ed00b
      with:
        mode: test
        app_id: ${{ needs.upload_ios.outputs.app_id }}
        platform: ios
        api_key: ${{ secrets.TESTERARMY_API_KEY }}
        project_id: ${{ secrets.TESTERARMY_PROJECT_ID }}
        group_id: ${{ secrets.TESTERARMY_GROUP_ID }}

dynamic_ios:
  needs: upload_ios
  if: ${{ github.event_name == 'pull_request' }}
  runs-on: ubuntu-latest
  steps:
    - name: Run dynamic PR agent
      # TODO: Switch back to @main after tester-army/mobile-github-action#4 merges.
      uses: tester-army/mobile-github-action@36005f70a05f421b1c5e0c9535b651cd1e6ed00b
      with:
        mode: dynamic_agent
        app_id: ${{ needs.upload_ios.outputs.app_id }}
        platform: ios
        api_key: ${{ secrets.TESTERARMY_API_KEY }}
        project_id: ${{ secrets.TESTERARMY_PROJECT_ID }}
```

When the dynamic planner skips a pull request, the action job remains successful because it uses `testerarmy@latest`; the CLI output and JSON result include the skipped run count.

For Android, use `app_path: .build/testerarmy.apk` and `platform: android`. The full example workflow uploads each platform once, runs dashboard tests, and only runs `mode: dynamic_agent` jobs on pull requests. The upload step uses `remove_after: "86400"` so TesterArmy removes the shared app automatically.

### 3. Trigger the workflow

This example workflow runs on pull requests, on pushes to `main`, and manually through `workflow_dispatch`.

You do not need to upload the app in the TesterArmy dashboard or call the upload API yourself unless you want a custom integration outside GitHub Actions.

## Writing Tests

Create tests in the [TesterArmy dashboard](https://tester.army) with step-by-step prompts. Guide the agent like you would a human user.

**Weak prompt:** *"Check the explore tab"*

**Strong prompt:** *"Tap the Explore tab at the bottom, scroll down to the 'File-based routing' section, tap to expand it, verify the content is visible"*

Both work, but specific prompts produce more reliable tests.

## CI Notes

The full example lives in `.github/workflows/test-mobile-app.yml`. It builds the iOS app on `macos-latest`, builds the Android app on `ubuntu-latest`, uploads both artifacts to TesterArmy from Linux jobs, then runs dashboard tests and PR-only dynamic agents against the shared uploads.

See the [CI Integration guide](https://tester.army/docs/mobile/ci-integration) for more details and additional workflow patterns.

## Links

- [TesterArmy — Mobile Testing Overview](https://tester.army/docs/mobile/overview)
- [TesterArmy — App Uploads](https://tester.army/docs/mobile/app-uploads)
- [TesterArmy — Writing Mobile Tests](https://tester.army/docs/mobile/writing-tests)
- [TesterArmy — CI Integration](https://tester.army/docs/mobile/ci-integration)
- [Expo Documentation](https://docs.expo.dev/)
