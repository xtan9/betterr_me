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
