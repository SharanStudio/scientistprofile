# Scientist Profile

Online entry forms for the quarterly ICMR-NIE Scientist Profile. Static site (plain HTML + ES modules, no build step) backed by Supabase.

- `js/config.js` holds the public Supabase URL and publishable key. Never commit the `sb_secret_` key, the `service_role` key or the database password.
- Data lives in Supabase, never in this repository. Row-level security limits each user to their own rows.
