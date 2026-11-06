-- =====================================================================
-- 0016: GST registration number (TIN) per outlet, printed on receipts
-- Needs 0015 first. Safe to run more than once.
-- =====================================================================
alter table public.outlets add column if not exists gst_number text check (char_length(gst_number) <= 40);
