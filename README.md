# Vitrina Monitor

Минималистичная админ-панель для мониторинга сайтов: статус, оплата, блокировка, история проверок и уведомления в Telegram.

## Быстрый старт

1. Скопируй `.env.example` → `.env.local` и заполни значения.
2. В Supabase SQL Editor выполни `supabase/schema.sql`.
3. Напиши боту в Telegram любое сообщение, затем получи `chat_id`:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getUpdates"
```

Добавь `TELEGRAM_CHAT_ID` в `.env.local`.

4. Запуск:

```bash
npm install
npm run dev
```

Открой [http://localhost:3000](http://localhost:3000). Сначала появится форма входа — логин и пароль берутся из `ADMIN_EMAIL` / `ADMIN_PASSWORD`. На Render добавь те же переменные плюс `AUTH_SECRET`.

## Возможности

- Добавление / удаление сайтов
- Автопроверка доступности каждые 10 минут (серверный таймер + Vercel Cron)
- Ручная смена статуса с причиной
- Telegram-уведомления при смене статуса на проблемный
- Cron: `vercel.json` → `GET /api/check` каждые 10 мин
- Аналитика трафика: отдельная страница с GA4 (Data API v1) и еженедельные PDF

## Google Analytics (GA4)

1. В Google Cloud включи **Google Analytics Data API**.
2. Создай service account и добавь его как Viewer на каждую GA4 property.
3. Заполни `GOOGLE_CLIENT_EMAIL` + `GOOGLE_PRIVATE_KEY` (или `GOOGLE_APPLICATION_CREDENTIALS`).
4. В Supabase выполни `supabase/ga4_analytics.sql`.
5. В списке сайтов открой **GA4**, укажи numeric Property ID (не `G-XXXX`) и нажми Test Connection.

Property ID: GA4 Admin → Property Settings → Property ID.

## Статусы

| Статус | Значение |
|---|---|
| `online` | Сайт работает |
| `offline` | Нет ответа / таймаут |
| `payment_required` | HTTP 402 или текст об оплате |
| `blocked` | HTTP 403 или текст о блокировке |
| `error` | 4xx/5xx и другие ошибки |

## API

- `GET/POST /api/sites` — список / добавить
- `PATCH/DELETE /api/sites/:id` — обновить / удалить
- `GET /api/sites/:id/checks` — история проверок
- `POST /api/check` — ручная проверка (`{ "siteIds": ["..."] }` опционально)
- `GET /api/check` — cron (с `Authorization: Bearer CRON_SECRET`)
- `GET /api/analytics/:siteId/:report` — GA4 dashboard (`overview`, `realtime`, `timeseries`, `countries`, `devices`, `sources`, `campaigns`, `landing-pages`, `bounce`)
- `POST /api/analytics/:siteId/test` — проверка доступа к property
- `GET/POST /api/analytics/reports` — список / генерация weekly PDF
- `GET /api/analytics/reports/:id/download` — скачивание PDF
- `GET /api/analytics/reports/cron` — автогенерация weekly PDF
- `GET /api/traffic-creator/balance` — кредиты Traffic Creator
- `GET /api/traffic-creator/credits` — история потраченных кредитов (campaign analytics)
- `GET /api/traffic-creator/campaigns` — список кампаний
- `PATCH /api/traffic-creator/campaigns/:id` — дневной лимит визитов
- `POST /api/traffic-creator/campaigns/:id/pause|resume` — пауза / продолжение

## Traffic Creator

1. Settings → Developer API → создай named key.
2. Добавь `TRAFFIC_CREATOR_API_KEY` в `.env.local` и в Render Environment.
3. Если в аккаунте включены IP restrictions — добавь outbound IP сервера (для Render это не тот IP, что локально). После 403 панель покажет IP, который нужно allowlist.
4. Перезапусти `npm run dev` или задеплой и открой **Traffic Creator** в сайдбаре.

## Вход в админку

Панель открывается только после логина.

1. Добавь `ADMIN_EMAIL`, `ADMIN_PASSWORD` и `AUTH_SECRET` в `.env.local`.
2. Тот же набор переменных нужен в Render → Environment, иначе прод останется без входа или никого не пустит.
3. `AUTH_SECRET` сгенерируй так: `openssl rand -base64 32`.
4. Сессия живёт 7 дней в httpOnly cookie. Выйти можно кнопкой **Выйти** внизу сайдбара.
