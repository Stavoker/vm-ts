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

Відкрий [http://localhost:3000](http://localhost:3000).

## Можливості

- Додавання / видалення сайтів
- Автоперевірка доступності кожні 10 хвилин (серверний таймер + Vercel Cron)
- Ручна зміна статусу з причиною
- Telegram-сповіщення при зміні статусу на проблемний
- Cron: `vercel.json` → `GET /api/check` кожні 10 хв

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
