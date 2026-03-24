-- Migration: Add client_type column to contacts table
-- Date: 2026-03-24
-- Purpose: Separar filas de reprocessamento por ambiente (hope/resort)

ALTER TABLE contacts ADD COLUMN client_type TEXT DEFAULT 'hope';

CREATE INDEX IF NOT EXISTS idx_contacts_client_type ON contacts(client_type);
CREATE INDEX IF NOT EXISTS idx_contacts_status_client_type ON contacts(status, client_type);
