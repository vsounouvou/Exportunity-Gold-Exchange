import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const configPath = path.join(rootDir, "ops", "tenants.config.json");

function fail(message) {
  console.error(`[tenant-config] ${message}`);
  process.exit(1);
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (error) {
    fail(`unable to read ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function mergeConfig(defaults, tenant) {
  return {
    ...defaults,
    ...tenant,
    aliases: normalizeArray(tenant.aliases ?? []),
    serviceNames: normalizeArray(tenant.serviceNames ?? defaults.serviceNames ?? []),
    linkedSharedPaths: normalizeArray(tenant.linkedSharedPaths ?? defaults.linkedSharedPaths ?? []),
    persistentPaths: normalizeArray(tenant.persistentPaths ?? defaults.persistentPaths ?? [])
  };
}

function resolveTenant(requestedTenant) {
  const config = readConfig();
  const defaults = config.defaults ?? {};
  const tenants = config.tenants ?? {};
  const lookup = String(requestedTenant || "").trim().toLowerCase();

  if (!lookup) fail("tenant is required");

  for (const [canonicalTenant, rawTenantConfig] of Object.entries(tenants)) {
    const tenantConfig = rawTenantConfig ?? {};
    const aliases = normalizeArray(tenantConfig.aliases ?? []).map((value) => String(value).toLowerCase());
    if (canonicalTenant.toLowerCase() === lookup || aliases.includes(lookup)) {
      const merged = mergeConfig(defaults, tenantConfig);
      const localReleaseDir =
        merged.localReleaseDir ?? path.posix.join(merged.localReleaseRoot ?? "ops/local-releases", canonicalTenant);
      const localBackupDir =
        merged.localBackupDir ?? path.posix.join(merged.localBackupRoot ?? "ops/local-backups", canonicalTenant);
      const remoteDeployRoot =
        merged.remoteDeployRoot ??
        path.posix.join(merged.remoteDeployRootBase ?? "/var/www", canonicalTenant);
      const remoteReleaseArchiveDir = path.posix.join(
        merged.remoteReleaseArchiveRoot ?? "/var/backups/releases",
        canonicalTenant
      );
      const remoteDbBackupDir = path.posix.join(
        merged.remoteDbBackupRoot ?? "/var/backups/db",
        canonicalTenant
      );
      const remoteFileBackupDir = path.posix.join(
        merged.remoteFileBackupRoot ?? "/var/backups/files",
        canonicalTenant
      );
      const remoteSshTarget =
        merged.remoteSshTarget ?? `${merged.deployUser ?? "vital"}@${merged.remoteHost ?? "127.0.0.1"}`;
      const healthCheckUrl =
        merged.healthCheckUrl ??
        (merged.domain
          ? `${String(merged.domain).replace(/\/+$/, "")}${merged.healthCheckPath ?? "/api/system/version"}`
          : "");

      return {
        ...merged,
        canonicalTenant,
        requestTenant: lookup,
        localReleaseDir,
        localBackupDir,
        remoteDeployRoot,
        remoteReleaseArchiveDir,
        remoteDbBackupDir,
        remoteFileBackupDir,
        remoteSshTarget,
        healthCheckUrl
      };
    }
  }

  fail(`unknown tenant "${requestedTenant}"`);
}

function quoteShell(value) {
  const text = String(value ?? "");
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

function printShell(config) {
  const scalarEntries = {
    CANONICAL_TENANT: config.canonicalTenant,
    REQUESTED_TENANT: config.requestTenant,
    DEPLOY_USER: config.deployUser ?? "",
    REMOTE_HOST: config.remoteHost ?? "",
    REMOTE_SSH_TARGET: config.remoteSshTarget ?? "",
    SSH_KEY_DEFAULT: config.sshKeyDefault ?? "",
    LOCAL_RELEASE_DIR: config.localReleaseDir,
    LOCAL_BACKUP_DIR: config.localBackupDir,
    REMOTE_RELEASE_ARCHIVE_DIR: config.remoteReleaseArchiveDir,
    REMOTE_DB_BACKUP_DIR: config.remoteDbBackupDir,
    REMOTE_FILE_BACKUP_DIR: config.remoteFileBackupDir,
    REMOTE_DEPLOY_ROOT: config.remoteDeployRoot,
    DEPLOY_MODE: config.deployMode ?? "docker-compose",
    COMPOSE_PROJECT: config.composeProject ?? "src",
    HEALTHCHECK_URL: config.healthCheckUrl ?? "",
    HEALTHCHECK_PATH: config.healthCheckPath ?? "",
    DOMAIN: config.domain ?? "",
    KEEP_LOCAL_RELEASES: String(config.keepLocalReleases ?? 3),
    KEEP_LOCAL_BACKUPS: String(config.keepLocalBackups ?? 3)
  };

  for (const [key, value] of Object.entries(scalarEntries)) {
    console.log(`${key}=${quoteShell(value)}`);
  }

  const arrays = {
    SERVICE_NAMES: config.serviceNames,
    LINKED_SHARED_PATHS: config.linkedSharedPaths,
    PERSISTENT_PATHS: config.persistentPaths,
    ALIASES: config.aliases
  };

  for (const [key, values] of Object.entries(arrays)) {
    const items = normalizeArray(values).map((value) => quoteShell(String(value)));
    console.log(`${key}=(${items.join(" ")})`);
  }
}

const [command = "list", tenantArg] = process.argv.slice(2);

if (command === "list") {
  const config = readConfig();
  for (const tenant of Object.keys(config.tenants ?? {})) {
    console.log(tenant);
  }
  process.exit(0);
}

if (!tenantArg) {
  fail(`usage: node scripts/ops/tenant-config.mjs ${command} <tenant>`);
}

const resolved = resolveTenant(tenantArg);

if (command === "json") {
  process.stdout.write(`${JSON.stringify(resolved, null, 2)}\n`);
  process.exit(0);
}

if (command === "shell") {
  printShell(resolved);
  process.exit(0);
}

fail(`unsupported command "${command}"`);
