--
-- PostgreSQL database dump
--

\restrict mFRd4ewxXclSCvnHn2zosVTOzS9zWe3bb0Cj0FrejlM55cluddg3zsFg6ykica9

-- Dumped from database version 18.3
-- Dumped by pg_dump version 18.3

-- Started on 2026-06-05 19:49:53

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 7 (class 2615 OID 115917)
-- Name: archive_20261203; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA archive_20261203;


ALTER SCHEMA archive_20261203 OWNER TO postgres;

--
-- TOC entry 9 (class 2615 OID 115998)
-- Name: backup_production; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA backup_production;


ALTER SCHEMA backup_production OWNER TO postgres;

--
-- TOC entry 8 (class 2615 OID 115973)
-- Name: backup_production_20261203; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA backup_production_20261203;


ALTER SCHEMA backup_production_20261203 OWNER TO postgres;

--
-- TOC entry 2 (class 3079 OID 116225)
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- TOC entry 6012 (class 0 OID 0)
-- Dependencies: 2
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- TOC entry 351 (class 1255 OID 115912)
-- Name: api_create_sales_order(character varying, uuid, jsonb, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.api_create_sales_order(p_tenant_id character varying, p_client_id uuid, p_items jsonb, p_notes text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_order_id UUID;
    v_item RECORD;
    v_total_ht BIGINT := 0;
    v_total_tva BIGINT := 0;
    v_total_ttc BIGINT := 0;
BEGIN
    -- Générer un nouvel ID
    v_order_id := gen_random_uuid();
    
    -- Calculer les totaux
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        description TEXT, quantity INT, unit_price_cents INT, tax_rate NUMERIC
    )
    LOOP
        v_total_ht := v_total_ht + (v_item.quantity * v_item.unit_price_cents);
        v_total_tva := v_total_tva + (v_item.quantity * v_item.unit_price_cents * v_item.tax_rate / 100);
    END LOOP;
    v_total_ttc := v_total_ht + v_total_tva;
    
    -- 1. Écrire dans le nouveau core
    INSERT INTO core_sales_order (
        id, order_number, tenant_id, client_id, status, payment_status,
        total_ht_cents, total_tva_cents, total_ttc_cents,
        order_date, notes, created_at, legacy_source
    ) VALUES (
        v_order_id,
        'SO-' || to_char(NOW(), 'YYYYMMDD') || '-' || LPAD(floor(random() * 10000)::text, 4, '0'),
        p_tenant_id, p_client_id, 'draft', 'unpaid',
        v_total_ht, v_total_tva, v_total_ttc,
        CURRENT_DATE, p_notes, NOW(), 'api_v2'
    );
    
    -- 2. Insérer les lignes
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        line_type VARCHAR, description TEXT, quantity INT, 
        unit_price_cents INT, tax_rate NUMERIC, product_id UUID
    )
    LOOP
        INSERT INTO core_sales_order_item (
            sales_order_id, line_type, description, quantity,
            unit_price_cents, tax_rate, tax_amount_cents, total_cents,
            product_id, created_at
        ) VALUES (
            v_order_id, v_item.line_type, v_item.description, v_item.quantity,
            v_item.unit_price_cents, v_item.tax_rate,
            (v_item.quantity * v_item.unit_price_cents * v_item.tax_rate / 100),
            (v_item.quantity * v_item.unit_price_cents),
            v_item.product_id, NOW()
        );
    END LOOP;
    
    -- 3. Optionnel : écrire aussi dans l'ancien système (double écriture)
    -- (à activer progressivement)
    
    RETURN v_order_id;
END;
$$;


ALTER FUNCTION public.api_create_sales_order(p_tenant_id character varying, p_client_id uuid, p_items jsonb, p_notes text) OWNER TO postgres;

--
-- TOC entry 354 (class 1255 OID 116036)
-- Name: auto_create_accounting_entry(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.auto_create_accounting_entry() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_tva_amount INT;
BEGIN
  -- Calculer TVA (20%)
  v_tva_amount := NEW.amount_ttc_cents - NEW.amount_ht_cents;
  
  -- Écriture Client (Débit)
  INSERT INTO accounting_journal (
    entry_date, account_number, account_name, 
    debit_cents, credit_cents, 
    reference_type, reference_id, description, 
    tenant_id, created_at
  ) VALUES (
    NEW.invoice_date, '411000', 'Clients',
    NEW.amount_ttc_cents, 0,
    'invoice', NEW.id, 'Facture ' || NEW.invoice_number,
    NEW.tenant_id, NOW()
  );
  
  -- Écriture Vente (Crédit)
  INSERT INTO accounting_journal (
    entry_date, account_number, account_name, 
    debit_cents, credit_cents, 
    reference_type, reference_id, description, 
    tenant_id, created_at
  ) VALUES (
    NEW.invoice_date, '701100', 'Ventes de marchandises',
    0, NEW.amount_ht_cents,
    'invoice', NEW.id, 'Vente ' || NEW.invoice_number,
    NEW.tenant_id, NOW()
  );
  
  -- Écriture TVA (Crédit) - optionnelle
  INSERT INTO accounting_journal (
    entry_date, account_number, account_name, 
    debit_cents, credit_cents, 
    reference_type, reference_id, description, 
    tenant_id, created_at
  ) VALUES (
    NEW.invoice_date, '445710', 'TVA collectée',
    0, v_tva_amount,
    'invoice', NEW.id, 'TVA ' || NEW.invoice_number,
    NEW.tenant_id, NOW()
  );
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.auto_create_accounting_entry() OWNER TO postgres;

--
-- TOC entry 350 (class 1255 OID 114856)
-- Name: generate_document_number(character varying, character varying); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.generate_document_number(p_tenant_id character varying, p_doc_type character varying) RETURNS character varying
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_year INT;
    v_next_number INT;
    v_prefix VARCHAR(10);
BEGIN
    v_year := EXTRACT(YEAR FROM NOW());
    
    -- Verrouiller la ligne
    PERFORM id FROM document_sequences 
    WHERE tenant_id = p_tenant_id AND document_type = p_doc_type AND year = v_year
    FOR UPDATE;
    
    -- Insérer ou mettre à jour
    INSERT INTO document_sequences (tenant_id, document_type, year, current_number, prefix, created_at, updated_at)
    VALUES (p_tenant_id, p_doc_type, v_year, 1, 
            CASE p_doc_type 
                WHEN 'invoice' THEN 'FAC'
                WHEN 'quote' THEN 'DEV'
                WHEN 'purchase_order' THEN 'PO'
                WHEN 'credit_note' THEN 'AV'
                ELSE 'DOC'
            END, NOW(), NOW())
    ON CONFLICT (tenant_id, document_type, year) DO UPDATE
    SET current_number = document_sequences.current_number + 1,
        updated_at = NOW()
    RETURNING current_number, prefix INTO v_next_number, v_prefix;
    
    RETURN v_prefix || '-' || v_year || '-' || LPAD(v_next_number::TEXT, 6, '0');
END;
$$;


ALTER FUNCTION public.generate_document_number(p_tenant_id character varying, p_doc_type character varying) OWNER TO postgres;

--
-- TOC entry 349 (class 1255 OID 114857)
-- Name: get_next_document_number(character varying, character varying); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_next_document_number(p_tenant_id character varying, p_doc_type character varying) RETURNS character varying
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_year INT;
    v_next_number INT;
    v_prefix VARCHAR(10);
BEGIN
    v_year := EXTRACT(YEAR FROM NOW());
    
    SELECT COALESCE(current_number, 0) + 1, COALESCE(prefix, 
        CASE p_doc_type 
            WHEN 'invoice' THEN 'FAC'
            WHEN 'quote' THEN 'DEV'
            WHEN 'purchase_order' THEN 'PO'
            WHEN 'credit_note' THEN 'AV'
            ELSE 'DOC'
        END)
    INTO v_next_number, v_prefix
    FROM document_sequences 
    WHERE tenant_id = p_tenant_id AND document_type = p_doc_type AND year = v_year;
    
    IF v_next_number IS NULL THEN
        v_next_number := 1;
        v_prefix := CASE p_doc_type 
                        WHEN 'invoice' THEN 'FAC'
                        WHEN 'quote' THEN 'DEV'
                        WHEN 'purchase_order' THEN 'PO'
                        WHEN 'credit_note' THEN 'AV'
                        ELSE 'DOC'
                    END;
    END IF;
    
    RETURN v_prefix || '-' || v_year || '-' || LPAD(v_next_number::TEXT, 6, '0');
END;
$$;


ALTER FUNCTION public.get_next_document_number(p_tenant_id character varying, p_doc_type character varying) OWNER TO postgres;

--
-- TOC entry 326 (class 1255 OID 115628)
-- Name: link_lens_order_to_sale(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.link_lens_order_to_sale() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Vérifier si le sales_order existe
    IF NOT EXISTS (SELECT 1 FROM sales_orders WHERE id = NEW.sales_order_id) THEN
        RAISE EXCEPTION 'sales_order_id % n''existe pas', NEW.sales_order_id;
    END IF;
    
    -- Vérifier si le client existe
    IF NOT EXISTS (SELECT 1 FROM clients WHERE id = NEW.client_id) THEN
        RAISE EXCEPTION 'client_id % n''existe pas', NEW.client_id;
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.link_lens_order_to_sale() OWNER TO postgres;

--
-- TOC entry 323 (class 1255 OID 114366)
-- Name: log_price_change(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.log_price_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF OLD.price_cents IS DISTINCT FROM NEW.price_cents THEN
        INSERT INTO product_price_history (
            tenant_id, product_id, old_price_cents, new_price_cents, changed_at
        ) VALUES (
            NEW.tenant_id, NEW.id, OLD.price_cents, NEW.price_cents, NOW()
        );
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.log_price_change() OWNER TO postgres;

--
-- TOC entry 327 (class 1255 OID 116223)
-- Name: prevent_event_modifications(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.prevent_event_modifications() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'purchase_order_events is immutable – updates/deletes are forbidden';
  RETURN NULL;
END;
$$;


ALTER FUNCTION public.prevent_event_modifications() OWNER TO postgres;

--
-- TOC entry 324 (class 1255 OID 115401)
-- Name: sync_invoice_line(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.sync_invoice_line() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_TABLE_NAME = 'sales_invoice_items' THEN
    INSERT INTO invoice_lines (
      invoice_id, invoice_type, description, quantity, 
      unit_price_cents, total_ht_cents, tax_rate, 
      tax_amount_cents, total_ttc_cents, tenant_id, created_at
    ) VALUES (
      NEW.invoice_id, 'sale', NEW.description, NEW.quantity,
      NEW.unit_price_cents, NEW.total_cents, 
      COALESCE(NEW.tax_rate, 20), NEW.tax_amount_cents,
      NEW.total_cents + COALESCE(NEW.tax_amount_cents, 0),
      NEW.tenant_id, NOW()
    );
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.sync_invoice_line() OWNER TO postgres;

--
-- TOC entry 353 (class 1255 OID 115897)
-- Name: sync_lens_order_to_core(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.sync_lens_order_to_core() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    INSERT INTO core_optical_job (
        id,
        job_number,
        tenant_id,
        client_id,
        prescription_id,
        right_lens_config,
        left_lens_config,
        selling_price_cents,
        cost_price_cents,
        job_status,
        supplier_id,
        ordered_at,
        received_at,
        created_at,
        updated_at,
        legacy_lens_order_id,
        sales_order_id
    ) VALUES (
        COALESCE(NEW.id, gen_random_uuid()),
        NEW.id::text,
        NEW.tenant_id,
        NEW.client_id,
        NEW.prescription_id,
        COALESCE(NEW.right_eye_config, '{}'),
        COALESCE(NEW.left_eye_config, '{}'),
        COALESCE(NEW.selling_price_cents, 0),
        COALESCE(NEW.cost_cents, 0),
        CASE 
            WHEN NEW.status = 'delivered' THEN 'delivered'
            WHEN NEW.status = 'cancelled' THEN 'cancelled'
            WHEN NEW.status = 'in_production' THEN 'in_production'
            WHEN NEW.status = 'shipped' THEN 'shipped'
            WHEN NEW.status = 'received' THEN 'received'
            ELSE 'ordered'
        END,
        NEW.supplier_id,
        NEW.ordered_at,
        NEW.received_at,
        NEW.created_at,
        NEW.updated_at,
        NEW.id,
        NEW.sales_order_id
    )
    ON CONFLICT (id) DO UPDATE SET
        job_status = EXCLUDED.job_status,
        updated_at = EXCLUDED.updated_at,
        received_at = EXCLUDED.received_at;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.sync_lens_order_to_core() OWNER TO postgres;

--
-- TOC entry 6013 (class 0 OID 0)
-- Dependencies: 353
-- Name: FUNCTION sync_lens_order_to_core(); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.sync_lens_order_to_core() IS 'Trigger de double écriture - lens_orders -> core_optical_job';


--
-- TOC entry 355 (class 1255 OID 116042)
-- Name: sync_new_order_to_core(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.sync_new_order_to_core() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    INSERT INTO core_sales_order (
        id, order_number, tenant_id, client_id, status, payment_status,
        total_ht_cents, total_tva_cents, total_ttc_cents,
        order_date, created_at, updated_at,
        legacy_order_id, legacy_source
    ) VALUES (
        NEW.id, NEW.order_number, NEW.tenant_id, NEW.client_id, 
        NEW.status, COALESCE(NEW.payment_status, 'unpaid'),
        COALESCE(NEW.total_ht_cents, 0), COALESCE(NEW.total_tva_cents, 0), 
        COALESCE(NEW.total_ttc_cents, 0),
        COALESCE(NEW.created_at::date, NOW()), NEW.created_at, NEW.updated_at,
        NEW.id, 'sales_orders'
    )
    ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        total_ht_cents = EXCLUDED.total_ht_cents,
        total_tva_cents = EXCLUDED.total_tva_cents,
        total_ttc_cents = EXCLUDED.total_ttc_cents,
        updated_at = NOW();
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.sync_new_order_to_core() OWNER TO postgres;

--
-- TOC entry 352 (class 1255 OID 115896)
-- Name: sync_sales_order_to_core(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.sync_sales_order_to_core() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    INSERT INTO core_sales_order (
        id,
        order_number,
        tenant_id,
        client_id,
        status,
        payment_status,
        order_date,
        notes,
        created_at,
        updated_at,
        legacy_order_id,
        legacy_source
    ) VALUES (
        COALESCE(NEW.id, gen_random_uuid()),
        NEW.order_number,
        NEW.tenant_id,
        NEW.client_id,
        NEW.status,
        COALESCE(NEW.payment_status, 'unpaid'),
        COALESCE(NEW.created_at::date, CURRENT_DATE),
        NEW.notes,
        COALESCE(NEW.created_at, NOW()),
        COALESCE(NEW.updated_at, NOW()),
        NEW.id,
        'sales_orders'
    )
    ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        payment_status = EXCLUDED.payment_status,
        notes = EXCLUDED.notes,
        updated_at = EXCLUDED.updated_at;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.sync_sales_order_to_core() OWNER TO postgres;

--
-- TOC entry 6014 (class 0 OID 0)
-- Dependencies: 352
-- Name: FUNCTION sync_sales_order_to_core(); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.sync_sales_order_to_core() IS 'Trigger de double écriture - sales_orders -> core_sales_order';


--
-- TOC entry 325 (class 1255 OID 115626)
-- Name: update_lens_order_timestamp(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_lens_order_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_lens_order_timestamp() OWNER TO postgres;

--
-- TOC entry 322 (class 1255 OID 113189)
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_updated_at_column() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 291 (class 1259 OID 115938)
-- Name: lens_orders_archive; Type: TABLE; Schema: archive_20261203; Owner: postgres
--

CREATE TABLE archive_20261203.lens_orders_archive (
    id uuid,
    tenant_id character varying(100),
    sales_order_id uuid,
    client_id uuid,
    prescription_id uuid,
    right_eye_config jsonb,
    left_eye_config jsonb,
    supplier_id uuid,
    cost_cents integer,
    selling_price_cents integer,
    status character varying(50),
    ordered_at timestamp with time zone,
    received_at timestamp with time zone,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    archived_at timestamp with time zone DEFAULT now()
);


ALTER TABLE archive_20261203.lens_orders_archive OWNER TO postgres;

--
-- TOC entry 290 (class 1259 OID 115933)
-- Name: sales_invoice_items_archive; Type: TABLE; Schema: archive_20261203; Owner: postgres
--

CREATE TABLE archive_20261203.sales_invoice_items_archive (
    id uuid,
    tenant_id character varying(100),
    invoice_id uuid,
    sales_order_item_id uuid,
    description text,
    quantity integer,
    unit_price_cents integer,
    total_cents integer,
    created_at timestamp without time zone,
    tax_rate numeric(5,2),
    tax_amount_cents integer,
    archived_at timestamp with time zone DEFAULT now()
);


ALTER TABLE archive_20261203.sales_invoice_items_archive OWNER TO postgres;

--
-- TOC entry 289 (class 1259 OID 115928)
-- Name: sales_invoices_archive; Type: TABLE; Schema: archive_20261203; Owner: postgres
--

CREATE TABLE archive_20261203.sales_invoices_archive (
    id uuid,
    tenant_id character varying(100),
    sales_order_id uuid,
    invoice_number character varying(100),
    invoice_date date,
    amount_ht_cents integer,
    amount_ttc_cents integer,
    deposit_cents integer,
    remaining_cents integer,
    insurance_coverage_cents integer,
    payment_status character varying(50),
    payment_date date,
    payment_method character varying(50),
    notes text,
    created_at timestamp without time zone,
    updated_at timestamp without time zone,
    client_id uuid,
    customer_name character varying(255),
    document_origin character varying(20),
    created_by uuid,
    updated_by uuid,
    archived_at timestamp with time zone DEFAULT now()
);


ALTER TABLE archive_20261203.sales_invoices_archive OWNER TO postgres;

--
-- TOC entry 288 (class 1259 OID 115923)
-- Name: sales_order_items_archive; Type: TABLE; Schema: archive_20261203; Owner: postgres
--

CREATE TABLE archive_20261203.sales_order_items_archive (
    id uuid,
    tenant_id character varying(100),
    sales_order_id uuid,
    item_type character varying(50),
    product_id uuid,
    description text,
    quantity integer,
    unit_price_cents integer,
    total_cents integer,
    metadata jsonb,
    created_at timestamp without time zone,
    updated_at timestamp without time zone,
    tax_rate numeric(5,2),
    tax_amount_cents integer,
    total_ttc_cents integer,
    archived_at timestamp with time zone DEFAULT now()
);


ALTER TABLE archive_20261203.sales_order_items_archive OWNER TO postgres;

--
-- TOC entry 287 (class 1259 OID 115918)
-- Name: sales_orders_archive; Type: TABLE; Schema: archive_20261203; Owner: postgres
--

CREATE TABLE archive_20261203.sales_orders_archive (
    id uuid,
    tenant_id character varying(100),
    prescription_id uuid,
    customer_name character varying(255),
    customer_email character varying(255),
    customer_phone character varying(50),
    order_number character varying(100),
    status character varying(50),
    payment_method character varying(50),
    payment_status character varying(50),
    created_at timestamp without time zone,
    paid_at timestamp without time zone,
    notes text,
    client_id uuid,
    updated_at timestamp without time zone,
    order_type character varying(50),
    invoice_number character varying(50),
    archived_at timestamp with time zone DEFAULT now()
);


ALTER TABLE archive_20261203.sales_orders_archive OWNER TO postgres;

--
-- TOC entry 292 (class 1259 OID 115943)
-- Name: supplier_orders_archive; Type: TABLE; Schema: archive_20261203; Owner: postgres
--

CREATE TABLE archive_20261203.supplier_orders_archive (
    id uuid,
    tenant_id character varying(100),
    order_id character varying(100),
    sales_order_id uuid,
    right_eye_config jsonb,
    left_eye_config jsonb,
    status character varying(50),
    technical_notes text,
    created_at timestamp without time zone,
    sent_at timestamp without time zone,
    confirmed_at timestamp without time zone,
    delivered_at timestamp without time zone,
    expected_price_cents integer,
    actual_price_cents integer,
    invoice_id uuid,
    payment_status character varying(50),
    supplier_id uuid,
    client_id uuid,
    has_left_eye boolean,
    has_right_eye boolean,
    received_at timestamp without time zone,
    shipped_at timestamp without time zone,
    quality_control_at timestamp without time zone,
    quality_control_by uuid,
    quality_control_notes text,
    items jsonb,
    order_type character varying(50),
    source_type character varying(50),
    created_by character varying(100),
    requested_by character varying(100),
    logistic_status character varying(50),
    quality_status character varying(50),
    supplier_invoice_number character varying(100),
    supplier_invoice_date date,
    supplier_invoice_amount numeric(12,2),
    quality_checked_at timestamp without time zone,
    quality_checked_by uuid,
    quality_notes text,
    updated_at timestamp without time zone,
    credit_note_number character varying(100),
    credit_note_amount_cents integer,
    credit_note_date timestamp without time zone,
    archived_at timestamp with time zone DEFAULT now()
);


ALTER TABLE archive_20261203.supplier_orders_archive OWNER TO postgres;

--
-- TOC entry 303 (class 1259 OID 116014)
-- Name: company_settings; Type: TABLE; Schema: backup_production; Owner: postgres
--

CREATE TABLE backup_production.company_settings (
    id integer,
    tenant_id character varying(100),
    company_name character varying(255),
    address text,
    phone character varying(50),
    email character varying(255),
    website character varying(255),
    rc character varying(50),
    if_number character varying(50),
    patente character varying(50),
    ice character varying(50),
    logo_url text,
    invoice_prefix character varying(20),
    credit_note_prefix character varying(20),
    purchase_order_prefix character varying(20),
    quote_prefix character varying(20),
    delivery_note_prefix character varying(20),
    created_at timestamp without time zone,
    updated_at timestamp without time zone
);


ALTER TABLE backup_production.company_settings OWNER TO postgres;

--
-- TOC entry 301 (class 1259 OID 116004)
-- Name: core_optical_job; Type: TABLE; Schema: backup_production; Owner: postgres
--

CREATE TABLE backup_production.core_optical_job (
    id uuid,
    job_number character varying(50),
    tenant_id character varying(100),
    client_id uuid,
    prescription_id uuid,
    sales_order_id uuid,
    right_lens_config jsonb,
    left_lens_config jsonb,
    selling_price_cents integer,
    cost_price_cents integer,
    job_status character varying(30),
    supplier_id uuid,
    supplier_order_id uuid,
    ordered_at timestamp with time zone,
    in_production_at timestamp with time zone,
    shipped_at timestamp with time zone,
    received_at timestamp with time zone,
    delivered_at timestamp with time zone,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    created_by uuid,
    legacy_lens_order_id uuid
);


ALTER TABLE backup_production.core_optical_job OWNER TO postgres;

--
-- TOC entry 300 (class 1259 OID 115999)
-- Name: core_sales_order; Type: TABLE; Schema: backup_production; Owner: postgres
--

CREATE TABLE backup_production.core_sales_order (
    id uuid,
    order_number character varying(50),
    tenant_id character varying(100),
    client_id uuid,
    status character varying(30),
    payment_status character varying(30),
    total_ht_cents bigint,
    total_tva_cents bigint,
    total_ttc_cents bigint,
    order_date date,
    paid_at timestamp with time zone,
    notes text,
    metadata jsonb,
    created_at timestamp with time zone,
    created_by uuid,
    updated_at timestamp with time zone,
    updated_by uuid,
    legacy_order_id uuid,
    legacy_invoice_id uuid,
    legacy_source character varying(50)
);


ALTER TABLE backup_production.core_sales_order OWNER TO postgres;

--
-- TOC entry 302 (class 1259 OID 116009)
-- Name: core_sales_order_item; Type: TABLE; Schema: backup_production; Owner: postgres
--

CREATE TABLE backup_production.core_sales_order_item (
    id uuid,
    sales_order_id uuid,
    line_type character varying(30),
    description text,
    quantity integer,
    unit_price_cents integer,
    tax_rate numeric(5,2),
    tax_amount_cents integer,
    total_cents integer,
    product_id uuid,
    optical_job_id uuid,
    metadata jsonb,
    created_at timestamp with time zone
);


ALTER TABLE backup_production.core_sales_order_item OWNER TO postgres;

--
-- TOC entry 304 (class 1259 OID 116019)
-- Name: plan_comptable; Type: TABLE; Schema: backup_production; Owner: postgres
--

CREATE TABLE backup_production.plan_comptable (
    id uuid,
    account_number character varying(10),
    account_name character varying(255),
    class integer,
    type character varying(20),
    parent_id uuid,
    is_active boolean,
    tenant_id character varying(100),
    created_at timestamp without time zone
);


ALTER TABLE backup_production.plan_comptable OWNER TO postgres;

--
-- TOC entry 305 (class 1259 OID 116022)
-- Name: triggers_info; Type: TABLE; Schema: backup_production; Owner: postgres
--

CREATE TABLE backup_production.triggers_info (
    tgname name,
    table_name regclass
);


ALTER TABLE backup_production.triggers_info OWNER TO postgres;

--
-- TOC entry 298 (class 1259 OID 115989)
-- Name: company_settings; Type: TABLE; Schema: backup_production_20261203; Owner: postgres
--

CREATE TABLE backup_production_20261203.company_settings (
    id integer,
    tenant_id character varying(100),
    company_name character varying(255),
    address text,
    phone character varying(50),
    email character varying(255),
    website character varying(255),
    rc character varying(50),
    if_number character varying(50),
    patente character varying(50),
    ice character varying(50),
    logo_url text,
    invoice_prefix character varying(20),
    credit_note_prefix character varying(20),
    purchase_order_prefix character varying(20),
    quote_prefix character varying(20),
    delivery_note_prefix character varying(20),
    created_at timestamp without time zone,
    updated_at timestamp without time zone
);


ALTER TABLE backup_production_20261203.company_settings OWNER TO postgres;

--
-- TOC entry 296 (class 1259 OID 115979)
-- Name: core_optical_job; Type: TABLE; Schema: backup_production_20261203; Owner: postgres
--

CREATE TABLE backup_production_20261203.core_optical_job (
    id uuid,
    job_number character varying(50),
    tenant_id character varying(100),
    client_id uuid,
    prescription_id uuid,
    sales_order_id uuid,
    right_lens_config jsonb,
    left_lens_config jsonb,
    selling_price_cents integer,
    cost_price_cents integer,
    job_status character varying(30),
    supplier_id uuid,
    supplier_order_id uuid,
    ordered_at timestamp with time zone,
    in_production_at timestamp with time zone,
    shipped_at timestamp with time zone,
    received_at timestamp with time zone,
    delivered_at timestamp with time zone,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    created_by uuid,
    legacy_lens_order_id uuid
);


ALTER TABLE backup_production_20261203.core_optical_job OWNER TO postgres;

--
-- TOC entry 295 (class 1259 OID 115974)
-- Name: core_sales_order; Type: TABLE; Schema: backup_production_20261203; Owner: postgres
--

CREATE TABLE backup_production_20261203.core_sales_order (
    id uuid,
    order_number character varying(50),
    tenant_id character varying(100),
    client_id uuid,
    status character varying(30),
    payment_status character varying(30),
    total_ht_cents bigint,
    total_tva_cents bigint,
    total_ttc_cents bigint,
    order_date date,
    paid_at timestamp with time zone,
    notes text,
    metadata jsonb,
    created_at timestamp with time zone,
    created_by uuid,
    updated_at timestamp with time zone,
    updated_by uuid,
    legacy_order_id uuid,
    legacy_invoice_id uuid,
    legacy_source character varying(50)
);


ALTER TABLE backup_production_20261203.core_sales_order OWNER TO postgres;

--
-- TOC entry 297 (class 1259 OID 115984)
-- Name: core_sales_order_item; Type: TABLE; Schema: backup_production_20261203; Owner: postgres
--

CREATE TABLE backup_production_20261203.core_sales_order_item (
    id uuid,
    sales_order_id uuid,
    line_type character varying(30),
    description text,
    quantity integer,
    unit_price_cents integer,
    tax_rate numeric(5,2),
    tax_amount_cents integer,
    total_cents integer,
    product_id uuid,
    optical_job_id uuid,
    metadata jsonb,
    created_at timestamp with time zone
);


ALTER TABLE backup_production_20261203.core_sales_order_item OWNER TO postgres;

--
-- TOC entry 299 (class 1259 OID 115994)
-- Name: plan_comptable; Type: TABLE; Schema: backup_production_20261203; Owner: postgres
--

CREATE TABLE backup_production_20261203.plan_comptable (
    id uuid,
    account_number character varying(10),
    account_name character varying(255),
    class integer,
    type character varying(20),
    parent_id uuid,
    is_active boolean,
    tenant_id character varying(100),
    created_at timestamp without time zone
);


ALTER TABLE backup_production_20261203.plan_comptable OWNER TO postgres;

--
-- TOC entry 270 (class 1259 OID 114791)
-- Name: accounting_journal; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.accounting_journal (
    id integer NOT NULL,
    entry_date date NOT NULL,
    account_number character varying(20) NOT NULL,
    account_name character varying(100) NOT NULL,
    debit_cents bigint DEFAULT 0,
    credit_cents bigint DEFAULT 0,
    reference_type character varying(30),
    reference_id uuid,
    description text,
    tenant_id character varying(100) DEFAULT 'default-shop'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    created_by uuid
);


ALTER TABLE public.accounting_journal OWNER TO postgres;

--
-- TOC entry 269 (class 1259 OID 114790)
-- Name: accounting_journal_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.accounting_journal_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.accounting_journal_id_seq OWNER TO postgres;

--
-- TOC entry 6015 (class 0 OID 0)
-- Dependencies: 269
-- Name: accounting_journal_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.accounting_journal_id_seq OWNED BY public.accounting_journal.id;


--
-- TOC entry 268 (class 1259 OID 114770)
-- Name: alerts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.alerts (
    id integer NOT NULL,
    type character varying(30) NOT NULL,
    title character varying(200) NOT NULL,
    message text,
    target_date date,
    is_read boolean DEFAULT false,
    is_acknowledged boolean DEFAULT false,
    user_id uuid,
    tenant_id character varying(100) DEFAULT 'default-shop'::character varying,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.alerts OWNER TO postgres;

--
-- TOC entry 267 (class 1259 OID 114769)
-- Name: alerts_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.alerts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.alerts_id_seq OWNER TO postgres;

--
-- TOC entry 6016 (class 0 OID 0)
-- Dependencies: 267
-- Name: alerts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.alerts_id_seq OWNED BY public.alerts.id;


--
-- TOC entry 275 (class 1259 OID 115358)
-- Name: amortissements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.amortissements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    immobilisation_id uuid,
    year integer NOT NULL,
    amortissement_amount_cents integer NOT NULL,
    cumulative_amount_cents integer NOT NULL,
    net_book_value_cents integer NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.amortissements OWNER TO postgres;

--
-- TOC entry 232 (class 1259 OID 113616)
-- Name: clients; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(100) NOT NULL,
    first_name character varying(255) NOT NULL,
    last_name character varying(255) NOT NULL,
    phone character varying(50) NOT NULL,
    email character varying(255),
    address text,
    date_of_birth date,
    insurance_company character varying(255),
    insurance_number character varying(100),
    insurance_rate numeric(5,2) DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    deleted_at timestamp without time zone,
    is_active boolean DEFAULT true
);


ALTER TABLE public.clients OWNER TO postgres;

--
-- TOC entry 231 (class 1259 OID 113563)
-- Name: coating_pricing; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.coating_pricing (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    coating_code character varying(50) NOT NULL,
    coating_name character varying(255) NOT NULL,
    purchase_price_cents integer NOT NULL,
    selling_price_cents integer NOT NULL,
    tenant_id character varying(100) DEFAULT 'default-shop'::character varying
);


ALTER TABLE public.coating_pricing OWNER TO postgres;

--
-- TOC entry 228 (class 1259 OID 113297)
-- Name: coatings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.coatings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    price_cents integer NOT NULL,
    description text
);


ALTER TABLE public.coatings OWNER TO postgres;

--
-- TOC entry 253 (class 1259 OID 114606)
-- Name: company_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.company_settings (
    id integer NOT NULL,
    tenant_id character varying(100) NOT NULL,
    company_name character varying(255) DEFAULT 'MARZOUK OPTIQUE'::character varying NOT NULL,
    address text,
    phone character varying(50),
    email character varying(255),
    website character varying(255),
    rc character varying(50),
    if_number character varying(50),
    patente character varying(50),
    ice character varying(50),
    logo_url text,
    invoice_prefix character varying(20) DEFAULT 'FACT'::character varying,
    credit_note_prefix character varying(20) DEFAULT 'AV'::character varying,
    purchase_order_prefix character varying(20) DEFAULT 'PO'::character varying,
    quote_prefix character varying(20) DEFAULT 'DEV'::character varying,
    delivery_note_prefix character varying(20) DEFAULT 'BL'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.company_settings OWNER TO postgres;

--
-- TOC entry 252 (class 1259 OID 114605)
-- Name: company_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.company_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.company_settings_id_seq OWNER TO postgres;

--
-- TOC entry 6017 (class 0 OID 0)
-- Dependencies: 252
-- Name: company_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.company_settings_id_seq OWNED BY public.company_settings.id;


--
-- TOC entry 308 (class 1259 OID 116073)
-- Name: core_invoice_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.core_invoice_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_id uuid NOT NULL,
    order_item_id uuid,
    tenant_id character varying(100) NOT NULL,
    description text NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    unit_price_cents integer NOT NULL,
    total_ht_cents integer NOT NULL,
    tax_rate numeric(5,2) DEFAULT 20 NOT NULL,
    tax_amount_cents integer NOT NULL,
    total_ttc_cents integer NOT NULL,
    product_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    legacy_id uuid
);


ALTER TABLE public.core_invoice_items OWNER TO postgres;

--
-- TOC entry 307 (class 1259 OID 116044)
-- Name: core_invoices; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.core_invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_number character varying(50) NOT NULL,
    tenant_id character varying(100) NOT NULL,
    order_id uuid,
    client_id uuid,
    client_name character varying(255),
    client_snapshot jsonb,
    total_ht_cents bigint DEFAULT 0 NOT NULL,
    total_tva_cents bigint DEFAULT 0 NOT NULL,
    total_ttc_cents bigint DEFAULT 0 NOT NULL,
    status character varying(20) DEFAULT 'draft'::character varying,
    payment_status character varying(20) DEFAULT 'unpaid'::character varying,
    invoice_date date DEFAULT CURRENT_DATE NOT NULL,
    payment_date date,
    notes text,
    payment_method character varying(50),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone,
    legacy_id uuid
);


ALTER TABLE public.core_invoices OWNER TO postgres;

--
-- TOC entry 283 (class 1259 OID 115845)
-- Name: core_optical_job; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.core_optical_job (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_number character varying(50) NOT NULL,
    tenant_id character varying(100) NOT NULL,
    client_id uuid NOT NULL,
    prescription_id uuid,
    sales_order_id uuid,
    right_lens_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    left_lens_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    selling_price_cents integer DEFAULT 0 NOT NULL,
    cost_price_cents integer DEFAULT 0 NOT NULL,
    job_status character varying(30) DEFAULT 'pending'::character varying,
    supplier_id uuid,
    supplier_order_id uuid,
    ordered_at timestamp with time zone,
    in_production_at timestamp with time zone,
    shipped_at timestamp with time zone,
    received_at timestamp with time zone,
    delivered_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone,
    created_by uuid,
    legacy_lens_order_id uuid,
    CONSTRAINT optical_job_status_check CHECK (((job_status)::text = ANY ((ARRAY['pending'::character varying, 'ordered'::character varying, 'in_production'::character varying, 'shipped'::character varying, 'received'::character varying, 'delivered'::character varying, 'cancelled'::character varying])::text[])))
);


ALTER TABLE public.core_optical_job OWNER TO postgres;

--
-- TOC entry 309 (class 1259 OID 116104)
-- Name: core_payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.core_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(100) NOT NULL,
    invoice_id uuid,
    order_id uuid,
    amount_cents integer NOT NULL,
    payment_method character varying(50),
    payment_date timestamp with time zone DEFAULT now(),
    reference character varying(100),
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    legacy_id uuid
);


ALTER TABLE public.core_payments OWNER TO postgres;

--
-- TOC entry 281 (class 1259 OID 115784)
-- Name: core_sales_order; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.core_sales_order (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_number character varying(50) NOT NULL,
    tenant_id character varying(100) NOT NULL,
    client_id uuid NOT NULL,
    status character varying(30) DEFAULT 'draft'::character varying,
    payment_status character varying(30) DEFAULT 'unpaid'::character varying,
    total_ht_cents bigint DEFAULT 0 NOT NULL,
    total_tva_cents bigint DEFAULT 0 NOT NULL,
    total_ttc_cents bigint DEFAULT 0 NOT NULL,
    order_date date DEFAULT CURRENT_DATE NOT NULL,
    paid_at timestamp with time zone,
    notes text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    updated_at timestamp with time zone,
    updated_by uuid,
    legacy_order_id uuid,
    legacy_invoice_id uuid,
    legacy_source character varying(50),
    prescription_id uuid
);


ALTER TABLE public.core_sales_order OWNER TO postgres;

--
-- TOC entry 282 (class 1259 OID 115810)
-- Name: core_sales_order_item; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.core_sales_order_item (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sales_order_id uuid NOT NULL,
    line_type character varying(30) NOT NULL,
    description text NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    unit_price_cents integer NOT NULL,
    tax_rate numeric(5,2) DEFAULT 20 NOT NULL,
    tax_amount_cents integer NOT NULL,
    total_cents integer NOT NULL,
    product_id uuid,
    optical_job_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT core_sales_order_item_line_type_check CHECK (((line_type)::text = ANY ((ARRAY['product'::character varying, 'optical_job'::character varying, 'lens'::character varying, 'service'::character varying, 'shipping'::character varying, 'discount'::character varying, 'accessory'::character varying, 'frame'::character varying])::text[]))),
    CONSTRAINT valid_line_type CHECK (((line_type)::text = ANY ((ARRAY['product'::character varying, 'optical_job'::character varying, 'service'::character varying, 'shipping'::character varying, 'discount'::character varying])::text[])))
);


ALTER TABLE public.core_sales_order_item OWNER TO postgres;

--
-- TOC entry 224 (class 1259 OID 113191)
-- Name: products; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(100),
    reference character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    price_cents integer DEFAULT 0,
    min_stock integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    deleted_at timestamp without time zone,
    sku character varying(100),
    barcode character varying(100),
    location character varying(100),
    purchase_price_cents integer,
    margin_percent numeric(5,2),
    is_featured boolean DEFAULT false,
    is_active boolean DEFAULT true,
    frame_type character varying(50),
    gender character varying(20),
    shape character varying(50),
    material character varying(50),
    frame_color character varying(50),
    temple_color character varying(50),
    size_code character varying(20),
    lens_width integer,
    bridge_width integer,
    temple_length integer,
    lens_height integer,
    base_curve character varying(10),
    rim_type character varying(50),
    accessory_type character varying(50),
    compatible_with text,
    consumable boolean DEFAULT false,
    supplier_id uuid,
    frame_brand character varying(100),
    frame_model character varying(100)
);


ALTER TABLE public.products OWNER TO postgres;

--
-- TOC entry 238 (class 1259 OID 113942)
-- Name: stock_movements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.stock_movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(100) NOT NULL,
    product_id uuid NOT NULL,
    type character varying(10) NOT NULL,
    quantity integer NOT NULL,
    source_type character varying(50),
    source_id uuid,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_by uuid
);


ALTER TABLE public.stock_movements OWNER TO postgres;

--
-- TOC entry 6018 (class 0 OID 0)
-- Dependencies: 238
-- Name: TABLE stock_movements; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.stock_movements IS 'SOURCE UNIQUE - Tous les mouvements de stock';


--
-- TOC entry 284 (class 1259 OID 115875)
-- Name: core_stock_view; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.core_stock_view AS
 SELECT sm.product_id,
    p.reference,
    p.name,
    p.tenant_id,
    sum(
        CASE
            WHEN ((sm.type)::text = ANY ((ARRAY['IN'::character varying, 'ADJUST'::character varying])::text[])) THEN sm.quantity
            WHEN ((sm.type)::text = 'OUT'::text) THEN (- sm.quantity)
            ELSE 0
        END) AS physical_stock,
    sum(
        CASE
            WHEN ((sm.type)::text = 'RESERVE'::text) THEN sm.quantity
            ELSE 0
        END) AS reserved_stock,
    sum(
        CASE
            WHEN ((sm.type)::text = ANY ((ARRAY['IN'::character varying, 'ADJUST'::character varying])::text[])) THEN sm.quantity
            WHEN ((sm.type)::text = ANY ((ARRAY['OUT'::character varying, 'RESERVE'::character varying])::text[])) THEN (- sm.quantity)
            ELSE 0
        END) AS available_stock
   FROM (public.stock_movements sm
     JOIN public.products p ON ((p.id = sm.product_id)))
  WHERE (p.deleted_at IS NULL)
  GROUP BY sm.product_id, p.reference, p.name, p.tenant_id;


ALTER VIEW public.core_stock_view OWNER TO postgres;

--
-- TOC entry 6019 (class 0 OID 0)
-- Dependencies: 284
-- Name: VIEW core_stock_view; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON VIEW public.core_stock_view IS 'SOURCE UNIQUE DE VÉRITÉ - Stock calculé depuis stock_movements';


--
-- TOC entry 285 (class 1259 OID 115881)
-- Name: core_supplier_order_lifecycle; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.core_supplier_order_lifecycle (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    supplier_order_id uuid NOT NULL,
    status character varying(50) NOT NULL,
    previous_status character varying(50),
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.core_supplier_order_lifecycle OWNER TO postgres;

--
-- TOC entry 6020 (class 0 OID 0)
-- Dependencies: 285
-- Name: TABLE core_supplier_order_lifecycle; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.core_supplier_order_lifecycle IS 'Remplace supplier_order_events et supplier_order_history';


--
-- TOC entry 255 (class 1259 OID 114631)
-- Name: document_sequences; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.document_sequences (
    id integer NOT NULL,
    tenant_id character varying(100) NOT NULL,
    document_type character varying(50) NOT NULL,
    prefix character varying(10) NOT NULL,
    current_number integer DEFAULT 1 NOT NULL,
    year integer NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.document_sequences OWNER TO postgres;

--
-- TOC entry 254 (class 1259 OID 114630)
-- Name: document_sequences_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.document_sequences_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.document_sequences_id_seq OWNER TO postgres;

--
-- TOC entry 6021 (class 0 OID 0)
-- Dependencies: 254
-- Name: document_sequences_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.document_sequences_id_seq OWNED BY public.document_sequences.id;


--
-- TOC entry 274 (class 1259 OID 115340)
-- Name: immobilisations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.immobilisations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    acquisition_date date NOT NULL,
    acquisition_cost_cents integer NOT NULL,
    useful_life_years integer NOT NULL,
    residual_value_cents integer DEFAULT 0,
    method character varying(20) DEFAULT 'linear'::character varying,
    status character varying(20) DEFAULT 'active'::character varying,
    tenant_id character varying(100) NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.immobilisations OWNER TO postgres;

--
-- TOC entry 276 (class 1259 OID 115377)
-- Name: invoice_lines; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.invoice_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_id uuid NOT NULL,
    invoice_type character varying(20) NOT NULL,
    description text NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    unit_price_cents integer NOT NULL,
    total_ht_cents integer NOT NULL,
    tax_rate numeric(5,2) NOT NULL,
    tax_amount_cents integer NOT NULL,
    total_ttc_cents integer NOT NULL,
    product_id uuid,
    reference_type character varying(50),
    reference_id uuid,
    tenant_id character varying(100) NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    created_by uuid
);


ALTER TABLE public.invoice_lines OWNER TO postgres;

--
-- TOC entry 277 (class 1259 OID 115587)
-- Name: lens_orders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.lens_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(100) NOT NULL,
    sales_order_id uuid NOT NULL,
    client_id uuid NOT NULL,
    prescription_id uuid,
    right_eye_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    left_eye_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    supplier_id uuid,
    cost_cents integer DEFAULT 0 NOT NULL,
    selling_price_cents integer DEFAULT 0 NOT NULL,
    status character varying(50) DEFAULT 'draft'::character varying,
    ordered_at timestamp with time zone,
    received_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT lens_orders_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'ordered'::character varying, 'in_production'::character varying, 'shipped'::character varying, 'received'::character varying, 'delivered'::character varying, 'cancelled'::character varying])::text[])))
);


ALTER TABLE public.lens_orders OWNER TO postgres;

--
-- TOC entry 6022 (class 0 OID 0)
-- Dependencies: 277
-- Name: TABLE lens_orders; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.lens_orders IS 'Commandes de verres sur mesure - source de vérité pour les lentilles';


--
-- TOC entry 6023 (class 0 OID 0)
-- Dependencies: 277
-- Name: COLUMN lens_orders.right_eye_config; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.lens_orders.right_eye_config IS 'Configuration œil droit (type, index, coatings, prix)';


--
-- TOC entry 6024 (class 0 OID 0)
-- Dependencies: 277
-- Name: COLUMN lens_orders.left_eye_config; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.lens_orders.left_eye_config IS 'Configuration œil gauche (type, index, coatings, prix)';


--
-- TOC entry 230 (class 1259 OID 113548)
-- Name: lens_pricing; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.lens_pricing (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lens_type character varying(50) NOT NULL,
    index_type character varying(10) NOT NULL,
    material character varying(50) NOT NULL,
    purchase_price_cents integer NOT NULL,
    selling_price_cents integer NOT NULL,
    margin_percentage numeric(5,2),
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.lens_pricing OWNER TO postgres;

--
-- TOC entry 227 (class 1259 OID 113283)
-- Name: lens_types; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.lens_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    multiplier numeric(5,2) DEFAULT 1.0,
    available_indexes text[],
    available_materials text[]
);


ALTER TABLE public.lens_types OWNER TO postgres;

--
-- TOC entry 294 (class 1259 OID 115963)
-- Name: migration_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.migration_log (
    id integer NOT NULL,
    migration_date timestamp with time zone DEFAULT now(),
    version character varying(20),
    description text,
    executed_by character varying(100),
    status character varying(20)
);


ALTER TABLE public.migration_log OWNER TO postgres;

--
-- TOC entry 293 (class 1259 OID 115962)
-- Name: migration_log_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.migration_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.migration_log_id_seq OWNER TO postgres;

--
-- TOC entry 6025 (class 0 OID 0)
-- Dependencies: 293
-- Name: migration_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.migration_log_id_seq OWNED BY public.migration_log.id;


--
-- TOC entry 272 (class 1259 OID 114813)
-- Name: payment_reminders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payment_reminders (
    id integer NOT NULL,
    entity_type character varying(20) NOT NULL,
    entity_id uuid NOT NULL,
    invoice_id uuid NOT NULL,
    invoice_number character varying(50),
    due_date date NOT NULL,
    amount_due_cents bigint NOT NULL,
    reminder_level integer DEFAULT 1,
    reminder_sent_at timestamp without time zone,
    status character varying(20) DEFAULT 'pending'::character varying,
    tenant_id character varying(100) DEFAULT 'default-shop'::character varying,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.payment_reminders OWNER TO postgres;

--
-- TOC entry 271 (class 1259 OID 114812)
-- Name: payment_reminders_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.payment_reminders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.payment_reminders_id_seq OWNER TO postgres;

--
-- TOC entry 6026 (class 0 OID 0)
-- Dependencies: 271
-- Name: payment_reminders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.payment_reminders_id_seq OWNED BY public.payment_reminders.id;


--
-- TOC entry 310 (class 1259 OID 116139)
-- Name: payments; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.payments AS
 SELECT id,
    tenant_id,
    invoice_id,
    order_id,
    amount_cents,
    payment_method,
    payment_date,
    reference,
    created_at,
    created_by,
    legacy_id
   FROM public.core_payments;


ALTER VIEW public.payments OWNER TO postgres;

--
-- TOC entry 235 (class 1259 OID 113706)
-- Name: payments_backup; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payments_backup (
    id uuid DEFAULT gen_random_uuid() CONSTRAINT payments_id_not_null NOT NULL,
    tenant_id character varying(100) CONSTRAINT payments_tenant_id_not_null NOT NULL,
    invoice_id uuid CONSTRAINT payments_invoice_id_not_null NOT NULL,
    amount_cents integer CONSTRAINT payments_amount_cents_not_null NOT NULL,
    payment_method character varying(50),
    payment_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    reference character varying(100),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    bank_account character varying(100),
    created_by uuid
);


ALTER TABLE public.payments_backup OWNER TO postgres;

--
-- TOC entry 259 (class 1259 OID 114680)
-- Name: permissions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.permissions (
    id integer NOT NULL,
    resource character varying(50) NOT NULL,
    action character varying(20) NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.permissions OWNER TO postgres;

--
-- TOC entry 258 (class 1259 OID 114679)
-- Name: permissions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.permissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.permissions_id_seq OWNER TO postgres;

--
-- TOC entry 6027 (class 0 OID 0)
-- Dependencies: 258
-- Name: permissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.permissions_id_seq OWNED BY public.permissions.id;


--
-- TOC entry 273 (class 1259 OID 115327)
-- Name: plan_comptable; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.plan_comptable (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_number character varying(10) NOT NULL,
    account_name character varying(255) NOT NULL,
    class integer NOT NULL,
    type character varying(20),
    parent_id uuid,
    is_active boolean DEFAULT true,
    tenant_id character varying(100) NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.plan_comptable OWNER TO postgres;

--
-- TOC entry 233 (class 1259 OID 113632)
-- Name: prescriptions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.prescriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(100) NOT NULL,
    client_id uuid,
    doctor_name character varying(255) NOT NULL,
    doctor_phone character varying(50),
    date_of_issue date NOT NULL,
    expiry_date date NOT NULL,
    od_sphere numeric(5,2),
    od_cylinder numeric(5,2),
    od_axis integer,
    od_addition numeric(5,2),
    og_sphere numeric(5,2),
    og_cylinder numeric(5,2),
    og_axis integer,
    og_addition numeric(5,2),
    pupillary_distance numeric(5,2),
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    technical_notes text,
    mounting_notes text,
    frame_recommendations jsonb DEFAULT '{}'::jsonb,
    right_prism numeric(5,2),
    right_prism_base character varying(10),
    left_prism numeric(5,2),
    left_prism_base character varying(10),
    prescription_number character varying(50),
    is_valid boolean DEFAULT true
);


ALTER TABLE public.prescriptions OWNER TO postgres;

--
-- TOC entry 6028 (class 0 OID 0)
-- Dependencies: 233
-- Name: COLUMN prescriptions.doctor_name; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.prescriptions.doctor_name IS 'Nom du médecin prescripteur';


--
-- TOC entry 6029 (class 0 OID 0)
-- Dependencies: 233
-- Name: COLUMN prescriptions.doctor_phone; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.prescriptions.doctor_phone IS 'Téléphone du médecin';


--
-- TOC entry 6030 (class 0 OID 0)
-- Dependencies: 233
-- Name: COLUMN prescriptions.date_of_issue; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.prescriptions.date_of_issue IS 'Date de prescription';


--
-- TOC entry 6031 (class 0 OID 0)
-- Dependencies: 233
-- Name: COLUMN prescriptions.expiry_date; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.prescriptions.expiry_date IS 'Date d''expiration (généralement 1 an)';


--
-- TOC entry 6032 (class 0 OID 0)
-- Dependencies: 233
-- Name: COLUMN prescriptions.prescription_number; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.prescriptions.prescription_number IS 'Numéro de prescription (si disponible)';


--
-- TOC entry 236 (class 1259 OID 113735)
-- Name: price_grid; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.price_grid (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(100) NOT NULL,
    lens_type character varying(50) NOT NULL,
    index_type character varying(10) NOT NULL,
    material character varying(50) NOT NULL,
    base_price_cents numeric(10,2) DEFAULT 0,
    selling_price_cents numeric(10,2) DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.price_grid OWNER TO postgres;

--
-- TOC entry 241 (class 1259 OID 114260)
-- Name: product_images; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.product_images (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(100),
    product_id uuid,
    image_url text NOT NULL,
    alt_text character varying(255),
    display_order integer DEFAULT 0,
    is_primary boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.product_images OWNER TO postgres;

--
-- TOC entry 244 (class 1259 OID 114326)
-- Name: product_price_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.product_price_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(100),
    product_id uuid,
    variant_id uuid,
    old_price_cents integer,
    new_price_cents integer,
    changed_by character varying(100),
    reason character varying(255),
    changed_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.product_price_history OWNER TO postgres;

--
-- TOC entry 243 (class 1259 OID 114305)
-- Name: product_related; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.product_related (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(100),
    product_id uuid,
    related_product_id uuid,
    relation_type character varying(50),
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.product_related OWNER TO postgres;

--
-- TOC entry 278 (class 1259 OID 115743)
-- Name: product_stock_view; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.product_stock_view AS
 SELECT p.id,
    p.reference,
    p.name,
    COALESCE(sm.stock_in, (0)::bigint) AS stock_physical,
    COALESCE(sm.stock_reserved, (0)::bigint) AS reserved_quantity,
    (COALESCE(sm.stock_in, (0)::bigint) - COALESCE(sm.stock_reserved, (0)::bigint)) AS available_quantity
   FROM (public.products p
     LEFT JOIN ( SELECT stock_movements.product_id,
            sum(
                CASE
                    WHEN ((stock_movements.type)::text = 'IN'::text) THEN stock_movements.quantity
                    ELSE 0
                END) AS stock_in,
            sum(
                CASE
                    WHEN ((stock_movements.type)::text = 'RESERVE'::text) THEN stock_movements.quantity
                    ELSE 0
                END) AS stock_reserved
           FROM public.stock_movements
          GROUP BY stock_movements.product_id) sm ON ((sm.product_id = p.id)))
  WHERE (p.deleted_at IS NULL);


ALTER VIEW public.product_stock_view OWNER TO postgres;

--
-- TOC entry 245 (class 1259 OID 114346)
-- Name: product_tags; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.product_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(100),
    product_id uuid,
    tag character varying(50),
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.product_tags OWNER TO postgres;

--
-- TOC entry 242 (class 1259 OID 114281)
-- Name: product_variants; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.product_variants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(100),
    product_id uuid,
    sku character varying(100),
    barcode character varying(100),
    color character varying(50),
    size character varying(20),
    purchase_price_cents integer,
    selling_price_cents integer,
    attributes jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.product_variants OWNER TO postgres;

--
-- TOC entry 320 (class 1259 OID 116236)
-- Name: purchase_order_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.purchase_order_events (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    supplier_order_id uuid NOT NULL,
    event_type character varying(32) NOT NULL,
    data jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid NOT NULL,
    CONSTRAINT purchase_order_events_event_type_check CHECK (((event_type)::text = ANY ((ARRAY['credit_note_created'::character varying, 'dispute_opened'::character varying, 'dispute_resolved'::character varying, 'order_cancelled'::character varying, 'return_created'::character varying])::text[])))
);


ALTER TABLE public.purchase_order_events OWNER TO postgres;

--
-- TOC entry 229 (class 1259 OID 113531)
-- Name: supplier_orders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.supplier_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(100) NOT NULL,
    order_id character varying(100) NOT NULL,
    sales_order_id uuid,
    right_eye_config jsonb,
    left_eye_config jsonb,
    status character varying(50) DEFAULT 'pending'::character varying,
    technical_notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    sent_at timestamp without time zone,
    confirmed_at timestamp without time zone,
    delivered_at timestamp without time zone,
    expected_price_cents integer DEFAULT 0,
    actual_price_cents integer DEFAULT 0,
    invoice_id uuid,
    payment_status character varying(50) DEFAULT 'pending'::character varying,
    supplier_id uuid,
    client_id uuid,
    has_left_eye boolean DEFAULT true,
    has_right_eye boolean DEFAULT true,
    received_at timestamp without time zone,
    shipped_at timestamp without time zone,
    quality_control_at timestamp without time zone,
    quality_control_by uuid,
    quality_control_notes text,
    items jsonb,
    order_type character varying(50) DEFAULT 'mixed'::character varying,
    source_type character varying(50) DEFAULT 'customer_order'::character varying,
    created_by character varying(100),
    requested_by character varying(100),
    logistic_status character varying(50) DEFAULT 'draft'::character varying,
    quality_status character varying(50) DEFAULT 'pending'::character varying,
    supplier_invoice_number character varying(100),
    supplier_invoice_date date,
    supplier_invoice_amount numeric(12,2),
    quality_checked_at timestamp without time zone,
    quality_checked_by uuid,
    quality_notes text,
    updated_at timestamp without time zone DEFAULT now(),
    credit_note_number character varying(100),
    credit_note_amount_cents integer,
    credit_note_date timestamp without time zone,
    CONSTRAINT supplier_orders_status_check CHECK (((logistic_status)::text = ANY ((ARRAY['draft'::character varying, 'sent'::character varying, 'approved'::character varying, 'shipped'::character varying, 'received'::character varying, 'quality_pending'::character varying, 'passed'::character varying, 'validated'::character varying, 'dispute'::character varying, 'returned'::character varying, 'credit_note'::character varying, 'cancelled'::character varying, 'pending'::character varying, 'completed'::character varying])::text[])))
);


ALTER TABLE public.supplier_orders OWNER TO postgres;

--
-- TOC entry 321 (class 1259 OID 116258)
-- Name: purchase_order_financials; Type: MATERIALIZED VIEW; Schema: public; Owner: postgres
--

CREATE MATERIALIZED VIEW public.purchase_order_financials AS
 SELECT po.id AS order_id,
    po.supplier_invoice_amount AS invoice_total,
    po.status,
    COALESCE(sum(((e.data ->> 'amount_ht'::text))::numeric), (0)::numeric) AS total_credit_ht,
    COALESCE(sum(((e.data ->> 'amount_ttc'::text))::numeric), (0)::numeric) AS total_credit_ttc,
    (po.supplier_invoice_amount - COALESCE(sum(((e.data ->> 'amount_ht'::text))::numeric), (0)::numeric)) AS remaining,
        CASE
            WHEN ((po.supplier_invoice_amount - COALESCE(sum(((e.data ->> 'amount_ht'::text))::numeric), (0)::numeric)) <= (0)::numeric) THEN true
            ELSE false
        END AS is_settled,
    max(e.created_at) AS last_event_at
   FROM (public.supplier_orders po
     LEFT JOIN public.purchase_order_events e ON (((e.supplier_order_id = po.id) AND ((e.event_type)::text = 'credit_note_created'::text))))
  GROUP BY po.id, po.supplier_invoice_amount, po.status
  WITH NO DATA;


ALTER MATERIALIZED VIEW public.purchase_order_financials OWNER TO postgres;

--
-- TOC entry 260 (class 1259 OID 114694)
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.role_permissions (
    role_id integer NOT NULL,
    permission_id integer NOT NULL
);


ALTER TABLE public.role_permissions OWNER TO postgres;

--
-- TOC entry 257 (class 1259 OID 114665)
-- Name: roles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.roles (
    id integer NOT NULL,
    name character varying(50) NOT NULL,
    description text,
    tenant_id character varying(100) DEFAULT 'default-shop'::character varying,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.roles OWNER TO postgres;

--
-- TOC entry 256 (class 1259 OID 114664)
-- Name: roles_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.roles_id_seq OWNER TO postgres;

--
-- TOC entry 6033 (class 0 OID 0)
-- Dependencies: 256
-- Name: roles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.roles_id_seq OWNED BY public.roles.id;


--
-- TOC entry 226 (class 1259 OID 113221)
-- Name: sale_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sale_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sale_id uuid,
    product_id uuid,
    quantity integer DEFAULT 0,
    unit_price_cents integer DEFAULT 0,
    total_cents integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.sale_items OWNER TO postgres;

--
-- TOC entry 225 (class 1259 OID 113208)
-- Name: sales; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sales (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(100),
    invoice_number character varying(50),
    customer_name character varying(255),
    customer_email character varying(255),
    total_cents integer DEFAULT 0,
    tax_cents integer DEFAULT 0,
    status character varying(50) DEFAULT 'pending'::character varying,
    payment_method character varying(50),
    invoice_hash character varying(255),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    paid_at timestamp without time zone,
    deleted_at timestamp without time zone,
    client_id uuid
);


ALTER TABLE public.sales OWNER TO postgres;

--
-- TOC entry 6034 (class 0 OID 0)
-- Dependencies: 225
-- Name: TABLE sales; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.sales IS '@freeze Ne plus modifier - En cours de migration';


--
-- TOC entry 317 (class 1259 OID 116187)
-- Name: sales_document_lines; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.sales_document_lines AS
 SELECT id,
    invoice_id AS sales_document_id,
    tenant_id,
    description,
    quantity,
    unit_price_cents,
    total_ht_cents,
    tax_rate,
    tax_amount_cents,
    total_ttc_cents,
    created_at
   FROM public.core_invoice_items;


ALTER VIEW public.sales_document_lines OWNER TO postgres;

--
-- TOC entry 316 (class 1259 OID 116183)
-- Name: sales_documents; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.sales_documents AS
 SELECT id,
    'invoice'::text AS document_type,
    invoice_number AS document_number,
    tenant_id,
    client_id,
    jsonb_build_object('name', client_name) AS client_snapshot,
    status,
    payment_status,
    total_ht_cents,
    total_tva_cents,
    total_ttc_cents,
    invoice_date AS document_date,
    created_at
   FROM public.core_invoices;


ALTER VIEW public.sales_documents OWNER TO postgres;

--
-- TOC entry 315 (class 1259 OID 116179)
-- Name: sales_invoice_items; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.sales_invoice_items AS
 SELECT id,
    invoice_id,
    tenant_id,
    description,
    quantity,
    unit_price_cents,
    total_ht_cents,
    tax_rate,
    tax_amount_cents,
    total_ttc_cents,
    created_at
   FROM public.core_invoice_items;


ALTER VIEW public.sales_invoice_items OWNER TO postgres;

--
-- TOC entry 314 (class 1259 OID 116175)
-- Name: sales_invoices; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.sales_invoices AS
 SELECT id,
    invoice_number,
    tenant_id,
    client_id,
    client_name AS customer_name,
    order_id AS sales_order_id,
    total_ht_cents AS amount_ht_cents,
    total_tva_cents AS tax_amount_cents,
    total_ttc_cents AS amount_ttc_cents,
    payment_status,
    payment_method,
    invoice_date,
    created_at
   FROM public.core_invoices;


ALTER VIEW public.sales_invoices OWNER TO postgres;

--
-- TOC entry 313 (class 1259 OID 116171)
-- Name: sales_order_items; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.sales_order_items AS
 SELECT id,
    sales_order_id,
    line_type AS item_type,
    description,
    quantity,
    unit_price_cents,
    total_cents,
    tax_rate,
    tax_amount_cents,
    product_id,
    metadata,
    created_at
   FROM public.core_sales_order_item;


ALTER VIEW public.sales_order_items OWNER TO postgres;

--
-- TOC entry 312 (class 1259 OID 116167)
-- Name: sales_orders; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.sales_orders AS
 SELECT id,
    order_number,
    tenant_id,
    client_id,
    status,
    payment_status,
    total_ht_cents,
    total_tva_cents,
    total_ttc_cents,
    order_date,
    created_at,
    updated_at
   FROM public.core_sales_order;


ALTER VIEW public.sales_orders OWNER TO postgres;

--
-- TOC entry 280 (class 1259 OID 115768)
-- Name: schema_cartography; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.schema_cartography (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    domain character varying(50) NOT NULL,
    object_name character varying(100) NOT NULL,
    object_type character varying(20) NOT NULL,
    role character varying(30) NOT NULL,
    status character varying(30) DEFAULT 'active'::character varying,
    depends_on jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    migrated_to character varying(100),
    notes text
);


ALTER TABLE public.schema_cartography OWNER TO postgres;

--
-- TOC entry 248 (class 1259 OID 114435)
-- Name: supplier_credit_notes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.supplier_credit_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(100) NOT NULL,
    credit_note_number character varying(100) NOT NULL,
    supplier_invoice_id uuid,
    supplier_order_id uuid,
    amount_ht numeric(12,2),
    amount_tva numeric(12,2),
    amount_ttc numeric(12,2),
    reason character varying(255),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_by uuid
);


ALTER TABLE public.supplier_credit_notes OWNER TO postgres;

--
-- TOC entry 234 (class 1259 OID 113684)
-- Name: supplier_invoice_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.supplier_invoice_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(100) NOT NULL,
    invoice_id uuid,
    lens_type character varying(50) NOT NULL,
    index_type character varying(10) NOT NULL,
    material character varying(50) NOT NULL,
    quantity integer NOT NULL,
    unit_price_cents integer NOT NULL,
    total_cents integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.supplier_invoice_items OWNER TO postgres;

--
-- TOC entry 239 (class 1259 OID 113966)
-- Name: supplier_invoices; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.supplier_invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(100) NOT NULL,
    supplier_id uuid,
    order_id uuid,
    invoice_number character varying(100),
    invoice_date date,
    amount_ht numeric(10,2) DEFAULT 0,
    amount_tva numeric(10,2) DEFAULT 0 NOT NULL,
    amount_ttc numeric(10,2) DEFAULT 0,
    payment_status character varying(50) DEFAULT 'pending'::character varying,
    payment_date date,
    file_url text,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    invoice_type character varying(50) DEFAULT 'standard'::character varying
);


ALTER TABLE public.supplier_invoices OWNER TO postgres;

--
-- TOC entry 247 (class 1259 OID 114399)
-- Name: supplier_order_disputes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.supplier_order_disputes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    supplier_order_id uuid,
    dispute_type character varying(50) NOT NULL,
    severity character varying(20) DEFAULT 'normal'::character varying,
    description text,
    resolution_type character varying(50),
    resolution_notes text,
    resolved_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    created_by uuid
);


ALTER TABLE public.supplier_order_disputes OWNER TO postgres;

--
-- TOC entry 251 (class 1259 OID 114538)
-- Name: supplier_order_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.supplier_order_events (
    id integer NOT NULL,
    supplier_order_id uuid NOT NULL,
    event_type character varying(50) NOT NULL,
    event_data jsonb,
    notes text,
    created_by integer,
    created_at timestamp without time zone DEFAULT now(),
    tenant_id text NOT NULL
);


ALTER TABLE public.supplier_order_events OWNER TO postgres;

--
-- TOC entry 6035 (class 0 OID 0)
-- Dependencies: 251
-- Name: TABLE supplier_order_events; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.supplier_order_events IS '@freeze À remplacer par status_history';


--
-- TOC entry 250 (class 1259 OID 114537)
-- Name: supplier_order_events_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.supplier_order_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.supplier_order_events_id_seq OWNER TO postgres;

--
-- TOC entry 6036 (class 0 OID 0)
-- Dependencies: 250
-- Name: supplier_order_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.supplier_order_events_id_seq OWNED BY public.supplier_order_events.id;


--
-- TOC entry 246 (class 1259 OID 114379)
-- Name: supplier_order_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.supplier_order_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    supplier_order_id uuid,
    old_logistic_status character varying(50),
    new_logistic_status character varying(50),
    old_quality_status character varying(50),
    new_quality_status character varying(50),
    action character varying(100),
    notes text,
    created_by uuid,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.supplier_order_history OWNER TO postgres;

--
-- TOC entry 240 (class 1259 OID 114221)
-- Name: supplier_order_issues; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.supplier_order_issues (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    supplier_order_id uuid NOT NULL,
    item_type character varying(50) NOT NULL,
    issue_type character varying(50) NOT NULL,
    description text,
    quantity integer DEFAULT 1,
    status character varying(20) DEFAULT 'open'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    resolved_at timestamp without time zone,
    notes text
);


ALTER TABLE public.supplier_order_issues OWNER TO postgres;

--
-- TOC entry 249 (class 1259 OID 114465)
-- Name: supplier_replacements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.supplier_replacements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(100) NOT NULL,
    replacement_number character varying(100) NOT NULL,
    original_invoice_id uuid,
    supplier_order_id uuid,
    new_invoice_number character varying(100),
    new_invoice_date date,
    new_amount_ht numeric(12,2),
    status character varying(50) DEFAULT 'pending'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    received_at timestamp without time zone,
    created_by uuid
);


ALTER TABLE public.supplier_replacements OWNER TO postgres;

--
-- TOC entry 237 (class 1259 OID 113750)
-- Name: suppliers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.suppliers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(100) NOT NULL,
    name character varying(255) NOT NULL,
    commercial_name character varying(255),
    ice character varying(15),
    if character varying(20),
    rc character varying(50),
    cnss character varying(50),
    patente character varying(50),
    address text,
    city character varying(100),
    postal_code character varying(10),
    phone character varying(50) NOT NULL,
    fax character varying(50),
    email character varying(255),
    website character varying(255),
    contact_name character varying(255),
    contact_phone character varying(50),
    contact_email character varying(255),
    bank_name character varying(255),
    bank_account_number character varying(100),
    bank_rib character varying(100),
    notes text,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    deleted_at timestamp without time zone,
    iban character varying(34),
    CONSTRAINT iban_format CHECK (((iban)::text ~ '^MA[0-9]{26}$'::text)),
    CONSTRAINT phone_format CHECK (((phone)::text ~ '^(\+212|0)[5-7][0-9]{8}$'::text))
);


ALTER TABLE public.suppliers OWNER TO postgres;

--
-- TOC entry 266 (class 1259 OID 114748)
-- Name: tva_declaration_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tva_declaration_items (
    id integer NOT NULL,
    declaration_id integer,
    type character varying(20) NOT NULL,
    document_type character varying(30) NOT NULL,
    document_id uuid NOT NULL,
    document_number character varying(50),
    document_date date NOT NULL,
    tva_rate numeric(5,2) NOT NULL,
    amount_ht_cents bigint NOT NULL,
    tva_amount_cents bigint NOT NULL,
    tenant_id character varying(100) DEFAULT 'default-shop'::character varying,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.tva_declaration_items OWNER TO postgres;

--
-- TOC entry 265 (class 1259 OID 114747)
-- Name: tva_declaration_items_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.tva_declaration_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.tva_declaration_items_id_seq OWNER TO postgres;

--
-- TOC entry 6037 (class 0 OID 0)
-- Dependencies: 265
-- Name: tva_declaration_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.tva_declaration_items_id_seq OWNED BY public.tva_declaration_items.id;


--
-- TOC entry 264 (class 1259 OID 114726)
-- Name: tva_declarations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tva_declarations (
    id integer NOT NULL,
    year integer NOT NULL,
    quarter integer NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    due_date date NOT NULL,
    total_ht_cents bigint DEFAULT 0,
    total_tva_collected_cents bigint DEFAULT 0,
    total_tva_deductible_cents bigint DEFAULT 0,
    net_tva_due_cents bigint DEFAULT 0,
    status character varying(20) DEFAULT 'draft'::character varying,
    submitted_at timestamp without time zone,
    validated_at timestamp without time zone,
    tenant_id character varying(100) DEFAULT 'default-shop'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    created_by uuid,
    validated_by uuid
);


ALTER TABLE public.tva_declarations OWNER TO postgres;

--
-- TOC entry 263 (class 1259 OID 114725)
-- Name: tva_declarations_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.tva_declarations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.tva_declarations_id_seq OWNER TO postgres;

--
-- TOC entry 6038 (class 0 OID 0)
-- Dependencies: 263
-- Name: tva_declarations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.tva_declarations_id_seq OWNED BY public.tva_declarations.id;


--
-- TOC entry 262 (class 1259 OID 114712)
-- Name: tva_rates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tva_rates (
    id integer NOT NULL,
    taux numeric(5,2) NOT NULL,
    label character varying(50) NOT NULL,
    is_active boolean DEFAULT true,
    valid_from date NOT NULL,
    valid_to date,
    tenant_id character varying(100) DEFAULT 'default-shop'::character varying,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.tva_rates OWNER TO postgres;

--
-- TOC entry 261 (class 1259 OID 114711)
-- Name: tva_rates_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.tva_rates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.tva_rates_id_seq OWNER TO postgres;

--
-- TOC entry 6039 (class 0 OID 0)
-- Dependencies: 261
-- Name: tva_rates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.tva_rates_id_seq OWNED BY public.tva_rates.id;


--
-- TOC entry 223 (class 1259 OID 113104)
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    first_name character varying(100),
    last_name character varying(100),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    tenant_id character varying(100) DEFAULT 'default_tenant'::character varying,
    role character varying(20) DEFAULT 'optician'::character varying,
    refresh_token_hash character varying(255),
    last_login timestamp without time zone,
    is_active boolean DEFAULT true
);


ALTER TABLE public.users OWNER TO postgres;

--
-- TOC entry 319 (class 1259 OID 116196)
-- Name: v_optical_jobs_unified; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_optical_jobs_unified AS
 SELECT id,
    job_number,
    tenant_id,
    client_id,
    prescription_id,
    sales_order_id,
    right_lens_config,
    left_lens_config,
    (selling_price_cents / 100) AS selling_price,
    (cost_price_cents / 100) AS cost_price,
    job_status AS status,
    supplier_id,
    ordered_at,
    received_at,
    created_at
   FROM public.core_optical_job coj;


ALTER VIEW public.v_optical_jobs_unified OWNER TO postgres;

--
-- TOC entry 306 (class 1259 OID 116027)
-- Name: v_production_monitoring; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_production_monitoring AS
 SELECT now() AS check_time,
    ( SELECT count(*) AS count
           FROM public.core_sales_order) AS total_orders,
    ( SELECT count(*) AS count
           FROM public.core_optical_job) AS total_jobs,
    ( SELECT count(*) AS count
           FROM pg_trigger
          WHERE (pg_trigger.tgname ~~ 'trigger_sync_%'::text)) AS active_triggers,
    ( SELECT count(*) AS count
           FROM public.core_sales_order
          WHERE ((core_sales_order.status)::text = 'delivered'::text)) AS delivered_orders,
    ( SELECT count(*) AS count
           FROM public.core_sales_order
          WHERE ((core_sales_order.status)::text = 'pending'::text)) AS pending_orders;


ALTER VIEW public.v_production_monitoring OWNER TO postgres;

--
-- TOC entry 286 (class 1259 OID 115903)
-- Name: v_sales_order_items_unified; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_sales_order_items_unified AS
 SELECT id,
    sales_order_id,
    line_type,
    description,
    quantity,
    (unit_price_cents / 100) AS unit_price,
    tax_rate,
    (tax_amount_cents / 100) AS tax_amount,
    (total_cents / 100) AS total,
    product_id,
    optical_job_id,
    created_at
   FROM public.core_sales_order_item csoi;


ALTER VIEW public.v_sales_order_items_unified OWNER TO postgres;

--
-- TOC entry 318 (class 1259 OID 116191)
-- Name: v_sales_orders_unified; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_sales_orders_unified AS
 SELECT cso.id,
    cso.order_number,
    cso.tenant_id,
    cso.client_id,
    cso.status,
    cso.payment_status,
    (cso.total_ht_cents / 100) AS total_ht,
    (cso.total_tva_cents / 100) AS total_tva,
    (cso.total_ttc_cents / 100) AS total_ttc,
    cso.order_date,
    cso.created_at,
    cso.notes,
    cl.first_name,
    cl.last_name
   FROM (public.core_sales_order cso
     LEFT JOIN public.clients cl ON ((cl.id = cso.client_id)));


ALTER VIEW public.v_sales_orders_unified OWNER TO postgres;

--
-- TOC entry 311 (class 1259 OID 116153)
-- Name: v_sales_unified; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_sales_unified AS
 SELECT cso.id,
    cso.tenant_id,
    'order'::text AS document_type,
    cso.order_number AS document_number,
    cso.client_id,
    jsonb_build_object('name', (((cl.first_name)::text || ' '::text) || (cl.last_name)::text)) AS client_snapshot,
    cso.status,
    cso.payment_status,
    cso.total_ht_cents,
    cso.total_tva_cents,
    cso.total_ttc_cents,
    cso.order_date AS document_date,
    cso.created_at,
    NULL::timestamp with time zone AS paid_at
   FROM (public.core_sales_order cso
     LEFT JOIN public.clients cl ON ((cl.id = cso.client_id)))
UNION ALL
 SELECT ci.id,
    ci.tenant_id,
    'invoice'::text AS document_type,
    ci.invoice_number AS document_number,
    ci.client_id,
    jsonb_build_object('name', ci.client_name) AS client_snapshot,
    ci.status,
    ci.payment_status,
    ci.total_ht_cents,
    ci.total_tva_cents,
    ci.total_ttc_cents,
    ci.invoice_date AS document_date,
    ci.created_at,
    (ci.payment_date)::timestamp with time zone AS paid_at
   FROM public.core_invoices ci;


ALTER VIEW public.v_sales_unified OWNER TO postgres;

--
-- TOC entry 279 (class 1259 OID 115748)
-- Name: v_stock_accurate; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_stock_accurate AS
 SELECT product_id,
    tenant_id,
    sum(
        CASE
            WHEN ((type)::text = 'IN'::text) THEN quantity
            ELSE (- quantity)
        END) AS physical_stock,
    sum(
        CASE
            WHEN ((type)::text = 'RESERVE'::text) THEN quantity
            ELSE 0
        END) AS reserved_stock,
    (sum(
        CASE
            WHEN ((type)::text = 'IN'::text) THEN quantity
            ELSE (- quantity)
        END) - sum(
        CASE
            WHEN ((type)::text = 'RESERVE'::text) THEN quantity
            ELSE 0
        END)) AS available_stock
   FROM public.stock_movements
  GROUP BY product_id, tenant_id;


ALTER VIEW public.v_stock_accurate OWNER TO postgres;

--
-- TOC entry 5385 (class 2604 OID 114794)
-- Name: accounting_journal id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accounting_journal ALTER COLUMN id SET DEFAULT nextval('public.accounting_journal_id_seq'::regclass);


--
-- TOC entry 5380 (class 2604 OID 114773)
-- Name: alerts id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.alerts ALTER COLUMN id SET DEFAULT nextval('public.alerts_id_seq'::regclass);


--
-- TOC entry 5347 (class 2604 OID 114609)
-- Name: company_settings id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.company_settings ALTER COLUMN id SET DEFAULT nextval('public.company_settings_id_seq'::regclass);


--
-- TOC entry 5356 (class 2604 OID 114634)
-- Name: document_sequences id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.document_sequences ALTER COLUMN id SET DEFAULT nextval('public.document_sequences_id_seq'::regclass);


--
-- TOC entry 5449 (class 2604 OID 115966)
-- Name: migration_log id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.migration_log ALTER COLUMN id SET DEFAULT nextval('public.migration_log_id_seq'::regclass);


--
-- TOC entry 5390 (class 2604 OID 114816)
-- Name: payment_reminders id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment_reminders ALTER COLUMN id SET DEFAULT nextval('public.payment_reminders_id_seq'::regclass);


--
-- TOC entry 5363 (class 2604 OID 114683)
-- Name: permissions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.permissions ALTER COLUMN id SET DEFAULT nextval('public.permissions_id_seq'::regclass);


--
-- TOC entry 5360 (class 2604 OID 114668)
-- Name: roles id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roles ALTER COLUMN id SET DEFAULT nextval('public.roles_id_seq'::regclass);


--
-- TOC entry 5345 (class 2604 OID 114541)
-- Name: supplier_order_events id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_order_events ALTER COLUMN id SET DEFAULT nextval('public.supplier_order_events_id_seq'::regclass);


--
-- TOC entry 5377 (class 2604 OID 114751)
-- Name: tva_declaration_items id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tva_declaration_items ALTER COLUMN id SET DEFAULT nextval('public.tva_declaration_items_id_seq'::regclass);


--
-- TOC entry 5369 (class 2604 OID 114729)
-- Name: tva_declarations id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tva_declarations ALTER COLUMN id SET DEFAULT nextval('public.tva_declarations_id_seq'::regclass);


--
-- TOC entry 5365 (class 2604 OID 114715)
-- Name: tva_rates id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tva_rates ALTER COLUMN id SET DEFAULT nextval('public.tva_rates_id_seq'::regclass);


--
-- TOC entry 5987 (class 0 OID 115938)
-- Dependencies: 291
-- Data for Name: lens_orders_archive; Type: TABLE DATA; Schema: archive_20261203; Owner: postgres
--

COPY archive_20261203.lens_orders_archive (id, tenant_id, sales_order_id, client_id, prescription_id, right_eye_config, left_eye_config, supplier_id, cost_cents, selling_price_cents, status, ordered_at, received_at, created_at, updated_at, archived_at) FROM stdin;
09c206f4-e27a-4965-84f6-c4046d4f179e	default-shop	f8773f74-d79e-4328-b955-a994591d7b72	92b04257-120b-4647-85bc-fde8d81ab9c7	\N	{"type": "progressive", "index": "1.67", "price": 290, "coatings": ["AR"], "material": "organic"}	{"type": "progressive", "index": "1.67", "price": 290, "coatings": ["AR"], "material": "organic"}	8703866b-3c3b-496f-a6d8-36b0a27b74a1	58000	35000	received	\N	2026-06-02 17:37:02.338986+02	2026-06-02 17:36:23.293601+02	2026-06-03 14:37:41.696233+02	2026-06-03 17:20:25.238597+02
455dbdab-d0aa-47be-af71-8f3dfddc98c5	default-shop	0e0037f4-2a99-41d5-99f3-931c64682764	63330f0b-bd4b-4e31-a2f3-dbfde6928cf1	\N	{"type": "progressive", "index": "1.67", "price": 350, "coatings": ["AR", "BLUE", "FOG", "SCRATCH"], "material": "organic"}	{"type": "progressive", "index": "1.67", "price": 350, "coatings": ["AR", "SCRATCH", "FOG", "BLUE"], "material": "organic"}	8703866b-3c3b-496f-a6d8-36b0a27b74a1	70000	30000	received	\N	2026-06-02 18:09:49.328131+02	2026-06-02 18:09:21.648144+02	2026-06-03 14:37:41.696233+02	2026-06-03 17:20:25.238597+02
\.


--
-- TOC entry 5986 (class 0 OID 115933)
-- Dependencies: 290
-- Data for Name: sales_invoice_items_archive; Type: TABLE DATA; Schema: archive_20261203; Owner: postgres
--

COPY archive_20261203.sales_invoice_items_archive (id, tenant_id, invoice_id, sales_order_item_id, description, quantity, unit_price_cents, total_cents, created_at, tax_rate, tax_amount_cents, archived_at) FROM stdin;
8e974b9f-1fbe-414d-a94e-0bd8a14397c0	default-shop	f8d86d01-26a8-4703-a286-9415825580f1	21e1471b-3593-46a7-bbf9-836220687645	progressive | 1.67 | organic	1	29000	29000	2026-06-02 17:37:25.136899	20.00	5800	2026-06-03 17:20:25.238597+02
f84f942c-4407-4381-9ade-38f427b2b427	default-shop	f8d86d01-26a8-4703-a286-9415825580f1	0834cefd-ca71-4c4c-8348-8d2c8139fd16	progressive | 1.67 | organic	1	29000	29000	2026-06-02 17:37:25.136899	20.00	5800	2026-06-03 17:20:25.238597+02
99904b73-8800-4644-8aa0-d26950db15ab	default-shop	1058e8d2-3e5b-4bcc-a806-e2f0bb487dc9	c0a95eac-7eaf-4da4-b0a1-a96872e4cab0	progressive | 1.67 | organic	1	35000	35000	2026-06-02 18:10:04.188561	20.00	7000	2026-06-03 17:20:25.238597+02
3c9f714b-d1f6-46ff-82ac-8676c53de27a	default-shop	1058e8d2-3e5b-4bcc-a806-e2f0bb487dc9	d435961b-6e91-4bd0-a7d5-7cd817851dc2	progressive | 1.67 | organic	1	35000	35000	2026-06-02 18:10:04.188561	20.00	7000	2026-06-03 17:20:25.238597+02
\.


--
-- TOC entry 5985 (class 0 OID 115928)
-- Dependencies: 289
-- Data for Name: sales_invoices_archive; Type: TABLE DATA; Schema: archive_20261203; Owner: postgres
--

COPY archive_20261203.sales_invoices_archive (id, tenant_id, sales_order_id, invoice_number, invoice_date, amount_ht_cents, amount_ttc_cents, deposit_cents, remaining_cents, insurance_coverage_cents, payment_status, payment_date, payment_method, notes, created_at, updated_at, client_id, customer_name, document_origin, created_by, updated_by, archived_at) FROM stdin;
f8d86d01-26a8-4703-a286-9415825580f1	default-shop	f8773f74-d79e-4328-b955-a994591d7b72	FACT-2026-000001	2026-06-02	58000	69600	6960000	-6890400	0	paid	\N	cash	\N	2026-06-02 17:37:25.136899	2026-06-02 17:37:25.136899	92b04257-120b-4647-85bc-fde8d81ab9c7	Riad Khadari	optical_order	\N	\N	2026-06-03 17:20:25.238597+02
1058e8d2-3e5b-4bcc-a806-e2f0bb487dc9	default-shop	0e0037f4-2a99-41d5-99f3-931c64682764	FACT-2026-000002	2026-06-02	70000	84000	8400000	-8316000	0	paid	\N	cash	\N	2026-06-02 18:10:04.188561	2026-06-02 18:10:04.188561	63330f0b-bd4b-4e31-a2f3-dbfde6928cf1	KARIM Khadari	optical_order	\N	\N	2026-06-03 17:20:25.238597+02
\.


--
-- TOC entry 5984 (class 0 OID 115923)
-- Dependencies: 288
-- Data for Name: sales_order_items_archive; Type: TABLE DATA; Schema: archive_20261203; Owner: postgres
--

COPY archive_20261203.sales_order_items_archive (id, tenant_id, sales_order_id, item_type, product_id, description, quantity, unit_price_cents, total_cents, metadata, created_at, updated_at, tax_rate, tax_amount_cents, total_ttc_cents, archived_at) FROM stdin;
21e1471b-3593-46a7-bbf9-836220687645	default-shop	f8773f74-d79e-4328-b955-a994591d7b72	lens	\N	progressive | 1.67 | organic	1	29000	29000	{"eye": "OD", "left_eye": {"type": "progressive", "index": "1.67", "price": 290, "coatings": ["AR"], "material": "organic"}, "right_eye": {"type": "progressive", "index": "1.67", "price": 290, "coatings": ["AR"], "material": "organic"}, "purchase_price_cents": 0}	2026-06-02 17:36:15.620309	2026-06-02 17:36:15.620309	20.00	5800	34800	2026-06-03 17:20:25.238597+02
0834cefd-ca71-4c4c-8348-8d2c8139fd16	default-shop	f8773f74-d79e-4328-b955-a994591d7b72	lens	\N	progressive | 1.67 | organic	1	29000	29000	{"eye": "OG", "left_eye": {"type": "progressive", "index": "1.67", "price": 290, "coatings": ["AR"], "material": "organic"}, "right_eye": {"type": "progressive", "index": "1.67", "price": 290, "coatings": ["AR"], "material": "organic"}, "purchase_price_cents": 0}	2026-06-02 17:36:15.620309	2026-06-02 17:36:15.620309	20.00	5800	34800	2026-06-03 17:20:25.238597+02
c0a95eac-7eaf-4da4-b0a1-a96872e4cab0	default-shop	0e0037f4-2a99-41d5-99f3-931c64682764	lens	\N	progressive | 1.67 | organic	1	35000	35000	{"eye": "OD", "left_eye": {"type": "progressive", "index": "1.67", "price": 350, "coatings": ["AR", "SCRATCH", "FOG", "BLUE"], "material": "organic"}, "right_eye": {"type": "progressive", "index": "1.67", "price": 350, "coatings": ["AR", "BLUE", "FOG", "SCRATCH"], "material": "organic"}, "purchase_price_cents": 0}	2026-06-02 18:09:11.325726	2026-06-02 18:09:11.325726	20.00	7000	42000	2026-06-03 17:20:25.238597+02
d435961b-6e91-4bd0-a7d5-7cd817851dc2	default-shop	0e0037f4-2a99-41d5-99f3-931c64682764	lens	\N	progressive | 1.67 | organic	1	35000	35000	{"eye": "OG", "left_eye": {"type": "progressive", "index": "1.67", "price": 350, "coatings": ["AR", "SCRATCH", "FOG", "BLUE"], "material": "organic"}, "right_eye": {"type": "progressive", "index": "1.67", "price": 350, "coatings": ["AR", "BLUE", "FOG", "SCRATCH"], "material": "organic"}, "purchase_price_cents": 0}	2026-06-02 18:09:11.325726	2026-06-02 18:09:11.325726	20.00	7000	42000	2026-06-03 17:20:25.238597+02
\.


--
-- TOC entry 5983 (class 0 OID 115918)
-- Dependencies: 287
-- Data for Name: sales_orders_archive; Type: TABLE DATA; Schema: archive_20261203; Owner: postgres
--

COPY archive_20261203.sales_orders_archive (id, tenant_id, prescription_id, customer_name, customer_email, customer_phone, order_number, status, payment_method, payment_status, created_at, paid_at, notes, client_id, updated_at, order_type, invoice_number, archived_at) FROM stdin;
f8773f74-d79e-4328-b955-a994591d7b72	default-shop	\N	Riad Khadari	achat.marzouk@gmail.com	0656548452	SO-1780414575619-74	delivered	\N	paid	2026-06-02 17:36:15.620309	2026-06-02 17:37:25.136899	\N	92b04257-120b-4647-85bc-fde8d81ab9c7	2026-06-02 17:36:23.293601	optical	\N	2026-06-03 17:20:25.238597+02
0e0037f4-2a99-41d5-99f3-931c64682764	default-shop	\N	KARIM Khadari	achat.marzouk2@gmail.com	0645785461	SO-1780416551325-828	delivered	\N	paid	2026-06-02 18:09:11.325726	2026-06-02 18:10:04.188561	\N	63330f0b-bd4b-4e31-a2f3-dbfde6928cf1	2026-06-02 18:09:21.648144	optical	\N	2026-06-03 17:20:25.238597+02
\.


--
-- TOC entry 5988 (class 0 OID 115943)
-- Dependencies: 292
-- Data for Name: supplier_orders_archive; Type: TABLE DATA; Schema: archive_20261203; Owner: postgres
--

COPY archive_20261203.supplier_orders_archive (id, tenant_id, order_id, sales_order_id, right_eye_config, left_eye_config, status, technical_notes, created_at, sent_at, confirmed_at, delivered_at, expected_price_cents, actual_price_cents, invoice_id, payment_status, supplier_id, client_id, has_left_eye, has_right_eye, received_at, shipped_at, quality_control_at, quality_control_by, quality_control_notes, items, order_type, source_type, created_by, requested_by, logistic_status, quality_status, supplier_invoice_number, supplier_invoice_date, supplier_invoice_amount, quality_checked_at, quality_checked_by, quality_notes, updated_at, credit_note_number, credit_note_amount_cents, credit_note_date, archived_at) FROM stdin;
52ddecd8-92f7-4725-b542-f9fb310b3d01	default-shop	SUP-1780414583292-89	f8773f74-d79e-4328-b955-a994591d7b72	{"type": "progressive", "index": "1.67", "price": 290, "coatings": ["AR"], "material": "organic"}	{"type": "progressive", "index": "1.67", "price": 290, "coatings": ["AR"], "material": "organic"}	validated	\N	2026-06-02 17:36:23.293601	\N	\N	\N	58000	35000	\N	pending	8703866b-3c3b-496f-a6d8-36b0a27b74a1	92b04257-120b-4647-85bc-fde8d81ab9c7	t	t	2026-06-02 17:37:02.338986	\N	2026-06-02 17:37:11.69815	\N	\N	[{"id": "21e1471b-3593-46a7-bbf9-836220687645", "type": "lens", "metadata": {"eye": "OD", "left_eye": {"type": "progressive", "index": "1.67", "price": 290, "coatings": ["AR"], "material": "organic"}, "right_eye": {"type": "progressive", "index": "1.67", "price": 290, "coatings": ["AR"], "material": "organic"}, "purchase_price_cents": 0}, "quantity": 1, "description": "progressive | 1.67 | organic", "total_cents": 29000, "unit_price_cents": 29000}, {"id": "0834cefd-ca71-4c4c-8348-8d2c8139fd16", "type": "lens", "metadata": {"eye": "OG", "left_eye": {"type": "progressive", "index": "1.67", "price": 290, "coatings": ["AR"], "material": "organic"}, "right_eye": {"type": "progressive", "index": "1.67", "price": 290, "coatings": ["AR"], "material": "organic"}, "purchase_price_cents": 0}, "quantity": 1, "description": "progressive | 1.67 | organic", "total_cents": 29000, "unit_price_cents": 29000}]	mixed	optical_lab	\N	\N	draft	pending	FACT001	2026-06-02	350.00	\N	\N	\N	2026-06-02 17:36:23.293601	\N	\N	\N	2026-06-03 17:20:25.238597+02
c85ca1c7-16b1-4152-8af4-32af2e374cd2	default-shop	SUP-1780416561647-697	0e0037f4-2a99-41d5-99f3-931c64682764	{"type": "progressive", "index": "1.67", "price": 350, "coatings": ["AR", "BLUE", "FOG", "SCRATCH"], "material": "organic"}	{"type": "progressive", "index": "1.67", "price": 350, "coatings": ["AR", "SCRATCH", "FOG", "BLUE"], "material": "organic"}	validated	\N	2026-06-02 18:09:21.648144	\N	\N	\N	70000	30000	\N	pending	8703866b-3c3b-496f-a6d8-36b0a27b74a1	63330f0b-bd4b-4e31-a2f3-dbfde6928cf1	t	t	2026-06-02 18:09:49.328131	\N	2026-06-02 18:09:57.755836	\N	\N	[{"id": "c0a95eac-7eaf-4da4-b0a1-a96872e4cab0", "type": "lens", "metadata": {"eye": "OD", "left_eye": {"type": "progressive", "index": "1.67", "price": 350, "coatings": ["AR", "SCRATCH", "FOG", "BLUE"], "material": "organic"}, "right_eye": {"type": "progressive", "index": "1.67", "price": 350, "coatings": ["AR", "BLUE", "FOG", "SCRATCH"], "material": "organic"}, "purchase_price_cents": 0}, "quantity": 1, "description": "progressive | 1.67 | organic", "total_cents": 35000, "unit_price_cents": 35000}, {"id": "d435961b-6e91-4bd0-a7d5-7cd817851dc2", "type": "lens", "metadata": {"eye": "OG", "left_eye": {"type": "progressive", "index": "1.67", "price": 350, "coatings": ["AR", "SCRATCH", "FOG", "BLUE"], "material": "organic"}, "right_eye": {"type": "progressive", "index": "1.67", "price": 350, "coatings": ["AR", "BLUE", "FOG", "SCRATCH"], "material": "organic"}, "purchase_price_cents": 0}, "quantity": 1, "description": "progressive | 1.67 | organic", "total_cents": 35000, "unit_price_cents": 35000}]	mixed	optical_lab	\N	\N	draft	pending	FACT124	2026-06-02	300.00	\N	\N	\N	2026-06-02 18:09:21.648144	\N	\N	\N	2026-06-03 17:20:25.238597+02
\.


--
-- TOC entry 5999 (class 0 OID 116014)
-- Dependencies: 303
-- Data for Name: company_settings; Type: TABLE DATA; Schema: backup_production; Owner: postgres
--

COPY backup_production.company_settings (id, tenant_id, company_name, address, phone, email, website, rc, if_number, patente, ice, logo_url, invoice_prefix, credit_note_prefix, purchase_order_prefix, quote_prefix, delivery_note_prefix, created_at, updated_at) FROM stdin;
1	default-shop	MARZOUK OPTIQUE	N40 Rue 6, Haj Fatah – Casablanca	05 22 90 00 42	\N	\N	397194	40416741	36265648	000819745000054	\N	FACT	AV	PO	DEV	BL	2026-05-23 17:55:05.56045	2026-05-23 17:55:05.56045
\.


--
-- TOC entry 5997 (class 0 OID 116004)
-- Dependencies: 301
-- Data for Name: core_optical_job; Type: TABLE DATA; Schema: backup_production; Owner: postgres
--

COPY backup_production.core_optical_job (id, job_number, tenant_id, client_id, prescription_id, sales_order_id, right_lens_config, left_lens_config, selling_price_cents, cost_price_cents, job_status, supplier_id, supplier_order_id, ordered_at, in_production_at, shipped_at, received_at, delivered_at, created_at, updated_at, created_by, legacy_lens_order_id) FROM stdin;
1ed974ed-88cb-4f18-bcb3-89849a80951f	09c206f4-e27a-4965-84f6-c4046d4f179e	default-shop	92b04257-120b-4647-85bc-fde8d81ab9c7	\N	f8773f74-d79e-4328-b955-a994591d7b72	{"type": "progressive", "index": "1.67", "price": 290, "coatings": ["AR"], "material": "organic"}	{"type": "progressive", "index": "1.67", "price": 290, "coatings": ["AR"], "material": "organic"}	35000	58000	received	8703866b-3c3b-496f-a6d8-36b0a27b74a1	\N	\N	\N	\N	2026-06-02 17:37:02.338986+02	\N	2026-06-02 17:36:23.293601+02	2026-06-03 14:37:41.696233+02	\N	09c206f4-e27a-4965-84f6-c4046d4f179e
1f43a088-0724-4ec8-848a-6106d0f9b345	455dbdab-d0aa-47be-af71-8f3dfddc98c5	default-shop	63330f0b-bd4b-4e31-a2f3-dbfde6928cf1	\N	0e0037f4-2a99-41d5-99f3-931c64682764	{"type": "progressive", "index": "1.67", "price": 350, "coatings": ["AR", "BLUE", "FOG", "SCRATCH"], "material": "organic"}	{"type": "progressive", "index": "1.67", "price": 350, "coatings": ["AR", "SCRATCH", "FOG", "BLUE"], "material": "organic"}	30000	70000	received	8703866b-3c3b-496f-a6d8-36b0a27b74a1	\N	\N	\N	\N	2026-06-02 18:09:49.328131+02	\N	2026-06-02 18:09:21.648144+02	2026-06-03 14:37:41.696233+02	\N	455dbdab-d0aa-47be-af71-8f3dfddc98c5
\.


--
-- TOC entry 5996 (class 0 OID 115999)
-- Dependencies: 300
-- Data for Name: core_sales_order; Type: TABLE DATA; Schema: backup_production; Owner: postgres
--

COPY backup_production.core_sales_order (id, order_number, tenant_id, client_id, status, payment_status, total_ht_cents, total_tva_cents, total_ttc_cents, order_date, paid_at, notes, metadata, created_at, created_by, updated_at, updated_by, legacy_order_id, legacy_invoice_id, legacy_source) FROM stdin;
f8773f74-d79e-4328-b955-a994591d7b72	SO-1780414575619-74	default-shop	92b04257-120b-4647-85bc-fde8d81ab9c7	delivered	paid	58000	11600	69600	2026-06-02	\N	\N	{}	2026-06-02 17:36:15.620309+02	\N	2026-06-02 17:36:23.293601+02	\N	f8773f74-d79e-4328-b955-a994591d7b72	\N	sales_orders
0e0037f4-2a99-41d5-99f3-931c64682764	SO-1780416551325-828	default-shop	63330f0b-bd4b-4e31-a2f3-dbfde6928cf1	delivered	paid	70000	14000	84000	2026-06-02	\N	\N	{}	2026-06-02 18:09:11.325726+02	\N	2026-06-02 18:09:21.648144+02	\N	0e0037f4-2a99-41d5-99f3-931c64682764	\N	sales_orders
\.


--
-- TOC entry 5998 (class 0 OID 116009)
-- Dependencies: 302
-- Data for Name: core_sales_order_item; Type: TABLE DATA; Schema: backup_production; Owner: postgres
--

COPY backup_production.core_sales_order_item (id, sales_order_id, line_type, description, quantity, unit_price_cents, tax_rate, tax_amount_cents, total_cents, product_id, optical_job_id, metadata, created_at) FROM stdin;
\.


--
-- TOC entry 6000 (class 0 OID 116019)
-- Dependencies: 304
-- Data for Name: plan_comptable; Type: TABLE DATA; Schema: backup_production; Owner: postgres
--

COPY backup_production.plan_comptable (id, account_number, account_name, class, type, parent_id, is_active, tenant_id, created_at) FROM stdin;
bc247008-fe70-46d7-9c22-eaf28e684f9f	1111	Capital social	1	PASSIF	\N	t	default-shop	2026-06-03 12:58:46.203781
3a699a21-5df6-4e5a-8713-7ac9d333647a	1140	Compte courant associé	1	PASSIF	\N	t	default-shop	2026-06-03 12:58:46.203781
af2d66b1-cd94-48a3-a878-62767790180f	1190	Résultat net	1	PASSIF	\N	t	default-shop	2026-06-03 12:58:46.203781
7a8335a5-db74-4315-b00d-3d3e02f756b0	2340	Matériel et outillage	2	ACTIF	\N	t	default-shop	2026-06-03 12:58:46.203781
87df7b34-ae7b-4ccc-8a31-e925f9f56166	2350	Matériel de bureau	2	ACTIF	\N	t	default-shop	2026-06-03 12:58:46.203781
1f6cad38-f4ad-45da-80da-6534c1e14ee1	2351	Matériel informatique	2	ACTIF	\N	t	default-shop	2026-06-03 12:58:46.203781
92baabc1-5b16-4fd1-9f01-1ac43f7f3bf2	3111	Marchandises (montures)	3	ACTIF	\N	t	default-shop	2026-06-03 12:58:46.203781
339b862a-ed64-474c-8897-d02c2f515916	3112	Marchandises (verres)	3	ACTIF	\N	t	default-shop	2026-06-03 12:58:46.203781
55e0340d-cfc4-4cd9-bf96-5029577199f7	3113	Marchandises (accessoires)	3	ACTIF	\N	t	default-shop	2026-06-03 12:58:46.203781
704cd1a0-4873-4f1b-a52c-dd9b18c1cdb6	4110	Clients	4	ACTIF	\N	t	default-shop	2026-06-03 12:58:46.203781
1a364e73-66c5-485f-809d-2e1bdbf37681	4111	Clients factures à établir	4	ACTIF	\N	t	default-shop	2026-06-03 12:58:46.203781
dffb17fe-61b9-4955-8333-cbb8ee5dd766	4455	État TVA due	4	PASSIF	\N	t	default-shop	2026-06-03 12:58:46.203781
c11c0523-8058-4f62-81f0-5b7514fa730b	4456	État TVA déductible	4	ACTIF	\N	t	default-shop	2026-06-03 12:58:46.203781
0423dfc3-06e1-4073-ac25-c0b91a215154	4457	État TVA récupérable	4	ACTIF	\N	t	default-shop	2026-06-03 12:58:46.203781
993c2684-cd7a-4551-b60b-f219907ec78b	4432	CNSS	4	PASSIF	\N	t	default-shop	2026-06-03 12:58:46.203781
95cd4162-b335-47d2-9e7c-d0ff983a6d0d	4441	IGSS	4	PASSIF	\N	t	default-shop	2026-06-03 12:58:46.203781
075bc72f-8ff5-497c-a22e-1793efd49af3	4449	IR	4	PASSIF	\N	t	default-shop	2026-06-03 12:58:46.203781
9a7c28bf-82d8-4be6-a37e-7e0268e882f8	5140	Banque	5	ACTIF	\N	t	default-shop	2026-06-03 12:58:46.203781
284bd3bf-fbf8-4bb4-a95e-6ca165d02770	5160	Caisse	5	ACTIF	\N	t	default-shop	2026-06-03 12:58:46.203781
6d8106be-abce-4fa0-a72d-5848cf9fdee5	6110	Achats montures	6	CHARGE	\N	t	default-shop	2026-06-03 12:58:46.203781
10f56afa-1b3e-4b84-acb1-c9d2e7758dd9	6111	Achats verres	6	CHARGE	\N	t	default-shop	2026-06-03 12:58:46.203781
1883e34a-9a13-4a38-a66f-988b2359c878	6112	Achats accessoires	6	CHARGE	\N	t	default-shop	2026-06-03 12:58:46.203781
661b0087-5252-4309-a8b0-0754580d2f8d	6132	Loyer	6	CHARGE	\N	t	default-shop	2026-06-03 12:58:46.203781
3a0f6e61-9898-4269-a585-58375e11517a	6140	Charges de personnel	6	CHARGE	\N	t	default-shop	2026-06-03 12:58:46.203781
5e08378c-6483-4316-a9d1-5b443a60e961	6141	CNSS patronale	6	CHARGE	\N	t	default-shop	2026-06-03 12:58:46.203781
d2a5dd0a-158e-4966-9294-3b87f0660d88	6311	Impôts et taxes	6	CHARGE	\N	t	default-shop	2026-06-03 12:58:46.203781
e2116dce-b48b-4594-888e-02d8a719fca0	6371	Honoraires	6	CHARGE	\N	t	default-shop	2026-06-03 12:58:46.203781
88fd1fcd-233c-41b2-b5ef-f8a91308cc16	7011	Ventes montures	7	PRODUIT	\N	t	default-shop	2026-06-03 12:58:46.203781
a4b77e48-3617-4521-9a81-64bb9ddf5224	7012	Ventes verres	7	PRODUIT	\N	t	default-shop	2026-06-03 12:58:46.203781
60e6d54c-8da2-4aa9-86e9-bc8145ce1c28	7013	Ventes accessoires	7	PRODUIT	\N	t	default-shop	2026-06-03 12:58:46.203781
d47f6f18-73a0-4182-aabf-0fc7ba25cdd1	7080	Autres produits	7	PRODUIT	\N	t	default-shop	2026-06-03 12:58:46.203781
\.


--
-- TOC entry 6001 (class 0 OID 116022)
-- Dependencies: 305
-- Data for Name: triggers_info; Type: TABLE DATA; Schema: backup_production; Owner: postgres
--

COPY backup_production.triggers_info (tgname, table_name) FROM stdin;
\.


--
-- TOC entry 5994 (class 0 OID 115989)
-- Dependencies: 298
-- Data for Name: company_settings; Type: TABLE DATA; Schema: backup_production_20261203; Owner: postgres
--

COPY backup_production_20261203.company_settings (id, tenant_id, company_name, address, phone, email, website, rc, if_number, patente, ice, logo_url, invoice_prefix, credit_note_prefix, purchase_order_prefix, quote_prefix, delivery_note_prefix, created_at, updated_at) FROM stdin;
1	default-shop	MARZOUK OPTIQUE	N40 Rue 6, Haj Fatah – Casablanca	05 22 90 00 42	\N	\N	397194	40416741	36265648	000819745000054	\N	FACT	AV	PO	DEV	BL	2026-05-23 17:55:05.56045	2026-05-23 17:55:05.56045
\.


--
-- TOC entry 5992 (class 0 OID 115979)
-- Dependencies: 296
-- Data for Name: core_optical_job; Type: TABLE DATA; Schema: backup_production_20261203; Owner: postgres
--

COPY backup_production_20261203.core_optical_job (id, job_number, tenant_id, client_id, prescription_id, sales_order_id, right_lens_config, left_lens_config, selling_price_cents, cost_price_cents, job_status, supplier_id, supplier_order_id, ordered_at, in_production_at, shipped_at, received_at, delivered_at, created_at, updated_at, created_by, legacy_lens_order_id) FROM stdin;
1ed974ed-88cb-4f18-bcb3-89849a80951f	09c206f4-e27a-4965-84f6-c4046d4f179e	default-shop	92b04257-120b-4647-85bc-fde8d81ab9c7	\N	f8773f74-d79e-4328-b955-a994591d7b72	{"type": "progressive", "index": "1.67", "price": 290, "coatings": ["AR"], "material": "organic"}	{"type": "progressive", "index": "1.67", "price": 290, "coatings": ["AR"], "material": "organic"}	35000	58000	received	8703866b-3c3b-496f-a6d8-36b0a27b74a1	\N	\N	\N	\N	2026-06-02 17:37:02.338986+02	\N	2026-06-02 17:36:23.293601+02	2026-06-03 14:37:41.696233+02	\N	09c206f4-e27a-4965-84f6-c4046d4f179e
1f43a088-0724-4ec8-848a-6106d0f9b345	455dbdab-d0aa-47be-af71-8f3dfddc98c5	default-shop	63330f0b-bd4b-4e31-a2f3-dbfde6928cf1	\N	0e0037f4-2a99-41d5-99f3-931c64682764	{"type": "progressive", "index": "1.67", "price": 350, "coatings": ["AR", "BLUE", "FOG", "SCRATCH"], "material": "organic"}	{"type": "progressive", "index": "1.67", "price": 350, "coatings": ["AR", "SCRATCH", "FOG", "BLUE"], "material": "organic"}	30000	70000	received	8703866b-3c3b-496f-a6d8-36b0a27b74a1	\N	\N	\N	\N	2026-06-02 18:09:49.328131+02	\N	2026-06-02 18:09:21.648144+02	2026-06-03 14:37:41.696233+02	\N	455dbdab-d0aa-47be-af71-8f3dfddc98c5
\.


--
-- TOC entry 5991 (class 0 OID 115974)
-- Dependencies: 295
-- Data for Name: core_sales_order; Type: TABLE DATA; Schema: backup_production_20261203; Owner: postgres
--

COPY backup_production_20261203.core_sales_order (id, order_number, tenant_id, client_id, status, payment_status, total_ht_cents, total_tva_cents, total_ttc_cents, order_date, paid_at, notes, metadata, created_at, created_by, updated_at, updated_by, legacy_order_id, legacy_invoice_id, legacy_source) FROM stdin;
f8773f74-d79e-4328-b955-a994591d7b72	SO-1780414575619-74	default-shop	92b04257-120b-4647-85bc-fde8d81ab9c7	delivered	paid	58000	11600	69600	2026-06-02	\N	\N	{}	2026-06-02 17:36:15.620309+02	\N	2026-06-02 17:36:23.293601+02	\N	f8773f74-d79e-4328-b955-a994591d7b72	\N	sales_orders
0e0037f4-2a99-41d5-99f3-931c64682764	SO-1780416551325-828	default-shop	63330f0b-bd4b-4e31-a2f3-dbfde6928cf1	delivered	paid	70000	14000	84000	2026-06-02	\N	\N	{}	2026-06-02 18:09:11.325726+02	\N	2026-06-02 18:09:21.648144+02	\N	0e0037f4-2a99-41d5-99f3-931c64682764	\N	sales_orders
\.


--
-- TOC entry 5993 (class 0 OID 115984)
-- Dependencies: 297
-- Data for Name: core_sales_order_item; Type: TABLE DATA; Schema: backup_production_20261203; Owner: postgres
--

COPY backup_production_20261203.core_sales_order_item (id, sales_order_id, line_type, description, quantity, unit_price_cents, tax_rate, tax_amount_cents, total_cents, product_id, optical_job_id, metadata, created_at) FROM stdin;
\.


--
-- TOC entry 5995 (class 0 OID 115994)
-- Dependencies: 299
-- Data for Name: plan_comptable; Type: TABLE DATA; Schema: backup_production_20261203; Owner: postgres
--

COPY backup_production_20261203.plan_comptable (id, account_number, account_name, class, type, parent_id, is_active, tenant_id, created_at) FROM stdin;
bc247008-fe70-46d7-9c22-eaf28e684f9f	1111	Capital social	1	PASSIF	\N	t	default-shop	2026-06-03 12:58:46.203781
3a699a21-5df6-4e5a-8713-7ac9d333647a	1140	Compte courant associé	1	PASSIF	\N	t	default-shop	2026-06-03 12:58:46.203781
af2d66b1-cd94-48a3-a878-62767790180f	1190	Résultat net	1	PASSIF	\N	t	default-shop	2026-06-03 12:58:46.203781
7a8335a5-db74-4315-b00d-3d3e02f756b0	2340	Matériel et outillage	2	ACTIF	\N	t	default-shop	2026-06-03 12:58:46.203781
87df7b34-ae7b-4ccc-8a31-e925f9f56166	2350	Matériel de bureau	2	ACTIF	\N	t	default-shop	2026-06-03 12:58:46.203781
1f6cad38-f4ad-45da-80da-6534c1e14ee1	2351	Matériel informatique	2	ACTIF	\N	t	default-shop	2026-06-03 12:58:46.203781
92baabc1-5b16-4fd1-9f01-1ac43f7f3bf2	3111	Marchandises (montures)	3	ACTIF	\N	t	default-shop	2026-06-03 12:58:46.203781
339b862a-ed64-474c-8897-d02c2f515916	3112	Marchandises (verres)	3	ACTIF	\N	t	default-shop	2026-06-03 12:58:46.203781
55e0340d-cfc4-4cd9-bf96-5029577199f7	3113	Marchandises (accessoires)	3	ACTIF	\N	t	default-shop	2026-06-03 12:58:46.203781
704cd1a0-4873-4f1b-a52c-dd9b18c1cdb6	4110	Clients	4	ACTIF	\N	t	default-shop	2026-06-03 12:58:46.203781
1a364e73-66c5-485f-809d-2e1bdbf37681	4111	Clients factures à établir	4	ACTIF	\N	t	default-shop	2026-06-03 12:58:46.203781
dffb17fe-61b9-4955-8333-cbb8ee5dd766	4455	État TVA due	4	PASSIF	\N	t	default-shop	2026-06-03 12:58:46.203781
c11c0523-8058-4f62-81f0-5b7514fa730b	4456	État TVA déductible	4	ACTIF	\N	t	default-shop	2026-06-03 12:58:46.203781
0423dfc3-06e1-4073-ac25-c0b91a215154	4457	État TVA récupérable	4	ACTIF	\N	t	default-shop	2026-06-03 12:58:46.203781
993c2684-cd7a-4551-b60b-f219907ec78b	4432	CNSS	4	PASSIF	\N	t	default-shop	2026-06-03 12:58:46.203781
95cd4162-b335-47d2-9e7c-d0ff983a6d0d	4441	IGSS	4	PASSIF	\N	t	default-shop	2026-06-03 12:58:46.203781
075bc72f-8ff5-497c-a22e-1793efd49af3	4449	IR	4	PASSIF	\N	t	default-shop	2026-06-03 12:58:46.203781
9a7c28bf-82d8-4be6-a37e-7e0268e882f8	5140	Banque	5	ACTIF	\N	t	default-shop	2026-06-03 12:58:46.203781
284bd3bf-fbf8-4bb4-a95e-6ca165d02770	5160	Caisse	5	ACTIF	\N	t	default-shop	2026-06-03 12:58:46.203781
6d8106be-abce-4fa0-a72d-5848cf9fdee5	6110	Achats montures	6	CHARGE	\N	t	default-shop	2026-06-03 12:58:46.203781
10f56afa-1b3e-4b84-acb1-c9d2e7758dd9	6111	Achats verres	6	CHARGE	\N	t	default-shop	2026-06-03 12:58:46.203781
1883e34a-9a13-4a38-a66f-988b2359c878	6112	Achats accessoires	6	CHARGE	\N	t	default-shop	2026-06-03 12:58:46.203781
661b0087-5252-4309-a8b0-0754580d2f8d	6132	Loyer	6	CHARGE	\N	t	default-shop	2026-06-03 12:58:46.203781
3a0f6e61-9898-4269-a585-58375e11517a	6140	Charges de personnel	6	CHARGE	\N	t	default-shop	2026-06-03 12:58:46.203781
5e08378c-6483-4316-a9d1-5b443a60e961	6141	CNSS patronale	6	CHARGE	\N	t	default-shop	2026-06-03 12:58:46.203781
d2a5dd0a-158e-4966-9294-3b87f0660d88	6311	Impôts et taxes	6	CHARGE	\N	t	default-shop	2026-06-03 12:58:46.203781
e2116dce-b48b-4594-888e-02d8a719fca0	6371	Honoraires	6	CHARGE	\N	t	default-shop	2026-06-03 12:58:46.203781
88fd1fcd-233c-41b2-b5ef-f8a91308cc16	7011	Ventes montures	7	PRODUIT	\N	t	default-shop	2026-06-03 12:58:46.203781
a4b77e48-3617-4521-9a81-64bb9ddf5224	7012	Ventes verres	7	PRODUIT	\N	t	default-shop	2026-06-03 12:58:46.203781
60e6d54c-8da2-4aa9-86e9-bc8145ce1c28	7013	Ventes accessoires	7	PRODUIT	\N	t	default-shop	2026-06-03 12:58:46.203781
d47f6f18-73a0-4182-aabf-0fc7ba25cdd1	7080	Autres produits	7	PRODUIT	\N	t	default-shop	2026-06-03 12:58:46.203781
\.


--
-- TOC entry 5970 (class 0 OID 114791)
-- Dependencies: 270
-- Data for Name: accounting_journal; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.accounting_journal (id, entry_date, account_number, account_name, debit_cents, credit_cents, reference_type, reference_id, description, tenant_id, created_at, created_by) FROM stdin;
1	2026-06-02	411000	Clients	69600	0	invoice	f8d86d01-26a8-4703-a286-9415825580f1	Facture FACT-2026-000001	default-shop	2026-06-02 20:45:50.158442	\N
2	2026-06-02	411000	Clients	84000	0	invoice	1058e8d2-3e5b-4bcc-a806-e2f0bb487dc9	Facture FACT-2026-000002	default-shop	2026-06-02 20:45:50.158442	\N
3	2026-06-02	701100	Ventes de marchandises	0	58000	invoice	f8d86d01-26a8-4703-a286-9415825580f1	Vente FACT-2026-000001	default-shop	2026-06-02 20:45:50.158442	\N
4	2026-06-02	701100	Ventes de marchandises	0	70000	invoice	1058e8d2-3e5b-4bcc-a806-e2f0bb487dc9	Vente FACT-2026-000002	default-shop	2026-06-02 20:45:50.158442	\N
5	2026-06-02	445710	TVA collectée	0	11600	invoice	f8d86d01-26a8-4703-a286-9415825580f1	TVA FACT-2026-000001	default-shop	2026-06-02 20:45:50.158442	\N
6	2026-06-02	445710	TVA collectée	0	14000	invoice	1058e8d2-3e5b-4bcc-a806-e2f0bb487dc9	TVA FACT-2026-000002	default-shop	2026-06-02 20:45:50.158442	\N
7	2026-06-02	514000	Banque	69600	0	payment	f8d86d01-26a8-4703-a286-9415825580f1	Paiement facture FACT-2026-000001	default-shop	2026-06-03 15:07:30.434324	\N
8	2026-06-02	514000	Banque	84000	0	payment	1058e8d2-3e5b-4bcc-a806-e2f0bb487dc9	Paiement facture FACT-2026-000002	default-shop	2026-06-03 15:07:30.434324	\N
9	2026-06-02	411000	Clients	0	69600	payment	f8d86d01-26a8-4703-a286-9415825580f1	Paiement facture FACT-2026-000001	default-shop	2026-06-03 15:07:30.434324	\N
10	2026-06-02	411000	Clients	0	84000	payment	1058e8d2-3e5b-4bcc-a806-e2f0bb487dc9	Paiement facture FACT-2026-000002	default-shop	2026-06-03 15:07:30.434324	\N
13	2026-06-03	411000	Clients	99600	0	invoice	d32e6fa6-3e68-4580-ae1a-b3eca3be4419	Facture FACT-2026-683286	default-shop	2026-06-03 19:00:03.580093	\N
14	2026-06-03	701100	Ventes de marchandises	0	83000	invoice	d32e6fa6-3e68-4580-ae1a-b3eca3be4419	Vente FACT-2026-683286	default-shop	2026-06-03 19:00:03.580093	\N
15	2026-06-03	445710	TVA collectée	0	16600	invoice	d32e6fa6-3e68-4580-ae1a-b3eca3be4419	TVA FACT-2026-683286	default-shop	2026-06-03 19:00:03.580093	\N
16	2026-06-03	411000	Clients	99600	0	invoice	1978c1fb-9d71-444f-b25d-06f36016bfbc	Facture FACT-2026-621358	default-shop	2026-06-03 19:44:21.95979	\N
17	2026-06-03	701100	Ventes de marchandises	0	83000	invoice	1978c1fb-9d71-444f-b25d-06f36016bfbc	Vente FACT-2026-621358	default-shop	2026-06-03 19:44:21.95979	\N
18	2026-06-03	445710	TVA collectée	0	16600	invoice	1978c1fb-9d71-444f-b25d-06f36016bfbc	TVA FACT-2026-621358	default-shop	2026-06-03 19:44:21.95979	\N
19	2026-06-03	411000	Clients	109200	0	invoice	73da5b9a-f164-4117-8215-a6fe9e037bc0	Facture FACT-2026-320717	default-shop	2026-06-03 19:55:43.324594	\N
20	2026-06-03	701100	Ventes de marchandises	0	91000	invoice	73da5b9a-f164-4117-8215-a6fe9e037bc0	Vente FACT-2026-320717	default-shop	2026-06-03 19:55:43.324594	\N
21	2026-06-03	445710	TVA collectée	0	18200	invoice	73da5b9a-f164-4117-8215-a6fe9e037bc0	TVA FACT-2026-320717	default-shop	2026-06-03 19:55:43.324594	\N
22	2026-06-03	411000	Clients	109200	0	invoice	d137bb1f-144a-4aa7-af54-5cb9316a92de	Facture FACT-2026-223771	default-shop	2026-06-03 20:05:57.594126	\N
23	2026-06-03	701100	Ventes de marchandises	0	91000	invoice	d137bb1f-144a-4aa7-af54-5cb9316a92de	Vente FACT-2026-223771	default-shop	2026-06-03 20:05:57.594126	\N
24	2026-06-03	445710	TVA collectée	0	18200	invoice	d137bb1f-144a-4aa7-af54-5cb9316a92de	TVA FACT-2026-223771	default-shop	2026-06-03 20:05:57.594126	\N
\.


--
-- TOC entry 5968 (class 0 OID 114770)
-- Dependencies: 268
-- Data for Name: alerts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.alerts (id, type, title, message, target_date, is_read, is_acknowledged, user_id, tenant_id, created_at) FROM stdin;
\.


--
-- TOC entry 5975 (class 0 OID 115358)
-- Dependencies: 275
-- Data for Name: amortissements; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.amortissements (id, immobilisation_id, year, amortissement_amount_cents, cumulative_amount_cents, net_book_value_cents, created_at) FROM stdin;
\.


--
-- TOC entry 5932 (class 0 OID 113616)
-- Dependencies: 232
-- Data for Name: clients; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.clients (id, tenant_id, first_name, last_name, phone, email, address, date_of_birth, insurance_company, insurance_number, insurance_rate, created_at, updated_at, deleted_at, is_active) FROM stdin;
92b04257-120b-4647-85bc-fde8d81ab9c7	default-shop	Riad	Khadari	0656548452	achat.marzouk@gmail.com	\N	\N	\N	\N	0.00	2026-05-18 20:19:45.18865	2026-05-18 20:28:18.245802	\N	t
536cf983-614d-4a65-a65f-56d2c6df80cf	default-shop	najoua	bourdi el alamo	0564578453	najoua.bourdi01@gmail.com	\N	\N	\N	\N	0.00	2026-05-19 20:33:17.698752	2026-05-21 16:21:42.901755	\N	t
63330f0b-bd4b-4e31-a2f3-dbfde6928cf1	default-shop	KARIM	Khadari	0645785461	achat.marzouk2@gmail.com	\N	\N	\N	\N	0.00	2026-05-21 16:22:28.303589	2026-05-21 16:22:28.303589	\N	t
11111111-1111-1111-1111-111111111111	default-shop	Client	Comptoir	0000000000	\N	\N	\N	\N	\N	0.00	2026-05-28 19:08:47.317199	2026-05-28 19:08:47.317199	\N	t
98e48105-2797-48b0-bedf-341c9b00d3b9	default-shop	Elias	Marzouk	0659878541	Elias@gmail.com	\N	\N	\N	\N	0.00	2026-05-23 21:32:08.29589	2026-06-05 00:32:59.183679	\N	t
\.


--
-- TOC entry 5931 (class 0 OID 113563)
-- Dependencies: 231
-- Data for Name: coating_pricing; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.coating_pricing (id, coating_code, coating_name, purchase_price_cents, selling_price_cents, tenant_id) FROM stdin;
40ddf6df-f551-4834-868b-ae0efa6ccbb2	BLUE	Anti-lumiere bleue	10	2000	default-shop
cb99f060-4262-480f-ad6a-c5e6646c2ccc	SCRATCH	Anti-rayure	8	1500	default-shop
9c8673dd-9aa1-4f45-8aa1-ec561b9c4a2a	UV	Protection UV	5	1000	default-shop
e7944c5e-6dd4-4ecf-8845-5a4c3e71c3da	AR	Antireflet	15	4000	default-shop
e64c41ef-b9d7-4851-b123-1bee3306aeea	FOG	Anti-buee	12	2500	default-shop
135e1bf6-4c92-46b1-9b5e-61cda94cd408	PHOTO	Photochromique	0	5500	default-shop
\.


--
-- TOC entry 5928 (class 0 OID 113297)
-- Dependencies: 228
-- Data for Name: coatings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.coatings (id, code, name, price_cents, description) FROM stdin;
5b60c9f4-618e-4558-b17b-00e719d4b0f1	AR	Antireflet	3000	Traitement antireflet haute performance
6abfada7-27e0-442e-b8b2-77f4a9553103	PHOTO	Photochromique	5000	Verres qui s'assombrissent à la lumière
d92b6710-0c17-4207-a18f-4b83350be0ef	BLUE	Anti-lumière bleue	2000	Filtre la lumière bleue des écrans
3ad80b0d-e4c6-4e4d-b241-c6ce851865fc	SCRATCH	Anti-rayure	1500	Résistance aux rayures
e0406595-ec52-4cb3-a4d8-d8127ab8847e	FOG	Anti-buée	2500	Empêche la formation de buée
78e2882a-e98c-4e5d-bc01-b1e47405a11d	UV	Protection UV	1000	Protection contre les rayons UV
\.


--
-- TOC entry 5953 (class 0 OID 114606)
-- Dependencies: 253
-- Data for Name: company_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.company_settings (id, tenant_id, company_name, address, phone, email, website, rc, if_number, patente, ice, logo_url, invoice_prefix, credit_note_prefix, purchase_order_prefix, quote_prefix, delivery_note_prefix, created_at, updated_at) FROM stdin;
1	default-shop	MARZOUK OPTIQUE	N40 Rue 6, Haj Fatah – Casablanca	05 22 90 00 42	\N	\N	397194	40416741	36265648	000819745000054	\N	FACT	AV	PO	DEV	BL	2026-05-23 17:55:05.56045	2026-05-23 17:55:05.56045
\.


--
-- TOC entry 6003 (class 0 OID 116073)
-- Dependencies: 308
-- Data for Name: core_invoice_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.core_invoice_items (id, invoice_id, order_item_id, tenant_id, description, quantity, unit_price_cents, total_ht_cents, tax_rate, tax_amount_cents, total_ttc_cents, product_id, created_at, legacy_id) FROM stdin;
\.


--
-- TOC entry 6002 (class 0 OID 116044)
-- Dependencies: 307
-- Data for Name: core_invoices; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.core_invoices (id, invoice_number, tenant_id, order_id, client_id, client_name, client_snapshot, total_ht_cents, total_tva_cents, total_ttc_cents, status, payment_status, invoice_date, payment_date, notes, payment_method, created_at, updated_at, legacy_id) FROM stdin;
b4db6cfb-e374-4e80-a6d2-3154ac84b0af	FAC-2026-00001	default-shop	54755218-9105-400a-b9e2-728b71d768dd	98e48105-2797-48b0-bedf-341c9b00d3b9	Elias Marzouk	\N	108000	21600	129600	draft	paid	2026-06-04	\N	\N	cash	2026-06-04 20:06:12.957144+02	\N	\N
59a472d3-bb49-403c-89ec-620024840a8c	FAC-2026-00002	default-shop	e9409acb-968e-4416-b461-3cf715dca47f	98e48105-2797-48b0-bedf-341c9b00d3b9	Elias Marzouk	\N	91000	18200	109200	draft	paid	2026-06-05	\N	\N	cash	2026-06-05 12:18:05.247152+02	\N	\N
4d424113-cf82-40a7-bb4c-772ffaaebf16	FAC-2026-00003	default-shop	68bf9857-4444-49eb-854a-82aa70f83442	98e48105-2797-48b0-bedf-341c9b00d3b9	Elias Marzouk	\N	103000	20600	123600	draft	paid	2026-06-05	\N	\N	cash	2026-06-05 12:34:45.432353+02	\N	\N
d993d36c-e0d1-456b-853f-d0f66558d389	FAC-2026-00004	default-shop	971c952c-2455-4b6e-b21c-efb06418670b	98e48105-2797-48b0-bedf-341c9b00d3b9	Elias Marzouk	\N	95000	19000	114000	draft	paid	2026-06-05	\N	\N	cash	2026-06-05 18:02:12.660133+02	\N	\N
\.


--
-- TOC entry 5981 (class 0 OID 115845)
-- Dependencies: 283
-- Data for Name: core_optical_job; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.core_optical_job (id, job_number, tenant_id, client_id, prescription_id, sales_order_id, right_lens_config, left_lens_config, selling_price_cents, cost_price_cents, job_status, supplier_id, supplier_order_id, ordered_at, in_production_at, shipped_at, received_at, delivered_at, created_at, updated_at, created_by, legacy_lens_order_id) FROM stdin;
e90c4309-ac41-4d6a-ab95-c7030e1b98b3	JOB-SO-1780592120768-947-5a716f30	default-shop	98e48105-2797-48b0-bedf-341c9b00d3b9	\N	54755218-9105-400a-b9e2-728b71d768dd	{"tint": {"color": "gray", "gradient": true, "intensity": 50}, "type": "progressive", "index": "1.67", "coatings": ["AR", "BLUE", "FOG", "SCRATCH"], "material": "organic", "description": "progressive | 1.67 | organic"}	{}	54000	30000	delivered	8703866b-3c3b-496f-a6d8-36b0a27b74a1	\N	\N	\N	\N	\N	\N	2026-06-04 20:06:12.957144+02	\N	\N	\N
aa0ec25c-ef13-4332-a618-144959d3ed43	JOB-SO-1780592120768-947-0f46d422	default-shop	98e48105-2797-48b0-bedf-341c9b00d3b9	\N	54755218-9105-400a-b9e2-728b71d768dd	{}	{"tint": {"color": "gray", "gradient": true, "intensity": 50}, "type": "progressive", "index": "1.67", "coatings": ["AR", "FOG", "SCRATCH", "BLUE"], "material": "organic", "description": "progressive | 1.67 | organic"}	54000	30000	delivered	8703866b-3c3b-496f-a6d8-36b0a27b74a1	\N	\N	\N	\N	\N	\N	2026-06-04 20:06:12.957144+02	\N	\N	\N
18a5b33e-0cdf-435f-8786-a2a0cddaf2b2	JOB-SO-1780654589478-350-735ed71b	default-shop	98e48105-2797-48b0-bedf-341c9b00d3b9	\N	e9409acb-968e-4416-b461-3cf715dca47f	{"tint": {"color": "none", "gradient": false, "intensity": 0}, "type": "progressive", "index": "1.67", "coatings": ["AR"], "material": "organic", "description": "progressive | 1.67 | organic", "prescription": {"axis": 2, "prism": null, "sphere": 0.75, "addition": 0.5, "cylinder": -0.5, "prism_base": null}}	{}	45500	17500	delivered	8703866b-3c3b-496f-a6d8-36b0a27b74a1	\N	\N	\N	\N	\N	\N	2026-06-05 12:18:05.247152+02	\N	\N	\N
692cd83b-ec6c-452c-9705-b2b92f5121fe	JOB-SO-1780654589478-350-eb97875e	default-shop	98e48105-2797-48b0-bedf-341c9b00d3b9	\N	e9409acb-968e-4416-b461-3cf715dca47f	{}	{"tint": {"color": "none", "gradient": false, "intensity": 0}, "type": "progressive", "index": "1.67", "coatings": ["AR"], "material": "organic", "description": "progressive | 1.67 | organic", "prescription": {"axis": 2, "prism": null, "sphere": 0.5, "addition": 0.5, "cylinder": -0.25, "prism_base": null}}	45500	17500	delivered	8703866b-3c3b-496f-a6d8-36b0a27b74a1	\N	\N	\N	\N	\N	\N	2026-06-05 12:18:05.247152+02	\N	\N	\N
f3b4daad-183c-4480-a504-d7c748b3bcbf	JOB-SO-1780655574357-848-9ecfd287	default-shop	98e48105-2797-48b0-bedf-341c9b00d3b9	\N	68bf9857-4444-49eb-854a-82aa70f83442	{"tint": {"color": "gray", "gradient": false, "intensity": 50}, "type": "progressive", "index": "1.67", "coatings": ["AR", "BLUE", "FOG", "SCRATCH"], "material": "organic", "description": "progressive | 1.67 | organic", "prescription": {"axis": 2, "prism": 0.5, "sphere": 0.75, "addition": 0.5, "cylinder": -0.5, "prism_base": "down"}}	{}	51500	15000	delivered	8703866b-3c3b-496f-a6d8-36b0a27b74a1	\N	\N	\N	\N	\N	\N	2026-06-05 12:34:45.432353+02	\N	\N	\N
3fe521c6-d79b-4b44-87b8-482fb11dd420	JOB-SO-1780655574357-848-06354350	default-shop	98e48105-2797-48b0-bedf-341c9b00d3b9	\N	68bf9857-4444-49eb-854a-82aa70f83442	{}	{"tint": {"color": "gray", "gradient": false, "intensity": 50}, "type": "progressive", "index": "1.67", "coatings": ["AR", "BLUE", "FOG", "SCRATCH"], "material": "organic", "description": "progressive | 1.67 | organic", "prescription": {"axis": 2, "prism": 1.5, "sphere": 0.5, "addition": 0.5, "cylinder": -0.25, "prism_base": "in"}}	51500	15000	delivered	8703866b-3c3b-496f-a6d8-36b0a27b74a1	\N	\N	\N	\N	\N	\N	2026-06-05 12:34:45.432353+02	\N	\N	\N
938b596b-4dc8-4474-b9cc-0bd330dd1ab4	JOB-SO-1780675135648-671-2022a476	default-shop	98e48105-2797-48b0-bedf-341c9b00d3b9	\N	971c952c-2455-4b6e-b21c-efb06418670b	{"tint": {"color": "none", "gradient": false, "intensity": 0}, "type": "progressive", "index": "1.67", "coatings": ["AR", "BLUE"], "material": "organic", "description": "progressive | 1.67 | organic", "prescription": {"axis": 2, "prism": null, "sphere": 0.75, "addition": 0.5, "cylinder": -0.5, "prism_base": null}}	{}	47500	30000	delivered	8703866b-3c3b-496f-a6d8-36b0a27b74a1	\N	\N	\N	\N	\N	\N	2026-06-05 18:02:12.660133+02	\N	\N	\N
92525dc8-fb0e-498f-8aca-0a49dba576ef	JOB-SO-1780675135648-671-590f438c	default-shop	98e48105-2797-48b0-bedf-341c9b00d3b9	\N	971c952c-2455-4b6e-b21c-efb06418670b	{}	{"tint": {"color": "none", "gradient": false, "intensity": 0}, "type": "progressive", "index": "1.67", "coatings": ["AR", "BLUE"], "material": "organic", "description": "progressive | 1.67 | organic", "prescription": {"axis": 2, "prism": null, "sphere": 0.5, "addition": 0.5, "cylinder": -0.25, "prism_base": null}}	47500	30000	delivered	8703866b-3c3b-496f-a6d8-36b0a27b74a1	\N	\N	\N	\N	\N	\N	2026-06-05 18:02:12.660133+02	\N	\N	\N
\.


--
-- TOC entry 6004 (class 0 OID 116104)
-- Dependencies: 309
-- Data for Name: core_payments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.core_payments (id, tenant_id, invoice_id, order_id, amount_cents, payment_method, payment_date, reference, created_at, created_by, legacy_id) FROM stdin;
5dac735e-5c5f-4e72-9646-40c03c60cf97	default-shop	b4db6cfb-e374-4e80-a6d2-3154ac84b0af	\N	129600	cash	2026-06-04 20:06:12.957144+02	\N	2026-06-04 20:06:12.957144+02	\N	\N
bd38261a-f138-45c0-9500-93928bd91ce4	default-shop	59a472d3-bb49-403c-89ec-620024840a8c	\N	109200	cash	2026-06-05 12:18:05.247152+02	\N	2026-06-05 12:18:05.247152+02	\N	\N
c696f137-6564-4373-9a2c-dc36b898f016	default-shop	4d424113-cf82-40a7-bb4c-772ffaaebf16	\N	123600	cash	2026-06-05 12:34:45.432353+02	\N	2026-06-05 12:34:45.432353+02	\N	\N
80946ae6-dcb1-4303-b090-09a069bf763b	default-shop	d993d36c-e0d1-456b-853f-d0f66558d389	\N	114000	cash	2026-06-05 18:02:12.660133+02	\N	2026-06-05 18:02:12.660133+02	\N	\N
\.


--
-- TOC entry 5979 (class 0 OID 115784)
-- Dependencies: 281
-- Data for Name: core_sales_order; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.core_sales_order (id, order_number, tenant_id, client_id, status, payment_status, total_ht_cents, total_tva_cents, total_ttc_cents, order_date, paid_at, notes, metadata, created_at, created_by, updated_at, updated_by, legacy_order_id, legacy_invoice_id, legacy_source, prescription_id) FROM stdin;
dfba3714-2276-491f-9b57-2d9bfc1dc9d0	SO-1780651182812-303	default-shop	98e48105-2797-48b0-bedf-341c9b00d3b9	pending	unpaid	103000	20600	123600	2026-06-05	\N	\N	{}	2026-06-05 11:19:42.812611+02	\N	2026-06-05 11:19:55.179287+02	\N	\N	\N	\N	\N
15d647d7-c44e-4aef-824b-640a958d9bfb	SO-1780651666554-193	default-shop	98e48105-2797-48b0-bedf-341c9b00d3b9	pending	unpaid	95000	19000	114000	2026-06-05	\N	\N	{}	2026-06-05 11:27:46.554205+02	\N	2026-06-05 11:28:22.746719+02	\N	\N	\N	\N	\N
dd77994b-5934-48f2-b784-41373035fa29	SO-1780652003312-978	default-shop	98e48105-2797-48b0-bedf-341c9b00d3b9	pending	unpaid	95000	19000	114000	2026-06-05	\N	\N	{}	2026-06-05 11:33:23.312438+02	\N	2026-06-05 11:37:18.961415+02	\N	\N	\N	\N	\N
e9409acb-968e-4416-b461-3cf715dca47f	SO-1780654589478-350	default-shop	98e48105-2797-48b0-bedf-341c9b00d3b9	delivered	paid	91000	18200	109200	2026-06-05	2026-06-05 12:18:05.247152+02	\N	{}	2026-06-05 12:16:29.478739+02	\N	2026-06-05 12:18:05.247152+02	\N	\N	\N	\N	\N
68bf9857-4444-49eb-854a-82aa70f83442	SO-1780655574357-848	default-shop	98e48105-2797-48b0-bedf-341c9b00d3b9	delivered	paid	103000	20600	123600	2026-06-05	2026-06-05 12:34:45.432353+02	\N	{}	2026-06-05 12:32:54.357986+02	\N	2026-06-05 12:34:45.432353+02	\N	\N	\N	\N	\N
54755218-9105-400a-b9e2-728b71d768dd	SO-1780592120768-947	default-shop	98e48105-2797-48b0-bedf-341c9b00d3b9	delivered	paid	108000	21600	129600	2026-06-04	2026-06-04 20:06:12.957144+02	\N	{}	2026-06-04 18:55:20.767832+02	\N	2026-06-04 20:06:12.957144+02	\N	\N	\N	\N	\N
971c952c-2455-4b6e-b21c-efb06418670b	SO-1780675135648-671	default-shop	98e48105-2797-48b0-bedf-341c9b00d3b9	delivered	paid	95000	19000	114000	2026-06-05	2026-06-05 18:02:12.660133+02	\N	{}	2026-06-05 17:58:55.64843+02	\N	2026-06-05 18:02:12.660133+02	\N	\N	\N	\N	\N
3422b209-39c5-46a8-8539-bad89d713aec	SO-1780608116209-145	default-shop	63330f0b-bd4b-4e31-a2f3-dbfde6928cf1	pending	unpaid	126500	25300	151800	2026-06-04	\N	\N	{}	2026-06-04 23:21:56.210737+02	\N	2026-06-04 23:22:21.256997+02	\N	\N	\N	\N	\N
50a8c803-f39f-424d-a70d-f8a303f90632	SO-1780649982929-378	default-shop	98e48105-2797-48b0-bedf-341c9b00d3b9	pending	unpaid	103000	20600	123600	2026-06-05	\N	\N	{}	2026-06-05 10:59:42.929943+02	\N	2026-06-05 10:59:53.616417+02	\N	\N	\N	\N	\N
\.


--
-- TOC entry 5980 (class 0 OID 115810)
-- Dependencies: 282
-- Data for Name: core_sales_order_item; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.core_sales_order_item (id, sales_order_id, line_type, description, quantity, unit_price_cents, tax_rate, tax_amount_cents, total_cents, product_id, optical_job_id, metadata, created_at) FROM stdin;
da25b2c3-6a4d-4c6d-aad9-42d0af22ce10	3422b209-39c5-46a8-8539-bad89d713aec	optical_job	progressive | 1.6 | organic	1	72500	20.00	14500	72500	\N	\N	{"eye": "OD", "left_eye": {"tint": {"color": "gray", "gradient": true, "intensity": 50}, "type": "progressive", "index": "1.67", "price": 540, "coatings": ["AR", "BLUE", "SCRATCH", "FOG"], "material": "organic", "base_price": 440, "prescription": {"axis": null, "prism": 1.5, "sphere": 0.75, "addition": null, "cylinder": 0, "prism_base": "down"}, "coatings_price": 100, "coatings_detail": [{"code": "AR", "name": "Antireflet", "price": 40}, {"code": "BLUE", "name": "Anti-lumiere bleue", "price": 20}, {"code": "SCRATCH", "name": "Anti-rayure", "price": 15}, {"code": "FOG", "name": "Anti-buee", "price": 25}]}, "mounting": {"frame_wrap": 3, "mounting_height": 2, "vertex_distance": 12, "pantoscopic_angle": 5, "pupillary_distance": 17}, "right_eye": {"tint": {"color": "gray", "gradient": true, "intensity": 50}, "type": "progressive", "index": "1.6", "price": 725, "coatings": ["AR", "BLUE", "FOG", "SCRATCH"], "material": "organic", "base_price": 625, "prescription": {"axis": null, "prism": 0.5, "sphere": 1.5, "addition": null, "cylinder": 0, "prism_base": "up"}, "coatings_price": 100, "coatings_detail": [{"code": "AR", "name": "Antireflet", "price": 40}, {"code": "BLUE", "name": "Anti-lumiere bleue", "price": 20}, {"code": "FOG", "name": "Anti-buee", "price": 25}, {"code": "SCRATCH", "name": "Anti-rayure", "price": 15}]}}	2026-06-04 23:21:56.210737+02
5a716f30-0acb-49e0-92bc-b68bd346d016	54755218-9105-400a-b9e2-728b71d768dd	optical_job	progressive | 1.67 | organic	1	54000	20.00	10800	54000	\N	\N	{"eye": "OD", "mounting": {"frame_wrap": 1, "mounting_height": 1, "vertex_distance": 12, "pantoscopic_angle": 2, "pupillary_distance": 1}, "right_eye": {"tint": {"color": "gray", "gradient": true, "intensity": 50}, "type": "progressive", "index": "1.67", "coatings": ["AR", "BLUE", "FOG", "SCRATCH"], "material": "organic", "description": "progressive | 1.67 | organic"}, "lens_config": {"tint": {"color": "gray", "gradient": true, "intensity": 50}, "type": "progressive", "index": "1.67", "coatings": ["AR", "BLUE", "FOG", "SCRATCH"], "material": "organic"}, "prescription": {"axis": 2, "prism": 1, "sphere": -0.75, "addition": 0.5, "cylinder": -0.5, "prism_base": "up"}, "purchase_price_cents": 0}	2026-06-04 18:55:20.767832+02
0f46d422-a39b-45a9-aefa-43a66636fd9e	54755218-9105-400a-b9e2-728b71d768dd	optical_job	progressive | 1.67 | organic	1	54000	20.00	10800	54000	\N	\N	{"eye": "OG", "left_eye": {"tint": {"color": "gray", "gradient": true, "intensity": 50}, "type": "progressive", "index": "1.67", "coatings": ["AR", "FOG", "SCRATCH", "BLUE"], "material": "organic", "description": "progressive | 1.67 | organic"}, "mounting": {"frame_wrap": 1, "mounting_height": 1, "vertex_distance": 12, "pantoscopic_angle": 2, "pupillary_distance": 1}, "lens_config": {"tint": {"color": "gray", "gradient": true, "intensity": 50}, "type": "progressive", "index": "1.67", "coatings": ["AR", "FOG", "SCRATCH", "BLUE"], "material": "organic"}, "prescription": {"axis": 2, "prism": 2.5, "sphere": -0.25, "addition": 0.5, "cylinder": -0.25, "prism_base": "down"}, "purchase_price_cents": 0}	2026-06-04 18:55:20.767832+02
d8c62afa-d00f-4794-a9a4-7a59edeee42d	3422b209-39c5-46a8-8539-bad89d713aec	optical_job	progressive | 1.67 | organic	1	54000	20.00	10800	54000	\N	\N	{"eye": "OG", "left_eye": {"tint": {"color": "gray", "gradient": true, "intensity": 50}, "type": "progressive", "index": "1.67", "price": 540, "coatings": ["AR", "BLUE", "SCRATCH", "FOG"], "material": "organic", "base_price": 440, "prescription": {"axis": null, "prism": 1.5, "sphere": 0.75, "addition": null, "cylinder": 0, "prism_base": "down"}, "coatings_price": 100, "coatings_detail": [{"code": "AR", "name": "Antireflet", "price": 40}, {"code": "BLUE", "name": "Anti-lumiere bleue", "price": 20}, {"code": "SCRATCH", "name": "Anti-rayure", "price": 15}, {"code": "FOG", "name": "Anti-buee", "price": 25}]}, "mounting": {"frame_wrap": 3, "mounting_height": 2, "vertex_distance": 12, "pantoscopic_angle": 5, "pupillary_distance": 17}, "right_eye": {"tint": {"color": "gray", "gradient": true, "intensity": 50}, "type": "progressive", "index": "1.6", "price": 725, "coatings": ["AR", "BLUE", "FOG", "SCRATCH"], "material": "organic", "base_price": 625, "prescription": {"axis": null, "prism": 0.5, "sphere": 1.5, "addition": null, "cylinder": 0, "prism_base": "up"}, "coatings_price": 100, "coatings_detail": [{"code": "AR", "name": "Antireflet", "price": 40}, {"code": "BLUE", "name": "Anti-lumiere bleue", "price": 20}, {"code": "FOG", "name": "Anti-buee", "price": 25}, {"code": "SCRATCH", "name": "Anti-rayure", "price": 15}]}}	2026-06-04 23:21:56.210737+02
4ff02933-9e34-4904-aca6-c10a674068b3	50a8c803-f39f-424d-a70d-f8a303f90632	optical_job	progressive | 1.67 | organic	1	51500	20.00	10300	51500	\N	\N	{"eye": "OD", "left_eye": null, "mounting": {"frame_wrap": 0, "mounting_height": 0, "vertex_distance": 12, "pantoscopic_angle": 0, "pupillary_distance": 51.5}, "right_eye": {"tint": {"color": "gray", "gradient": true, "intensity": 50}, "type": "progressive", "index": "1.67", "coatings": ["AR", "BLUE", "SCRATCH", "FOG"], "material": "organic", "description": "progressive | 1.67 | organic", "prescription": {"axis": 2, "prism": 0.5, "sphere": 0.75, "addition": 0.5, "cylinder": -0.5, "prism_base": "up"}}}	2026-06-05 10:59:42.929943+02
793ea4fa-17b8-42a8-85ea-20cfb9350e37	50a8c803-f39f-424d-a70d-f8a303f90632	optical_job	progressive | 1.67 | organic	1	51500	20.00	10300	51500	\N	\N	{"eye": "OG", "left_eye": {"tint": {"color": "gray", "gradient": true, "intensity": 50}, "type": "progressive", "index": "1.67", "coatings": ["AR", "BLUE", "SCRATCH", "FOG"], "material": "organic", "description": "progressive | 1.67 | organic", "prescription": {"axis": 2, "prism": null, "sphere": 0.5, "addition": 0.5, "cylinder": -0.25, "prism_base": null}}, "mounting": {"frame_wrap": 0, "mounting_height": 0, "vertex_distance": 12, "pantoscopic_angle": 0, "pupillary_distance": 51.5}, "right_eye": null}	2026-06-05 10:59:42.929943+02
78ee306e-a5a0-454b-b0be-f67aede71044	dfba3714-2276-491f-9b57-2d9bfc1dc9d0	optical_job	progressive | 1.67 | organic	1	51500	20.00	10300	51500	\N	\N	{"eye": "OD", "left_eye": null, "mounting": {"frame_wrap": 1, "mounting_height": 0.5, "vertex_distance": 12, "pantoscopic_angle": -1, "pupillary_distance": 51.5}, "right_eye": {"tint": {"color": "gray", "gradient": true, "intensity": 50}, "type": "progressive", "index": "1.67", "coatings": ["AR", "BLUE", "FOG", "SCRATCH"], "material": "organic", "description": "progressive | 1.67 | organic", "prescription": {"axis": 2, "prism": 0.5, "sphere": 0.75, "addition": 0.5, "cylinder": -0.5, "prism_base": "up"}}}	2026-06-05 11:19:42.812611+02
056b039e-34fa-4a51-8373-29ff0556d611	dfba3714-2276-491f-9b57-2d9bfc1dc9d0	optical_job	progressive | 1.67 | organic	1	51500	20.00	10300	51500	\N	\N	{"eye": "OG", "left_eye": {"tint": {"color": "gray", "gradient": true, "intensity": 50}, "type": "progressive", "index": "1.67", "coatings": ["AR", "BLUE", "FOG", "SCRATCH"], "material": "organic", "description": "progressive | 1.67 | organic", "prescription": {"axis": 2, "prism": null, "sphere": 0.5, "addition": 0.5, "cylinder": -0.25, "prism_base": null}}, "mounting": {"frame_wrap": 1, "mounting_height": 0.5, "vertex_distance": 12, "pantoscopic_angle": -1, "pupillary_distance": 51.5}, "right_eye": null}	2026-06-05 11:19:42.812611+02
7011e47d-9118-4e31-9e80-f88130a2c9ec	15d647d7-c44e-4aef-824b-640a958d9bfb	optical_job	progressive | 1.67 | organic	1	47500	20.00	9500	47500	\N	\N	{"eye": "OD", "left_eye": null, "mounting": {"frame_wrap": 0, "mounting_height": 0, "vertex_distance": 12, "pantoscopic_angle": 0, "pupillary_distance": 51.5}, "right_eye": {"tint": {"color": "gray", "gradient": true, "intensity": 50}, "type": "progressive", "index": "1.67", "coatings": ["AR", "BLUE"], "material": "organic", "description": "progressive | 1.67 | organic", "prescription": {"axis": 2, "prism": 0.5, "sphere": 0.75, "addition": 0.5, "cylinder": -0.5, "prism_base": "up"}}}	2026-06-05 11:27:46.554205+02
7f7f20bd-e614-40db-af21-6e9ce9c3e2ca	15d647d7-c44e-4aef-824b-640a958d9bfb	optical_job	progressive | 1.67 | organic	1	47500	20.00	9500	47500	\N	\N	{"eye": "OG", "left_eye": {"tint": {"color": "gray", "gradient": true, "intensity": 50}, "type": "progressive", "index": "1.67", "coatings": ["AR", "BLUE"], "material": "organic", "description": "progressive | 1.67 | organic", "prescription": {"axis": 2, "prism": 1.5, "sphere": 0.5, "addition": 0.5, "cylinder": -0.25, "prism_base": "down"}}, "mounting": {"frame_wrap": 0, "mounting_height": 0, "vertex_distance": 12, "pantoscopic_angle": 0, "pupillary_distance": 51.5}, "right_eye": null}	2026-06-05 11:27:46.554205+02
2eb631e1-336c-4099-b8cd-7a4bba2e7f18	dd77994b-5934-48f2-b784-41373035fa29	optical_job	progressive | 1.67 | organic	1	47500	20.00	9500	47500	\N	\N	{"eye": "OD", "left_eye": null, "mounting": {"frame_wrap": 0, "mounting_height": 0, "vertex_distance": 12, "pantoscopic_angle": 0, "pupillary_distance": 51.5}, "right_eye": {"tint": {"color": "gray", "gradient": false, "intensity": 50}, "type": "progressive", "index": "1.67", "coatings": ["AR", "BLUE"], "material": "organic", "description": "progressive | 1.67 | organic", "prescription": {"axis": 2, "prism": 0.5, "sphere": 0.75, "addition": 0.5, "cylinder": -0.5, "prism_base": "up"}}}	2026-06-05 11:33:23.312438+02
33f7382f-7ad2-491c-845d-494544795226	dd77994b-5934-48f2-b784-41373035fa29	optical_job	progressive | 1.67 | organic	1	47500	20.00	9500	47500	\N	\N	{"eye": "OG", "left_eye": {"tint": {"color": "gray", "gradient": false, "intensity": 50}, "type": "progressive", "index": "1.67", "coatings": ["AR", "BLUE"], "material": "organic", "description": "progressive | 1.67 | organic", "prescription": {"axis": 2, "prism": null, "sphere": 0.5, "addition": 0.5, "cylinder": -0.25, "prism_base": null}}, "mounting": {"frame_wrap": 0, "mounting_height": 0, "vertex_distance": 12, "pantoscopic_angle": 0, "pupillary_distance": 51.5}, "right_eye": null}	2026-06-05 11:33:23.312438+02
735ed71b-ca33-4b0b-bba9-e9d2b5d7b51f	e9409acb-968e-4416-b461-3cf715dca47f	optical_job	progressive | 1.67 | organic	1	45500	20.00	9100	45500	\N	\N	{"eye": "OD", "left_eye": null, "mounting": {"frame_wrap": 0, "mounting_height": 0, "vertex_distance": 12, "pantoscopic_angle": 0, "pupillary_distance": 51.5}, "right_eye": {"tint": {"color": "none", "gradient": false, "intensity": 0}, "type": "progressive", "index": "1.67", "coatings": ["AR"], "material": "organic", "description": "progressive | 1.67 | organic", "prescription": {"axis": 2, "prism": null, "sphere": 0.75, "addition": 0.5, "cylinder": -0.5, "prism_base": null}}}	2026-06-05 12:16:29.478739+02
eb97875e-e05b-42a0-ab25-f908d46da32b	e9409acb-968e-4416-b461-3cf715dca47f	optical_job	progressive | 1.67 | organic	1	45500	20.00	9100	45500	\N	\N	{"eye": "OG", "left_eye": {"tint": {"color": "none", "gradient": false, "intensity": 0}, "type": "progressive", "index": "1.67", "coatings": ["AR"], "material": "organic", "description": "progressive | 1.67 | organic", "prescription": {"axis": 2, "prism": null, "sphere": 0.5, "addition": 0.5, "cylinder": -0.25, "prism_base": null}}, "mounting": {"frame_wrap": 0, "mounting_height": 0, "vertex_distance": 12, "pantoscopic_angle": 0, "pupillary_distance": 51.5}, "right_eye": null}	2026-06-05 12:16:29.478739+02
9ecfd287-a0f0-46df-9baa-94e2f56ac96d	68bf9857-4444-49eb-854a-82aa70f83442	optical_job	progressive | 1.67 | organic	1	51500	20.00	10300	51500	\N	\N	{"eye": "OD", "left_eye": null, "mounting": {"frame_wrap": 0, "mounting_height": 0, "vertex_distance": 12, "pantoscopic_angle": 0, "pupillary_distance": 51.5}, "right_eye": {"tint": {"color": "gray", "gradient": false, "intensity": 50}, "type": "progressive", "index": "1.67", "coatings": ["AR", "BLUE", "FOG", "SCRATCH"], "material": "organic", "description": "progressive | 1.67 | organic", "prescription": {"axis": 2, "prism": 0.5, "sphere": 0.75, "addition": 0.5, "cylinder": -0.5, "prism_base": "down"}}}	2026-06-05 12:32:54.357986+02
06354350-2cc4-4354-ba0e-59a4616620cd	68bf9857-4444-49eb-854a-82aa70f83442	optical_job	progressive | 1.67 | organic	1	51500	20.00	10300	51500	\N	\N	{"eye": "OG", "left_eye": {"tint": {"color": "gray", "gradient": false, "intensity": 50}, "type": "progressive", "index": "1.67", "coatings": ["AR", "BLUE", "FOG", "SCRATCH"], "material": "organic", "description": "progressive | 1.67 | organic", "prescription": {"axis": 2, "prism": 1.5, "sphere": 0.5, "addition": 0.5, "cylinder": -0.25, "prism_base": "in"}}, "mounting": {"frame_wrap": 0, "mounting_height": 0, "vertex_distance": 12, "pantoscopic_angle": 0, "pupillary_distance": 51.5}, "right_eye": null}	2026-06-05 12:32:54.357986+02
2022a476-2de1-47a6-9ada-6ae1cf93c306	971c952c-2455-4b6e-b21c-efb06418670b	optical_job	progressive | 1.67 | organic	1	47500	20.00	9500	47500	\N	\N	{"eye": "OD", "left_eye": null, "mounting": {"frame_wrap": 0, "mounting_height": 0, "vertex_distance": 12, "pantoscopic_angle": 0, "pupillary_distance": 51.5}, "right_eye": {"tint": {"color": "none", "gradient": false, "intensity": 0}, "type": "progressive", "index": "1.67", "coatings": ["AR", "BLUE"], "material": "organic", "description": "progressive | 1.67 | organic", "prescription": {"axis": 2, "prism": null, "sphere": 0.75, "addition": 0.5, "cylinder": -0.5, "prism_base": null}}}	2026-06-05 17:58:55.64843+02
590f438c-8542-4103-a977-fb35bbcf2a3f	971c952c-2455-4b6e-b21c-efb06418670b	optical_job	progressive | 1.67 | organic	1	47500	20.00	9500	47500	\N	\N	{"eye": "OG", "left_eye": {"tint": {"color": "none", "gradient": false, "intensity": 0}, "type": "progressive", "index": "1.67", "coatings": ["AR", "BLUE"], "material": "organic", "description": "progressive | 1.67 | organic", "prescription": {"axis": 2, "prism": null, "sphere": 0.5, "addition": 0.5, "cylinder": -0.25, "prism_base": null}}, "mounting": {"frame_wrap": 0, "mounting_height": 0, "vertex_distance": 12, "pantoscopic_angle": 0, "pupillary_distance": 51.5}, "right_eye": null}	2026-06-05 17:58:55.64843+02
\.


--
-- TOC entry 5982 (class 0 OID 115881)
-- Dependencies: 285
-- Data for Name: core_supplier_order_lifecycle; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.core_supplier_order_lifecycle (id, supplier_order_id, status, previous_status, notes, created_by, created_at) FROM stdin;
\.


--
-- TOC entry 5955 (class 0 OID 114631)
-- Dependencies: 255
-- Data for Name: document_sequences; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.document_sequences (id, tenant_id, document_type, prefix, current_number, year, created_at, updated_at) FROM stdin;
3	default-shop	delivery_note	BL	1	2026	2026-05-23 18:43:49.273379	2026-05-23 18:43:49.273379
1	default-shop	invoice	FACT	4	2026	2026-05-23 18:43:49.273379	2026-06-05 18:02:12.660133
2	default-shop	credit_note	AV	0	2026	2026-05-23 18:43:49.273379	2026-06-02 17:34:58.211492
4	default-shop	quote	DEV	0	2026	2026-05-23 18:43:49.273379	2026-06-02 17:34:58.211492
\.


--
-- TOC entry 5974 (class 0 OID 115340)
-- Dependencies: 274
-- Data for Name: immobilisations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.immobilisations (id, name, description, acquisition_date, acquisition_cost_cents, useful_life_years, residual_value_cents, method, status, tenant_id, created_at) FROM stdin;
\.


--
-- TOC entry 5976 (class 0 OID 115377)
-- Dependencies: 276
-- Data for Name: invoice_lines; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.invoice_lines (id, invoice_id, invoice_type, description, quantity, unit_price_cents, total_ht_cents, tax_rate, tax_amount_cents, total_ttc_cents, product_id, reference_type, reference_id, tenant_id, created_at, created_by) FROM stdin;
445e2955-f745-48b6-b785-65b528416744	f8d86d01-26a8-4703-a286-9415825580f1	sale	progressive | 1.67 | organic	1	29000	29000	20.00	5800	34800	\N	\N	\N	default-shop	2026-06-03 13:49:28.630626	\N
b93b556e-8c10-43d4-9e5d-2daa746af8ca	f8d86d01-26a8-4703-a286-9415825580f1	sale	progressive | 1.67 | organic	1	29000	29000	20.00	5800	34800	\N	\N	\N	default-shop	2026-06-03 13:49:28.630626	\N
a8183b64-c499-4a0a-bde7-228131542554	1058e8d2-3e5b-4bcc-a806-e2f0bb487dc9	sale	progressive | 1.67 | organic	1	35000	35000	20.00	7000	42000	\N	\N	\N	default-shop	2026-06-03 13:49:28.630626	\N
a8ab706f-2592-4f86-95b7-ebea10d0760b	1058e8d2-3e5b-4bcc-a806-e2f0bb487dc9	sale	progressive | 1.67 | organic	1	35000	35000	20.00	7000	42000	\N	\N	\N	default-shop	2026-06-03 13:49:28.630626	\N
\.


--
-- TOC entry 5977 (class 0 OID 115587)
-- Dependencies: 277
-- Data for Name: lens_orders; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.lens_orders (id, tenant_id, sales_order_id, client_id, prescription_id, right_eye_config, left_eye_config, supplier_id, cost_cents, selling_price_cents, status, ordered_at, received_at, created_at, updated_at) FROM stdin;
09c206f4-e27a-4965-84f6-c4046d4f179e	default-shop	f8773f74-d79e-4328-b955-a994591d7b72	92b04257-120b-4647-85bc-fde8d81ab9c7	\N	{"type": "progressive", "index": "1.67", "price": 290, "coatings": ["AR"], "material": "organic"}	{"type": "progressive", "index": "1.67", "price": 290, "coatings": ["AR"], "material": "organic"}	8703866b-3c3b-496f-a6d8-36b0a27b74a1	58000	35000	received	\N	2026-06-02 17:37:02.338986+02	2026-06-02 17:36:23.293601+02	2026-06-03 14:37:41.696233+02
455dbdab-d0aa-47be-af71-8f3dfddc98c5	default-shop	0e0037f4-2a99-41d5-99f3-931c64682764	63330f0b-bd4b-4e31-a2f3-dbfde6928cf1	\N	{"type": "progressive", "index": "1.67", "price": 350, "coatings": ["AR", "BLUE", "FOG", "SCRATCH"], "material": "organic"}	{"type": "progressive", "index": "1.67", "price": 350, "coatings": ["AR", "SCRATCH", "FOG", "BLUE"], "material": "organic"}	8703866b-3c3b-496f-a6d8-36b0a27b74a1	70000	30000	received	\N	2026-06-02 18:09:49.328131+02	2026-06-02 18:09:21.648144+02	2026-06-03 14:37:41.696233+02
\.


--
-- TOC entry 5930 (class 0 OID 113548)
-- Dependencies: 230
-- Data for Name: lens_pricing; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.lens_pricing (id, lens_type, index_type, material, purchase_price_cents, selling_price_cents, margin_percentage, updated_at) FROM stdin;
94a62499-783e-48be-8d5d-e561e8569182	unifocal	1.5	organic	2000	5000	\N	2026-05-17 17:14:43.366997
5ff1e42d-2f7e-49d3-9b9d-77954cea92fd	unifocal	1.6	organic	3000	7500	\N	2026-05-17 17:14:43.366997
c12ebded-688f-4a7e-817e-98d4df192aa0	unifocal	1.67	organic	4500	11250	\N	2026-05-17 17:14:43.366997
27a9ad4f-6977-4c57-acb9-0df30a5395d0	unifocal	1.74	organic	7000	17500	\N	2026-05-17 17:14:43.366997
0ca88b0d-8442-478f-91a6-82dbba1b23b6	progressive	1.6	organic	6000	15000	\N	2026-05-17 17:14:43.366997
e3f8c459-315a-46b2-b8ba-a21ea797a488	progressive	1.67	organic	8000	20000	\N	2026-05-17 17:14:43.366997
60218caf-aa01-4844-a20a-cac4380a08bc	progressive	1.74	organic	12000	30000	\N	2026-05-17 17:14:43.366997
6f15ef58-5f23-44a0-b1b9-47554a8ab726	bifocal	1.5	mineral	3500	8750	\N	2026-05-17 17:14:43.366997
1a4f1021-df19-4fef-a59a-f0e92e7b0817	bifocal	1.6	mineral	5000	12500	\N	2026-05-17 17:14:43.366997
fc90b24c-3464-4cb6-a61d-7b0c071a297b	occupational	1.6	polycarbonate	5500	13750	\N	2026-05-17 17:14:43.366997
\.


--
-- TOC entry 5927 (class 0 OID 113283)
-- Dependencies: 227
-- Data for Name: lens_types; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.lens_types (id, code, name, description, multiplier, available_indexes, available_materials) FROM stdin;
660def64-05d3-45ee-85c1-1e8654ff6d06	UNIFOCAL	Unifocal	Verre simple distance unique	1.00	{1.5,1.6,1.67,1.74}	{organic,mineral,polycarbonate}
cf0bd513-348c-4320-aab1-586f4424449d	PROGRESSIVE	Progressif	Verre progressif multifocal	2.50	{1.6,1.67,1.74}	{organic,polycarbonate,trivex}
4d2b43ac-86f9-46a3-8504-4795f16edaff	BIFOCAL	Bifocal	Verre bifocal deux distances	1.50	{1.5,1.6,1.67}	{organic,mineral}
d93ed518-9cae-47de-8ba6-34ab45a91f0f	OCCUPATIONAL	Occupational	Verre travail / écran	1.80	{1.6,1.67,1.74}	{organic,polycarbonate}
\.


--
-- TOC entry 5990 (class 0 OID 115963)
-- Dependencies: 294
-- Data for Name: migration_log; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.migration_log (id, migration_date, version, description, executed_by, status) FROM stdin;
1	2026-06-03 17:21:32.061204+02	V7.0	Migration vers le nouveau core ERP - Suppression des doublons	Administrateur	SUCCESS
2	2026-06-03 17:21:32.061204+02	V7.0	Création de core_sales_order et core_optical_job	Administrateur	SUCCESS
3	2026-06-03 17:21:32.061204+02	V7.0	Activation double écriture et triggers	Administrateur	SUCCESS
4	2026-06-03 17:21:32.061204+02	V7.0	Archivage des anciennes tables	Administrateur	SUCCESS
\.


--
-- TOC entry 5972 (class 0 OID 114813)
-- Dependencies: 272
-- Data for Name: payment_reminders; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.payment_reminders (id, entity_type, entity_id, invoice_id, invoice_number, due_date, amount_due_cents, reminder_level, reminder_sent_at, status, tenant_id, created_at) FROM stdin;
\.


--
-- TOC entry 5935 (class 0 OID 113706)
-- Dependencies: 235
-- Data for Name: payments_backup; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.payments_backup (id, tenant_id, invoice_id, amount_cents, payment_method, payment_date, reference, created_at, bank_account, created_by) FROM stdin;
8838ef1d-b39e-45c6-bf81-4858355bbfb3	default-shop	1978c1fb-9d71-444f-b25d-06f36016bfbc	99600	cash	2026-06-03 19:44:21.95979	\N	2026-06-03 19:44:21.95979	\N	\N
39becf7a-02e0-4c3c-b46f-748719497357	default-shop	73da5b9a-f164-4117-8215-a6fe9e037bc0	109200	cash	2026-06-03 19:55:43.324594	\N	2026-06-03 19:55:43.324594	\N	\N
55cec1e3-1c62-4af5-9b2d-70997079a6e5	default-shop	d137bb1f-144a-4aa7-af54-5cb9316a92de	109200	cash	2026-06-03 20:05:57.594126	\N	2026-06-03 20:05:57.594126	\N	\N
\.


--
-- TOC entry 5959 (class 0 OID 114680)
-- Dependencies: 259
-- Data for Name: permissions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.permissions (id, resource, action, description, created_at) FROM stdin;
1	clients	read	Voir la liste des clients	2026-06-01 18:15:08.584189
2	clients	write	Créer et modifier des clients	2026-06-01 18:15:08.584189
3	clients	delete	Supprimer des clients	2026-06-01 18:15:08.584189
4	products	read	Voir les produits	2026-06-01 18:15:08.584189
5	products	write	Créer et modifier des produits	2026-06-01 18:15:08.584189
6	products	delete	Supprimer des produits	2026-06-01 18:15:08.584189
7	prescriptions	read	Voir les ordonnances	2026-06-01 18:15:08.584189
8	prescriptions	write	Créer et modifier des ordonnances	2026-06-01 18:15:08.584189
9	prescriptions	delete	Supprimer des ordonnances	2026-06-01 18:15:08.584189
10	orders	read	Voir les commandes	2026-06-01 18:15:08.584189
11	orders	write	Créer des commandes	2026-06-01 18:15:08.584189
12	orders	confirm	Confirmer les commandes	2026-06-01 18:15:08.584189
13	orders	delete	Supprimer des commandes	2026-06-01 18:15:08.584189
14	suppliers	read	Voir les fournisseurs	2026-06-01 18:15:08.584189
15	suppliers	write	Créer et modifier des fournisseurs	2026-06-01 18:15:08.584189
16	pricing	read	Voir la grille des prix	2026-06-01 18:15:08.584189
17	pricing	write	Modifier la grille des prix	2026-06-01 18:15:08.584189
18	stock	read	Voir le stock	2026-06-01 18:15:08.584189
19	stock	write	Ajuster le stock	2026-06-01 18:15:08.584189
20	sales	read	Voir les ventes	2026-06-01 18:15:08.584189
21	sales	write	Effectuer des ventes	2026-06-01 18:15:08.584189
22	stats	read	Voir les statistiques	2026-06-01 18:15:08.584189
23	settings	read	Voir les paramètres	2026-06-01 18:15:08.584189
24	settings	write	Modifier les paramètres	2026-06-01 18:15:08.584189
25	documents	read	Générer des documents PDF	2026-06-01 18:15:08.584189
26	documents	write	Créer des documents	2026-06-01 18:15:08.584189
27	accounting	read	Accès à la comptabilité	2026-06-01 18:57:34.736086
28	accounting	write	Gestion comptable (déclarations TVA, écritures)	2026-06-01 18:57:34.736086
\.


--
-- TOC entry 5973 (class 0 OID 115327)
-- Dependencies: 273
-- Data for Name: plan_comptable; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.plan_comptable (id, account_number, account_name, class, type, parent_id, is_active, tenant_id, created_at) FROM stdin;
bc247008-fe70-46d7-9c22-eaf28e684f9f	1111	Capital social	1	PASSIF	\N	t	default-shop	2026-06-03 12:58:46.203781
3a699a21-5df6-4e5a-8713-7ac9d333647a	1140	Compte courant associé	1	PASSIF	\N	t	default-shop	2026-06-03 12:58:46.203781
af2d66b1-cd94-48a3-a878-62767790180f	1190	Résultat net	1	PASSIF	\N	t	default-shop	2026-06-03 12:58:46.203781
7a8335a5-db74-4315-b00d-3d3e02f756b0	2340	Matériel et outillage	2	ACTIF	\N	t	default-shop	2026-06-03 12:58:46.203781
87df7b34-ae7b-4ccc-8a31-e925f9f56166	2350	Matériel de bureau	2	ACTIF	\N	t	default-shop	2026-06-03 12:58:46.203781
1f6cad38-f4ad-45da-80da-6534c1e14ee1	2351	Matériel informatique	2	ACTIF	\N	t	default-shop	2026-06-03 12:58:46.203781
92baabc1-5b16-4fd1-9f01-1ac43f7f3bf2	3111	Marchandises (montures)	3	ACTIF	\N	t	default-shop	2026-06-03 12:58:46.203781
339b862a-ed64-474c-8897-d02c2f515916	3112	Marchandises (verres)	3	ACTIF	\N	t	default-shop	2026-06-03 12:58:46.203781
55e0340d-cfc4-4cd9-bf96-5029577199f7	3113	Marchandises (accessoires)	3	ACTIF	\N	t	default-shop	2026-06-03 12:58:46.203781
704cd1a0-4873-4f1b-a52c-dd9b18c1cdb6	4110	Clients	4	ACTIF	\N	t	default-shop	2026-06-03 12:58:46.203781
1a364e73-66c5-485f-809d-2e1bdbf37681	4111	Clients factures à établir	4	ACTIF	\N	t	default-shop	2026-06-03 12:58:46.203781
dffb17fe-61b9-4955-8333-cbb8ee5dd766	4455	État TVA due	4	PASSIF	\N	t	default-shop	2026-06-03 12:58:46.203781
c11c0523-8058-4f62-81f0-5b7514fa730b	4456	État TVA déductible	4	ACTIF	\N	t	default-shop	2026-06-03 12:58:46.203781
0423dfc3-06e1-4073-ac25-c0b91a215154	4457	État TVA récupérable	4	ACTIF	\N	t	default-shop	2026-06-03 12:58:46.203781
993c2684-cd7a-4551-b60b-f219907ec78b	4432	CNSS	4	PASSIF	\N	t	default-shop	2026-06-03 12:58:46.203781
95cd4162-b335-47d2-9e7c-d0ff983a6d0d	4441	IGSS	4	PASSIF	\N	t	default-shop	2026-06-03 12:58:46.203781
075bc72f-8ff5-497c-a22e-1793efd49af3	4449	IR	4	PASSIF	\N	t	default-shop	2026-06-03 12:58:46.203781
9a7c28bf-82d8-4be6-a37e-7e0268e882f8	5140	Banque	5	ACTIF	\N	t	default-shop	2026-06-03 12:58:46.203781
284bd3bf-fbf8-4bb4-a95e-6ca165d02770	5160	Caisse	5	ACTIF	\N	t	default-shop	2026-06-03 12:58:46.203781
6d8106be-abce-4fa0-a72d-5848cf9fdee5	6110	Achats montures	6	CHARGE	\N	t	default-shop	2026-06-03 12:58:46.203781
10f56afa-1b3e-4b84-acb1-c9d2e7758dd9	6111	Achats verres	6	CHARGE	\N	t	default-shop	2026-06-03 12:58:46.203781
1883e34a-9a13-4a38-a66f-988b2359c878	6112	Achats accessoires	6	CHARGE	\N	t	default-shop	2026-06-03 12:58:46.203781
661b0087-5252-4309-a8b0-0754580d2f8d	6132	Loyer	6	CHARGE	\N	t	default-shop	2026-06-03 12:58:46.203781
3a0f6e61-9898-4269-a585-58375e11517a	6140	Charges de personnel	6	CHARGE	\N	t	default-shop	2026-06-03 12:58:46.203781
5e08378c-6483-4316-a9d1-5b443a60e961	6141	CNSS patronale	6	CHARGE	\N	t	default-shop	2026-06-03 12:58:46.203781
d2a5dd0a-158e-4966-9294-3b87f0660d88	6311	Impôts et taxes	6	CHARGE	\N	t	default-shop	2026-06-03 12:58:46.203781
e2116dce-b48b-4594-888e-02d8a719fca0	6371	Honoraires	6	CHARGE	\N	t	default-shop	2026-06-03 12:58:46.203781
88fd1fcd-233c-41b2-b5ef-f8a91308cc16	7011	Ventes montures	7	PRODUIT	\N	t	default-shop	2026-06-03 12:58:46.203781
a4b77e48-3617-4521-9a81-64bb9ddf5224	7012	Ventes verres	7	PRODUIT	\N	t	default-shop	2026-06-03 12:58:46.203781
60e6d54c-8da2-4aa9-86e9-bc8145ce1c28	7013	Ventes accessoires	7	PRODUIT	\N	t	default-shop	2026-06-03 12:58:46.203781
d47f6f18-73a0-4182-aabf-0fc7ba25cdd1	7080	Autres produits	7	PRODUIT	\N	t	default-shop	2026-06-03 12:58:46.203781
\.


--
-- TOC entry 5933 (class 0 OID 113632)
-- Dependencies: 233
-- Data for Name: prescriptions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.prescriptions (id, tenant_id, client_id, doctor_name, doctor_phone, date_of_issue, expiry_date, od_sphere, od_cylinder, od_axis, od_addition, og_sphere, og_cylinder, og_axis, og_addition, pupillary_distance, notes, created_at, updated_at, technical_notes, mounting_notes, frame_recommendations, right_prism, right_prism_base, left_prism, left_prism_base, prescription_number, is_valid) FROM stdin;
8d10236b-06b5-4e36-a0cc-df5af78d425a	default-shop	92b04257-120b-4647-85bc-fde8d81ab9c7	Kifah	\N	2026-05-18	2027-06-18	0.50	\N	\N	\N	1.00	\N	\N	\N	\N	\N	2026-05-18 20:21:28.887098	2026-05-18 20:21:28.887098	\N	\N	{}	\N	\N	\N	\N	\N	t
334fe52a-623f-4339-8e76-192991f09d17	default-shop	63330f0b-bd4b-4e31-a2f3-dbfde6928cf1	Kifah	\N	2026-05-21	2027-11-16	1.50	\N	\N	\N	0.75	\N	\N	\N	17.00	\N	2026-05-21 16:25:14.950772	2026-05-21 16:25:14.950772	\N	\N	{}	\N	\N	\N	\N	\N	t
a572a14d-e9f4-4859-bc8d-a9e0e9b11768	default-shop	98e48105-2797-48b0-bedf-341c9b00d3b9	Kifah	\N	2026-06-05	2027-06-05	0.75	-0.50	2	0.50	0.50	-0.25	2	0.50	51.50	\N	2026-06-05 00:35:38.740032	2026-06-05 00:35:38.740032	\N	\N	{}	\N	\N	\N	\N	\N	t
\.


--
-- TOC entry 5936 (class 0 OID 113735)
-- Dependencies: 236
-- Data for Name: price_grid; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.price_grid (id, tenant_id, lens_type, index_type, material, base_price_cents, selling_price_cents, created_at, updated_at) FROM stdin;
f09ffbd9-a956-4407-b3e9-af1914f6f575	default-shop	progressive	1.74	organic	12000.00	30000.00	2026-05-18 13:08:07.520795	2026-05-18 13:08:07.520795
e30b227f-884d-42a3-9c4c-aa573a26426e	default-shop	unifocal	1.67	organic	0.00	20000.00	2026-05-18 13:08:07.520795	2026-05-20 12:41:24.449608
2457900c-88cd-4bfd-b953-697f3e64a711	default-shop	unifocal	1.6	organic	0.00	25000.00	2026-05-18 13:08:07.520795	2026-05-20 12:41:35.333409
b9828a44-3543-4f1a-bdaf-609523101deb	default-shop	progressive	1.6	organic	0.00	60000.00	2026-05-18 13:08:07.520795	2026-05-20 12:41:43.352551
5d41fc08-c185-4062-92c8-9714eca835fe	default-shop	unifocal	1.5	organic	0.00	70000.00	2026-05-18 13:08:07.520795	2026-05-20 12:41:53.790891
a108fc59-40f3-470b-a6ea-685f2f9b9ccd	default-shop	progressive	1.67	organic	0.00	41500.00	2026-05-18 13:08:07.520795	2026-06-03 19:38:57.575546
\.


--
-- TOC entry 5941 (class 0 OID 114260)
-- Dependencies: 241
-- Data for Name: product_images; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.product_images (id, tenant_id, product_id, image_url, alt_text, display_order, is_primary, created_at, updated_at) FROM stdin;
82b3e0de-0d72-454a-9e98-dfc6e56065a3	default-shop	158debf0-61d9-4c7b-83db-ff5fb775a3ad	/images/rb2140-1.jpg	\N	1	t	2026-05-21 10:03:18.796026	2026-05-21 10:03:18.796026
d0424dfc-dfd8-4559-a053-3a2e42d3d0e0	default-shop	158debf0-61d9-4c7b-83db-ff5fb775a3ad	/images/rb2140-2.jpg	\N	2	f	2026-05-21 10:03:18.796026	2026-05-21 10:03:18.796026
\.


--
-- TOC entry 5944 (class 0 OID 114326)
-- Dependencies: 244
-- Data for Name: product_price_history; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.product_price_history (id, tenant_id, product_id, variant_id, old_price_cents, new_price_cents, changed_by, reason, changed_at) FROM stdin;
208929fa-9d08-47f2-934d-39f806ef7691	default-shop	0b371d2a-58af-45df-9bb5-c6406439eb49	\N	2500	2600	\N	\N	2026-06-05 14:06:00.546824
252e3811-bcd6-4997-a944-d044f471407c	default-shop	158debf0-61d9-4c7b-83db-ff5fb775a3ad	\N	12500	12700	\N	\N	2026-06-05 14:36:19.842678
\.


--
-- TOC entry 5943 (class 0 OID 114305)
-- Dependencies: 243
-- Data for Name: product_related; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.product_related (id, tenant_id, product_id, related_product_id, relation_type, created_at) FROM stdin;
6b62a569-7646-48f2-aa58-056344484c6e	default-shop	158debf0-61d9-4c7b-83db-ff5fb775a3ad	0b371d2a-58af-45df-9bb5-c6406439eb49	accessory	2026-05-21 10:03:18.796026
78aefeea-9d7c-48c0-a5c0-183276fb2efe	default-shop	158debf0-61d9-4c7b-83db-ff5fb775a3ad	e457ec9f-8079-4d9a-ad97-c76df4e00f2a	accessory	2026-05-21 10:03:18.796026
\.


--
-- TOC entry 5945 (class 0 OID 114346)
-- Dependencies: 245
-- Data for Name: product_tags; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.product_tags (id, tenant_id, product_id, tag, created_at) FROM stdin;
7155784b-7c74-46c4-bd0d-99a730e68992	default-shop	158debf0-61d9-4c7b-83db-ff5fb775a3ad	luxe	2026-05-21 10:03:18.796026
e8b29ace-8fbc-4764-8f6d-ef4b53d6a6ee	default-shop	158debf0-61d9-4c7b-83db-ff5fb775a3ad	classique	2026-05-21 10:03:18.796026
da23fc3c-4daf-401c-a927-ba256663346f	default-shop	158debf0-61d9-4c7b-83db-ff5fb775a3ad	best-seller	2026-05-21 10:03:18.796026
\.


--
-- TOC entry 5942 (class 0 OID 114281)
-- Dependencies: 242
-- Data for Name: product_variants; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.product_variants (id, tenant_id, product_id, sku, barcode, color, size, purchase_price_cents, selling_price_cents, attributes, created_at, updated_at) FROM stdin;
5e4b5a39-a560-4cc8-a88c-b6985a349191	default-shop	158debf0-61d9-4c7b-83db-ff5fb775a3ad	RB2140-NOIR	\N	noir	\N	\N	12500	{}	2026-05-21 10:03:18.796026	2026-05-21 10:03:18.796026
521a35a3-5c63-4bd5-9105-91bf30223be9	default-shop	158debf0-61d9-4c7b-83db-ff5fb775a3ad	RB2140-TORTUE	\N	tortoise	\N	\N	12500	{}	2026-05-21 10:03:18.796026	2026-05-21 10:03:18.796026
\.


--
-- TOC entry 5924 (class 0 OID 113191)
-- Dependencies: 224
-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.products (id, tenant_id, reference, name, description, price_cents, min_stock, created_at, updated_at, deleted_at, sku, barcode, location, purchase_price_cents, margin_percent, is_featured, is_active, frame_type, gender, shape, material, frame_color, temple_color, size_code, lens_width, bridge_width, temple_length, lens_height, base_curve, rim_type, accessory_type, compatible_with, consumable, supplier_id, frame_brand, frame_model) FROM stdin;
0b371d2a-58af-45df-9bb5-c6406439eb49	default-shop	ACC-001	Étui rigide Ray-Ban	\N	2600	0	2026-05-21 10:03:18.796026	2026-06-05 14:06:00.546824	\N	ACC-001	\N	Emplacement principal	1250	\N	t	t	\N	unisex	wayfarer	acetate	\N	\N	\N	\N	\N	\N	\N	\N	\N	case	\N	f	\N	\N	\N
f0fbdc36-2cf6-4b77-8c71-a24c31c5040d	default-shop	ACC-003	Clip solaire	\N	4500	0	2026-05-21 10:03:18.796026	2026-06-02 16:09:11.576562	2026-05-21 11:18:59.958268	ACC-003	\N	Emplacement principal	2250	\N	f	t	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	cleaner	\N	t	\N	\N	\N
e457ec9f-8079-4d9a-ad97-c76df4e00f2a	default-shop	ACC-002	Spray nettoyant	\N	890	0	2026-05-21 10:03:18.796026	2026-06-02 16:09:11.576562	\N	ACC-002	\N	Emplacement principal	445	\N	f	t	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	cleaner	\N	t	\N	\N	\N
48fc536e-9990-415a-8199-a88b324a3cfb	default-shop	CHIFFON001	Chiffon microfibre	Chiffon microfibre pour nettoyage des verres	1500	20	2026-05-19 18:40:07.915302	2026-06-02 16:09:11.576562	\N	CHIFFON001	\N	Emplacement principal	750	\N	f	t	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	cleaner	\N	t	\N	\N	\N
e8400e35-8c3e-4864-884c-1a6f9203732d	default-shop	SPRAY001	Spray nettoyage	Spray nettoyant pour verres optiques	3500	15	2026-05-19 18:40:07.915302	2026-06-02 16:09:11.576562	\N	SPRAY001	\N	Emplacement principal	1750	\N	f	t	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	cleaner	\N	t	\N	\N	\N
406f8aa5-2364-48db-9e1d-5ce8902c3f49	default-shop	ETUI001	Étui noir	Étui de protection rigide pour lunettes	5000	10	2026-05-19 18:40:07.915302	2026-06-02 16:09:11.576562	\N	ETUI001	\N	Emplacement principal	2500	\N	f	t	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	case	\N	f	\N	\N	\N
158debf0-61d9-4c7b-83db-ff5fb775a3ad	default-shop	MNT-001	Ray-Ban RB2140	Monture iconique Wayfarer	12700	0	2026-05-21 10:03:18.796026	2026-06-05 14:36:19.842678	\N	MNT-001	\N	Emplacement principal	6250	\N	t	t	full_rim	unisex	wayfarer	acetate	noir	\N	\N	52	18	145	\N	\N	\N	\N	\N	f	\N	\N	\N
c51224ba-a5d2-451a-81a1-9a0459657c33	default-shop	DIOR-001	Dior BlackTie Elite	Lunettes de vue Dior édition limitée avec finition dorée. Monture élégante pour homme.	250000	3	2026-05-21 11:17:48.820118	2026-06-02 16:09:11.576562	\N	\N	\N	Vitrine A - Rayon 2	125000	\N	f	t	full_rim	homme	square	metal	\N	\N	\N	54	25	148	\N	\N	\N	\N	\N	f	\N	\N	\N
ec63d905-9861-46ca-99e0-3cb83c3a550e	default-shop	RB3447	RayBan Round	Monture ronde style vintage - RayBan	120000	3	2026-05-19 18:40:07.915302	2026-06-02 16:09:11.576562	\N	RB3447	\N	Emplacement principal	60000	\N	f	t	full_rim	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N
b0c211a9-cbcd-41ba-8464-4c71c5112ed1	default-shop	TOM22	TomFord Black	Monture élégante noire - TomFord	220000	2	2026-05-19 18:40:07.915302	2026-06-02 16:09:11.576562	\N	TOM22	\N	Emplacement principal	110000	\N	f	t	full_rim	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N
003b3d45-2b05-4d47-a8cc-35755fbfc0aa	default-shop	CR100	Carrera Sport	Monture sportive - Carrera	90000	2	2026-05-19 18:40:07.915302	2026-06-02 16:09:11.576562	\N	CR100	\N	Emplacement principal	45000	\N	f	t	full_rim	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N
\.


--
-- TOC entry 6005 (class 0 OID 116236)
-- Dependencies: 320
-- Data for Name: purchase_order_events; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.purchase_order_events (id, supplier_order_id, event_type, data, created_at, created_by) FROM stdin;
\.


--
-- TOC entry 5960 (class 0 OID 114694)
-- Dependencies: 260
-- Data for Name: role_permissions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.role_permissions (role_id, permission_id) FROM stdin;
2	1
2	2
2	4
2	5
2	7
2	8
2	10
2	11
2	12
2	14
2	15
2	16
2	17
2	18
2	19
2	20
2	21
2	22
3	1
3	4
3	20
3	21
3	22
2	27
2	28
\.


--
-- TOC entry 5957 (class 0 OID 114665)
-- Dependencies: 257
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.roles (id, name, description, tenant_id, created_at) FROM stdin;
1	admin	Accès total à toutes les fonctionnalités	default-shop	2026-06-01 18:15:08.584189
2	optician	Accès complet aux commandes, produits et clients	default-shop	2026-06-01 18:15:08.584189
3	cashier	Accès limité aux ventes et lecture des clients/produits	default-shop	2026-06-01 18:15:08.584189
\.


--
-- TOC entry 5926 (class 0 OID 113221)
-- Dependencies: 226
-- Data for Name: sale_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.sale_items (id, sale_id, product_id, quantity, unit_price_cents, total_cents, created_at) FROM stdin;
\.


--
-- TOC entry 5925 (class 0 OID 113208)
-- Dependencies: 225
-- Data for Name: sales; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.sales (id, tenant_id, invoice_number, customer_name, customer_email, total_cents, tax_cents, status, payment_method, invoice_hash, created_at, paid_at, deleted_at, client_id) FROM stdin;
\.


--
-- TOC entry 5978 (class 0 OID 115768)
-- Dependencies: 280
-- Data for Name: schema_cartography; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.schema_cartography (id, domain, object_name, object_type, role, status, depends_on, created_at, migrated_to, notes) FROM stdin;
4f95667f-a4a4-46f5-92c6-c5e4bab8af61	sales	sales	table	legacy	frozen	[]	2026-06-03 16:12:28.547875+02	\N	À remplacer par sales_order_new
864b1890-0799-46f3-be4d-a1545d46fe14	sales	sales_orders	table	source	active	[]	2026-06-03 16:12:28.547875+02	\N	Source actuelle - À migrer
b873b810-fb65-481c-82ca-2cd1e13cdbb9	sales	sales_documents	table	legacy	frozen	[]	2026-06-03 16:12:28.547875+02	\N	Fusionner avec sales_orders
bed4e819-57a2-4f69-85d6-761b228cb77d	sales	sales_invoices	table	legacy	active	[]	2026-06-03 16:12:28.547875+02	\N	Source factures - À migrer
43590b15-4908-4713-9852-e41f2882ea7d	sales	sales_invoice_items	table	legacy	active	[]	2026-06-03 16:12:28.547875+02	\N	À migrer vers sales_order_item_new
98772da4-517d-43e1-bcd4-520c2accc93d	sales	sale_items	table	legacy	frozen	[]	2026-06-03 16:12:28.547875+02	\N	Obsolète
c9159d11-cca1-4072-8a30-20adebeab0de	sales	invoice_lines	table	legacy	frozen	[]	2026-06-03 16:12:28.547875+02	\N	Doublon avec sales_invoice_items
c4f44893-ec8a-4a2b-82dd-8cb26145c161	sales	sales_order_items	table	source	active	[]	2026-06-03 16:12:28.547875+02	\N	Source actuelle - À garder temporairement
7737e715-eacf-4244-87be-829c6e190a78	optical	lens_orders	table	source	active	[]	2026-06-03 16:12:28.547875+02	\N	Source principale - À migrer vers optical_job
bf58f231-1d92-4c77-b6a0-07c2f622b836	optical	prescriptions	table	source	active	[]	2026-06-03 16:12:28.547875+02	\N	Garder - enrichir
da839315-cd55-4f16-a903-37b5e5322fd3	optical	lens_pricing	table	reference	active	[]	2026-06-03 16:12:28.547875+02	\N	À garder comme référence
79f6931c-a303-4c36-84d3-627c2be2a2a5	optical	lens_types	table	reference	active	[]	2026-06-03 16:12:28.547875+02	\N	À garder
b7362043-b9d9-4698-8958-850f7a6831fa	optical	price_grid	table	reference	active	[]	2026-06-03 16:12:28.547875+02	\N	À garder
2c482438-754f-47ac-8f5b-dff2e532df86	supplier	supplier_orders	table	source	active	[]	2026-06-03 16:12:28.547875+02	\N	Source principale
1e94853e-1d37-4f9b-bdf1-71a7b87df23a	supplier	supplier_invoices	table	source	active	[]	2026-06-03 16:12:28.547875+02	\N	Lié aux commandes
52719290-5373-4853-825f-6c7a53783662	supplier	supplier_order_events	table	legacy	frozen	[]	2026-06-03 16:12:28.547875+02	\N	À fusionner dans status_history
96d6e4e9-5093-4cb0-93b6-67cdd54db468	supplier	supplier_order_history	table	legacy	frozen	[]	2026-06-03 16:12:28.547875+02	\N	À fusionner
ed8bd63b-195a-40da-840f-81454703d1b5	supplier	supplier_order_issues	table	legacy	frozen	[]	2026-06-03 16:12:28.547875+02	\N	À fusionner dans disputes
8e5b1049-ee9a-4a32-ba7c-0d75291d8de8	supplier	supplier_order_disputes	table	source	active	[]	2026-06-03 16:12:28.547875+02	\N	À garder
4f9fa850-f24a-4f45-a3f8-4a4db5801d5f	stock	stock_movements	table	source	active	[]	2026-06-03 16:12:28.547875+02	\N	SOURCE UNIQUE - À garder
820ce153-9b9a-414d-b598-1428d7f4b383	stock	product_stock_view	view	view	deprecated	[]	2026-06-03 16:12:28.547875+02	\N	À remplacer par v_inventory
4adcab5c-170e-4e56-8f55-305a599813d4	stock	v_stock_accurate	view	view	deprecated	[]	2026-06-03 16:12:28.547875+02	\N	À supprimer
eef73b8c-a393-4ed2-a548-e93167233a75	stock	v_stock_current	view	view	deprecated	[]	2026-06-03 16:12:28.547875+02	\N	À supprimer
005a8c31-6204-4e8d-b4ba-b4cc3a8cd979	product	products	table	source	active	[]	2026-06-03 16:12:28.547875+02	\N	À garder - nettoyer
c87577b7-857f-4410-b0f4-755885e7ddee	product	product_variants	table	source	active	[]	2026-06-03 16:12:28.547875+02	\N	À garder
e68607fd-e9ab-465b-985c-0086f7032fe9	product	product_images	table	source	active	[]	2026-06-03 16:12:28.547875+02	\N	OK
d1474183-b67e-423d-bc33-00dbb0da6296	product	product_tags	table	source	active	[]	2026-06-03 16:12:28.547875+02	\N	OK
425ebd3b-7111-4721-a8d7-3157a7569340	accounting	accounting_journal	table	source	active	[]	2026-06-03 16:12:28.547875+02	\N	Source comptable
2cf55aa0-fdf6-4afa-b01e-209ae81bef08	accounting	plan_comptable	table	reference	active	[]	2026-06-03 16:12:28.547875+02	\N	Plan comptable
385ed151-e9e1-4177-95f6-c7a0b9bf5a7a	accounting	tva_declarations	table	source	active	[]	2026-06-03 16:12:28.547875+02	\N	OK
4ba8a6c5-fbc9-42a2-8358-6705e0df7164	accounting	tva_declaration_items	table	source	active	[]	2026-06-03 16:12:28.547875+02	\N	OK
76f4d0ad-8e6e-4851-9aa6-9f9b0f3b5d2a	accounting	payments	table	source	active	[]	2026-06-03 16:12:28.547875+02	\N	OK
820725e4-d285-40d3-92ae-1f3b42eef55f	client	clients	table	source	active	[]	2026-06-03 16:12:28.547875+02	\N	Source principale
9e5dfb37-c2b8-4a4e-af8e-ea939b05d645	client	users	table	source	active	[]	2026-06-03 16:12:28.547875+02	\N	OK
\.


--
-- TOC entry 5938 (class 0 OID 113942)
-- Dependencies: 238
-- Data for Name: stock_movements; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.stock_movements (id, tenant_id, product_id, type, quantity, source_type, source_id, created_at, created_by) FROM stdin;
\.


--
-- TOC entry 5948 (class 0 OID 114435)
-- Dependencies: 248
-- Data for Name: supplier_credit_notes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.supplier_credit_notes (id, tenant_id, credit_note_number, supplier_invoice_id, supplier_order_id, amount_ht, amount_tva, amount_ttc, reason, created_at, created_by) FROM stdin;
\.


--
-- TOC entry 5934 (class 0 OID 113684)
-- Dependencies: 234
-- Data for Name: supplier_invoice_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.supplier_invoice_items (id, tenant_id, invoice_id, lens_type, index_type, material, quantity, unit_price_cents, total_cents, created_at) FROM stdin;
\.


--
-- TOC entry 5939 (class 0 OID 113966)
-- Dependencies: 239
-- Data for Name: supplier_invoices; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.supplier_invoices (id, tenant_id, supplier_id, order_id, invoice_number, invoice_date, amount_ht, amount_tva, amount_ttc, payment_status, payment_date, file_url, notes, created_at, updated_at, invoice_type) FROM stdin;
388acef9-8059-4dfd-80c2-70f83202d54b	default-shop	8703866b-3c3b-496f-a6d8-36b0a27b74a1	fa5c328f-6ca3-4240-baf1-c38d93289bbb	fa0036	2026-06-04	600.00	20.00	720.00	pending	\N	\N	\N	2026-06-04 20:05:44.323712	2026-06-04 20:05:44.323712	standard
d2003372-3ef2-439f-a008-5b244533caa5	default-shop	8703866b-3c3b-496f-a6d8-36b0a27b74a1	d44ff9c2-61c2-4c37-9754-cd4c416f4a20	fa02325	2026-06-05	350.00	20.00	420.00	pending	\N	\N	\N	2026-06-05 12:17:45.844831	2026-06-05 12:17:45.844831	standard
0d23ad38-7586-46f3-a73c-16da8500107b	default-shop	8703866b-3c3b-496f-a6d8-36b0a27b74a1	96f55ef6-cb93-4633-afe0-3d62582058d9	fa789	2026-06-05	300.00	20.00	360.00	pending	\N	\N	\N	2026-06-05 12:34:13.957411	2026-06-05 12:34:13.957411	standard
f9a3e027-68c1-41b6-bc29-acfadf37ca52	default-shop	8703866b-3c3b-496f-a6d8-36b0a27b74a1	d696f7d4-6239-46e3-8f90-54cd6e5a4e40	f545	2026-06-05	600.00	20.00	720.00	pending	\N	\N	\N	2026-06-05 18:00:43.944289	2026-06-05 18:00:43.944289	standard
\.


--
-- TOC entry 5947 (class 0 OID 114399)
-- Dependencies: 247
-- Data for Name: supplier_order_disputes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.supplier_order_disputes (id, supplier_order_id, dispute_type, severity, description, resolution_type, resolution_notes, resolved_at, created_at, created_by) FROM stdin;
\.


--
-- TOC entry 5951 (class 0 OID 114538)
-- Dependencies: 251
-- Data for Name: supplier_order_events; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.supplier_order_events (id, supplier_order_id, event_type, event_data, notes, created_by, created_at, tenant_id) FROM stdin;
\.


--
-- TOC entry 5946 (class 0 OID 114379)
-- Dependencies: 246
-- Data for Name: supplier_order_history; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.supplier_order_history (id, supplier_order_id, old_logistic_status, new_logistic_status, old_quality_status, new_quality_status, action, notes, created_by, created_at) FROM stdin;
\.


--
-- TOC entry 5940 (class 0 OID 114221)
-- Dependencies: 240
-- Data for Name: supplier_order_issues; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.supplier_order_issues (id, supplier_order_id, item_type, issue_type, description, quantity, status, created_at, resolved_at, notes) FROM stdin;
\.


--
-- TOC entry 5929 (class 0 OID 113531)
-- Dependencies: 229
-- Data for Name: supplier_orders; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.supplier_orders (id, tenant_id, order_id, sales_order_id, right_eye_config, left_eye_config, status, technical_notes, created_at, sent_at, confirmed_at, delivered_at, expected_price_cents, actual_price_cents, invoice_id, payment_status, supplier_id, client_id, has_left_eye, has_right_eye, received_at, shipped_at, quality_control_at, quality_control_by, quality_control_notes, items, order_type, source_type, created_by, requested_by, logistic_status, quality_status, supplier_invoice_number, supplier_invoice_date, supplier_invoice_amount, quality_checked_at, quality_checked_by, quality_notes, updated_at, credit_note_number, credit_note_amount_cents, credit_note_date) FROM stdin;
91cd646a-0c96-4205-b197-cc5ebf5e3ee0	default-shop	SUP-1780608141255-740	3422b209-39c5-46a8-8539-bad89d713aec	{"tint": {"color": "gray", "gradient": true, "intensity": 50}, "type": "progressive", "index": "1.6", "price": 725, "coatings": ["AR", "BLUE", "FOG", "SCRATCH"], "material": "organic", "base_price": 625, "prescription": {"axis": null, "prism": 0.5, "sphere": 1.5, "addition": null, "cylinder": 0, "prism_base": "up"}, "coatings_price": 100, "coatings_detail": [{"code": "AR", "name": "Antireflet", "price": 40}, {"code": "BLUE", "name": "Anti-lumiere bleue", "price": 20}, {"code": "FOG", "name": "Anti-buee", "price": 25}, {"code": "SCRATCH", "name": "Anti-rayure", "price": 15}]}	{"tint": {"color": "gray", "gradient": true, "intensity": 50}, "type": "progressive", "index": "1.67", "price": 540, "coatings": ["AR", "BLUE", "SCRATCH", "FOG"], "material": "organic", "base_price": 440, "prescription": {"axis": null, "prism": 1.5, "sphere": 0.75, "addition": null, "cylinder": 0, "prism_base": "down"}, "coatings_price": 100, "coatings_detail": [{"code": "AR", "name": "Antireflet", "price": 40}, {"code": "BLUE", "name": "Anti-lumiere bleue", "price": 20}, {"code": "SCRATCH", "name": "Anti-rayure", "price": 15}, {"code": "FOG", "name": "Anti-buee", "price": 25}]}	approved	\N	2026-06-04 23:22:21.256997	\N	\N	\N	126500	0	\N	pending	8703866b-3c3b-496f-a6d8-36b0a27b74a1	63330f0b-bd4b-4e31-a2f3-dbfde6928cf1	t	t	\N	\N	\N	\N	\N	[{"id": "da25b2c3-6a4d-4c6d-aad9-42d0af22ce10", "type": "optical_job", "metadata": {"eye": "OD", "left_eye": {"tint": {"color": "gray", "gradient": true, "intensity": 50}, "type": "progressive", "index": "1.67", "price": 540, "coatings": ["AR", "BLUE", "SCRATCH", "FOG"], "material": "organic", "base_price": 440, "prescription": {"axis": null, "prism": 1.5, "sphere": 0.75, "addition": null, "cylinder": 0, "prism_base": "down"}, "coatings_price": 100, "coatings_detail": [{"code": "AR", "name": "Antireflet", "price": 40}, {"code": "BLUE", "name": "Anti-lumiere bleue", "price": 20}, {"code": "SCRATCH", "name": "Anti-rayure", "price": 15}, {"code": "FOG", "name": "Anti-buee", "price": 25}]}, "mounting": {"frame_wrap": 3, "mounting_height": 2, "vertex_distance": 12, "pantoscopic_angle": 5, "pupillary_distance": 17}, "right_eye": {"tint": {"color": "gray", "gradient": true, "intensity": 50}, "type": "progressive", "index": "1.6", "price": 725, "coatings": ["AR", "BLUE", "FOG", "SCRATCH"], "material": "organic", "base_price": 625, "prescription": {"axis": null, "prism": 0.5, "sphere": 1.5, "addition": null, "cylinder": 0, "prism_base": "up"}, "coatings_price": 100, "coatings_detail": [{"code": "AR", "name": "Antireflet", "price": 40}, {"code": "BLUE", "name": "Anti-lumiere bleue", "price": 20}, {"code": "FOG", "name": "Anti-buee", "price": 25}, {"code": "SCRATCH", "name": "Anti-rayure", "price": 15}]}}, "quantity": 1, "description": "progressive | 1.6 | organic", "total_cents": 72500, "unit_price_cents": 72500}, {"id": "d8c62afa-d00f-4794-a9a4-7a59edeee42d", "type": "optical_job", "metadata": {"eye": "OG", "left_eye": {"tint": {"color": "gray", "gradient": true, "intensity": 50}, "type": "progressive", "index": "1.67", "price": 540, "coatings": ["AR", "BLUE", "SCRATCH", "FOG"], "material": "organic", "base_price": 440, "prescription": {"axis": null, "prism": 1.5, "sphere": 0.75, "addition": null, "cylinder": 0, "prism_base": "down"}, "coatings_price": 100, "coatings_detail": [{"code": "AR", "name": "Antireflet", "price": 40}, {"code": "BLUE", "name": "Anti-lumiere bleue", "price": 20}, {"code": "SCRATCH", "name": "Anti-rayure", "price": 15}, {"code": "FOG", "name": "Anti-buee", "price": 25}]}, "mounting": {"frame_wrap": 3, "mounting_height": 2, "vertex_distance": 12, "pantoscopic_angle": 5, "pupillary_distance": 17}, "right_eye": {"tint": {"color": "gray", "gradient": true, "intensity": 50}, "type": "progressive", "index": "1.6", "price": 725, "coatings": ["AR", "BLUE", "FOG", "SCRATCH"], "material": "organic", "base_price": 625, "prescription": {"axis": null, "prism": 0.5, "sphere": 1.5, "addition": null, "cylinder": 0, "prism_base": "up"}, "coatings_price": 100, "coatings_detail": [{"code": "AR", "name": "Antireflet", "price": 40}, {"code": "BLUE", "name": "Anti-lumiere bleue", "price": 20}, {"code": "FOG", "name": "Anti-buee", "price": 25}, {"code": "SCRATCH", "name": "Anti-rayure", "price": 15}]}}, "quantity": 1, "description": "progressive | 1.67 | organic", "total_cents": 54000, "unit_price_cents": 54000}]	mixed	optical_lab	\N	\N	draft	pending	\N	\N	\N	\N	\N	\N	2026-06-04 23:22:21.256997	\N	\N	\N
5291d7e9-d258-418b-8615-0cbbdd8ce4a3	default-shop	SUP-1780649993615-469	50a8c803-f39f-424d-a70d-f8a303f90632	{"tint": {"color": "gray", "gradient": true, "intensity": 50}, "type": "progressive", "index": "1.67", "coatings": ["AR", "BLUE", "SCRATCH", "FOG"], "material": "organic", "description": "progressive | 1.67 | organic", "prescription": {"axis": 2, "prism": 0.5, "sphere": 0.75, "addition": 0.5, "cylinder": -0.5, "prism_base": "up"}}	{"tint": {"color": "gray", "gradient": true, "intensity": 50}, "type": "progressive", "index": "1.67", "coatings": ["AR", "BLUE", "SCRATCH", "FOG"], "material": "organic", "description": "progressive | 1.67 | organic", "prescription": {"axis": 2, "prism": null, "sphere": 0.5, "addition": 0.5, "cylinder": -0.25, "prism_base": null}}	shipped	\N	2026-06-05 10:59:53.616417	\N	\N	\N	103000	0	\N	pending	8703866b-3c3b-496f-a6d8-36b0a27b74a1	98e48105-2797-48b0-bedf-341c9b00d3b9	t	t	\N	\N	\N	\N	\N	[{"id": "4ff02933-9e34-4904-aca6-c10a674068b3", "type": "optical_job", "metadata": {"eye": "OD", "left_eye": null, "mounting": {"frame_wrap": 0, "mounting_height": 0, "vertex_distance": 12, "pantoscopic_angle": 0, "pupillary_distance": 51.5}, "right_eye": {"tint": {"color": "gray", "gradient": true, "intensity": 50}, "type": "progressive", "index": "1.67", "coatings": ["AR", "BLUE", "SCRATCH", "FOG"], "material": "organic", "description": "progressive | 1.67 | organic", "prescription": {"axis": 2, "prism": 0.5, "sphere": 0.75, "addition": 0.5, "cylinder": -0.5, "prism_base": "up"}}}, "quantity": 1, "description": "progressive | 1.67 | organic", "total_cents": 51500, "unit_price_cents": 51500}, {"id": "793ea4fa-17b8-42a8-85ea-20cfb9350e37", "type": "optical_job", "metadata": {"eye": "OG", "left_eye": {"tint": {"color": "gray", "gradient": true, "intensity": 50}, "type": "progressive", "index": "1.67", "coatings": ["AR", "BLUE", "SCRATCH", "FOG"], "material": "organic", "description": "progressive | 1.67 | organic", "prescription": {"axis": 2, "prism": null, "sphere": 0.5, "addition": 0.5, "cylinder": -0.25, "prism_base": null}}, "mounting": {"frame_wrap": 0, "mounting_height": 0, "vertex_distance": 12, "pantoscopic_angle": 0, "pupillary_distance": 51.5}, "right_eye": null}, "quantity": 1, "description": "progressive | 1.67 | organic", "total_cents": 51500, "unit_price_cents": 51500}]	mixed	optical_lab	\N	\N	draft	pending	\N	\N	\N	\N	\N	\N	2026-06-05 10:59:53.616417	\N	\N	\N
d44ff9c2-61c2-4c37-9754-cd4c416f4a20	default-shop	SUP-1780654610740-600	e9409acb-968e-4416-b461-3cf715dca47f	{"tint": {"color": "none", "gradient": false, "intensity": 0}, "type": "progressive", "index": "1.67", "price": 0, "coatings": ["AR"], "material": "organic", "mounting": {"frame_wrap": 0, "mounting_height": 0, "vertex_distance": 12, "pantoscopic_angle": 0, "pupillary_distance": 51.5}, "prescription": {"axis": 2, "prism": null, "sphere": 0.75, "addition": 0.5, "cylinder": -0.5, "prism_base": null}, "coatings_detail": []}	{"tint": {"color": "none", "gradient": false, "intensity": 0}, "type": "progressive", "index": "1.67", "price": 0, "coatings": ["AR"], "material": "organic", "mounting": {"frame_wrap": 0, "mounting_height": 0, "vertex_distance": 12, "pantoscopic_angle": 0, "pupillary_distance": 51.5}, "prescription": {"axis": 2, "prism": null, "sphere": 0.5, "addition": 0.5, "cylinder": -0.25, "prism_base": null}, "coatings_detail": []}	validated	\N	2026-06-05 12:16:50.74071	\N	\N	\N	91000	35000	\N	pending	8703866b-3c3b-496f-a6d8-36b0a27b74a1	98e48105-2797-48b0-bedf-341c9b00d3b9	t	t	2026-06-05 12:17:45.844831	\N	2026-06-05 12:17:56.997475	\N	\N	[{"id": "735ed71b-ca33-4b0b-bba9-e9d2b5d7b51f", "type": "optical_job", "metadata": {"eye": "OD", "left_eye": null, "mounting": {"frame_wrap": 0, "mounting_height": 0, "vertex_distance": 12, "pantoscopic_angle": 0, "pupillary_distance": 51.5}, "right_eye": {"tint": {"color": "none", "gradient": false, "intensity": 0}, "type": "progressive", "index": "1.67", "price": 0, "coatings": ["AR"], "material": "organic", "prescription": {"axis": 2, "prism": null, "sphere": 0.75, "addition": 0.5, "cylinder": -0.5, "prism_base": null}, "coatings_detail": []}}, "quantity": 1, "description": "progressive | 1.67 | organic", "total_cents": 45500, "unit_price_cents": 45500}, {"id": "eb97875e-e05b-42a0-ab25-f908d46da32b", "type": "optical_job", "metadata": {"eye": "OG", "left_eye": {"tint": {"color": "none", "gradient": false, "intensity": 0}, "type": "progressive", "index": "1.67", "price": 0, "coatings": ["AR"], "material": "organic", "prescription": {"axis": 2, "prism": null, "sphere": 0.5, "addition": 0.5, "cylinder": -0.25, "prism_base": null}, "coatings_detail": []}, "mounting": {"frame_wrap": 0, "mounting_height": 0, "vertex_distance": 12, "pantoscopic_angle": 0, "pupillary_distance": 51.5}, "right_eye": null}, "quantity": 1, "description": "progressive | 1.67 | organic", "total_cents": 45500, "unit_price_cents": 45500}]	mixed	optical_lab	\N	\N	draft	pending	fa02325	2026-06-05	350.00	\N	\N	\N	2026-06-05 12:16:50.74071	\N	\N	\N
96f55ef6-cb93-4633-afe0-3d62582058d9	default-shop	BCF-2026-00001	68bf9857-4444-49eb-854a-82aa70f83442	{"tint": {"color": "gray", "gradient": false, "intensity": 50}, "type": "progressive", "index": "1.67", "price": 0, "coatings": ["AR", "BLUE", "FOG", "SCRATCH"], "material": "organic", "mounting": {"frame_wrap": 0, "mounting_height": 0, "vertex_distance": 12, "pantoscopic_angle": 0, "pupillary_distance": 51.5}, "prescription": {"axis": 2, "prism": 0.5, "sphere": 0.75, "addition": 0.5, "cylinder": -0.5, "prism_base": "down"}, "coatings_detail": []}	{"tint": {"color": "gray", "gradient": false, "intensity": 50}, "type": "progressive", "index": "1.67", "price": 0, "coatings": ["AR", "BLUE", "FOG", "SCRATCH"], "material": "organic", "mounting": {"frame_wrap": 0, "mounting_height": 0, "vertex_distance": 12, "pantoscopic_angle": 0, "pupillary_distance": 51.5}, "prescription": {"axis": 2, "prism": 1.5, "sphere": 0.5, "addition": 0.5, "cylinder": -0.25, "prism_base": "in"}, "coatings_detail": []}	validated	\N	2026-06-05 12:33:14.691708	\N	\N	\N	103000	30000	\N	pending	8703866b-3c3b-496f-a6d8-36b0a27b74a1	\N	t	t	2026-06-05 12:34:13.957411	\N	2026-06-05 12:34:22.343269	\N	\N	[{"id": "9ecfd287-a0f0-46df-9baa-94e2f56ac96d", "type": "optical_job", "metadata": {"eye": "OD", "left_eye": null, "mounting": {"frame_wrap": 0, "mounting_height": 0, "vertex_distance": 12, "pantoscopic_angle": 0, "pupillary_distance": 51.5}, "right_eye": {"tint": {"color": "gray", "gradient": false, "intensity": 50}, "type": "progressive", "index": "1.67", "price": 0, "coatings": ["AR", "BLUE", "FOG", "SCRATCH"], "material": "organic", "prescription": {"axis": 2, "prism": 0.5, "sphere": 0.75, "addition": 0.5, "cylinder": -0.5, "prism_base": "down"}, "coatings_detail": []}}, "quantity": 1, "description": "progressive | 1.67 | organic", "total_cents": 51500, "unit_price_cents": 51500}, {"id": "06354350-2cc4-4354-ba0e-59a4616620cd", "type": "optical_job", "metadata": {"eye": "OG", "left_eye": {"tint": {"color": "gray", "gradient": false, "intensity": 50}, "type": "progressive", "index": "1.67", "price": 0, "coatings": ["AR", "BLUE", "FOG", "SCRATCH"], "material": "organic", "prescription": {"axis": 2, "prism": 1.5, "sphere": 0.5, "addition": 0.5, "cylinder": -0.25, "prism_base": "in"}, "coatings_detail": []}, "mounting": {"frame_wrap": 0, "mounting_height": 0, "vertex_distance": 12, "pantoscopic_angle": 0, "pupillary_distance": 51.5}, "right_eye": null}, "quantity": 1, "description": "progressive | 1.67 | organic", "total_cents": 51500, "unit_price_cents": 51500}]	mixed	optical_lab	\N	\N	draft	pending	fa789	2026-06-05	300.00	\N	\N	\N	2026-06-05 12:33:14.691708	\N	\N	\N
2e8cf16e-f881-4746-943d-a45b5cd1a7db	default-shop	SUP-1780651195179-19	dfba3714-2276-491f-9b57-2d9bfc1dc9d0	{"tint": {"color": "gray", "gradient": true, "intensity": 50}, "type": "progressive", "index": "1.67", "coatings": ["AR", "BLUE", "FOG", "SCRATCH"], "material": "organic", "description": "progressive | 1.67 | organic", "prescription": {"axis": 2, "prism": 0.5, "sphere": 0.75, "addition": 0.5, "cylinder": -0.5, "prism_base": "up"}}	{"tint": {"color": "gray", "gradient": true, "intensity": 50}, "type": "progressive", "index": "1.67", "coatings": ["AR", "BLUE", "FOG", "SCRATCH"], "material": "organic", "description": "progressive | 1.67 | organic", "prescription": {"axis": 2, "prism": null, "sphere": 0.5, "addition": 0.5, "cylinder": -0.25, "prism_base": null}}	shipped	\N	2026-06-05 11:19:55.179287	\N	\N	\N	103000	0	\N	pending	8703866b-3c3b-496f-a6d8-36b0a27b74a1	98e48105-2797-48b0-bedf-341c9b00d3b9	t	t	\N	\N	\N	\N	\N	[{"id": "78ee306e-a5a0-454b-b0be-f67aede71044", "type": "optical_job", "metadata": {"eye": "OD", "left_eye": null, "mounting": {"frame_wrap": 1, "mounting_height": 0.5, "vertex_distance": 12, "pantoscopic_angle": -1, "pupillary_distance": 51.5}, "right_eye": {"tint": {"color": "gray", "gradient": true, "intensity": 50}, "type": "progressive", "index": "1.67", "coatings": ["AR", "BLUE", "FOG", "SCRATCH"], "material": "organic", "description": "progressive | 1.67 | organic", "prescription": {"axis": 2, "prism": 0.5, "sphere": 0.75, "addition": 0.5, "cylinder": -0.5, "prism_base": "up"}}}, "quantity": 1, "description": "progressive | 1.67 | organic", "total_cents": 51500, "unit_price_cents": 51500}, {"id": "056b039e-34fa-4a51-8373-29ff0556d611", "type": "optical_job", "metadata": {"eye": "OG", "left_eye": {"tint": {"color": "gray", "gradient": true, "intensity": 50}, "type": "progressive", "index": "1.67", "coatings": ["AR", "BLUE", "FOG", "SCRATCH"], "material": "organic", "description": "progressive | 1.67 | organic", "prescription": {"axis": 2, "prism": null, "sphere": 0.5, "addition": 0.5, "cylinder": -0.25, "prism_base": null}}, "mounting": {"frame_wrap": 1, "mounting_height": 0.5, "vertex_distance": 12, "pantoscopic_angle": -1, "pupillary_distance": 51.5}, "right_eye": null}, "quantity": 1, "description": "progressive | 1.67 | organic", "total_cents": 51500, "unit_price_cents": 51500}]	mixed	optical_lab	\N	\N	draft	pending	\N	\N	\N	\N	\N	\N	2026-06-05 11:19:55.179287	\N	\N	\N
2703ff77-1a21-464f-931f-382e50e1b8ed	default-shop	SUP-1780652238960-984	dd77994b-5934-48f2-b784-41373035fa29	{"tint": {"color": "gray", "gradient": false, "intensity": 50}, "type": "progressive", "index": "1.67", "price": 0, "coatings": ["AR", "BLUE"], "material": "organic", "mounting": {"frame_wrap": 0, "mounting_height": 0, "vertex_distance": 12, "pantoscopic_angle": 0, "pupillary_distance": 51.5}, "prescription": {"axis": 2, "prism": 0.5, "sphere": 0.75, "addition": 0.5, "cylinder": -0.5, "prism_base": "up"}, "coatings_detail": []}	{"tint": {"color": "gray", "gradient": false, "intensity": 50}, "type": "progressive", "index": "1.67", "price": 0, "coatings": ["AR", "BLUE"], "material": "organic", "mounting": {"frame_wrap": 0, "mounting_height": 0, "vertex_distance": 12, "pantoscopic_angle": 0, "pupillary_distance": 51.5}, "prescription": {"axis": 2, "prism": null, "sphere": 0.5, "addition": 0.5, "cylinder": -0.25, "prism_base": null}, "coatings_detail": []}	approved	\N	2026-06-05 11:37:18.961415	\N	\N	\N	95000	0	\N	pending	8703866b-3c3b-496f-a6d8-36b0a27b74a1	98e48105-2797-48b0-bedf-341c9b00d3b9	t	t	\N	\N	\N	\N	\N	[{"id": "2eb631e1-336c-4099-b8cd-7a4bba2e7f18", "type": "optical_job", "metadata": {"eye": "OD", "left_eye": null, "mounting": {"frame_wrap": 0, "mounting_height": 0, "vertex_distance": 12, "pantoscopic_angle": 0, "pupillary_distance": 51.5}, "right_eye": {"tint": {"color": "gray", "gradient": false, "intensity": 50}, "type": "progressive", "index": "1.67", "price": 0, "coatings": ["AR", "BLUE"], "material": "organic", "prescription": {"axis": 2, "prism": 0.5, "sphere": 0.75, "addition": 0.5, "cylinder": -0.5, "prism_base": "up"}, "coatings_detail": []}}, "quantity": 1, "description": "progressive | 1.67 | organic", "total_cents": 47500, "unit_price_cents": 47500}, {"id": "33f7382f-7ad2-491c-845d-494544795226", "type": "optical_job", "metadata": {"eye": "OG", "left_eye": {"tint": {"color": "gray", "gradient": false, "intensity": 50}, "type": "progressive", "index": "1.67", "price": 0, "coatings": ["AR", "BLUE"], "material": "organic", "prescription": {"axis": 2, "prism": null, "sphere": 0.5, "addition": 0.5, "cylinder": -0.25, "prism_base": null}, "coatings_detail": []}, "mounting": {"frame_wrap": 0, "mounting_height": 0, "vertex_distance": 12, "pantoscopic_angle": 0, "pupillary_distance": 51.5}, "right_eye": null}, "quantity": 1, "description": "progressive | 1.67 | organic", "total_cents": 47500, "unit_price_cents": 47500}]	mixed	optical_lab	\N	\N	draft	pending	\N	\N	\N	\N	\N	\N	2026-06-05 11:37:18.961415	\N	\N	\N
fa5c328f-6ca3-4240-baf1-c38d93289bbb	default-shop	SUP-1780592986479-889	54755218-9105-400a-b9e2-728b71d768dd	{"tint": {"color": "gray", "gradient": true, "intensity": 50}, "type": "progressive", "index": "1.67", "coatings": ["AR", "BLUE", "FOG", "SCRATCH"], "material": "organic", "description": "progressive | 1.67 | organic"}	{"tint": {"color": "gray", "gradient": true, "intensity": 50}, "type": "progressive", "index": "1.67", "coatings": ["AR", "FOG", "SCRATCH", "BLUE"], "material": "organic", "description": "progressive | 1.67 | organic"}	validated	\N	2026-06-04 19:09:46.479622	\N	\N	\N	108000	60000	\N	pending	8703866b-3c3b-496f-a6d8-36b0a27b74a1	98e48105-2797-48b0-bedf-341c9b00d3b9	t	t	2026-06-04 20:05:44.323712	\N	2026-06-04 20:06:01.309779	\N	\N	[{"id": "5a716f30-0acb-49e0-92bc-b68bd346d016", "type": "optical_job", "metadata": {"eye": "OD", "mounting": {"frame_wrap": 1, "mounting_height": 1, "vertex_distance": 12, "pantoscopic_angle": 2, "pupillary_distance": 1}, "right_eye": {"tint": {"color": "gray", "gradient": true, "intensity": 50}, "type": "progressive", "index": "1.67", "coatings": ["AR", "BLUE", "FOG", "SCRATCH"], "material": "organic", "description": "progressive | 1.67 | organic"}, "lens_config": {"tint": {"color": "gray", "gradient": true, "intensity": 50}, "type": "progressive", "index": "1.67", "coatings": ["AR", "BLUE", "FOG", "SCRATCH"], "material": "organic"}, "prescription": {"axis": 2, "prism": 1, "sphere": -0.75, "addition": 0.5, "cylinder": -0.5, "prism_base": "up"}, "purchase_price_cents": 0}, "quantity": 1, "description": "progressive | 1.67 | organic", "total_cents": 54000, "unit_price_cents": 54000}, {"id": "0f46d422-a39b-45a9-aefa-43a66636fd9e", "type": "optical_job", "metadata": {"eye": "OG", "left_eye": {"tint": {"color": "gray", "gradient": true, "intensity": 50}, "type": "progressive", "index": "1.67", "coatings": ["AR", "FOG", "SCRATCH", "BLUE"], "material": "organic", "description": "progressive | 1.67 | organic"}, "mounting": {"frame_wrap": 1, "mounting_height": 1, "vertex_distance": 12, "pantoscopic_angle": 2, "pupillary_distance": 1}, "lens_config": {"tint": {"color": "gray", "gradient": true, "intensity": 50}, "type": "progressive", "index": "1.67", "coatings": ["AR", "FOG", "SCRATCH", "BLUE"], "material": "organic"}, "prescription": {"axis": 2, "prism": 2.5, "sphere": -0.25, "addition": 0.5, "cylinder": -0.25, "prism_base": "down"}, "purchase_price_cents": 0}, "quantity": 1, "description": "progressive | 1.67 | organic", "total_cents": 54000, "unit_price_cents": 54000}]	mixed	optical_lab	\N	\N	draft	pending	fa0036	2026-06-04	600.00	\N	\N	\N	2026-06-04 19:09:46.479622	\N	\N	\N
a9efe495-161b-4929-a15d-f1cc96d1d9e3	default-shop	SUP-1780651702746-352	15d647d7-c44e-4aef-824b-640a958d9bfb	{"tint": {"color": "gray", "gradient": true, "intensity": 50}, "type": "progressive", "index": "1.67", "price": 0, "coatings": ["AR", "BLUE"], "material": "organic", "prescription": {"axis": 2, "prism": 0.5, "sphere": 0.75, "addition": 0.5, "cylinder": -0.5, "prism_base": "up"}, "coatings_detail": []}	{"tint": {"color": "gray", "gradient": true, "intensity": 50}, "type": "progressive", "index": "1.67", "price": 0, "coatings": ["AR", "BLUE"], "material": "organic", "prescription": {"axis": 2, "prism": 1.5, "sphere": 0.5, "addition": 0.5, "cylinder": -0.25, "prism_base": "down"}, "coatings_detail": []}	shipped	\N	2026-06-05 11:28:22.746719	\N	\N	\N	95000	0	\N	pending	8703866b-3c3b-496f-a6d8-36b0a27b74a1	98e48105-2797-48b0-bedf-341c9b00d3b9	t	t	\N	\N	\N	\N	\N	[{"id": "7011e47d-9118-4e31-9e80-f88130a2c9ec", "type": "optical_job", "metadata": {"eye": "OD", "left_eye": null, "mounting": {"frame_wrap": 0, "mounting_height": 0, "vertex_distance": 12, "pantoscopic_angle": 0, "pupillary_distance": 51.5}, "right_eye": {"tint": {"color": "gray", "gradient": true, "intensity": 50}, "type": "progressive", "index": "1.67", "price": 0, "coatings": ["AR", "BLUE"], "material": "organic", "prescription": {"axis": 2, "prism": 0.5, "sphere": 0.75, "addition": 0.5, "cylinder": -0.5, "prism_base": "up"}, "coatings_detail": []}}, "quantity": 1, "description": "progressive | 1.67 | organic", "total_cents": 47500, "unit_price_cents": 47500}, {"id": "7f7f20bd-e614-40db-af21-6e9ce9c3e2ca", "type": "optical_job", "metadata": {"eye": "OG", "left_eye": {"tint": {"color": "gray", "gradient": true, "intensity": 50}, "type": "progressive", "index": "1.67", "price": 0, "coatings": ["AR", "BLUE"], "material": "organic", "prescription": {"axis": 2, "prism": 1.5, "sphere": 0.5, "addition": 0.5, "cylinder": -0.25, "prism_base": "down"}, "coatings_detail": []}, "mounting": {"frame_wrap": 0, "mounting_height": 0, "vertex_distance": 12, "pantoscopic_angle": 0, "pupillary_distance": 51.5}, "right_eye": null}, "quantity": 1, "description": "progressive | 1.67 | organic", "total_cents": 47500, "unit_price_cents": 47500}]	mixed	optical_lab	\N	\N	draft	pending	\N	\N	\N	\N	\N	\N	2026-06-05 11:28:22.746719	\N	\N	\N
d696f7d4-6239-46e3-8f90-54cd6e5a4e40	default-shop	BCF-2026-00002	971c952c-2455-4b6e-b21c-efb06418670b	{"tint": {"color": "none", "gradient": false, "intensity": 0}, "type": "progressive", "index": "1.67", "price": 0, "coatings": ["AR", "BLUE"], "material": "organic", "mounting": {"frame_wrap": 0, "mounting_height": 0, "vertex_distance": 12, "pantoscopic_angle": 0, "pupillary_distance": 51.5}, "prescription": {"axis": 2, "prism": null, "sphere": 0.75, "addition": 0.5, "cylinder": -0.5, "prism_base": null}, "coatings_detail": []}	{"tint": {"color": "none", "gradient": false, "intensity": 0}, "type": "progressive", "index": "1.67", "price": 0, "coatings": ["AR", "BLUE"], "material": "organic", "mounting": {"frame_wrap": 0, "mounting_height": 0, "vertex_distance": 12, "pantoscopic_angle": 0, "pupillary_distance": 51.5}, "prescription": {"axis": 2, "prism": null, "sphere": 0.5, "addition": 0.5, "cylinder": -0.25, "prism_base": null}, "coatings_detail": []}	validated	\N	2026-06-05 17:59:48.317149	\N	\N	\N	95000	60000	\N	pending	8703866b-3c3b-496f-a6d8-36b0a27b74a1	\N	t	t	2026-06-05 18:00:43.944289	\N	2026-06-05 18:01:01.374855	\N	\N	[{"id": "2022a476-2de1-47a6-9ada-6ae1cf93c306", "type": "optical_job", "metadata": {"eye": "OD", "left_eye": null, "mounting": {"frame_wrap": 0, "mounting_height": 0, "vertex_distance": 12, "pantoscopic_angle": 0, "pupillary_distance": 51.5}, "right_eye": {"tint": {"color": "none", "gradient": false, "intensity": 0}, "type": "progressive", "index": "1.67", "price": 0, "coatings": ["AR", "BLUE"], "material": "organic", "prescription": {"axis": 2, "prism": null, "sphere": 0.75, "addition": 0.5, "cylinder": -0.5, "prism_base": null}, "coatings_detail": []}}, "quantity": 1, "description": "progressive | 1.67 | organic", "total_cents": 47500, "unit_price_cents": 47500}, {"id": "590f438c-8542-4103-a977-fb35bbcf2a3f", "type": "optical_job", "metadata": {"eye": "OG", "left_eye": {"tint": {"color": "none", "gradient": false, "intensity": 0}, "type": "progressive", "index": "1.67", "price": 0, "coatings": ["AR", "BLUE"], "material": "organic", "prescription": {"axis": 2, "prism": null, "sphere": 0.5, "addition": 0.5, "cylinder": -0.25, "prism_base": null}, "coatings_detail": []}, "mounting": {"frame_wrap": 0, "mounting_height": 0, "vertex_distance": 12, "pantoscopic_angle": 0, "pupillary_distance": 51.5}, "right_eye": null}, "quantity": 1, "description": "progressive | 1.67 | organic", "total_cents": 47500, "unit_price_cents": 47500}]	mixed	optical_lab	\N	\N	draft	pending	f545	2026-06-05	600.00	\N	\N	\N	2026-06-05 17:59:48.317149	\N	\N	\N
\.


--
-- TOC entry 5949 (class 0 OID 114465)
-- Dependencies: 249
-- Data for Name: supplier_replacements; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.supplier_replacements (id, tenant_id, replacement_number, original_invoice_id, supplier_order_id, new_invoice_number, new_invoice_date, new_amount_ht, status, created_at, received_at, created_by) FROM stdin;
\.


--
-- TOC entry 5937 (class 0 OID 113750)
-- Dependencies: 237
-- Data for Name: suppliers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.suppliers (id, tenant_id, name, commercial_name, ice, if, rc, cnss, patente, address, city, postal_code, phone, fax, email, website, contact_name, contact_phone, contact_email, bank_name, bank_account_number, bank_rib, notes, is_active, created_at, updated_at, deleted_at, iban) FROM stdin;
ce96d2a9-886b-4226-8f00-4378facb6aa7	default-shop	Hoya Lens Maroc	\N	001234567890125	12345680	12347	987654323	12345680	Casablanca	Casablanca	\N	0522345678	\N	contact@hoya.ma	\N	\N	\N	\N	\N	\N	\N	\N	t	2026-05-18 13:07:57.407856	2026-05-18 13:07:57.407856	\N	\N
bc41d4d7-89f5-4421-80a7-73de63c56172	default-shop	Zeiss Maroc	\N	001234567890124	12345679	12346	987654322	12345679	Rabat	Rabat	\N	0537123456	\N	contact@zeiss.ma	\N	\N	\N	\N	\N	\N	\N	\N	f	2026-05-18 13:07:57.407856	2026-05-18 13:07:57.407856	\N	\N
8703866b-3c3b-496f-a6d8-36b0a27b74a1	default-shop	Essilor Maroc	\N	001234567890121	12345678	12345	987654321	12345678	Casablanca	Casablanca	\N	0522123459	\N	contact@essilor.ma	\N	\N		\N	\N	\N	\N	\N	t	2026-05-18 13:07:57.407856	2026-05-21 16:27:33.330644	\N	\N
693160e2-d570-4df1-8651-98970e4a0398	default-shop	Essilor2 Maroc	\N	001200007890122	\N	\N	\N	\N	\N	\N	\N	0632546963	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	2026-05-21 16:31:56.17831	2026-05-21 16:31:56.17831	\N	\N
\.


--
-- TOC entry 5966 (class 0 OID 114748)
-- Dependencies: 266
-- Data for Name: tva_declaration_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tva_declaration_items (id, declaration_id, type, document_type, document_id, document_number, document_date, tva_rate, amount_ht_cents, tva_amount_cents, tenant_id, created_at) FROM stdin;
\.


--
-- TOC entry 5964 (class 0 OID 114726)
-- Dependencies: 264
-- Data for Name: tva_declarations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tva_declarations (id, year, quarter, start_date, end_date, due_date, total_ht_cents, total_tva_collected_cents, total_tva_deductible_cents, net_tva_due_cents, status, submitted_at, validated_at, tenant_id, created_at, created_by, validated_by) FROM stdin;
\.


--
-- TOC entry 5962 (class 0 OID 114712)
-- Dependencies: 262
-- Data for Name: tva_rates; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tva_rates (id, taux, label, is_active, valid_from, valid_to, tenant_id, created_at) FROM stdin;
1	20.00	TVA 20% (Standard)	t	2024-01-01	\N	default-shop	2026-06-01 18:41:58.056086
2	14.00	TVA 14% (Réduit)	t	2024-01-01	\N	default-shop	2026-06-01 18:41:58.056086
3	10.00	TVA 10% (Réduit)	t	2024-01-01	\N	default-shop	2026-06-01 18:41:58.056086
4	7.00	TVA 7% (Réduit)	t	2024-01-01	\N	default-shop	2026-06-01 18:41:58.056086
5	0.00	TVA 0% (Exonéré)	t	2024-01-01	\N	default-shop	2026-06-01 18:41:58.056086
\.


--
-- TOC entry 5923 (class 0 OID 113104)
-- Dependencies: 223
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, email, password_hash, first_name, last_name, created_at, updated_at, tenant_id, role, refresh_token_hash, last_login, is_active) FROM stdin;
108a5dc8-2c46-4748-bdcb-b729df8870d5	paris@optique.com	temp_hash_1779023476614	Paris	Shop	2026-05-17 15:11:16.610249	2026-05-17 15:11:16.610249	shop-paris	optician	\N	\N	t
808b90c9-cb7b-4394-842a-dfcf1b1dfd8a	manager@paris.com	temp_hash_1779023476623	Jean	Dupont	2026-05-17 15:11:16.623209	2026-05-17 15:11:16.623209	shop-paris	optician	\N	\N	t
bc96abf3-5a03-423b-be28-9cbb5b919c58	lyon@optique.com	temp_hash_1779023476627	Lyon	Shop	2026-05-17 15:11:16.627748	2026-05-17 15:11:16.627748	shop-lyon	optician	\N	\N	t
bfe27498-d5a4-452a-a093-5d35596946de	manager@lyon.com	temp_hash_1779023476631	Marie	Martin	2026-05-17 15:11:16.631192	2026-05-17 15:11:16.631192	shop-lyon	optician	\N	\N	t
3fe8c72b-acc0-48e3-b465-0771321e69b5	marseille@optique.com	temp_hash_1779023476634	Marseille	Shop	2026-05-17 15:11:16.634577	2026-05-17 15:11:16.634577	shop-marseille	optician	\N	\N	t
0f6e4f52-be0e-441c-9460-a7d156738467	contact@shop-paris.com	temp_hash_1779023587324	Paris	Shop	2026-05-17 15:13:07.324493	2026-05-17 15:13:07.324493	shop-paris-001	optician	\N	\N	t
7446293c-7ab8-4500-b79b-e66ffefa11c8	contact@shop-lyon.com	temp_hash_1779023587334	Lyon	Shop	2026-05-17 15:13:07.334824	2026-05-17 15:13:07.334824	shop-lyon-002	optician	\N	\N	t
a1f8dd45-a828-481f-89a3-77b19d6cbd66	user1@shop-paris.com	temp_hash_1779023587357	User	1	2026-05-17 15:13:07.357375	2026-05-17 15:13:07.357375	shop-paris-001	optician	\N	\N	t
b0b314b6-3e07-4453-a594-5f3dd7787582	user2@shop-paris.com	temp_hash_1779023587360	User	2	2026-05-17 15:13:07.360804	2026-05-17 15:13:07.360804	shop-paris-001	optician	\N	\N	t
03865d62-9236-4be6-8117-e10be690aded	user3@shop-paris.com	temp_hash_1779023587363	User	3	2026-05-17 15:13:07.36332	2026-05-17 15:13:07.36332	shop-paris-001	optician	\N	\N	t
20a2f292-0af6-4cf7-81f8-08e75997a797	user1@shop-lyon.com	temp_hash_1779023587365	User	1	2026-05-17 15:13:07.366027	2026-05-17 15:13:07.366027	shop-lyon-002	optician	\N	\N	t
d6bd30e9-33d1-4181-916c-197cbca6cc0a	user2@shop-lyon.com	temp_hash_1779023587367	User	2	2026-05-17 15:13:07.368	2026-05-17 15:13:07.368	shop-lyon-002	optician	\N	\N	t
8e7f8118-1945-4483-8e4f-22797fd5137f	admin@optiquev7.com	$2b$10$Xp7yeC2cp4PzoodtA/vGVOmm7iPrAm/zXjSmhrnPjCcZcqaki.J7m	Admin	Principal	2026-06-01 13:30:53.712207	2026-06-01 13:30:53.712207	default-shop	admin	$2b$10$PjzRfF7AYYsQxKkiqEQDBuK52XInobjC48..iLcK4F0CSA1mA1vjG	2026-06-05 19:20:03.968807	t
\.


--
-- TOC entry 6040 (class 0 OID 0)
-- Dependencies: 269
-- Name: accounting_journal_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.accounting_journal_id_seq', 24, true);


--
-- TOC entry 6041 (class 0 OID 0)
-- Dependencies: 267
-- Name: alerts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.alerts_id_seq', 1, false);


--
-- TOC entry 6042 (class 0 OID 0)
-- Dependencies: 252
-- Name: company_settings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.company_settings_id_seq', 1, true);


--
-- TOC entry 6043 (class 0 OID 0)
-- Dependencies: 254
-- Name: document_sequences_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.document_sequences_id_seq', 20, true);


--
-- TOC entry 6044 (class 0 OID 0)
-- Dependencies: 293
-- Name: migration_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.migration_log_id_seq', 4, true);


--
-- TOC entry 6045 (class 0 OID 0)
-- Dependencies: 271
-- Name: payment_reminders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.payment_reminders_id_seq', 1, false);


--
-- TOC entry 6046 (class 0 OID 0)
-- Dependencies: 258
-- Name: permissions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.permissions_id_seq', 30, true);


--
-- TOC entry 6047 (class 0 OID 0)
-- Dependencies: 256
-- Name: roles_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.roles_id_seq', 3, true);


--
-- TOC entry 6048 (class 0 OID 0)
-- Dependencies: 250
-- Name: supplier_order_events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.supplier_order_events_id_seq', 8, true);


--
-- TOC entry 6049 (class 0 OID 0)
-- Dependencies: 265
-- Name: tva_declaration_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.tva_declaration_items_id_seq', 1, false);


--
-- TOC entry 6050 (class 0 OID 0)
-- Dependencies: 263
-- Name: tva_declarations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.tva_declarations_id_seq', 2, true);


--
-- TOC entry 6051 (class 0 OID 0)
-- Dependencies: 261
-- Name: tva_rates_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.tva_rates_id_seq', 5, true);


--
-- TOC entry 5639 (class 2606 OID 114806)
-- Name: accounting_journal accounting_journal_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accounting_journal
    ADD CONSTRAINT accounting_journal_pkey PRIMARY KEY (id);


--
-- TOC entry 5637 (class 2606 OID 114784)
-- Name: alerts alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_pkey PRIMARY KEY (id);


--
-- TOC entry 5649 (class 2606 OID 115369)
-- Name: amortissements amortissements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.amortissements
    ADD CONSTRAINT amortissements_pkey PRIMARY KEY (id);


--
-- TOC entry 5530 (class 2606 OID 113631)
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- TOC entry 5532 (class 2606 OID 113932)
-- Name: clients clients_tenant_id_phone_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_tenant_id_phone_key UNIQUE (tenant_id, phone);


--
-- TOC entry 5526 (class 2606 OID 113575)
-- Name: coating_pricing coating_pricing_coating_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coating_pricing
    ADD CONSTRAINT coating_pricing_coating_code_key UNIQUE (coating_code);


--
-- TOC entry 5528 (class 2606 OID 113573)
-- Name: coating_pricing coating_pricing_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coating_pricing
    ADD CONSTRAINT coating_pricing_pkey PRIMARY KEY (id);


--
-- TOC entry 5502 (class 2606 OID 113310)
-- Name: coatings coatings_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coatings
    ADD CONSTRAINT coatings_code_key UNIQUE (code);


--
-- TOC entry 5504 (class 2606 OID 113308)
-- Name: coatings coatings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coatings
    ADD CONSTRAINT coatings_pkey PRIMARY KEY (id);


--
-- TOC entry 5611 (class 2606 OID 114629)
-- Name: company_settings company_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.company_settings
    ADD CONSTRAINT company_settings_pkey PRIMARY KEY (id);


--
-- TOC entry 5703 (class 2606 OID 116093)
-- Name: core_invoice_items core_invoice_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.core_invoice_items
    ADD CONSTRAINT core_invoice_items_pkey PRIMARY KEY (id);


--
-- TOC entry 5693 (class 2606 OID 116067)
-- Name: core_invoices core_invoices_invoice_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.core_invoices
    ADD CONSTRAINT core_invoices_invoice_number_key UNIQUE (invoice_number);


--
-- TOC entry 5695 (class 2606 OID 116065)
-- Name: core_invoices core_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.core_invoices
    ADD CONSTRAINT core_invoices_pkey PRIMARY KEY (id);


--
-- TOC entry 5678 (class 2606 OID 115869)
-- Name: core_optical_job core_optical_job_job_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.core_optical_job
    ADD CONSTRAINT core_optical_job_job_number_key UNIQUE (job_number);


--
-- TOC entry 5680 (class 2606 OID 115867)
-- Name: core_optical_job core_optical_job_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.core_optical_job
    ADD CONSTRAINT core_optical_job_pkey PRIMARY KEY (id);


--
-- TOC entry 5706 (class 2606 OID 116114)
-- Name: core_payments core_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.core_payments
    ADD CONSTRAINT core_payments_pkey PRIMARY KEY (id);


--
-- TOC entry 5674 (class 2606 OID 115832)
-- Name: core_sales_order_item core_sales_order_item_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.core_sales_order_item
    ADD CONSTRAINT core_sales_order_item_pkey PRIMARY KEY (id);


--
-- TOC entry 5664 (class 2606 OID 115809)
-- Name: core_sales_order core_sales_order_order_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.core_sales_order
    ADD CONSTRAINT core_sales_order_order_number_key UNIQUE (order_number);


--
-- TOC entry 5666 (class 2606 OID 115807)
-- Name: core_sales_order core_sales_order_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.core_sales_order
    ADD CONSTRAINT core_sales_order_pkey PRIMARY KEY (id);


--
-- TOC entry 5686 (class 2606 OID 115892)
-- Name: core_supplier_order_lifecycle core_supplier_order_lifecycle_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.core_supplier_order_lifecycle
    ADD CONSTRAINT core_supplier_order_lifecycle_pkey PRIMARY KEY (id);


--
-- TOC entry 5613 (class 2606 OID 114645)
-- Name: document_sequences document_sequences_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.document_sequences
    ADD CONSTRAINT document_sequences_pkey PRIMARY KEY (id);


--
-- TOC entry 5615 (class 2606 OID 114647)
-- Name: document_sequences document_sequences_tenant_id_document_type_year_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.document_sequences
    ADD CONSTRAINT document_sequences_tenant_id_document_type_year_key UNIQUE (tenant_id, document_type, year);


--
-- TOC entry 5647 (class 2606 OID 115357)
-- Name: immobilisations immobilisations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.immobilisations
    ADD CONSTRAINT immobilisations_pkey PRIMARY KEY (id);


--
-- TOC entry 5654 (class 2606 OID 115397)
-- Name: invoice_lines invoice_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoice_lines
    ADD CONSTRAINT invoice_lines_pkey PRIMARY KEY (id);


--
-- TOC entry 5660 (class 2606 OID 115610)
-- Name: lens_orders lens_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lens_orders
    ADD CONSTRAINT lens_orders_pkey PRIMARY KEY (id);


--
-- TOC entry 5522 (class 2606 OID 113562)
-- Name: lens_pricing lens_pricing_lens_type_index_type_material_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lens_pricing
    ADD CONSTRAINT lens_pricing_lens_type_index_type_material_key UNIQUE (lens_type, index_type, material);


--
-- TOC entry 5524 (class 2606 OID 113560)
-- Name: lens_pricing lens_pricing_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lens_pricing
    ADD CONSTRAINT lens_pricing_pkey PRIMARY KEY (id);


--
-- TOC entry 5498 (class 2606 OID 113296)
-- Name: lens_types lens_types_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lens_types
    ADD CONSTRAINT lens_types_code_key UNIQUE (code);


--
-- TOC entry 5500 (class 2606 OID 113294)
-- Name: lens_types lens_types_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lens_types
    ADD CONSTRAINT lens_types_pkey PRIMARY KEY (id);


--
-- TOC entry 5691 (class 2606 OID 115972)
-- Name: migration_log migration_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.migration_log
    ADD CONSTRAINT migration_log_pkey PRIMARY KEY (id);


--
-- TOC entry 5641 (class 2606 OID 114828)
-- Name: payment_reminders payment_reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment_reminders
    ADD CONSTRAINT payment_reminders_pkey PRIMARY KEY (id);


--
-- TOC entry 5540 (class 2606 OID 113717)
-- Name: payments_backup payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments_backup
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- TOC entry 5623 (class 2606 OID 114691)
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);


--
-- TOC entry 5625 (class 2606 OID 114693)
-- Name: permissions permissions_resource_action_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_resource_action_key UNIQUE (resource, action);


--
-- TOC entry 5645 (class 2606 OID 115339)
-- Name: plan_comptable plan_comptable_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plan_comptable
    ADD CONSTRAINT plan_comptable_pkey PRIMARY KEY (id);


--
-- TOC entry 5535 (class 2606 OID 113646)
-- Name: prescriptions prescriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.prescriptions
    ADD CONSTRAINT prescriptions_pkey PRIMARY KEY (id);


--
-- TOC entry 5542 (class 2606 OID 113749)
-- Name: price_grid price_grid_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.price_grid
    ADD CONSTRAINT price_grid_pkey PRIMARY KEY (id);


--
-- TOC entry 5567 (class 2606 OID 114273)
-- Name: product_images product_images_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_images
    ADD CONSTRAINT product_images_pkey PRIMARY KEY (id);


--
-- TOC entry 5583 (class 2606 OID 114333)
-- Name: product_price_history product_price_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_price_history
    ADD CONSTRAINT product_price_history_pkey PRIMARY KEY (id);


--
-- TOC entry 5577 (class 2606 OID 114312)
-- Name: product_related product_related_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_related
    ADD CONSTRAINT product_related_pkey PRIMARY KEY (id);


--
-- TOC entry 5579 (class 2606 OID 114314)
-- Name: product_related product_related_product_id_related_product_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_related
    ADD CONSTRAINT product_related_product_id_related_product_id_key UNIQUE (product_id, related_product_id);


--
-- TOC entry 5586 (class 2606 OID 114353)
-- Name: product_tags product_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_tags
    ADD CONSTRAINT product_tags_pkey PRIMARY KEY (id);


--
-- TOC entry 5588 (class 2606 OID 114355)
-- Name: product_tags product_tags_product_id_tag_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_tags
    ADD CONSTRAINT product_tags_product_id_tag_key UNIQUE (product_id, tag);


--
-- TOC entry 5572 (class 2606 OID 114294)
-- Name: product_variants product_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_pkey PRIMARY KEY (id);


--
-- TOC entry 5574 (class 2606 OID 114296)
-- Name: product_variants product_variants_sku_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_sku_key UNIQUE (sku);


--
-- TOC entry 5490 (class 2606 OID 113207)
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- TOC entry 5710 (class 2606 OID 116251)
-- Name: purchase_order_events purchase_order_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchase_order_events
    ADD CONSTRAINT purchase_order_events_pkey PRIMARY KEY (id);


--
-- TOC entry 5627 (class 2606 OID 114700)
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (role_id, permission_id);


--
-- TOC entry 5619 (class 2606 OID 114678)
-- Name: roles roles_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_name_key UNIQUE (name);


--
-- TOC entry 5621 (class 2606 OID 114676)
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- TOC entry 5496 (class 2606 OID 113231)
-- Name: sale_items sale_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_pkey PRIMARY KEY (id);


--
-- TOC entry 5493 (class 2606 OID 113220)
-- Name: sales sales_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_pkey PRIMARY KEY (id);


--
-- TOC entry 5662 (class 2606 OID 115783)
-- Name: schema_cartography schema_cartography_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.schema_cartography
    ADD CONSTRAINT schema_cartography_pkey PRIMARY KEY (id);


--
-- TOC entry 5552 (class 2606 OID 113953)
-- Name: stock_movements stock_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_pkey PRIMARY KEY (id);


--
-- TOC entry 5596 (class 2606 OID 114449)
-- Name: supplier_credit_notes supplier_credit_notes_credit_note_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_credit_notes
    ADD CONSTRAINT supplier_credit_notes_credit_note_number_key UNIQUE (credit_note_number);


--
-- TOC entry 5598 (class 2606 OID 114447)
-- Name: supplier_credit_notes supplier_credit_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_credit_notes
    ADD CONSTRAINT supplier_credit_notes_pkey PRIMARY KEY (id);


--
-- TOC entry 5537 (class 2606 OID 113698)
-- Name: supplier_invoice_items supplier_invoice_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_invoice_items
    ADD CONSTRAINT supplier_invoice_items_pkey PRIMARY KEY (id);


--
-- TOC entry 5558 (class 2606 OID 113988)
-- Name: supplier_invoices supplier_invoices_invoice_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_invoices
    ADD CONSTRAINT supplier_invoices_invoice_number_key UNIQUE (invoice_number);


--
-- TOC entry 5560 (class 2606 OID 113986)
-- Name: supplier_invoices supplier_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_invoices
    ADD CONSTRAINT supplier_invoices_pkey PRIMARY KEY (id);


--
-- TOC entry 5594 (class 2606 OID 114410)
-- Name: supplier_order_disputes supplier_order_disputes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_order_disputes
    ADD CONSTRAINT supplier_order_disputes_pkey PRIMARY KEY (id);


--
-- TOC entry 5609 (class 2606 OID 114550)
-- Name: supplier_order_events supplier_order_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_order_events
    ADD CONSTRAINT supplier_order_events_pkey PRIMARY KEY (id);


--
-- TOC entry 5591 (class 2606 OID 114388)
-- Name: supplier_order_history supplier_order_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_order_history
    ADD CONSTRAINT supplier_order_history_pkey PRIMARY KEY (id);


--
-- TOC entry 5563 (class 2606 OID 114235)
-- Name: supplier_order_issues supplier_order_issues_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_order_issues
    ADD CONSTRAINT supplier_order_issues_pkey PRIMARY KEY (id);


--
-- TOC entry 5516 (class 2606 OID 113547)
-- Name: supplier_orders supplier_orders_order_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_orders
    ADD CONSTRAINT supplier_orders_order_id_key UNIQUE (order_id);


--
-- TOC entry 5518 (class 2606 OID 113936)
-- Name: supplier_orders supplier_orders_order_id_key1; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_orders
    ADD CONSTRAINT supplier_orders_order_id_key1 UNIQUE (order_id);


--
-- TOC entry 5520 (class 2606 OID 113545)
-- Name: supplier_orders supplier_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_orders
    ADD CONSTRAINT supplier_orders_pkey PRIMARY KEY (id);


--
-- TOC entry 5600 (class 2606 OID 114475)
-- Name: supplier_replacements supplier_replacements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_replacements
    ADD CONSTRAINT supplier_replacements_pkey PRIMARY KEY (id);


--
-- TOC entry 5602 (class 2606 OID 114477)
-- Name: supplier_replacements supplier_replacements_replacement_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_replacements
    ADD CONSTRAINT supplier_replacements_replacement_number_key UNIQUE (replacement_number);


--
-- TOC entry 5544 (class 2606 OID 113765)
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);


--
-- TOC entry 5546 (class 2606 OID 113934)
-- Name: suppliers suppliers_tenant_id_ice_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_tenant_id_ice_key UNIQUE (tenant_id, ice);


--
-- TOC entry 5635 (class 2606 OID 114763)
-- Name: tva_declaration_items tva_declaration_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tva_declaration_items
    ADD CONSTRAINT tva_declaration_items_pkey PRIMARY KEY (id);


--
-- TOC entry 5631 (class 2606 OID 114744)
-- Name: tva_declarations tva_declarations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tva_declarations
    ADD CONSTRAINT tva_declarations_pkey PRIMARY KEY (id);


--
-- TOC entry 5633 (class 2606 OID 114746)
-- Name: tva_declarations tva_declarations_year_quarter_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tva_declarations
    ADD CONSTRAINT tva_declarations_year_quarter_tenant_id_key UNIQUE (year, quarter, tenant_id);


--
-- TOC entry 5629 (class 2606 OID 114724)
-- Name: tva_rates tva_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tva_rates
    ADD CONSTRAINT tva_rates_pkey PRIMARY KEY (id);


--
-- TOC entry 5548 (class 2606 OID 113939)
-- Name: suppliers unique_ice; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT unique_ice UNIQUE (tenant_id, ice);


--
-- TOC entry 5701 (class 2606 OID 116145)
-- Name: core_invoices unique_invoice_number; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.core_invoices
    ADD CONSTRAINT unique_invoice_number UNIQUE (invoice_number);


--
-- TOC entry 5617 (class 2606 OID 116147)
-- Name: document_sequences uq_document_sequences; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.document_sequences
    ADD CONSTRAINT uq_document_sequences UNIQUE (tenant_id, document_type, year);


--
-- TOC entry 5478 (class 2606 OID 113118)
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- TOC entry 5480 (class 2606 OID 113116)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- TOC entry 5533 (class 1259 OID 115742)
-- Name: idx_clients_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_clients_tenant ON public.clients USING btree (tenant_id);


--
-- TOC entry 5704 (class 1259 OID 116128)
-- Name: idx_core_invoice_items_invoice; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_core_invoice_items_invoice ON public.core_invoice_items USING btree (invoice_id);


--
-- TOC entry 5696 (class 1259 OID 116126)
-- Name: idx_core_invoices_client; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_core_invoices_client ON public.core_invoices USING btree (client_id);


--
-- TOC entry 5697 (class 1259 OID 116127)
-- Name: idx_core_invoices_number; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_core_invoices_number ON public.core_invoices USING btree (invoice_number);


--
-- TOC entry 5698 (class 1259 OID 116125)
-- Name: idx_core_invoices_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_core_invoices_order ON public.core_invoices USING btree (order_id);


--
-- TOC entry 5681 (class 1259 OID 115872)
-- Name: idx_core_optical_job_client; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_core_optical_job_client ON public.core_optical_job USING btree (client_id);


--
-- TOC entry 5682 (class 1259 OID 115874)
-- Name: idx_core_optical_job_sales_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_core_optical_job_sales_order ON public.core_optical_job USING btree (sales_order_id);


--
-- TOC entry 5683 (class 1259 OID 115873)
-- Name: idx_core_optical_job_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_core_optical_job_status ON public.core_optical_job USING btree (job_status);


--
-- TOC entry 5684 (class 1259 OID 115871)
-- Name: idx_core_optical_job_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_core_optical_job_tenant ON public.core_optical_job USING btree (tenant_id);


--
-- TOC entry 5707 (class 1259 OID 116129)
-- Name: idx_core_payments_invoice; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_core_payments_invoice ON public.core_payments USING btree (invoice_id);


--
-- TOC entry 5675 (class 1259 OID 115843)
-- Name: idx_core_sales_item_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_core_sales_item_order ON public.core_sales_order_item USING btree (sales_order_id);


--
-- TOC entry 5676 (class 1259 OID 115844)
-- Name: idx_core_sales_item_product; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_core_sales_item_product ON public.core_sales_order_item USING btree (product_id);


--
-- TOC entry 5667 (class 1259 OID 115839)
-- Name: idx_core_sales_order_client; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_core_sales_order_client ON public.core_sales_order USING btree (client_id);


--
-- TOC entry 5668 (class 1259 OID 115840)
-- Name: idx_core_sales_order_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_core_sales_order_date ON public.core_sales_order USING btree (order_date);


--
-- TOC entry 5669 (class 1259 OID 115842)
-- Name: idx_core_sales_order_number; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_core_sales_order_number ON public.core_sales_order USING btree (order_number);


--
-- TOC entry 5670 (class 1259 OID 116206)
-- Name: idx_core_sales_order_prescription; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_core_sales_order_prescription ON public.core_sales_order USING btree (prescription_id);


--
-- TOC entry 5671 (class 1259 OID 115841)
-- Name: idx_core_sales_order_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_core_sales_order_status ON public.core_sales_order USING btree (status);


--
-- TOC entry 5672 (class 1259 OID 115838)
-- Name: idx_core_sales_order_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_core_sales_order_tenant ON public.core_sales_order USING btree (tenant_id);


--
-- TOC entry 5687 (class 1259 OID 115895)
-- Name: idx_core_supplier_lifecycle_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_core_supplier_lifecycle_date ON public.core_supplier_order_lifecycle USING btree (created_at);


--
-- TOC entry 5688 (class 1259 OID 115893)
-- Name: idx_core_supplier_lifecycle_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_core_supplier_lifecycle_order ON public.core_supplier_order_lifecycle USING btree (supplier_order_id);


--
-- TOC entry 5689 (class 1259 OID 115894)
-- Name: idx_core_supplier_lifecycle_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_core_supplier_lifecycle_status ON public.core_supplier_order_lifecycle USING btree (status);


--
-- TOC entry 5603 (class 1259 OID 114560)
-- Name: idx_events_order_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_events_order_id ON public.supplier_order_events USING btree (supplier_order_id);


--
-- TOC entry 5604 (class 1259 OID 114563)
-- Name: idx_events_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_events_tenant ON public.supplier_order_events USING btree (tenant_id);


--
-- TOC entry 5650 (class 1259 OID 115398)
-- Name: idx_invoice_lines_invoice; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_invoice_lines_invoice ON public.invoice_lines USING btree (invoice_id, invoice_type);


--
-- TOC entry 5651 (class 1259 OID 115400)
-- Name: idx_invoice_lines_tax_rate; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_invoice_lines_tax_rate ON public.invoice_lines USING btree (tax_rate);


--
-- TOC entry 5652 (class 1259 OID 115399)
-- Name: idx_invoice_lines_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_invoice_lines_tenant ON public.invoice_lines USING btree (tenant_id);


--
-- TOC entry 5655 (class 1259 OID 115612)
-- Name: idx_lens_orders_client; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lens_orders_client ON public.lens_orders USING btree (client_id);


--
-- TOC entry 5656 (class 1259 OID 115611)
-- Name: idx_lens_orders_sales_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lens_orders_sales_order ON public.lens_orders USING btree (sales_order_id);


--
-- TOC entry 5657 (class 1259 OID 115613)
-- Name: idx_lens_orders_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lens_orders_status ON public.lens_orders USING btree (status);


--
-- TOC entry 5658 (class 1259 OID 115614)
-- Name: idx_lens_orders_supplier; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lens_orders_supplier ON public.lens_orders USING btree (supplier_id);


--
-- TOC entry 5538 (class 1259 OID 115741)
-- Name: idx_payments_invoice; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payments_invoice ON public.payments_backup USING btree (invoice_id);


--
-- TOC entry 5642 (class 1259 OID 115376)
-- Name: idx_plan_comptable_account_number; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_plan_comptable_account_number ON public.plan_comptable USING btree (account_number);


--
-- TOC entry 5643 (class 1259 OID 115375)
-- Name: idx_plan_comptable_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_plan_comptable_tenant ON public.plan_comptable USING btree (tenant_id);


--
-- TOC entry 5580 (class 1259 OID 114345)
-- Name: idx_price_history_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_price_history_date ON public.product_price_history USING btree (changed_at);


--
-- TOC entry 5581 (class 1259 OID 114344)
-- Name: idx_price_history_product; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_price_history_product ON public.product_price_history USING btree (product_id);


--
-- TOC entry 5564 (class 1259 OID 114280)
-- Name: idx_product_images_primary; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_product_images_primary ON public.product_images USING btree (product_id, is_primary);


--
-- TOC entry 5565 (class 1259 OID 114279)
-- Name: idx_product_images_product; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_product_images_product ON public.product_images USING btree (product_id);


--
-- TOC entry 5575 (class 1259 OID 114325)
-- Name: idx_product_related_product; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_product_related_product ON public.product_related USING btree (product_id);


--
-- TOC entry 5584 (class 1259 OID 114361)
-- Name: idx_product_tags_tag; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_product_tags_tag ON public.product_tags USING btree (tag);


--
-- TOC entry 5568 (class 1259 OID 114303)
-- Name: idx_product_variants_barcode; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_product_variants_barcode ON public.product_variants USING btree (barcode);


--
-- TOC entry 5569 (class 1259 OID 114304)
-- Name: idx_product_variants_product; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_product_variants_product ON public.product_variants USING btree (product_id);


--
-- TOC entry 5570 (class 1259 OID 114302)
-- Name: idx_product_variants_sku; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_product_variants_sku ON public.product_variants USING btree (sku);


--
-- TOC entry 5481 (class 1259 OID 114258)
-- Name: idx_products_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_products_active ON public.products USING btree (is_active);


--
-- TOC entry 5482 (class 1259 OID 114254)
-- Name: idx_products_barcode; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_products_barcode ON public.products USING btree (barcode);


--
-- TOC entry 5483 (class 1259 OID 114259)
-- Name: idx_products_featured; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_products_featured ON public.products USING btree (is_featured);


--
-- TOC entry 5484 (class 1259 OID 114255)
-- Name: idx_products_frame_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_products_frame_type ON public.products USING btree (frame_type);


--
-- TOC entry 5485 (class 1259 OID 114256)
-- Name: idx_products_gender; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_products_gender ON public.products USING btree (gender);


--
-- TOC entry 5486 (class 1259 OID 114257)
-- Name: idx_products_material; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_products_material ON public.products USING btree (material);


--
-- TOC entry 5487 (class 1259 OID 114253)
-- Name: idx_products_sku; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_products_sku ON public.products USING btree (sku);


--
-- TOC entry 5488 (class 1259 OID 113242)
-- Name: idx_products_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_products_tenant ON public.products USING btree (tenant_id);


--
-- TOC entry 5708 (class 1259 OID 116257)
-- Name: idx_purchase_order_events_supplier_order_id_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_purchase_order_events_supplier_order_id_created_at ON public.purchase_order_events USING btree (supplier_order_id, created_at);


--
-- TOC entry 5494 (class 1259 OID 113244)
-- Name: idx_sale_items_sale; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_sale_items_sale ON public.sale_items USING btree (sale_id);


--
-- TOC entry 5491 (class 1259 OID 113243)
-- Name: idx_sales_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_sales_tenant ON public.sales USING btree (tenant_id);


--
-- TOC entry 5549 (class 1259 OID 114363)
-- Name: idx_stock_movements_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_stock_movements_date ON public.stock_movements USING btree (created_at);


--
-- TOC entry 5550 (class 1259 OID 114362)
-- Name: idx_stock_movements_product; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_stock_movements_product ON public.stock_movements USING btree (product_id);


--
-- TOC entry 5553 (class 1259 OID 115740)
-- Name: idx_supplier_invoices_date_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_supplier_invoices_date_tenant ON public.supplier_invoices USING btree (tenant_id, invoice_date, payment_status);


--
-- TOC entry 5554 (class 1259 OID 114001)
-- Name: idx_supplier_invoices_number; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_supplier_invoices_number ON public.supplier_invoices USING btree (invoice_number);


--
-- TOC entry 5555 (class 1259 OID 113999)
-- Name: idx_supplier_invoices_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_supplier_invoices_order ON public.supplier_invoices USING btree (order_id);


--
-- TOC entry 5556 (class 1259 OID 114000)
-- Name: idx_supplier_invoices_supplier; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_supplier_invoices_supplier ON public.supplier_invoices USING btree (supplier_id);


--
-- TOC entry 5592 (class 1259 OID 114425)
-- Name: idx_supplier_order_disputes_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_supplier_order_disputes_order ON public.supplier_order_disputes USING btree (supplier_order_id);


--
-- TOC entry 5605 (class 1259 OID 114556)
-- Name: idx_supplier_order_events_order_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_supplier_order_events_order_id ON public.supplier_order_events USING btree (supplier_order_id);


--
-- TOC entry 5606 (class 1259 OID 114562)
-- Name: idx_supplier_order_events_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_supplier_order_events_tenant ON public.supplier_order_events USING btree (tenant_id);


--
-- TOC entry 5607 (class 1259 OID 114558)
-- Name: idx_supplier_order_events_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_supplier_order_events_type ON public.supplier_order_events USING btree (event_type);


--
-- TOC entry 5589 (class 1259 OID 114424)
-- Name: idx_supplier_order_history_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_supplier_order_history_order ON public.supplier_order_history USING btree (supplier_order_id);


--
-- TOC entry 5561 (class 1259 OID 114242)
-- Name: idx_supplier_order_issues_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_supplier_order_issues_order ON public.supplier_order_issues USING btree (supplier_order_id);


--
-- TOC entry 5505 (class 1259 OID 114422)
-- Name: idx_supplier_orders_logistic; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_supplier_orders_logistic ON public.supplier_orders USING btree (logistic_status);


--
-- TOC entry 5506 (class 1259 OID 113577)
-- Name: idx_supplier_orders_order_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_supplier_orders_order_id ON public.supplier_orders USING btree (order_id);


--
-- TOC entry 5507 (class 1259 OID 114376)
-- Name: idx_supplier_orders_order_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_supplier_orders_order_type ON public.supplier_orders USING btree (order_type);


--
-- TOC entry 5508 (class 1259 OID 114423)
-- Name: idx_supplier_orders_quality; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_supplier_orders_quality ON public.supplier_orders USING btree (quality_status);


--
-- TOC entry 5509 (class 1259 OID 114219)
-- Name: idx_supplier_orders_received; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_supplier_orders_received ON public.supplier_orders USING btree (received_at);


--
-- TOC entry 5510 (class 1259 OID 114203)
-- Name: idx_supplier_orders_sales_order_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_supplier_orders_sales_order_id ON public.supplier_orders USING btree (sales_order_id);


--
-- TOC entry 5511 (class 1259 OID 114375)
-- Name: idx_supplier_orders_source_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_supplier_orders_source_type ON public.supplier_orders USING btree (source_type);


--
-- TOC entry 5512 (class 1259 OID 113578)
-- Name: idx_supplier_orders_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_supplier_orders_status ON public.supplier_orders USING btree (status);


--
-- TOC entry 5513 (class 1259 OID 114241)
-- Name: idx_supplier_orders_status_quality; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_supplier_orders_status_quality ON public.supplier_orders USING btree (status, tenant_id);


--
-- TOC entry 5514 (class 1259 OID 114204)
-- Name: idx_supplier_orders_status_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_supplier_orders_status_tenant ON public.supplier_orders USING btree (status, tenant_id);


--
-- TOC entry 5699 (class 1259 OID 116148)
-- Name: idx_unique_invoice_per_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_unique_invoice_per_order ON public.core_invoices USING btree (order_id) WHERE (order_id IS NOT NULL);


--
-- TOC entry 5476 (class 1259 OID 113120)
-- Name: idx_users_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_tenant ON public.users USING btree (tenant_id);


--
-- TOC entry 5754 (class 2620 OID 114367)
-- Name: products log_product_price_changes; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER log_product_price_changes AFTER UPDATE OF price_cents ON public.products FOR EACH ROW EXECUTE FUNCTION public.log_price_change();


--
-- TOC entry 5757 (class 2620 OID 116026)
-- Name: lens_orders trigger_sync_lens_order_to_core; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_sync_lens_order_to_core AFTER INSERT OR UPDATE ON public.lens_orders FOR EACH ROW EXECUTE FUNCTION public.sync_lens_order_to_core();


--
-- TOC entry 5758 (class 2620 OID 115627)
-- Name: lens_orders trigger_update_lens_order_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_lens_order_timestamp BEFORE UPDATE ON public.lens_orders FOR EACH ROW EXECUTE FUNCTION public.update_lens_order_timestamp();


--
-- TOC entry 5759 (class 2620 OID 115629)
-- Name: lens_orders trigger_validate_lens_order; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_validate_lens_order BEFORE INSERT OR UPDATE ON public.lens_orders FOR EACH ROW EXECUTE FUNCTION public.link_lens_order_to_sale();


--
-- TOC entry 5756 (class 2620 OID 114365)
-- Name: product_variants update_product_variants_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_product_variants_updated_at BEFORE UPDATE ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 5755 (class 2620 OID 114364)
-- Name: products update_products_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 5744 (class 2606 OID 114807)
-- Name: accounting_journal accounting_journal_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accounting_journal
    ADD CONSTRAINT accounting_journal_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- TOC entry 5743 (class 2606 OID 114785)
-- Name: alerts alerts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- TOC entry 5745 (class 2606 OID 115370)
-- Name: amortissements amortissements_immobilisation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.amortissements
    ADD CONSTRAINT amortissements_immobilisation_id_fkey FOREIGN KEY (immobilisation_id) REFERENCES public.immobilisations(id);


--
-- TOC entry 5749 (class 2606 OID 116094)
-- Name: core_invoice_items core_invoice_items_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.core_invoice_items
    ADD CONSTRAINT core_invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.core_invoices(id) ON DELETE CASCADE;


--
-- TOC entry 5750 (class 2606 OID 116099)
-- Name: core_invoice_items core_invoice_items_order_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.core_invoice_items
    ADD CONSTRAINT core_invoice_items_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.core_sales_order_item(id);


--
-- TOC entry 5748 (class 2606 OID 116068)
-- Name: core_invoices core_invoices_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.core_invoices
    ADD CONSTRAINT core_invoices_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.core_sales_order(id);


--
-- TOC entry 5751 (class 2606 OID 116115)
-- Name: core_payments core_payments_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.core_payments
    ADD CONSTRAINT core_payments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.core_invoices(id);


--
-- TOC entry 5752 (class 2606 OID 116120)
-- Name: core_payments core_payments_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.core_payments
    ADD CONSTRAINT core_payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.core_sales_order(id);


--
-- TOC entry 5747 (class 2606 OID 115833)
-- Name: core_sales_order_item core_sales_order_item_sales_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.core_sales_order_item
    ADD CONSTRAINT core_sales_order_item_sales_order_id_fkey FOREIGN KEY (sales_order_id) REFERENCES public.core_sales_order(id) ON DELETE CASCADE;


--
-- TOC entry 5746 (class 2606 OID 116200)
-- Name: core_sales_order core_sales_order_prescription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.core_sales_order
    ADD CONSTRAINT core_sales_order_prescription_id_fkey FOREIGN KEY (prescription_id) REFERENCES public.prescriptions(id);


--
-- TOC entry 5716 (class 2606 OID 113959)
-- Name: prescriptions fk_prescription_client; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.prescriptions
    ADD CONSTRAINT fk_prescription_client FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- TOC entry 5717 (class 2606 OID 115322)
-- Name: payments_backup payments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments_backup
    ADD CONSTRAINT payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- TOC entry 5722 (class 2606 OID 114274)
-- Name: product_images product_images_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_images
    ADD CONSTRAINT product_images_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- TOC entry 5726 (class 2606 OID 114334)
-- Name: product_price_history product_price_history_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_price_history
    ADD CONSTRAINT product_price_history_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- TOC entry 5727 (class 2606 OID 114339)
-- Name: product_price_history product_price_history_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_price_history
    ADD CONSTRAINT product_price_history_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE CASCADE;


--
-- TOC entry 5724 (class 2606 OID 114315)
-- Name: product_related product_related_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_related
    ADD CONSTRAINT product_related_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- TOC entry 5725 (class 2606 OID 114320)
-- Name: product_related product_related_related_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_related
    ADD CONSTRAINT product_related_related_product_id_fkey FOREIGN KEY (related_product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- TOC entry 5728 (class 2606 OID 114356)
-- Name: product_tags product_tags_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_tags
    ADD CONSTRAINT product_tags_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- TOC entry 5723 (class 2606 OID 114297)
-- Name: product_variants product_variants_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- TOC entry 5711 (class 2606 OID 114369)
-- Name: products products_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- TOC entry 5753 (class 2606 OID 116252)
-- Name: purchase_order_events purchase_order_events_supplier_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchase_order_events
    ADD CONSTRAINT purchase_order_events_supplier_order_id_fkey FOREIGN KEY (supplier_order_id) REFERENCES public.supplier_orders(id) ON DELETE CASCADE;


--
-- TOC entry 5740 (class 2606 OID 114706)
-- Name: role_permissions role_permissions_permission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES public.permissions(id) ON DELETE CASCADE;


--
-- TOC entry 5741 (class 2606 OID 114701)
-- Name: role_permissions role_permissions_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- TOC entry 5713 (class 2606 OID 113237)
-- Name: sale_items sale_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- TOC entry 5714 (class 2606 OID 113232)
-- Name: sale_items sale_items_sale_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.sales(id);


--
-- TOC entry 5712 (class 2606 OID 114655)
-- Name: sales sales_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- TOC entry 5718 (class 2606 OID 113954)
-- Name: stock_movements stock_movements_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- TOC entry 5733 (class 2606 OID 114460)
-- Name: supplier_credit_notes supplier_credit_notes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_credit_notes
    ADD CONSTRAINT supplier_credit_notes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- TOC entry 5734 (class 2606 OID 114450)
-- Name: supplier_credit_notes supplier_credit_notes_supplier_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_credit_notes
    ADD CONSTRAINT supplier_credit_notes_supplier_invoice_id_fkey FOREIGN KEY (supplier_invoice_id) REFERENCES public.supplier_invoices(id);


--
-- TOC entry 5735 (class 2606 OID 114455)
-- Name: supplier_credit_notes supplier_credit_notes_supplier_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_credit_notes
    ADD CONSTRAINT supplier_credit_notes_supplier_order_id_fkey FOREIGN KEY (supplier_order_id) REFERENCES public.supplier_orders(id);


--
-- TOC entry 5719 (class 2606 OID 113994)
-- Name: supplier_invoices supplier_invoices_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_invoices
    ADD CONSTRAINT supplier_invoices_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.supplier_orders(id);


--
-- TOC entry 5720 (class 2606 OID 113989)
-- Name: supplier_invoices supplier_invoices_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_invoices
    ADD CONSTRAINT supplier_invoices_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- TOC entry 5731 (class 2606 OID 114416)
-- Name: supplier_order_disputes supplier_order_disputes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_order_disputes
    ADD CONSTRAINT supplier_order_disputes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- TOC entry 5732 (class 2606 OID 114411)
-- Name: supplier_order_disputes supplier_order_disputes_supplier_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_order_disputes
    ADD CONSTRAINT supplier_order_disputes_supplier_order_id_fkey FOREIGN KEY (supplier_order_id) REFERENCES public.supplier_orders(id) ON DELETE CASCADE;


--
-- TOC entry 5739 (class 2606 OID 114551)
-- Name: supplier_order_events supplier_order_events_supplier_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_order_events
    ADD CONSTRAINT supplier_order_events_supplier_order_id_fkey FOREIGN KEY (supplier_order_id) REFERENCES public.supplier_orders(id) ON DELETE CASCADE;


--
-- TOC entry 5729 (class 2606 OID 114394)
-- Name: supplier_order_history supplier_order_history_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_order_history
    ADD CONSTRAINT supplier_order_history_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- TOC entry 5730 (class 2606 OID 114389)
-- Name: supplier_order_history supplier_order_history_supplier_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_order_history
    ADD CONSTRAINT supplier_order_history_supplier_order_id_fkey FOREIGN KEY (supplier_order_id) REFERENCES public.supplier_orders(id) ON DELETE CASCADE;


--
-- TOC entry 5721 (class 2606 OID 114236)
-- Name: supplier_order_issues supplier_order_issues_supplier_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_order_issues
    ADD CONSTRAINT supplier_order_issues_supplier_order_id_fkey FOREIGN KEY (supplier_order_id) REFERENCES public.supplier_orders(id) ON DELETE CASCADE;


--
-- TOC entry 5715 (class 2606 OID 113766)
-- Name: supplier_orders supplier_orders_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_orders
    ADD CONSTRAINT supplier_orders_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- TOC entry 5736 (class 2606 OID 114488)
-- Name: supplier_replacements supplier_replacements_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_replacements
    ADD CONSTRAINT supplier_replacements_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- TOC entry 5737 (class 2606 OID 114478)
-- Name: supplier_replacements supplier_replacements_original_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_replacements
    ADD CONSTRAINT supplier_replacements_original_invoice_id_fkey FOREIGN KEY (original_invoice_id) REFERENCES public.supplier_invoices(id);


--
-- TOC entry 5738 (class 2606 OID 114483)
-- Name: supplier_replacements supplier_replacements_supplier_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.supplier_replacements
    ADD CONSTRAINT supplier_replacements_supplier_order_id_fkey FOREIGN KEY (supplier_order_id) REFERENCES public.supplier_orders(id);


--
-- TOC entry 5742 (class 2606 OID 114764)
-- Name: tva_declaration_items tva_declaration_items_declaration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tva_declaration_items
    ADD CONSTRAINT tva_declaration_items_declaration_id_fkey FOREIGN KEY (declaration_id) REFERENCES public.tva_declarations(id) ON DELETE CASCADE;


--
-- TOC entry 6006 (class 0 OID 116258)
-- Dependencies: 321 6008
-- Name: purchase_order_financials; Type: MATERIALIZED VIEW DATA; Schema: public; Owner: postgres
--

REFRESH MATERIALIZED VIEW public.purchase_order_financials;


-- Completed on 2026-06-05 19:49:54

--
-- PostgreSQL database dump complete
--

\unrestrict mFRd4ewxXclSCvnHn2zosVTOzS9zWe3bb0Cj0FrejlM55cluddg3zsFg6ykica9

