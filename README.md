# Vitrina

Адмін-панель для вітрин і компаній: моніторинг сайтів, нагадування про оплати, перевірка вимог, аналітика, трафік, контент і пересилання пошти на legal.

Інтерфейс російською. Вхід лише після логіна (`ADMIN_EMAIL` / `ADMIN_PASSWORD`).

Дані лежать в **одній базі Supabase**. Зовнішні джерела: Notion (оплати), Telegram, GA4, Zoho Mail, Gmail, Traffic Creator, OpenAI.

## Навіщо це

Одна панель замість розкиданих таблиць і воркерів:

- бачити, які сайти живі, а які просять оплату або заблоковані;
- не пропускати продовження телефонів, доменів і сервісів;
- проганяти сайт по чеклісту вимог і зберігати PDF;
- дивитися трафік GA4 і кредити Traffic Creator;
- збирати пости під бренд;
- копіювати вхідні з Zoho на legal-скриньку.

Прод зазвичай крутиться на **Render** (`render.yaml`, сервіс `vm-ts`). Cron у `vercel.json` потрібен, якщо деплой на Vercel.

## Як це влаштовано

```
Браузер  →  Next.js (App Router)  →  Supabase
                 │
                 ├─ Notion (оплати)
                 ├─ Telegram (статуси сайтів і нагадування)
                 ├─ GA4 Data API
                 ├─ Zoho Mail + Gmail (Почта)
                 ├─ Traffic Creator API
                 └─ Playwright + OpenAI (перевірка вимог, контент)
```

- **Сесія:** httpOnly cookie на 7 днів, `AUTH_SECRET`. Cron-ендпоінти відкриваються з `Authorization: Bearer CRON_SECRET`.
- **Фон на Render:** після старту Node-процес сам ганяє перевірки сайтів, Telegram `/start`, оплати, тижневі PDF і пошту.
- **Локальний `npm run dev`:** автоперевірка сайтів **вимкнена**, щоб не дублювати прод. Увімкнути: `ENABLE_LOCAL_MONITOR=true`. Пошта в dev крутиться, якщо не стоїть `MAIL_FORWARDER_DISABLED=true`.
- **Vercel:** фонові цикли не стартують; працюють Cron з `vercel.json`.

## Розділи панелі

| Розділ | Що робить |
| --- | --- |
| **Все сайты** | Список, статуси, ручна перевірка, історія, фільтр по статусах у сайдбарі. |
| **Добавить сайт** | URL у моніторинг, опційно GA4 Property ID. |
| **Telegram** | Чати, які написали боту `/start`. Сюди йдуть алерти по сайтах і нагадування про оплати. |
| **Оплаты Notion** | Синхрон з баз телефонів / доменів / сервісів. За 7 днів до дати (і прострочені) — повідомлення в Telegram з кнопками Later / Payed. |
| **Проверка требований** | Обхід сайту (Playwright), чекліст, PASS / MANUAL / FAIL, PDF. |
| **Аналитика трафика** | GA4: огляд, realtime, країни, пристрої, джерела, лендінги. Щотижневий PDF (понеділок). |
| **Traffic Creator** | Баланс, історія кредитів, кампанії, денний ліміт, пауза / resume. |
| **Контент-завод** | Тексти й картинки під бренд сайту. Публікація вручну. |
| **Почта** | Ящики Zoho в Supabase. Раз на хвилину нові листи копіюються на `DESTINATION_EMAIL` (Gmail). |

### Статуси сайтів

| Статус | Коли |
| --- | --- |
| Працює (`online`) | Відповідь ок |
| Немає відповіді (`offline`) | Таймаут / мережа |
| Потрібна оплата (`payment_required`) | HTTP 402 або текст про оплату |
| Заблоковано (`blocked`) | HTTP 403 або текст про блокування |
| Помилка (`error`) | Інші 4xx/5xx |

Перевірка кожні **10 хвилин**. У Telegram пише, коли статус стає проблемним.

### Оплати з Notion

Бот **не шле всі рядки**. Потрібні одночасно:

- сторінка в `NOTION_PHONES_DATABASE_ID`, `NOTION_DOMAINS_DATABASE_ID` або `NOTION_EXTRA_DATABASE_IDS` (`id:phone\|domain\|service`);
- назва компанії;
- дата в колонці `Істекає` / `Истекает` / `Expires` / `Оплатить до` / `Оплатити до` / `Due date`;
- статус не Payed;
- до дати ≤ 7 днів (по UTC) або вже прострочено.

Після Payed нагадування мовчить, поки в Notion не змінять дату. Later — нагадує щодня, поки не натиснуть Payed. Джоб раз на годину (на Vercel ще cron о 08:00).

### Почта (Zoho → legal)

Ящики, історія пересилань і токени — таблиці Supabase (`mailboxes`, `processed_messages`, `forward_attempts`, `mailbox_sync`). Схема й права: `supabase/mail_forwarder.sql`.

Полінг щохвилини. Той самий лист двічі не йде. Gmail складає копію в папку з назвою компанії. CRUD ящиків — у розділі Почта.

## Швидкий старт

1. Скопіюй `.env.example` → `.env.local`.
2. У Supabase SQL Editor виконай скрипти з `supabase/` (див. нижче).
3. `npm install`
4. Для перевірки вимог: `npx playwright install` (на Render це робить `playwright:install`).
5. `npm run dev` → [http://localhost:3000](http://localhost:3000)

На проді ті самі змінні, плюс `AUTH_SECRET` (`openssl rand -base64 32`). Node на Render: **22** (`render.yaml`).

### SQL

Безпечно ганяти повторно (`IF NOT EXISTS`):

1. `supabase/schema.sql` — сайти, перевірки, Telegram-чати, оплати
2. `supabase/ga4_analytics.sql` — GA4 і тижневі звіти
3. `supabase/requirements_check.sql` + `requirement_definitions.sql` + `requirement_definitions_seed.sql`
4. `supabase/content_palette.sql` — палітри контент-заводу
5. `supabase/mail_forwarder.sql` — пошта (GRANT, щоб панель бачила ящики з того ж ключа, що й сайти)

Якщо таблиці оплат або чатів уже є: `payment_reminders.sql`, `payment_reminders_all_rows.sql`, `telegram_chats.sql`.

### Telegram

1. Створи бота, `TELEGRAM_BOT_TOKEN`.
2. Напиши боту `/start` — чат з’явиться в розділі Telegram.
3. За бажанням залиш `TELEGRAM_CHAT_ID` у env як запасний список.

На Vercel потрібен webhook: `TELEGRAM_WEBHOOK_BASE_URL` + `POST /api/telegram/setup`. На Render webhook знімається, бот читає оновлення сам.

### Google Analytics (GA4)

1. Увімкни Google Analytics Data API.
2. Service account — Viewer на кожну GA4 property.
3. `GOOGLE_CLIENT_EMAIL` + `GOOGLE_PRIVATE_KEY` (або `GOOGLE_APPLICATION_CREDENTIALS`).
4. У картці сайту: numeric Property ID (не `G-XXXX`) → Test Connection.

### Traffic Creator

Settings → Developer API → ключ → `TRAFFIC_CREATOR_API_KEY`. Якщо в кабінеті IP allowlist — додай outbound IP Render (не локальний). Після 403 панель покаже IP.

### Почта

`DESTINATION_EMAIL`, `SEND_METHOD=gmail`, Gmail OAuth (`gmail.modify`), Zoho client + токени ящиків. Ящики вже можуть бути в Supabase; нові додаються в UI.

## Фон і cron

| Задача | Render (процес) | Vercel Cron |
| --- | --- | --- |
| Сайти | кожні 10 хв | `GET /api/check` `*/10 * * * *` |
| Оплати Notion | щогодини | `GET /api/reminders` `0 8 * * *` |
| Тижневий GA4 PDF | щогодини, шле в понеділок | `GET /api/analytics/reports/cron` `0 8 * * 1` |
| Почта | щохвилини | `GET /api/mail-forwarder/poll` `* * * * *` |
| Telegram `/start` | кожні 2 с | webhook |

Cron без сесії: заголовок `Authorization: Bearer CRON_SECRET`.

Локально вимкнути монітор: залиш `ENABLE_LOCAL_MONITOR` порожнім. Вимкнути пошту: `MAIL_FORWARDER_DISABLED=true`. Повністю вимкнути монітор на сервері: `MONITOR_DISABLED=true`.

## Змінні

Повний список — `.env.example`. Мінімум для входу й сайтів:

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (бажано; інакше діють політики RLS), `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `AUTH_SECRET`, `CRON_SECRET`, `TELEGRAM_BOT_TOKEN`.

Оплати: `NOTION_TOKEN`, `NOTION_PHONES_DATABASE_ID`, `NOTION_DOMAINS_DATABASE_ID`, опційно `NOTION_EXTRA_DATABASE_IDS`.

## Команди

```bash
npm run dev
npm run build && npm start
npm test
npm run lint
```

## API (коротко)

Захищені сесією, крім login і cron з `CRON_SECRET`.

- Сайти: `GET/POST /api/sites`, `PATCH/DELETE /api/sites/:id`, `GET /api/sites/:id/checks`, `GET|POST /api/check`
- Оплати: `GET|POST /api/reminders`, `PATCH /api/reminders/:id`
- Telegram: `/api/telegram/chats`, `/api/telegram/poll`, `/api/telegram/webhook`, `/api/telegram/setup`
- GA4: `/api/analytics/:siteId/:report`, `/api/analytics/reports`, `/api/analytics/reports/cron`
- Traffic Creator: `/api/traffic-creator/balance`, `/credits`, `/campaigns`
- Контент: `/api/content-factory/brands`, `/generate`
- Вимоги: `/api/requirements-check`
- Почта: `/api/mail-forwarder/status`, `/mailboxes`, `/poll`, `/check`
