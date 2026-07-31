# GitHub Secrets Setup

To enable automatic database migrations, you need to add these secrets to your GitHub repository.

## Required Secrets

### 1. `SUPABASE_ACCESS_TOKEN`

**How to get it:**
1. Go to https://supabase.com/dashboard/account/tokens
2. Click "Generate new token"
3. Give it a name (e.g., "GitHub Actions - betterr_me")
4. Copy the token
5. Add to GitHub: Settings → Secrets and variables → Actions → New repository secret
   - Name: `SUPABASE_ACCESS_TOKEN`
   - Value: (paste the token)

### 2. `SUPABASE_DB_PASSWORD`

**How to get it:**
1. Go to https://supabase.com/dashboard/project/ugkhvvmjdrshuopgaaje/settings/database
2. Find "Database Password" section
3. Either use existing password or reset it
4. Copy the password
5. Add to GitHub: Settings → Secrets and variables → Actions → New repository secret
   - Name: `SUPABASE_DB_PASSWORD`
   - Value: (paste the password)

## Testing

After adding the secrets:
1. Push a change to a file in `supabase/migrations/`
2. Merge to `main`
3. Check Actions tab: https://github.com/xtan9/betterr_me/actions
4. Verify the "Database Migration" workflow runs successfully

## Troubleshooting

If the workflow fails:
- Check that both secrets are set correctly
- Verify the project ID in `.github/workflows/db-migrate.yml` is correct (`ugkhvvmjdrshuopgaaje`)
- Check Supabase dashboard for any manual migrations that might conflict

## Controlled Vercel deployments

The controlled production and manual preview workflow requires:

- Repository secret `VERCEL_TOKEN`: a Vercel access token scoped to
  `xtan9's projects` -> `All Projects`. A token scoped only to `betterr-me`
  cannot retrieve the project settings required by the current CLI deployment
  flow. Its non-sensitive expiration metadata is recorded in
  `.github/secret-expirations.json`.
- Repository variable `VERCEL_ORG_ID`: the `orgId` from the project's
  `.vercel/project.json` after running `vercel link` locally.
- Repository variable `VERCEL_PROJECT_ID`: the `projectId` from the same file.
- Repository secret `APP_URL`: the canonical production origin used by the
  post-deploy smoke probe.

Keep the repository variable `VERCEL_CI_DEPLOY_ENABLED` unset or set to `false`
when the controlled workflow is first merged. Automatic Vercel Git deployments
and the legacy production smoke workflow remain active in that state.

The automatic production chain is:

`CI` -> `Database Migration` -> `Vercel Deploy`

The database workflow runs for every CI-validated `main` commit but touches the
database only when a migration SQL file changed. The deployment workflow then
waits for the exact commit's `E2E Gate`, skips known non-runtime-only changes,
and deploys through Vercel's remote builder. Unknown paths and empty comparisons
deploy as a fail-safe. A newer `main` commit supersedes an older queued deploy.

Use this rollout order:

1. Add the Vercel token, project variables, and production URL described above.
2. Merge the workflow with `VERCEL_CI_DEPLOY_ENABLED=false`.
3. Add `deployment-policy` to the required `main` branch checks alongside the
   existing CI and E2E gates.
4. Manually run `Vercel Deploy` with target `preview` and verify the result.
5. Manually run it with target `production` and verify the smoke step passes.
6. In a small follow-up change, set `git.deploymentEnabled` to `false` in
   `vercel.json`. Let that final Git-integrated deployment finish.
7. Set `VERCEL_CI_DEPLOY_ENABLED=true`, then manually verify production once
   more. Do not disable Git deployment before steps 1-5 succeed.

When the rollout variable is `true`, the legacy `Production Smoke` push job
skips because the controlled deployment performs its own post-deploy smoke
probe.

## Expiration reminders

`.github/workflows/secret-expiration-reminders.yml` checks the repository's
declared credential metadata every Monday. It creates one deduplicated
maintenance issue when a credential is within 60 days of expiration, and
escalates the issue when a weekly check first finds it within 30 days, within 7
days, or expired. It closes the issue after the manifest is updated with a
rotated credential's new expiration date.

GitHub does not expose secret values or provider expiration dates to this
workflow. Whenever a repository credential is created or rotated, add or update
its entry in `.github/secret-expirations.json` in the same pull request. The
manifest may include credentials from any platform used by this repository, but
must contain only non-sensitive metadata: the GitHub secret name, provider,
expiration date, rotation URL, expected scope, and optional reminder thresholds.

The workflow's `GITHUB_TOKEN` can manage only the reminder issue in this
repository. It does not scan other repositories or provider accounts.
