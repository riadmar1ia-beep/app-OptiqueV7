-- Migration: create purchase_order_events table
-- Location: backend/migrations/20240605_create_purchase_order_events.sql

-- Ensure uuid-ossp extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing table if it exists to avoid schema mismatches
DROP TABLE IF EXISTS purchase_order_events CASCADE;

-- Create the event ledger table
CREATE TABLE purchase_order_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_order_id UUID NOT NULL REFERENCES supplier_orders(id) ON DELETE CASCADE,
    event_type VARCHAR(32) NOT NULL CHECK (event_type IN (
        'credit_note_created',
        'dispute_opened',
        'dispute_resolved',
        'order_cancelled',
        'return_created'
    )),
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID NOT NULL
);

-- Index for fast lookup per supplier order and deterministic ordering
CREATE INDEX IF NOT EXISTS idx_purchase_order_events_supplier_order_id_created_at
    ON purchase_order_events (supplier_order_id, created_at);

-- Optional unique constraint to prevent duplicate identical events (defensive)
-- ALTER TABLE purchase_order_events ADD CONSTRAINT uq_supplier_order_event_type_timestamp UNIQUE (supplier_order_id, event_type, created_at);
