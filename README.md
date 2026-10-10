# Scientist Profile

Online entry forms for the quarterly ICMR-NIE Scientist Profile. Static site (plain HTML + ES modules, no build step) backed by Supabase.

- `js/config.js` holds the public Supabase URL and publishable key. Never commit the `sb_secret_` key, the `service_role` key or the database password.
- Data lives in Supabase, never in this repository. Row-level security limits each user to their own rows.
- `vendor/exceljs.min.js` is ExcelJS 4.4.0 (MIT, licence in `vendor/exceljs.LICENSE`). It loads only when the Template button is pressed, from this site itself.
- `js/rules.js` holds the validation rules shared by the entry forms and the Excel upload. `js/import-schema.js` defines the upload sheets and layout.

## Public website fields

Entries can feed the public website. Each entry form (publication, project, award, teaching, mentee) ends with a "Show on my public website" box, off by default. A second box, "Feature on the home page", appears once the first is ticked.

- `is_public` and `is_featured` are columns on `entries`. The other website fields (research areas, team, states) are saved in `data`.
- The website reads only the views in the Supabase `site` schema. Private fields never reach them: project amounts, mentee emails, and your profile details.
- Team, research-area and mentee-programme dropdowns come from the tables `teams`, `research_areas` and `mentee_programs` (`js/lookups.js`). Add a row there and it appears in the forms. Manage teams in Supabase.
- Website fields live in a section's `siteFields`, not in `fields`, so the Word export and the Excel upload template are unchanged.
- Mentees hold the person's email privately. A mentee's name shows on the website only when "agreed to be named" is ticked, but every mentee counts in "officers mentored".
- Only awards of kind "Award" go into the Word profile. Grants, invited talks and roles are for the website.

## Website page (site owner only)

The owner sees a Website page and the website boxes on entry forms. Everyone else sees neither. Ownership comes from `public.is_site_owner()`. Run `supabase/migrations/20261010_site_owner_website_page.sql` once before using the page.
