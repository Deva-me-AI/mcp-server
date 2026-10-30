# Releasing

PR CI installs locked dependencies, typechecks, tests, builds, audits production dependencies, and imports an installed npm tarball to exercise MCP initialization without contacting the Deva API.

Prepare the intended version in both package manifests before pushing a matching stable `vX.Y.Z` tag. The current package version is 0.1.2; the 0.3.0 changelog describes an unreleased target. Manual dispatch of `publish.yml` only validates and packs; it never publishes.

Configure the npm trusted publisher with organization `Deva-me-AI`, repository `mcp-server`, workflow `publish.yml`, and environment `npm`. The workflow uses Node 24, npm 11.6.2, `id-token: write`, and `npm publish --provenance --access public`. See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).

No historical publish runs were returned by `gh run list --workflow publish.yml` during this investigation. The previous workflow used Node 20's npm without a publishing token; that CLI cannot authenticate through npm trusted publishing (requires npm >=11.5.1 and Node >=22.14). The package also lacked repository metadata for provenance. These requirements are now explicit. Actual authentication can only be verified during an authorized release.
