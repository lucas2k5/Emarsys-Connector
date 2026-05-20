-- Migration: Add Emarsys Sales Data API columns to orders table
-- Replaces s_channel_source/s_discount with correct Emarsys schema fields

ALTER TABLE orders ADD COLUMN customer TEXT;
ALTER TABLE orders ADD COLUMN s_canal TEXT;
ALTER TABLE orders ADD COLUMN s_loja TEXT;
ALTER TABLE orders ADD COLUMN s_tipo_pagamento TEXT;
ALTER TABLE orders ADD COLUMN s_cupom TEXT;
ALTER TABLE orders ADD COLUMN f_valor_desconto TEXT;
