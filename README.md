# Dracula Ops Dashboard

Dashboard Node.js giao dien toi theo tong mau Dracula cua VS Code.

## Chay du an

```bash
npm start
```

Mo trinh duyet tai:

```text
http://localhost:3000
```

## Module hien co

- Multitool
- API Manager
- Proxy Manager
- Email Manager
- Roadmap cho cac module update sau

## API mau

- `GET /api/dashboard`
- `POST /api/tools/run`
- `POST /api/apis`
- `POST /api/proxies`
- `POST /api/proxies/import`
- `POST /api/proxies/check-line`
- `POST /api/proxies/:id/check`
- `POST /api/proxies/check-all`
- `PUT /api/proxies/:id`
- `DELETE /api/proxies/:id`
- `GET /api/proxies/export`
- `POST /api/emails`
