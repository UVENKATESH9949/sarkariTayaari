// Dynamic layer on top of app.json.
//
// app.json stays the human-edited source of truth — name, package, icons, plugins. This
// file only supplies the two values that must differ per build and therefore cannot be
// committed as constants, plus it registers the local release-signing plugin.
//
// Expo reads app.json first and passes its `expo` object in as `config`, so everything
// here is an override, not a replacement. Run `npx expo config --type public` to see the
// merged result.

// Registered here rather than in app.json so the whole signing mechanism lives in code
// with its own explanation, instead of as an opaque path in a JSON array.
const RELEASE_SIGNING_PLUGIN = "./plugins/withReleaseSigning";

/**
 * Android requires versionCode to strictly increase — two builds sharing one value
 * cannot both be installed or uploaded. CI passes `github.run_number`, which is
 * monotonic per workflow and needs no committed counter and no race handling.
 *
 * The 1000 offset keeps CI builds permanently above any locally produced build (which
 * falls back to 1), so a local build can never accidentally out-rank or collide with a
 * CI one.
 */
function resolveVersionCode() {
  const fromEnv = Number(process.env.ANDROID_VERSION_CODE);
  if (Number.isInteger(fromEnv) && fromEnv > 0) {
    return fromEnv;
  }
  return 1;
}

module.exports = ({ config }) => {
  const plugins = config.plugins ?? [];

  return {
    ...config,

    // Overridable so a hotfix build can be stamped 1.0.1 without a commit; otherwise
    // whatever app.json says.
    version: process.env.ANDROID_VERSION_NAME || config.version,

    android: {
      ...config.android,
      versionCode: resolveVersionCode(),
    },

    plugins: plugins.includes(RELEASE_SIGNING_PLUGIN)
      ? plugins
      : [...plugins, RELEASE_SIGNING_PLUGIN],
  };
};
