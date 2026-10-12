-- Existing IDs and immutable external references survive conversion of the bridge.
ALTER TABLE plugin_connections
  ALTER COLUMN enabled SET DEFAULT false,
  ALTER COLUMN base_url SET DEFAULT '',
  ALTER COLUMN token_env SET DEFAULT '',
  ADD COLUMN kind text NOT NULL DEFAULT 'legacy' CHECK (kind IN ('mado','legacy')),
  ADD COLUMN config jsonb,
  ADD COLUMN migration_pending boolean NOT NULL DEFAULT false,
  ADD COLUMN config_revision integer NOT NULL DEFAULT 0 CHECK (config_revision >= 0),
  ADD COLUMN secret_key_id text,
  ADD COLUMN encrypted_credentials bytea,
  ADD COLUMN credentials_configured jsonb NOT NULL DEFAULT '{"readToken":false,"lineageToken":false,"metricsToken":false}'::jsonb;
UPDATE plugin_connections SET kind='mado',migration_pending=true WHERE manifest->>'id'='mado';
ALTER TABLE plugin_outbox
  ADD COLUMN payload text,
  ADD COLUMN payload_hash text,
  ADD COLUMN config_revision integer,
  ADD COLUMN destination_url text;

-- A retry changes lease/status only. Pinning legacy rows is allowed once, after migration settings.
CREATE FUNCTION protect_plugin_delivery_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.plugin_id IS DISTINCT FROM NEW.plugin_id OR OLD.event_id IS DISTINCT FROM NEW.event_id
      OR OLD.event IS DISTINCT FROM NEW.event THEN
    RAISE EXCEPTION 'Plugin event identity is immutable';
  END IF;
  IF OLD.payload IS NOT NULL AND (OLD.payload IS DISTINCT FROM NEW.payload
      OR OLD.payload_hash IS DISTINCT FROM NEW.payload_hash
      OR OLD.destination_url IS DISTINCT FROM NEW.destination_url
      OR OLD.config_revision IS DISTINCT FROM NEW.config_revision) THEN
    RAISE EXCEPTION 'Plugin delivery snapshot is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER plugin_delivery_identity BEFORE UPDATE ON plugin_outbox
  FOR EACH ROW EXECUTE FUNCTION protect_plugin_delivery_identity();
