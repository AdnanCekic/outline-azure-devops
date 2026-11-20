# Outline Azure DevOps Plugin

Overlay repository for an Azure DevOps integration plugin for [Outline](https://github.com/outline/outline) (self-hosted wiki). The plugin shows rich previews (unfurls) of Azure DevOps **work items** and **pull requests** when their links are pasted into an Outline document, similar to Outline's built-in GitHub, GitLab and Linear integrations and to Docmost's Azure DevOps integration.

Code, comments in code, commit messages and UI strings are in English. Maintainer-specific notes and test-environment details live in `CLAUDE.local.md` (gitignored).

## Goal and plan

1. Develop and test the plugin here, deploy it to an Outline test instance on Azure (see "Test environment").
2. When it works against a real Azure DevOps organization, submit it upstream as a pull request to `outline/outline`.

Keep the plugin upstream-ready at all times: follow Outline's conventions exactly (see "Outline conventions"), so the final PR is just `plugin/` copied to `plugins/azuredevops/` plus `patches/`.

## Why an overlay repo and not a fork

Outline does not load plugins at runtime. Server plugins are compiled and client plugins are bundled by Vite (`import.meta.glob("../../plugins/*/client/index.*")`), so every change requires a custom image built from Outline source plus the plugin. Instead of maintaining a full fork, this repo only contains the plugin and a pinned Outline version; scripts assemble the source tree. Updating Outline means changing `OUTLINE_VERSION`.

## Repository layout

| Path | Purpose |
|---|---|
| `plugin/` | The plugin, becomes `plugins/azuredevops/` in Outline |
| `patches/0001-integration-service.patch` | Adds `AzureDevOps = "azure-devops"` to `IntegrationService` in `shared/types/integrations.ts` (the only change outside the plugin folder) |
| `OUTLINE_VERSION` | Pinned Outline commit or tag the plugin is verified against |
| `scripts/setup-dev.sh` | Local dev: clones Outline to `./outline` (gitignored), applies patches, symlinks `plugin/` into it, runs `yarn install` |
| `scripts/prepare-build.sh` | CI: assembles a clean Outline tree with the plugin copied in |
| `.github/workflows/build-image.yml` | Builds the Docker image and pushes it to Azure Container Registry |

## Development workflow

```bash
./scripts/setup-dev.sh          # once, and after changing OUTLINE_VERSION
cd outline
yarn tsc                        # type check whole project (includes plugins)
yarn oxlint --type-aware plugins/azuredevops
yarn oxfmt plugins/azuredevops  # format
yarn test plugins/azuredevops   # unit tests
```

Edit files in `plugin/` (the symlink makes them visible inside `outline/`). If a tool does not follow the symlink (for example the Vite dev build), run `./scripts/setup-dev.sh --copy` and copy changes back to `plugin/` before committing. Never commit the `outline/` folder.

Node and Yarn versions are defined by Outline's `package.json` (`packageManager: yarn@4.x`, Node 22/24/26). Use corepack.

## Current state (verified)

Verified against Outline main at commit `41abdbec` (version 1.13.0):
- `yarn tsc` passes for the whole project, `oxlint --type-aware` passes, 12 unit tests in `shared/AzureDevOpsUtils.test.ts` pass.

**Not yet verified:** running Outline with the plugin (no database in the original environment), the Entra OAuth flow, and real Azure DevOps API calls. The first live test happens in the test environment. Expect small fixes there.

## Plugin architecture

Modeled on `plugins/linear` (OAuth, workspace-level integration) and `plugins/gitlab` (issue and PR unfurls).

### Server (`plugin/server/`)
- `index.ts`: registers hooks. `Hook.IntegrationSettings` always (key `azureDevOps`); `Hook.API`, `Hook.UnfurlProvider` (cacheExpiry 1 minute) and `Hook.MentionProvider` only when `AZURE_DEVOPS_CLIENT_ID` and `AZURE_DEVOPS_CLIENT_SECRET` are set.
- `env.ts`: `AZURE_DEVOPS_CLIENT_ID` (public), `AZURE_DEVOPS_CLIENT_SECRET`, `AZURE_DEVOPS_TENANT_ID` (public, defaults to `organizations`). Public vars are needed because the client builds the authorize URL.
- `api/azuredevops.ts`: OAuth callback route `GET /api/azuredevops.callback`. Verifies state nonce (cookie `azureDevOpsOAuthNonce`), requires `createIntegration` permission, exchanges code, loads profile and organizations, stores `IntegrationAuthentication` (token, refresh token, expiry) and an `Integration` of type `Embed` with settings `{ azureDevOps: { user, organizations } }`.
- `azuredevops.ts`: token exchange and refresh against Microsoft Entra ID v2 endpoints, profile and accounts lookup, unfurl logic.

### OAuth details
- Authorize/token: `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/...`
- Scopes: `499b84ac-1321-427f-aa17-267ca6975798/vso.work`, `.../vso.code`, `.../vso.profile`, `offline_access` (`499b84ac-...` is the Azure DevOps resource ID).
- Token refresh via `IntegrationAuthentication.refreshTokenIfNeeded`.
- No revoke endpoint exists in Entra, so there is no `Hook.Uninstall`.

### Azure DevOps API calls (api-version 7.1)
- Profile: `https://app.vssps.visualstudio.com/_apis/profile/profiles/me`
- Organizations: `https://app.vssps.visualstudio.com/_apis/accounts?memberId={id}`
- Work item: `https://dev.azure.com/{org}/{project}/_apis/wit/workitems/{id}`
- State color and category: `.../_apis/wit/workitemtypes/{type}/states` (falls back to category colors)
- Pull request: `.../_apis/git/repositories/{repo}/pullrequests/{id}`

Unfurl mapping: work items become `UnfurlResourceType.Issue` (id shown as `"{Type} {id}"`, tags as labels, HTML description stripped to text and truncated to 1000 chars), PRs become `UnfurlResourceType.PR` (id `!{id}`, status `active`/`completed`/`abandoned`, draft flag). Avatar URLs are left empty because Azure DevOps avatars require authentication.

When several integrations exist, the one whose organizations contain the URL's organization is used, otherwise the first.

### Shared (`plugin/shared/`)
- `AzureDevOpsUtils.ts`: URL parsing (`dev.azure.com/{org}/{project}/...`, legacy `{org}.visualstudio.com[/DefaultCollection]/{project}/...`, `_workitems/edit/{id}`, `_git/{repo}/pullrequest/{id}`, `?workitem={id}` on `_boards`, `_backlogs`, `_sprints`, `_queries`), mention type, colors, OAuth URLs.
- `types.ts`: augments `EmbedIntegrationSettings` with `azureDevOps`.

### Client (`plugin/client/`)
- `index.tsx`: registers the settings page (group "Integrations") and a mention provider that only converts links whose organization is in the connected integration.
- `Settings.tsx`: connect button, list of connections, error notices. Mirrors `plugins/linear/client/Settings.tsx`.
- `Icon.tsx`: neutral placeholder icon (board with check mark). Do not draw the official Azure DevOps logo; maintainers can swap it in.

## Design decisions

- **Workspace-level connection**, like Outline's GitHub and Linear integrations: an admin connects once, previews are fetched with that account's permissions for all users. Docmost does this per user. Keep workspace-level for consistency with Outline unless the maintainers ask otherwise; recommend connecting an account with appropriate read access.
- Only read scopes. No creating work items, no sync of pages.
- No database migration needed; `integrations.service` is a plain string column.

## Possible next steps

- Live test and fix OAuth and API issues.
- Server tests for `AzureDevOps.unfurl` with mocked fetch (see `plugins/linear/server/api/linear.test.ts` and `plugins/gitlab/server/gitlab.test.ts`; server tests using `vi.mock` must start with `// @vitest-isolate true`).
- Optional: `Hook.IssueProvider` for issue search like `plugins/gitlab/server/GitLabIssueProvider.ts`.
- Optional later: per-user connections.
- Bump `OUTLINE_VERSION` to the next release tag and re-verify before the upstream PR.

## Outline conventions (from Outline's AGENTS.md, must follow)

- Strict TypeScript, never `any`, avoid `unknown` and type assertions (`as`, `!`) where possible. Curly braces for every `if`. Early returns.
- Class member order: public static vars, public static methods, public vars, public methods, protected, private.
- Exported members at the top of the file; named exports for new components and classes.
- JSDoc on all public/exported functions: description, blank line, `@param`/`@returns` starting lowercase and ending with a period, `@throws` if applicable.
- Empty line above every comment unless it is the first line in a block.
- React: functional components, handlers prefixed with `handle`, styled-components, a11y.
- UI strings in US English with full grammar. Do not add translation strings manually (extracted automatically). Do not replace smart quotes.
- Do not create new markdown files inside Outline's repository (this CLAUDE.md lives in the overlay repo, which is fine).
- Use `@server/utils/fetch` with a timeout, `Logger` for logging, errors from `@server/errors`.
- Format with oxfmt, lint with oxlint, test with Vitest (collocated `.test.ts`, no new test directories).

## Test environment (Azure)

The test instance runs Outline in Azure Container Apps with PostgreSQL Flexible Server, Redis, Azure Files for attachments and Key Vault for secrets. Its image comes from an Azure Container Registry fed by this repo's build workflow. Concrete resource names are in `CLAUDE.local.md`.

- Plugin env vars on the container: `AZURE_DEVOPS_CLIENT_ID`, `AZURE_DEVOPS_TENANT_ID`, `AZURE_DEVOPS_CLIENT_SECRET` (from Key Vault). When `AZURE_DEVOPS_CLIENT_ID` is empty the plugin stays disabled.
- Azure Database for PostgreSQL only allows extensions on its allow list (`azure.extensions`). Outline needs at least `UUID-OSSP,PG_TRGM,UNACCENT,BTREE_GIN,BTREE_GIST,CITEXT,PGCRYPTO,FUZZYSTRMATCH`; a failing migration in the container logs names a missing one.

### Image build (GitHub Actions)
`.github/workflows/build-image.yml` logs in to Azure via OIDC with an app registration that has AcrPush on the registry. It needs a federated credential for this GitHub repo (`repo:<owner>/<repo>:ref:refs/heads/main`) and repository variables `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `ACR_NAME`. The Outline build is memory hungry; if the hosted runner fails, use a larger runner.

### Entra app for the plugin
Register in the tenant connected to the Azure DevOps organization: single tenant, Web redirect URI `https://<outline-url>/api/azuredevops.callback`, client secret, delegated Azure DevOps permissions `vso.work`, `vso.code`, `vso.profile` (admin consent if required).

## Lessons learned in this project

- Outline's generic OIDC provider rejects Entra users with "email address has not been verified by Microsoft"; the Azure provider is used instead. Direct login without the button: `https://<outline-url>/auth/azure`.
- Placeholder values in pipeline variables (`<...-EINTRAGEN>`) were deployed once by accident. Double-check variables before pushing.
