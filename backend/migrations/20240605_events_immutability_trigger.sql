-- backend/migrations/20240605_events_immutability_trigger.sql
-- Trigger to prevent UPDATE/DELETE on purchase_order_events (append‑only ledger)

CREATE OR REPLACE FUNCTION prevent_event_modifications()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'purchase_order_events is immutable – updates/deletes are forbidden';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_event_modifications
BEFORE UPDATE OR DELETE ON purchase_order_events
FOR EACH ROW EXECUTE FUNCTION prevent_event_modifications();
