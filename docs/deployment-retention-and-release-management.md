# Deployment Retention And Release Management

## Policy

This repository now treats the laptop as a development workspace, not a release archive.

- Local releases: keep only the latest 3 artifacts per tenant in `ops/local-releases/<tenant>/`
- Local backups: keep only the latest 3 artifacts per tenant in `ops/local-backups/<tenant>/`
- Remote release history: keep the latest 3 archived releases in `/var/backups/releases/<tenant>/`
- Remote backup history: keep full history in `/var/backups/db/<tenant>/` and `/var/backups/files/<tenant>/`
- Rollback source of truth: the server release history under `/var/www/<tenant>/releases/`

## Audit Summary

The previous workflow created large root-level archives such as:

- `deploy-src-*.tgz`
- `deploy-src-full-*.tgz`
- `deploy-dist-*.zip`
- `deploy-report-*.md`

It also allowed regenerable local build output to accumulate in places like:

- `dist/`
- `reports/`
- `test-results/`
- `tmp/`
- `.next/`
- `.cache/`
- `coverage/`

No active repo script was found writing deployment archives into `Downloads` or `Desktop`, but the root-level packaging pattern still caused heavy local duplication inside the project directory.

## Standard Layout

### Local

```bash
ops/local-releases/<tenant>/
ops/local-backups/<tenant>/
ops/tmp/
```

### Remote

```bash
/var/backups/releases/<tenant>/
/var/backups/db/<tenant>/
/var/backups/files/<tenant>/
```

### Remote deployment root

```bash
/var/www/<tenant>/
  releases/
  shared/
  current -> releases/<release-id>
  previous -> releases/<previous-release-id>
```

## Release Artifacts

Artifacts are built with:

```bash
<tenant>_release_<YYYYMMDD-HHMMSS>_<gitsha>.tar.gz
```

Each artifact gets:

- a JSON manifest beside it
- a `.sha256` checksum file beside it
- an embedded `release-manifest.json` inside the tarball

Artifacts are created from explicit include and exclude lists:

- include list: `ops/release.include`
- exclude list: `ops/release.exclude`

Excluded junk includes at least:

- `.git`
- `node_modules`
- `.next/cache`
- `coverage`
- `tmp`
- `temp`
- `logs`
- `*.log`
- `.DS_Store`
- `.vscode`
- `.idea`
- `ops/local-releases`
- `ops/local-backups`

## Deployment Flow

The canonical deploy path is:

1. `scripts/ops/create-release-artifact.sh`
2. `scripts/ops/upload-release.sh`
3. `scripts/ops/deploy-release.sh`

`deploy-release.sh` performs:

1. build an artifact locally when requested
2. upload the artifact and sidecars to `/var/backups/releases/<tenant>/`
3. unpack into `/var/www/<tenant>/releases/<release-id>/`
4. link shared runtime files
5. ensure persistent runtime directories exist, including `data/postgres` outside version-swapped source trees
6. restart services from the candidate release
7. hit the health endpoint
8. switch `current` only after a healthy release
9. keep the previous release available through the `previous` symlink

## Rollback

Rollback is symlink-based instead of restore-by-copy.

```bash
scripts/ops/rollback-release.sh <tenant>
```

If no release ID is provided, the script rolls back to:

- the `previous` symlink target if present
- otherwise the second-most-recent unpacked release directory

## Cleanup

### Local artifact retention

```bash
scripts/ops/prune-local-releases.sh <tenant>
scripts/ops/prune-local-backups.sh <tenant>
```

Both keep only the newest 3 primary artifacts and remove their sidecars.

### Local build cleanup

```bash
scripts/ops/cleanup-build-artifacts.sh
```

This removes only regenerable local artifacts such as:

- `dist`
- `build`
- `.next`
- `.cache`
- `coverage`
- `reports`
- `artifacts/smoke`
- `test-results`
- `tmp`
- known root-level deploy tarballs and zip files

### One-shot local cleanup

```bash
scripts/ops/run-local-cleanup.sh
```

Optional Docker cleanup:

```bash
scripts/ops/run-local-cleanup.sh --docker
scripts/ops/run-local-cleanup.sh --docker --with-volumes
```

## Docker Cleanup

`scripts/ops/prune-docker-local.sh` shows `docker system df` before pruning and asks for confirmation unless `--yes` is used.

It prunes:

- unused images
- build cache
- stopped containers
- optionally unused volumes

## Tenant Configuration

Tenant deployment settings live in:

```bash
ops/tenants.config.json
```

Each tenant entry defines or derives:

- local release path
- local backup path
- remote archive paths
- remote deploy root
- deploy user and host
- service names
- health check URL
- shared paths

Supported tenants include at least:

- `boursedelor` (`bdo`)
- `exportunity`
- `houseofzogue` (`hoz`)
- `maisonenterre` (`met`)
- `rayon1km`
- `vitalsounouvou` (`vs`)

## Adding A New Tenant

1. Add the tenant entry to `ops/tenants.config.json`
2. Set `domain`
3. Set `remoteDeployRoot`
4. Adjust `serviceNames` if the tenant has a different service set
5. Update `linkedSharedPaths` or `persistentPaths` only if the runtime layout differs

## Safe To Delete

These are safe to delete locally because they are regenerable or retention-managed:

- old files under `ops/local-releases/<tenant>/` beyond the newest 3
- old files under `ops/local-backups/<tenant>/` beyond the newest 3
- `dist/`
- `build/`
- `.next/`
- `.cache/`
- `coverage/`
- `reports/`
- `test-results/`
- `tmp/`
- known root-level deploy archives

## Do Not Delete Manually

Do not manually delete:

- source code
- `attached_assets/`
- `data/`
- tenant content and business documents
- files under remote `/var/backups/...` unless you are intentionally pruning server history
- files under remote `/var/www/<tenant>/shared/` unless you know the runtime dependency

## Inspect Disk Usage

```bash
du -sh ops/local-releases/* 2>/dev/null
du -sh ops/local-backups/* 2>/dev/null
du -sh dist reports test-results tmp 2>/dev/null
docker system df
```

## Example Commands

Create a release artifact:

```bash
scripts/ops/create-release-artifact.sh exportunity
```

Create a release artifact and build first:

```bash
scripts/ops/create-release-artifact.sh exportunity --build
```

Upload a release:

```bash
scripts/ops/upload-release.sh exportunity
```

Upload and deploy a release:

```bash
scripts/ops/deploy-release.sh exportunity
```

Rollback a tenant:

```bash
scripts/ops/rollback-release.sh exportunity
```

Cleanup local disk:

```bash
scripts/ops/run-local-cleanup.sh
```

Dry-run cleanup:

```bash
scripts/ops/run-local-cleanup.sh --dry-run
```

Prune local releases only:

```bash
scripts/ops/prune-local-releases.sh exportunity
```

Prune local backups only:

```bash
scripts/ops/prune-local-backups.sh exportunity
```

On Windows, run the bash scripts from Git Bash or use the PowerShell wrappers:

```powershell
.\deploy.ps1 bdo
.\deploy-to-vps.ps1 exportunity
```

## Expected Savings

Compared with the old behavior of storing every deploy tarball in the repo root plus leaving build output behind, this should cut local deployment-storage usage by well over 95% over time because:

- artifacts are retained only 3 deep per tenant
- build output is actively cleaned
- remote history becomes the archive source of truth
- rollback uses release directories and symlinks instead of repeated full local copies
