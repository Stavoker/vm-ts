# Vitrina Monitor

Мінімалістична адмін-панель для моніторингу сайтів: статус, оплата, блокування, історія перевірок і сповіщення в Telegram.

## Швидкий старт

1. Скопіюй `.env.example` → `.env.local` і заповни значення.
2. У Supabase SQL Editor виконай `supabase/schema.sql`.
3. Напиши боту в Telegram будь-яке повідомлення, потім отримай `chat_id`:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getUpdates"
```

Додай `TELEGRAM_CHAT_ID` у `.env.local`.

4. Запуск:

```bash
npm install
npm run dev
```

Відкрий [http://localhost:3000](http://localhost:3000). Спочатку з’явиться форма входу — логін і пароль беруться з `ADMIN_EMAIL` / `ADMIN_PASSWORD`. На Render додай ті самі змінні плюс `AUTH_SECRET`.

## Можливості

- Додавання / видалення сайтів
- Автоперевірка доступності кожні 10 хвилин (серверний таймер + Vercel Cron)
- Ручна зміна статусу з причиною
- Telegram-сповіщення при зміні статусу на проблемний
- Cron: `vercel.json` → `GET /api/check` кожні 10 хв
- Traffic Analytics: окрема сторінка з GA4 (Data API v1) і щотижневі PDF

## Google Analytics (GA4)

1. У Google Cloud увімкни **Google Analytics Data API**.
2. Створи service account і додай його як Viewer на кожну GA4 property.
3. Заповни `GOOGLE_CLIENT_EMAIL` + `GOOGLE_PRIVATE_KEY` (або `GOOGLE_APPLICATION_CREDENTIALS`).
4. У Supabase виконай `supabase/ga4_analytics.sql`.
5. У списку сайтів відкрий **GA4**, вкажи numeric Property ID (не `G-XXXX`) і натисни Test Connection.

Property ID: GA4 Admin → Property Settings → Property ID.

## Статуси

| Статус | Значення |
|---|---|
| `online` | Сайт працює |
| `offline` | Немає відповіді / таймаут |
| `payment_required` | HTTP 402 або текст про оплату |
| `blocked` | HTTP 403 або текст про блокування |
| `error` | 4xx/5xx та інші помилки |

## API

- `GET/POST /api/sites` — список / додати
- `PATCH/DELETE /api/sites/:id` — оновити / видалити
- `GET /api/sites/:id/checks` — історія перевірок
- `POST /api/check` — ручна перевірка (`{ "siteIds": ["..."] }` опційно)
- `GET /api/check` — cron (з `Authorization: Bearer CRON_SECRET`)
- `GET /api/analytics/:siteId/:report` — GA4 dashboard (`overview`, `realtime`, `timeseries`, `countries`, `devices`, `sources`, `campaigns`, `landing-pages`, `bounce`)
- `POST /api/analytics/:siteId/test` — перевірка доступу до property
- `GET/POST /api/analytics/reports` — список / генерація weekly PDF
- `GET /api/analytics/reports/:id/download` — завантаження PDF
- `GET /api/analytics/reports/cron` — автогенерація weekly PDF
- `GET /api/traffic-creator/balance` — кредити Traffic Creator
- `GET /api/traffic-creator/campaigns` — список кампаній
- `PATCH /api/traffic-creator/campaigns/:id` — денний ліміт візитів
- `POST /api/traffic-creator/campaigns/:id/pause|resume` — пауза / продовження

## Traffic Creator

1. Settings → Developer API → створи named key.
2. Додай `TRAFFIC_CREATOR_API_KEY` у `.env.local` і в Render Environment.
3. Якщо в акаунті увімкнені IP restrictions — додай outbound IP сервера (для Render це не той IP, що локально). Після 403 панель покаже IP, який треба allowlist.
4. Перезапусти `npm run dev` або задеплой і відкрий **Traffic Creator** у сайдбарі.

## Вхід в адмінку

Панель відкривається лише після логіна.

1. Додай `ADMIN_EMAIL`, `ADMIN_PASSWORD` і `AUTH_SECRET` у `.env.local`.
2. Той самий набір змінних потрібен у Render → Environment, інакше прод лишиться без входу або не пустить нікого.
3. `AUTH_SECRET` згенеруй так: `openssl rand -base64 32`.
4. Сесія живе 7 днів у httpOnly cookie. Вийти можна кнопкою **Выйти** внизу сайдбару.
