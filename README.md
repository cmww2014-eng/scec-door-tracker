# SCEC Door Tracker – browser version

Static app (`public/`) + small API (`functions/api`) on **Cloudflare Pages**, data in **Cloudflare D1**, sign-in by **Cloudflare Access**. Free tiers cover this project (D1: 5 GB; Access: 50 users).

## One-time setup (≈20 min)

1. **Cloudflare account** – sign up free at dash.cloudflare.com.
2. **D1 database** – Workers & Pages → D1 → *Create database* → name `door-tracker`.
   (Tables are created automatically on first use; `schema.sql` is for reference.)
   Copy the **Database ID** into `wrangler.toml` (`database_id = ...`) and commit.
3. **Pages project** – Workers & Pages → *Create* → *Pages* → *Connect to Git* → choose this repo.
   Framework preset: *None*. Build command: *(empty)*. Build output directory: `public`.
   Deploy. Note the address, e.g. `scec-door-tracker.pages.dev`.
   (Bindings come from `wrangler.toml`: `DB` → door-tracker, `ADMIN_EMAILS`.)
4. **Lock it down with sign-in** – *Zero Trust* (left menu; pick the free plan) →
   Access → Applications → *Add an application* → *Self-hosted*:
   - Domain: `scec-door-tracker.pages.dev` (add a second entry for `*.scec-door-tracker.pages.dev` to cover preview builds).
   - Policy *Allow*: Include → *Everyone*. Access only checks the email is real (one-time PIN); the app itself decides who gets in.
   - Login method: *One-time PIN* (code sent by email). Microsoft/Azure AD can be added later for AFRY single sign-on.
5. Open the site, sign in with the email code. Emails in `ADMIN_EMAILS` are owners.

## Letting people in
New people verify their email, then see an access page. They either
- **request access** (with a note of company/role) – admins see the request under **Team** and approve as Member, Viewer or Admin, or refuse; or
- **enter the access code** an admin has set under **Team → Access code** – instant Member access. Change or turn the code off at any time.
Optional: set `AUTO_APPROVE = "@afry.com"` under `[vars]` in `wrangler.toml` to let a whole email domain straight in.
Note every email that signs in uses one of Access's 50 free seats, even if refused.

## Roles
- **Owner** (`ADMIN_EMAILS`) and **Admin**: everything, including editing schedule information and deleting stage history.
- **Member**: progress, checklists, photos, defects, requests.
- **Viewer**: read only.
Permissions are enforced by the API, not just the screen.

## Updating drawings / door data
Replace files in `public/` (e.g. `public/data.json`, drawing PNGs) and push to `main` – Cloudflare redeploys automatically in ~1 minute. Progress, photos and defects live in D1 and are untouched by redeploys.

## Photos
Taken in the app (camera) or uploaded; reduced to max 1600 px (~0.5 MB JPEG) on the phone before upload, stamped with door ref and the date/time taken (from the photo's EXIF where available). Stored in D1.
