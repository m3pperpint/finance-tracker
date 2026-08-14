# Finance Tracker

Finance Tracker is a NestJS REST API plus a small Svelte dashboard for analyzing semicolon-separated German bank-statement CSV files. It supports `dd.MM.yyyy` dates and comma-decimal amounts such as `-7,95`.

The checked-in example is anonymized. Personal CSV files belong in `data/uploads/csv`, but are ignored by Git unless they are one of the explicitly allowed example files.

## Requirements

- Node.js 20 or newer
- npm

## Quick start

From the repository root, install dependencies for both services:

```powershell
npm install
npm --prefix frontend install
```

Start the API and frontend together:

```powershell
npm run start:all
```

Then open [http://localhost:5173](http://localhost:5173). The frontend calls the API at [http://localhost:3000](http://localhost:3000).

Stop both services from another terminal:

```powershell
npm run stop:all
```

The launcher records only the PIDs it started in `.temp/finance-tracker-dev.json`; that file is ignored by Git. Running `npm run start:all` again first stops the previous pair it recorded.

## Start services separately

Start the backend only:

```powershell
npm run start:dev
```

The API listens on port `3000` by default. Start the frontend in another terminal:

```powershell
npm --prefix frontend run dev
```

The Vite frontend listens on port `5173` by default. The root shortcuts are `npm run start:frontend`, `npm run check:frontend`, and `npm run build:frontend`.

To use another API port, set `PORT` before starting the backend. For example in PowerShell:

```powershell
$env:PORT = 4000
npm run start:dev
```

If the API is not on port 3000, create `frontend/.env` with:

```text
VITE_API_BASE_URL=http://localhost:4000
```

For a production-style backend run:

```powershell
npm run build:app
npm run start:prod
```

## Use the dashboard

The dashboard defaults to `15aug2024_15aug_2026.csv` and has two clearly separated areas:

- **Selected view**: the chosen month, year, or all-time scope. Its cards, transaction types, all spending categories, weekdays, and highest weekday all use the same scope.
- **Overall - independent**: complete-history trends. These do not change when the selected view changes. Their own Monthly trend / Yearly trend toggle controls the chart grain.

In the timeframe control:

- **Month** starts at the latest month available in the file. Use the left/right arrows to move one month at a time. Click the month label to open the browser month picker; only months in the file's available range are selectable.
- **Year** uses the same arrows to move between available years. Click the year label to choose another available year.
- **All time** aggregates the complete file and has no period navigation arrows.

The statement filename field loads a file already present in `data/uploads/csv`. The Upload CSV control sends a local file through the API and then selects the returned filename automatically. The Refresh button reloads the current scope.

## Use a CSV already in the upload folder

Put a CSV in `data/uploads/csv`, then enter its filename in the dashboard or pass only the filename to the API. Do not pass the full path. The default upload directory is `./data/uploads/csv`, relative to the directory where the app is started. Override it with `CSV_FILE_UPLOAD_DESTINATION` if needed.

The supplied anonymized example is:

```text
data/uploads/csv/bank_statements.csv
```

Example API calls:

```powershell
curl "http://localhost:3000/finance/dashboard/bank_statements.csv?mode=month&month=8&year=2025&top=5"
curl "http://localhost:3000/finance/dashboard/bank_statements.csv?mode=year&year=2025&top=5"
curl "http://localhost:3000/finance/dashboard/bank_statements.csv?mode=all&top=5"
```

The dashboard endpoint returns the scoped metrics plus every spending category with its definition, total, transaction count, share of total spending, necessity/control profile, and price pattern. It also returns the category catalog and complete-history monthly/yearly evolution used by the Overall section. Negative transactions without a source category are reported as `Uncategorized`, so category shares add up to total spending.

The original calculation endpoints are also available:

```powershell
curl http://localhost:3000/finance/calculate/execution-types-sums/bank_statements.csv
curl http://localhost:3000/finance/calculate/most-amount-per-weekday/bank_statements.csv
curl http://localhost:3000/finance/calculate/highest-spending-day/bank_statements.csv
curl "http://localhost:3000/finance/calculate/top-spending-categories/bank_statements.csv?top=3&month=8&year=2025"
```

## Upload through the API

The upload endpoint stores the file in the upload directory and returns the generated filename. German headers are recognized automatically, so `columnMappings` is optional:

```powershell
curl -X POST http://localhost:3000/finance/upload `
  -F "file=@path/to/statement.csv;type=text/csv"
```

You can provide explicit mappings for another bank's headers. The mapping format is canonical field name to original CSV header:

```powershell
curl -X POST http://localhost:3000/finance/upload `
  -F "file=@path/to/statement.csv;type=text/csv" `
  -F 'columnMappings={"date":"Buchungstag","date_executed":"Wertstellung","transaction_type":"Umsatzart","text":"Buchungstext","amount":"Betrag","currency":"Währung","bank_number_owner":"IBAN Kontoinhaber","category":"Kategorie"}'
```

Use the `fileName` returned by the upload response with the dashboard or calculation endpoints. Uploaded files are limited to 1 MB.

## API endpoints

- `GET /` - health/status message.
- `POST /finance/upload` - multipart upload with field name `file`; optional `columnMappings` JSON field.
- `GET /finance/dashboard/:fileName?mode=month&month=8&year=2025&top=5` - one consistent scoped dashboard plus all spending categories, category definitions, available periods, and complete-history monthly/yearly evolution. `top` is retained for compatibility; the dashboard report is no longer limited to five categories.
- `GET /finance/calculate/execution-types-sums/:fileName` - totals grouped by transaction type.
- `GET /finance/calculate/most-amount-per-weekday/:fileName` - totals grouped by weekday.
- `GET /finance/calculate/highest-spending-day/:fileName` - weekday with the highest total.
- `GET /finance/calculate/top-spending-categories/:fileName?top=3&month=8&year=2025` - top spending categories for a selected month and year.

Calculations use these canonical fields: `date`, `date_executed`, `transaction_type`, `text`, `amount`, `currency`, `bank_number_owner`, and `category`. Negative amounts are treated as spending by the category calculation.

## Frontend structure

The UI uses Svelte 5, Tailwind CSS v4, and shadcn's copy-in component pattern. Code is separated into domain types/calculations, an application use case, an API adapter, and presentational UI primitives. The shared dashboard response is the boundary that keeps selected-view calculations consistent.

## Build and test

```powershell
npm run check:frontend
npm run build:frontend
npm run build
npm test
npm run test:e2e
```

`npm run build` builds both the NestJS app and the reusable core package. The tests include CSV parsing and dashboard scope regression coverage.
