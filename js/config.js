// Public values only. The publishable key is safe in a public repo; row-level security protects the data.
// Never put the sb_secret_ key, the service_role key or the database password in this repo.
export const SUPABASE_URL = 'https://rybddalhjrsblkebcnic.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_fs0SUMK0IA5hOe8Qa80FTQ_C6BSCfnz';
// Cloudflare Turnstile site key (public). Leave empty until captcha is switched on in Supabase.
export const TURNSTILE_SITE_KEY = '';
