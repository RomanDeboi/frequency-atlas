# Frequency Atlas — GitHub Pages, без Vercel

Проєкт пристосовано до статичного експорту Next.js на GitHub Pages; Supabase залишається приватною базою. **Сайт ще не опублікований**: у підключеному GitHub-акаунті `RomanDeboi` репозиторій відсутній, а підключений GitHub-інструмент не дозволяє створити новий репозиторій. Не публікуй службових/конфіденційних відомостей у загальнодоступних хмарах без дозволу.

## Один ручний крок перед публікацією

1. Перейди до <https://github.com/new> під акаунтом `RomanDeboi`.
2. Назва **frequency-atlas**, видимість **Public** (GitHub Free Pages потребує публічного репозиторію). Не додавай стандартні README, license чи gitignore.
3. Скопіюй усі файли з **цієї папки** в новий репозиторій (не zip-файл як один документ). Найпростіше через Git на ПК після розпакування:

```bash
cd frequency-atlas-github-pages
git init -b main
git add .
git commit -m "GitHub Pages Frequency Atlas"
git remote add origin https://github.com/RomanDeboi/frequency-atlas.git
git push -u origin main
```

Якщо Git відсутній, встанови GitHub Desktop, створи локальний репозиторій з розпакованої папки та опублікуй його як публічний. **Не передавай пароль або персональний токен у чат.**

4. У репозиторії зайди в **Settings → Pages → Build and deployment → Source → GitHub Actions**. Якщо workflow вже запустився, після зміни Source відкрий вкладку Actions і за потреби перезапусти `Deploy Frequency Atlas to GitHub Pages`.
5. Після успішного Actions → Deploy отримана адреса за стандартного налаштування: `https://romandeboi.github.io/frequency-atlas/` (перевір фактичну адресу у Settings → Pages). Редирект із головної сторінки відкриє `/cloud/`.
6. У Supabase відкрий <https://supabase.com/dashboard/project/vidahhuiroselvxadglo/auth/url-configuration>:
   - Site URL = `https://romandeboi.github.io/frequency-atlas/`
   - Redirect URLs: додай `https://romandeboi.github.io/frequency-atlas/cloud/`
7. На сайті створи акаунт, підтвердь email, увійди й перевір невеликий тестовий запис. Після власної реєстрації **вимкни нові реєстрації в Supabase Authentication → Providers → Email**, а також зміни в workflow `NEXT_PUBLIC_ATLAS_ALLOW_SIGNUP` на `'false'` та зроби commit. Прихована кнопка не забороняє реєстрацію в Supabase — потрібне саме серверне налаштування.

## Важливі зауваження

- Код і статичний HTML будуть публічні; **даних користувача в репозиторії немає**. Доданий до workflow `sb_publishable_` — лише публічний клієнтський ключ, він **не надає права читати приватні записи без авторизації**. Не додавай `service_role`, `sb_secret_`, приватні JSON-резервні копії, screenshots чи `.env.local` до репозиторію.
- При відкритті `prototype.html` без `/cloud/` працює окрема **локальна** база IndexedDB цього браузера. Хмарні дані доступні через `/cloud/` після входу.
- Розгортання/реєстрація в реальному браузері **ще не перевірені**. Реліз перевіряє репозиторій лише після створення й запуску Actions.
- У GitHub Pages немає серверних API; ця версія використовує безпосередньо Supabase JS у браузері та політики RLS на сервері Supabase.
