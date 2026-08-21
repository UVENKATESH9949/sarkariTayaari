#!/usr/bin/env node
// Fast guard for plugins/withReleaseSigning.js.
//
// The plugin rewrites generated Gradle by matching on Expo template text. That is
// inherently brittle, so the failure modes are asserted here and run in CI *before* the
// ~10-minute build rather than being discovered inside it.
//
// This checks the transform logic. It does not check that Expo's real template still
// looks like the fixture — an Expo SDK upgrade that changes the template is caught by
// the plugin throwing during `expo prebuild`, which is the correct place for it.
//
//   node scripts/check-release-signing-plugin.js

const { injectReleaseSigning, MARKER } = require("../plugins/withReleaseSigning");

// Trimmed from the real generated android/app/build.gradle (Expo SDK 57).
const FIXTURE = `android {
    defaultConfig {
        applicationId 'com.sarkaritaiyaari.app'
        versionCode 1
        versionName "1.0.0"
    }
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug
            minifyEnabled enableMinifyInReleaseBuilds
        }
    }
}
`;

let failures = 0;

function check(label, fn) {
  try {
    fn();
    console.log(`  ok    ${label}`);
  } catch (err) {
    failures += 1;
    console.error(`  FAIL  ${label}\n          ${err.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

console.log("check-release-signing-plugin");

const patched = injectReleaseSigning(FIXTURE);

check("injects a release signingConfig", () => {
  assert(/signingConfigs \{[\s\S]*?release \{/.test(patched), "no release block inside signingConfigs");
  assert(patched.includes("ST_UPLOAD_STORE_FILE"), "keystore property not referenced");
  assert(patched.includes("keyPassword project.property('ST_UPLOAD_KEY_PASSWORD')"), "key password not wired");
});

check("release buildType selects the release signingConfig", () => {
  assert(patched.includes("signingConfig signingConfigs.release"), "release buildType never selects the release config");
});

check("debug buildType is left alone", () => {
  const debugBlock = patched.match(/buildTypes \{\s*debug \{([\s\S]*?)\}/);
  assert(debugBlock !== null, "could not locate the debug buildType");
  assert(
    debugBlock[1].includes("signingConfig signingConfigs.debug"),
    "the debug buildType's signing config was modified — it must keep using the debug key"
  );
});

check("keeps a debug fallback so local assembleRelease still works", () => {
  assert(patched.includes("signingConfig signingConfigs.debug"), "no debug fallback remains");
  assert(/logger\.warn/.test(patched), "the debug fallback does not warn — it must be loud");
});

check("is idempotent", () => {
  const twice = injectReleaseSigning(patched);
  assert(twice === patched, "running the transform twice changed the output");
  const markerCount = patched.split(MARKER).length - 1;
  assert(markerCount === 2, `expected 2 markers, found ${markerCount}`);
});

check("throws when signingConfigs is missing", () => {
  let threw = false;
  try {
    injectReleaseSigning("android {\n  buildTypes {\n  }\n}\n");
  } catch {
    threw = true;
  }
  assert(threw, "silently accepted Gradle with no signingConfigs block");
});

check("throws when the release buildType anchor is missing", () => {
  let threw = false;
  try {
    injectReleaseSigning("android {\n  signingConfigs {\n    debug {\n    }\n  }\n}\n");
  } catch {
    threw = true;
  }
  assert(threw, "silently accepted Gradle with no release buildType anchor");
});

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nall checks passed");
