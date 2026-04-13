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

# Zip the .app bundle for upload
cd build/Build/Products/Debug-iphonesimulator
zip -r testerarmy.app.zip testerarmy.app
```

## Uploading to TesterArmy

**Via dashboard:** Go to your project → **Mobile** tab → **Browse Files** → select the `.app.zip` file.

**Via API:** Use the 3-step presigned URL flow:

```bash
# Step 1: Initiate upload
RESPONSE=$(curl -s -X POST https://tester.army/api/v1/projects/$PROJECT_ID/mobile/upload \
  -H "Authorization: Bearer $TESTERARMY_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"filename\": \"testerarmy.app.zip\",
    \"fileSize\": $(stat -f%z testerarmy.app.zip),
    \"removeAfter\": 3600
  }")

UPLOAD_URL=$(echo "$RESPONSE" | jq -r '.uploadUrl')
STORAGE_KEY=$(echo "$RESPONSE" | jq -r '.storageKey')

# Step 2: Upload to storage
curl -X PUT "$UPLOAD_URL" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @testerarmy.app.zip

# Step 3: Confirm upload
curl -s -X POST https://tester.army/api/v1/projects/$PROJECT_ID/mobile/upload/confirm \
  -H "Authorization: Bearer $TESTERARMY_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"storageKey\": \"$STORAGE_KEY\",
    \"filename\": \"testerarmy.app.zip\",
    \"fileSize\": $(stat -f%z testerarmy.app.zip),
    \"removeAfter\": 3600
  }"
```

See [Mobile Apps API docs](https://tester.army/docs/api/mobile) for the full response schema.

## Writing Tests

Create tests in the [TesterArmy dashboard](https://tester.army) with step-by-step prompts. Guide the agent like you would a human user.

**Weak prompt:** *"Check the explore tab"*

**Strong prompt:** *"Tap the Explore tab at the bottom, scroll down to the 'File-based routing' section, tap to expand it, verify the content is visible"*

Both work, but specific prompts produce more reliable tests.

## Running Tests in CI

This repo includes a GitHub Action (`.github/workflows/testerarmy.yml`) that builds the app for the iOS simulator, uploads it to TesterArmy, and triggers your test group.

**Required GitHub secrets:**

| Secret | Description |
|--------|-------------|
| `TESTERARMY_API_KEY` | API key from Team Settings → API Keys |
| `TESTERARMY_PROJECT_ID` | Your TesterArmy project ID |
| `TESTERARMY_WEBHOOK_URL` | Group webhook URL (includes secret) |

The workflow runs on every push to `main` and on pull requests. See the [CI Integration guide](https://tester.army/docs/mobile/ci-integration) for more details.

## Links

- [TesterArmy — Mobile Testing Overview](https://tester.army/docs/mobile/overview)
- [TesterArmy — App Uploads](https://tester.army/docs/mobile/app-uploads)
- [TesterArmy — Writing Mobile Tests](https://tester.army/docs/mobile/writing-tests)
- [TesterArmy — CI Integration](https://tester.army/docs/mobile/ci-integration)
- [Expo Documentation](https://docs.expo.dev/)
