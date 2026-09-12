const path = require("path");
const { getSentryExpoConfig } = require("@sentry/react-native/metro");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..");

const config = getSentryExpoConfig(projectRoot);
config.resolver.sourceExts.push("sql");

// @sarkaritaiyaari/core is a source-only TypeScript package (no build step) living outside
// this project's folder, so Metro has to be told to watch it and to look in the workspace
// root's node_modules as well as this project's own. Without watchFolders an edit in
// packages/core does not trigger a reload; without nodeModulesPaths the symlinked
// dependency fails to resolve. mobile/ is deliberately NOT an npm workspace member — it
// keeps its own lockfile and node_modules — so only these two additions are needed.
config.watchFolders = [path.resolve(workspaceRoot, "packages")];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;
