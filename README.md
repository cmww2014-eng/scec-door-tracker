# SCEC Door Tracker – browser version

Static app (`public/`) + small API (`functions/api`) on **Cloudflare Pages**, data in **Cloudflare D1**, sign-in by **Cloudflare Access**. Free tiers cover this project (D1: 5 GB; Access: 50 users).

## One-time setup (≈20 min)

1. **Cloudflare account** – sign up free at dash.cloudflare.com.
2. **D1 database** – Workers & Pages → D1 → *Create database* → name `door-tracker`.
   Open it → *Console* → paste the contents of `schema.sql` → *Execute*.
   Copy the **Database ID** into `wrangler.toml` (`database_id = ...`) and commit.
3. **Pages project** – Workers & Pages → *Create* → *Pages* → *Connect to Git* → choose this repo.
   Framework preset: *None*. Build command: *(empty)*. Build output directory: `public`.
   Deploy. Note the address, e.g. `scec-door-tracker.pages.dev`.
   (Bindings come from `wrangler.toml`: `DB` → door-tracker, `ADMIN_EMAILS`.)
4. **Lock it down with sign-in** – *Zero Trust* (left menu; pick the free plan) →
   Access → Applications → *Add an application* → *Self-hosted*:
   - Domain: `scec-door-tracker.pages.dev` (add a second entry for `*.scec-door-tracker.pages.dev` to cover preview builds).
   - Policy *Allow*: Include → *Emails* (list each person) or *Emails ending in* `@afry.com`.
   - Login method: *One-time PIN* (code sent by email). Microsoft/Azure AD can be added later for AFRY single sign-on.
5. Open the site, sign in with the email code. Emails in `ADMIN_EMAILS` are owners; owners make other users admins from **Team** in the app.

## Roles
- **Owner** (`ADMIN_EMAILS`) and **Admin**: everything, including editing schedule information and deleting stage history.
- **Member** (anyone let in by Access): progress, checklists, photos, defects, requests.
Permissions are enforced by the API, not just the screen.

## Updating drawings / door data
Replace files in `public/` (e.g. `public/data.json`, drawing PNGs) and push to `main` – Cloudflare redeploys automatically in ~1 minute. Progress, photos and defects live in D1 and are untouched by redeploys.

## Photos
Taken in the app (camera) or uploaded; reduced to max 1600 px (~0.5 MB JPEG) on the phone before upload, stamped with door ref and the date/time taken (from the photo's EXIF where available). Stored in D1.
