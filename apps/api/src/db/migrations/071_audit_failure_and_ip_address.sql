-- The audit log uses the same words as Mado: a failed action is 'failure' and the client address
-- is ip_address. Existing rows are rewritten here once; nothing reads the old values afterwards.
-- The append-only trigger is lifted only for this rewrite, inside the migration's transaction.
ALTER TABLE audit_events DISABLE TRIGGER audit_events_append_only;
ALTER TABLE audit_events DROP CONSTRAINT audit_events_outcome_check;
UPDATE audit_events SET outcome = 'failure' WHERE outcome = 'failed';
ALTER TABLE audit_events ADD CONSTRAINT audit_events_outcome_check
  CHECK (outcome IN ('success', 'denied', 'failure'));
ALTER TABLE audit_events ENABLE TRIGGER audit_events_append_only;

ALTER TABLE audit_events RENAME COLUMN ip TO ip_address;
ALTER TABLE audit_events RENAME CONSTRAINT audit_events_ip_check TO audit_events_ip_address_check;
