-- Set passwords for database roles
\set pgpass `echo "$POSTGRES_PASSWORD"`

ALTER USER authenticator WITH PASSWORD :'pgpass';
ALTER USER pgbouncer WITH PASSWORD :'pgpass';
ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';
ALTER USER supabase_storage_admin WITH PASSWORD :'pgpass';

-- supabase_read_only_user is created WITH LOGIN by the base image but with NO
-- password, so the read-only connection string (used by the MCP read-only query
-- path, which authenticates as this role with POSTGRES_PASSWORD) fails with
-- "password authentication failed". Set its password too. Guarded because the
-- role is absent in some supabase/postgres image versions.
SET app.db_password = :'pgpass';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_read_only_user') THEN
    EXECUTE format('ALTER USER supabase_read_only_user WITH PASSWORD %L',
                   current_setting('app.db_password'));
  ELSE
    RAISE NOTICE 'Role supabase_read_only_user does not exist, skipping';
  END IF;
END $$;
RESET app.db_password;

-- supabase_functions_admin may not exist in all supabase/postgres image versions.
-- Use DO block to conditionally alter only if role exists.
SET app.db_password = :'pgpass';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_functions_admin') THEN
    EXECUTE format('ALTER USER supabase_functions_admin WITH PASSWORD %L',
                   current_setting('app.db_password'));
  ELSE
    RAISE NOTICE 'Role supabase_functions_admin does not exist, skipping';
  END IF;
END $$;
RESET app.db_password;

-- Transfer ownership of auth functions to supabase_auth_admin so GoTrue
-- migrations can CREATE OR REPLACE them without "must be owner" errors.
ALTER FUNCTION auth.uid() OWNER TO supabase_auth_admin;
ALTER FUNCTION auth.role() OWNER TO supabase_auth_admin;
ALTER FUNCTION auth.email() OWNER TO supabase_auth_admin;

-- Increase statement_timeout for authenticator so PostgREST schema cache
-- introspection doesn't time out on cold start (default 3s is too low).
ALTER ROLE authenticator SET statement_timeout = '30s';
