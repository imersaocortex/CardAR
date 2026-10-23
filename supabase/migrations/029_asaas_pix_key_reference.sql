-- Optional administrative reference; never used to generate automatic Pix charges.
begin;
alter table public.billing_provider_settings add column if not exists asaas_pix_key text;
alter table public.billing_provider_settings add column if not exists asaas_api_key_ciphertext text;
alter table public.billing_provider_settings drop constraint if exists asaas_pix_key_length;
alter table public.billing_provider_settings add constraint asaas_pix_key_length
  check (asaas_pix_key is null or length(asaas_pix_key) between 5 and 255);
commit;
