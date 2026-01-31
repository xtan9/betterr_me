# Database Migrations

## Applying Migrations

### Option 1: Supabase Dashboard (Recommended for first migration)
1. Go to https://supabase.com/dashboard/project/goiqubwfyzzsfamhzdnt/sql/new
2. Copy the contents of `20260129_initial_schema.sql`
3. Paste and run in the SQL Editor

### Option 2: Supabase CLI (After linking project)
```bash
# Link the project (need DB password from Supabase dashboard)
supabase link --project-ref goiqubwfyzzsfamhzdnt

# Push migrations
supabase db push
```

### Option 3: Direct psql (If you have connection string)
```bash
psql "postgresql://postgres:[PASSWORD]@db.goiqubwfyzzsfamhzdnt.supabase.co:5432/postgres" \
  -f supabase/migrations/20260129_initial_schema.sql
```

## Migration Files

- `20260129_initial_schema.sql` - Initial database schema with all tables, indexes, RLS policies
