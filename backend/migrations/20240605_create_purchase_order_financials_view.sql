-- Migration: create materialized view for purchase order financial summary
-- Location: backend/migrations/20240605_create_purchase_order_financials_view.sql

CREATE MATERIALIZED VIEW IF NOT EXISTS purchase_order_financials AS
SELECT
    po.id AS order_id,
    po.supplier_invoice_amount AS invoice_total,
    po.status,
    COALESCE(SUM((e.data->>'amount_ht')::numeric), 0) AS total_credit_ht,
    COALESCE(SUM((e.data->>'amount_ttc')::numeric), 0) AS total_credit_ttc,
    po.supplier_invoice_amount - COALESCE(SUM((e.data->>'amount_ht')::numeric), 0) AS remaining,
    CASE WHEN (po.supplier_invoice_amount - COALESCE(SUM((e.data->>'amount_ht')::numeric), 0)) <= 0 THEN TRUE ELSE FALSE END AS is_settled,
    MAX(e.created_at) AS last_event_at
FROM supplier_orders po
LEFT JOIN purchase_order_events e
    ON e.supplier_order_id = po.id AND e.event_type = 'credit_note_created'
GROUP BY po.id, po.supplier_invoice_amount, po.status;

-- Refresh function (optional, immediate refresh on insert via trigger defined elsewhere)
