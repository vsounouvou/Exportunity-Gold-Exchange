# Exportunity Engineering Kernel (Mining v1)

This repository includes a backend-only **Engineering Kernel** that compiles mining machines from **intent** (not CAD), then executes a fabrication job on an **Industrial Node** (simulated locally for v1).

## Non‑negotiables enforced

- No CAD UI / no geometry editing / no CAD uploads.
- Only **intent + project context** inputs are accepted.
- Engineering logic is **global** (no tenant-specific design forks).
- Mining machine families are **canonical v1**:
  - `dry_gold_recovery_system`
  - `final_concentrate_finishing_module`
  - `portable_crushing_screening_unit`
  - `universal_mining_skid_frame`
- Machines compile only when **economically justified** (budget vs CAPEX estimate).

## Data model (tables)

- `engineering_requests` (tenant-scoped)
- `machines` (tenant-scoped)
- `machine_revisions`
- `fabrication_jobs`

## Configuration

Add to `.env` / your secrets manager:

- `ENGINEERING_KERNEL_INTERNAL_KEY` (required)
- `ENGINEERING_ARTIFACTS_ROOT` (optional; defaults to `ASSET_ROOT/ASSET_BASE_PATH/engineering` then `./tmp/engineering-artifacts`)

All `/engineering/*` endpoints require:

- Header: `X-Engineering-Kernel-Key: <ENGINEERING_KERNEL_INTERNAL_KEY>`

## Internal API contract

Tenant is resolved from `Host` / `X-Forwarded-Host` like the rest of the platform (no client-provided `tenant_id` is trusted).

### `POST /engineering/intent`

Creates an engineering request.

Body:

```json
{
  "project_id": "mine:123",
  "intent": "Dry gold recovery for 1–2 t/h artisanal mine, minimal water, West Africa.",
  "input": {
    "budgetUsd": 150000,
    "timelineDays": 30,
    "geography": "West Africa"
  }
}
```

### `POST /engineering/compile`

Compiles a request into a machine + revision (compiler behavior).

Body:

```json
{ "request_id": 123 }
```

### `POST /engineering/execute`

Executes a compiled revision on a node (execution-only). For v1 this is a local simulation that writes artifacts on disk.

Body:

```json
{ "revision_id": 456, "node_id": "local-sim" }
```

Artifacts written per job include:

- `bom.json`
- `cut_list.csv`
- `weld_map.txt`
- `assembly_instructions.md`
- `model.step` (placeholder)
- `model.dxf` (placeholder)
- `model.stl` (placeholder)

## Verification

Run the end-to-end (spawn-free) verifier:

- Outer workspace: `npm --prefix Exportunity-Gold-Exchange run engineering:verify`
- Inside app: `npm run engineering:verify`

It performs: intent → compile → execute, then asserts that artifacts exist on disk and prints the IDs.

## Current limitations (v1)

- Execution artifacts are **simulated placeholders**; swapping in a real CAD kernel belongs in the Industrial Node runtime.
- No encrypted job transport / remote node dispatch yet (local execution simulation only).
