# Frequency Atlas — GitHub Pages build

**Publish this version via GitHub Actions:** see [GITHUB-PAGES.md](GITHUB-PAGES.md).

- `app/cloud/` — sign-in + private Supabase vault.
- `public/prototype.html` — spectrum atlas, editing, screenshots, search, export/import.
- `next.config.js` — `output: export`, `basePath: /frequency-atlas`, `trailingSlash: true`.
- `.github/workflows/deploy-pages.yml` — builds the static site and publishes `out` to GitHub Pages.
- `supabase/cloud_v0_3.sql` — source of the already-installed Supabase migration. **Do not run twice without reviewing.**

## Local build

```bash
npm install
NEXT_PUBLIC_BASE_PATH=/frequency-atlas NEXT_PUBLIC_SUPABASE_URL=https://vidahhuiroselvxadglo.supabase.co NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY npm run build
```

The public Supabase publishable key is set in the GitHub Actions workflow; `service_role` / `sb_secret_` keys are prohibited in client-side builds.
