# Daily Light

A private, phone-first inspiration app for Jacob and Sophie. Each morning: one Book of Mormon verse, one passage from
the latest general conference, and one short line from a book on our shelf — the same three for both of us.

**Live:** https://jacoblarenwalker-max.github.io/daily-light/

Static HTML/CSS/JS on GitHub Pages + Supabase (free). The free plan allows two active projects and both were in use,
so Daily Light lives in the existing **household-meals** project (`voydoxmxdnjnewxlwzse`), like Westley's Book. Every
object it adds is prefixed `dl_` / `dl-`; nothing else was changed.

## Screens
- **Today** — three cards (scripture, conference, shelf). Browse earlier days. Save (heart), share, or write an insight.
- **Bookshelf** — seeded with *The 7 Habits of Highly Effective People*, *Atomic Habits*, *Extreme Ownership*. Add books and
  quotes (word for word, 1–2 sentences). New quotes join the daily rotation.
- **Insights** — shared notes with author and time, optionally linked to a quote. Live between both phones.
- **Favorites** — hearted quotes, filter Mine / Theirs / Both.
- **Settings** — who's reading on this device, morning notification on/off, time and time zone (per person, default 7:00 AM America/Denver),
  notifications for this device, name, Morning/Evening/Match-phone theme.

## Rotation
`public.dl_today(day)` picks, for each kind, item number `(day − 2026-10-22) mod pool size` in `seq` order. Nothing repeats
until a pool is used up; added quotes join the end of the cycle. Seed order was shuffled once.

## Sources
- Book of Mormon text: public domain (Project Gutenberg eBook #17), each verse checked word-for-word against
  churchofjesuschrist.org; cards link to the chapter.
- Conference: October 2026 general conference, passages copied exactly from each talk page (footnote markers removed),
  with speaker, calling, title and link.
- Book quotes: only lines whose exact wording appears on Goodreads **and** at least one independent source
  (author site, publisher/news article, or quote site).

## Access (no sign-in, by Jacob's choice)
- No accounts. On first open each device asks **Who's reading? Jacob / Sophie** (saved in localStorage; change it in
  Settings). That choice is the author of insights, favorites, added books/quotes, and the device's notifications.
- Anyone with the link can read and write Daily Light data. RLS stays on for every `dl_` table and allows the anon role
  only what the app needs; person/author values must be `jacob` or `sophie`; seeded books/quotes can't be changed or
  deleted; only book quotes can be added. Push endpoints are not readable from the browser (saved/removed through
  `dl_save_subscription` / `dl_remove_subscription`). No other app's tables were changed.
- `config.js` holds only the URL, publishable key, and VAPID **public** key. No service-role key anywhere.

## Morning notifications
pg_cron job `dl-morning` runs `private.dl_send_morning()` every 5 minutes. Each person (`dl_people`) whose local time has passed their
`notify_time` (within 3 hours) and who hasn't had one today gets one push (de-duplicated in `dl_morning_sends`) via the
Edge Function **`dl-push`**, called through pg_net with a shared secret in Vault (`dl_push_webhook_secret`). VAPID keys
were generated inside Supabase and live only in Vault (`dl_push_vapid_private_jwk`, `dl_push_vapid_public_key`).

```sql
select private.dl_send_morning(now(), 'plan');   -- who would get what, writes nothing
select * from public.dl_morning_sends order by created_at desc;
```

iPhone (iOS 16.4+): Safari → Share → **Add to Home Screen**, open Daily Light from the Home Screen, tap your name, then
Settings (gear) → **Turn on notifications** → Allow.
