# Docker/Compose Quickstart

## Prerequisites
- Docker & Docker Compose installed

## Usage

1. Copy your `.env` to `hack-main/server/.env` and set secrets (DB, JWT, ExchangeRate API key, etc).
2. Run:

```sh
docker-compose up --build
```

- Backend: http://localhost:4000
- MySQL: localhost:3306 (user/pass: expense_user/expense_pass)

## Notes
- The backend waits for MySQL to be healthy before starting.
- Data is persisted in a Docker volume (`db_data`).
- For first-time DB setup, run the setup script inside the backend container:

```sh
docker-compose exec backend node scripts/setup-db.js
```

- To stop:

```sh
docker-compose down
```
