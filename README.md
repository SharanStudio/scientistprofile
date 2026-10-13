# Scientist Profile

Online entry forms for the quarterly ICMR-NIE Scientist Profile. Static site (plain HTML + ES modules, no build step) backed by Supabase.

- `js/config.js` holds the public Supabase URL and publishable key. Never commit the `sb_secret_` key, the `service_role` key or the database password.
- Data lives in Supabase, never in this repository. Row-level security limits each user to their own rows.
- `vendor/exceljs.min.js` is ExcelJS 4.4.0 (MIT, licence in `vendor/exceljs.LICENSE`). It loads only when the Template button is pressed, from this site itself.
- `js/rules.js` holds the validation rules shared by the entry forms and the Excel upload. `js/import-schema.js` defines the upload sheets and layout.

## Public website fields

Entries can feed the public website. Each entry form (publication, project, award, policy, mentee) ends with a "Show on my public website" box, off by default. A second box, "Feature on the home page", appears once the first is ticked.

- `is_public` and `is_featured` are columns on `entries`. The other website fields (research areas, team, states) are saved in `data`.
- The website reads only the views in the Supabase `site` schema. Private fields never reach them: project amounts, mentee emails, and your profile details.
- Team, research-area and mentee-programme dropdowns come from the tables `teams`, `research_areas` and `mentee_programs` (`js/lookups.js`). Add a row there and it appears in the forms. Manage teams in Supabase.
- Website fields live in a section's `siteFields`, not in `fields`, so the Word export is unaffected. Trainings and teaching are not shown on the website.
- The Excel upload adds its own Yes/No columns for the website boxes, consent and research areas (see `websiteFields` in `js/import-schema.js`). A blank Yes/No cell counts as No.
- Mentees hold the person's email privately. A mentee's name shows on the website only when "agreed to be named" is ticked, but every mentee counts in "officers mentored".
- Achievements (stored as section `award`) is one form with six kinds. In the Word profile, kind "Award" fills Awards and honours, "Institutional recognition" fills International standing and recognition, and "Notable research finding" fills Notable contributions in research. Grants, invited talks and roles are for the website only.
- The old Recognition and Notable contributions sections are retired from the home screen but stay in the database allowed list. Any row saved there earlier still reports in the same Word tables.

## Website page (site owner only)

The owner sees a Website page and the website boxes on entry forms. Everyone else sees neither. Ownership comes from `public.is_site_owner()`. Run `supabase/migrations/20261010_site_owner_website_page.sql` once before using the page.

## Team details (admin only)

The Team details page (`#/team`) manages the tables `teams`, `people` and `team_memberships` that feed the website's Teams page. Only an admin account (`profiles.role = 'admin'`) sees the tile and can write; row-level security enforces this on the server.

- Teams tab: add and edit teams. A team page lists its members, with Add member, Edit, End today and Remove.
- People tab: add and edit people. A person can sit in more than one team. "＋ New person…" on a team page creates a private person on the spot.
- Photos and team images are file paths inside the website assets folder, not uploads. A person's photo shows on the website only when "photo consent" is ticked.
- The web address (slug) is made from the name once, when the record is created, and never changes on edit.
- A team or person with members or projects cannot be deleted. End the membership, or untick "Show on public website".
- `js/team-data.js` holds the field lists and row builders (pure, testable in Node). `js/team.js` holds the page.

## Excel upload

The workbook has nine sheets: Teaching, Field visit, Training, Meeting, Programme support, Peer review, Publication, Mentee and People. Policy, Achievements, Projects, Teams and One-page summaries are entered in the app.

- Publication carries one Yes/No column per research area (read from `research_areas` when the template downloads), plus Show and Feature. Research publications need a DOI and a link.
- Mentee: Show needs the consent column to be Yes.
- People are saved to the `people` table with an `import_id`. Only an admin can import them. Undo leaves any person who now belongs to a team.
- Run `supabase/migrations/20261013_excel_upload_people_and_training.sql` once before using the People sheet. It also removes the `site.training` view.
