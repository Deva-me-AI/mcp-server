# Release Runbook

## Package

The canonical npm package name is `@deva-me/mcp-server`.

## Trusted Publishing Setup

The repository includes `.github/workflows/publish.yml`, which publishes tagged releases with GitHub Actions OIDC and npm provenance. Before the first release through that workflow, an npm package owner must configure a trusted publisher for `@deva-me/mcp-server` in npm:

- Repository: `Deva-me-AI/mcp-server`
- Workflow: `publish.yml`
- Environment: `npm`
- Package: `@deva-me/mcp-server`

No `NPM_TOKEN` is required for this path.

## Release Steps

1. Update `package.json` and `package-lock.json` to the intended version.
2. Confirm the package contents with `npm pack --dry-run`.
3. Push a protected release tag such as `v0.1.3`.
4. Confirm the GitHub Actions publish workflow completes.
5. Verify the npm release metadata and provenance for the published version.
