#!/usr/bin/env node
/**
 * Distributes secrets.local.env into the per-system config files each runtime actually reads.
 *
 * WHY THIS EXISTS. Four runtimes read four different files in three different formats: Spring
 * reads YAML, Expo and Vite read .env, and the studio reads its own .env. Keeping one hand-edited
 * copy per runtime is how a value ends up right in one place and stale in another - and how
 * somebody edits the wrong file and wonders why nothing changed. So secrets.local.env is the only
 * file a human edits, and this writes the rest.
 *
 * WHAT IT WILL NOT DO. It never writes a file for a section whose values are all blank, because
 * an empty generated file is worse than no file: Spring and Vite both treat "present but empty"
 * differently from "absent", and a blank base URL is a harder failure to read than a missing one.
 *
 * Run: npm run secrets:apply   (add --check to verify without writing)
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SOURCE = path.join(ROOT, "secrets.local.env");
const CHECK_ONLY = process.argv.includes("--check");

const BANNER = [
  "GENERATED FILE - DO NOT EDIT BY HAND.",
  "Edit secrets.local.env at the repository root, then run: npm run secrets:apply",
  "Hand edits here are silently overwritten the next time that runs.",
];

function readSecrets() {
  if (!fs.existsSync(SOURCE)) {
    console.error("secrets.local.env not found.");
    console.error("Copy secrets.example.env to secrets.local.env and fill it in.");
    process.exit(1);
  }
  const out = {};
  for (const line of fs.readFileSync(SOURCE, "utf8").split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match) out[match[1]] = match[2].trim();
  }
  return out;
}

const s = readSecrets();
const has = (...keys) => keys.some((k) => (s[k] ?? "") !== "");
/** Quote only when YAML would otherwise misread the value (e.g. a bare `:` or a leading `*`). */
const yamlValue = (v) => (/^[A-Za-z0-9_./@-]+$/.test(v) ? v : JSON.stringify(v));

const targets = [];

/* ---------------------------------------------------------------- backend
 * backend/application-local.yml, NOT src/main/resources/application-local.yml.
 * application.yml does `spring.config.import: optional:file:./application-local.yml`, and the
 * working directory for both spring-boot:run and surefire is backend/ - so the working-directory
 * file is the one Spring reads. A copy under src/main/resources is only picked up when a `local`
 * PROFILE is active, which this project never sets, so editing that one changes nothing.
 */
{
  const lines = [];
  lines.push(...BANNER.map((b) => "# " + b), "");

  const spring = [];
  if (has("DB_URL", "DB_USERNAME", "DB_PASSWORD")) {
    spring.push("  datasource:");
    if (s.DB_URL) spring.push(`    url: ${yamlValue(s.DB_URL)}`);
    if (s.DB_USERNAME) spring.push(`    username: ${yamlValue(s.DB_USERNAME)}`);
    if (s.DB_PASSWORD) spring.push(`    password: ${yamlValue(s.DB_PASSWORD)}`);
  }
  if (has("SPRING_MAIL_USERNAME", "SPRING_MAIL_PASSWORD")) {
    spring.push("  mail:");
    if (s.SPRING_MAIL_USERNAME) spring.push(`    username: ${yamlValue(s.SPRING_MAIL_USERNAME)}`);
    if (s.SPRING_MAIL_PASSWORD) spring.push(`    password: ${yamlValue(s.SPRING_MAIL_PASSWORD)}`);
  }
  if (spring.length) lines.push("spring:", ...spring, "");

  if (has("CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET")) {
    lines.push("cloudinary:");
    lines.push(`  cloud-name: ${yamlValue(s.CLOUDINARY_CLOUD_NAME || "")}`);
    lines.push(`  api-key: ${yamlValue(s.CLOUDINARY_API_KEY || "")}`);
    lines.push(`  api-secret: ${yamlValue(s.CLOUDINARY_API_SECRET || "")}`);
    lines.push("");
  }

  const app = [];
  const ai = [];
  if (s.APP_AI_ENABLED) ai.push(`    enabled: ${s.APP_AI_ENABLED}`);
  if (s.APP_AI_PROVIDER) ai.push(`    provider: ${yamlValue(s.APP_AI_PROVIDER)}`);
  if (s.APP_AI_API_KEY) ai.push(`    api-key: ${yamlValue(s.APP_AI_API_KEY)}`);
  if (s.APP_AI_MODEL) ai.push(`    model: ${yamlValue(s.APP_AI_MODEL)}`);
  if (s.APP_AI_ENCRYPTION_KEY) ai.push(`    encryption-key: ${yamlValue(s.APP_AI_ENCRYPTION_KEY)}`);
  if (ai.length) app.push("  ai:", ...ai);

  if (s.APP_DOCUMENT_STORAGE_FAKE) {
    app.push("  document-storage:", `    fake: ${s.APP_DOCUMENT_STORAGE_FAKE}`);
  }
  if (has("VIDEO_STORAGE_PROVIDER", "VIDEO_STORAGE_URL_TTL_SECONDS")) {
    app.push("  video-storage:");
    if (s.VIDEO_STORAGE_PROVIDER) app.push(`    provider: ${s.VIDEO_STORAGE_PROVIDER}`);
    if (s.VIDEO_STORAGE_URL_TTL_SECONDS) {
      app.push(`    url-ttl-seconds: ${s.VIDEO_STORAGE_URL_TTL_SECONDS}`);
    }
  }
  if (has("APP_MAIL_ENABLED", "APP_MAIL_FROM")) {
    app.push("  mail:");
    if (s.APP_MAIL_ENABLED) app.push(`    enabled: ${s.APP_MAIL_ENABLED}`);
    if (s.APP_MAIL_FROM) app.push(`    from: ${yamlValue(s.APP_MAIL_FROM)}`);
  }
  if (s.GOOGLE_WEB_CLIENT_ID) {
    app.push("  auth:", "    google:", `      web-client-id: ${yamlValue(s.GOOGLE_WEB_CLIENT_ID)}`);
  }
  if (app.length) lines.push("app:", ...app, "");

  if (has("ADMIN_BOOTSTRAP_EMAIL", "ADMIN_BOOTSTRAP_PASSWORD")) {
    lines.push("admin:");
    if (s.ADMIN_BOOTSTRAP_EMAIL) lines.push(`  bootstrap-email: ${yamlValue(s.ADMIN_BOOTSTRAP_EMAIL)}`);
    if (s.ADMIN_BOOTSTRAP_PASSWORD) {
      lines.push(`  bootstrap-password: ${yamlValue(s.ADMIN_BOOTSTRAP_PASSWORD)}`);
    }
    lines.push("");
  }

  targets.push({ file: "backend/application-local.yml", content: lines.join("\n") });
}

/* ---------------------------------------------------------------- clients */
function envFile(file, pairs) {
  const present = pairs.filter(([, v]) => (v ?? "") !== "");
  if (!present.length) return;
  const lines = [...BANNER.map((b) => "# " + b), "", ...present.map(([k, v]) => `${k}=${v}`), ""];
  targets.push({ file, content: lines.join("\n") });
}

envFile("mobile/.env.local", [
  ["EXPO_PUBLIC_API_BASE_URL", s.EXPO_PUBLIC_API_BASE_URL],
  ["EXPO_PUBLIC_SENTRY_DSN", s.EXPO_PUBLIC_SENTRY_DSN],
  ["EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID", s.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID],
]);
envFile("web/.env.local", [["VITE_API_BASE_URL", s.WEB_VITE_API_BASE_URL]]);
envFile("admin/.env.local", [["VITE_API_BASE_URL", s.ADMIN_VITE_API_BASE_URL]]);
envFile("studio/.env", [["OPENAI_API_KEY", s.OPENAI_API_KEY]]);

/* ---------------------------------------------------------------- write */
let changed = 0;
for (const { file, content } of targets) {
  const full = path.join(ROOT, file);
  const existing = fs.existsSync(full) ? fs.readFileSync(full, "utf8") : null;
  if (existing === content) {
    console.log(`  unchanged  ${file}`);
    continue;
  }
  changed++;
  if (CHECK_ONLY) {
    console.log(`  WOULD WRITE ${file}`);
    continue;
  }
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf8");
  console.log(`  wrote      ${file}`);
}

const blank = Object.entries(s).filter(([, v]) => v === "").map(([k]) => k);
if (blank.length) {
  console.log(`\n${blank.length} value(s) still blank in secrets.local.env:`);
  blank.forEach((k) => console.log("  " + k));
  console.log("Anything blank is simply left out of the generated files.");
}

if (CHECK_ONLY && changed) {
  console.error("\nGenerated files are out of date. Run: npm run secrets:apply");
  process.exit(1);
}
