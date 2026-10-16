-- One Mado access token now carries reading, sending and capacity, and its grant lists the namespaces.
-- The connection check stores that grant; namespaces are no longer entered in the connection.
ALTER TABLE plugin_connections
  ADD COLUMN access_token_grant jsonb,
  ALTER COLUMN credentials_configured SET DEFAULT '{"accessToken":false}'::jsonb;
-- Per-purpose keys cannot be merged into one token, so administrators enter the access token again.
-- The encrypted values are kept unchanged; the application ignores keys other than accessToken.
UPDATE plugin_connections
  SET credentials_configured = '{"accessToken":false}'::jsonb,
      config = CASE WHEN config IS NULL THEN NULL ELSE config - 'namespaces' END,
      manifest = CASE WHEN kind = 'mado' THEN NULL ELSE manifest END;
