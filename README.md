# Sikhaid Admin

The admin panel for the SikhAid website, as its own app. Runs locally only.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3003/admin. Run the website too (http://localhost:3002) so image previews and website forms work.

## How it connects to the website

| What | Where it lives |
|---|---|
| Admin accounts, form entries, donations, 80G certificates | `.local-data/` in this folder (private, git-ignored) |
| Blogs, campaigns, home page, celebrity cards, 80G trust details, contact details | the website's `lib/content/*.json` and `lib/campaigns-data.json` (set by `WEBSITE_DIR`) |
| Uploaded images and videos | the website's `public/uploads/` |

The website sends form entries and donations to `http://localhost:3003/api/local/...`
(its `NEXT_PUBLIC_ADMIN_API_URL`). Only the address in `WEBSITE_URL` may send them.

## Settings

Copy `.env.example` to `.env.local`. `ADMIN_EMAIL` / `ADMIN_PASSWORD` only create the first
Super Admin; after that use **Settings** and **User Management** in the panel.
