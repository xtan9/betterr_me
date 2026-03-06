-- Fix vault RPC security: revoke public/authenticated access, grant service_role only.
-- These RPCs wrap Supabase Vault and should only be callable by the service_role
-- (used via admin client on the server side). Authenticated users must never
-- call them directly — access tokens are managed through API routes.

REVOKE ALL ON FUNCTION create_plaid_secret(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION create_plaid_secret(text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION create_plaid_secret(text, text, text) TO service_role;

REVOKE ALL ON FUNCTION get_plaid_secret(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_plaid_secret(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION get_plaid_secret(text) TO service_role;

REVOKE ALL ON FUNCTION delete_plaid_secret(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION delete_plaid_secret(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION delete_plaid_secret(text) TO service_role;
