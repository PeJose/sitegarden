# Tasks

## 1. Publish

- [x] 1.1 `image` job in `release.yml` and `image:` in compose (D1, D2). Verify: YAML parse/actionlint; `docker compose config` shows image and build.

## 2. CLI

- [x] 2.1 `server/deploy.ts` `deployPlan` + `sg deploy` with `--build ci|local|server`, `--host`, `--dir`, `--version`, `--dry-run` (D3). Verify: unit tests; dry runs for each mode.

## 3. Close-out

- [x] 3.1 README updating section, CHANGELOG, minor version bump over main. Verify: `pnpm test`, `pnpm build`, `pnpm lint`.
