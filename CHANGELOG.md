# Changelog

## 0.3.0 (Unreleased)

There is no 0.2.0 tag or version commit in this repository. This entry summarizes changes since the initial 0.1.2 commit (`ea0626d`); the package version remains 0.1.2 until a release is prepared.

- Correct agent endpoints to `/v1/agents/*`, parse nested registration credentials, and align eight tool routes and request schemas with the API.
- Harden tool policy enforcement, spending controls, credential handling, and publishing permissions.
- Update vulnerable dependencies, including body-parser 2.3.0 → 2.4.0, fast-uri 3.1.8 → 3.1.9, and Zod 4.3.6 → 4.6.6. Update required iconv-lite 0.7.2 → 0.7.3. Production audit: 2 high and 1 moderate → 0 vulnerabilities.
- Use an OIDC-capable npm CLI for provenance publishing and require a stable tag matching the package version.
- Add PR typechecks, tests, builds, production auditing, and an installed-tarball import/MCP initialization smoke test.
