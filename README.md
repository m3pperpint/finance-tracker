# Finance Tracker

Finance Tracker is a NestJS REST API plus a small Svelte dashboard for analyzing bank-statement CSV files. It detects semicolon, comma, and tab delimiters, supports quoted cells and UTF-8/UTF-16 files, and parses `dd.MM.yyyy` dates and comma-decimal amounts such as `-7,95`.

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

The dashboard works with account ledgers. A ledger combines one or more statement CSVs belonging to the same account or person and has its own category aliases and recurring-payment decisions. When there is one ledger, it opens automatically; otherwise choose one from the selector.

The dashboard has two clearly separated areas:

- **Selected view**: the chosen month, year, or all-time scope. Its cards, transaction types, all spending categories, weekdays, and highest weekday all use the same scope.
- **Overall - independent**: complete-history trends. These do not change when the selected view changes. Their own Monthly trend / Yearly trend toggle controls the chart grain.

In the timeframe control:

- **Month** starts at the latest month available in the file. Use the left/right arrows to move one month at a time. Click the month label to open the browser month picker; only months in the file's available range are selectable.
- **Year** uses the same arrows to move between available years. Click the year label to choose another available year.
- **All time** aggregates the complete file and has no period navigation arrows.

Upload CSVs into an existing ledger to combine them, or create a ledger and select any existing loose CSV files to group together. Uploading previews the headers and lets you map columns to app fields. Amount is needed for spending totals; date enables time scopes; description fields add transaction detail and keyword suggestions. Named import profiles save reusable column mappings. Category aliases and recurring decisions are scoped to the ledger, while category definitions are shared. The dashboard reports the number of combined files and overlapping rows skipped. Refresh reloads the selected ledger.

## Use a CSV already in the upload folder

Put a CSV in `data/uploads/csv`; unassigned files appear in the ledger creation screen so they can be grouped into the correct account. Once grouped, files are copied into a UUID-named ledger folder alongside a `manifest.json` containing the ledger name, source list, hashes, and column mappings. Keep each ledger to one account/person. Files added to a ledger are aggregated with existing sources. Exact transaction matches across separate files are suppressed using date, amount, currency, and description; repeated matching rows within one file are retained. The default upload directory is `./data/uploads/csv`, relative to the directory where the app is started. Override it with `CSV_FILE_UPLOAD_DESTINATION` if needed.

The supplied anonymized example is:

```text
data/uploads/csv/bank_statements.csv
```

Create a ledger from loose files:

```powershell
$body = @{ name = 'Main account'; files = @('2025.csv'); importProfile = 'My bank' } | ConvertTo-Json
$ledger = Invoke-RestMethod -Method Post -Uri http://localhost:3000/finance/ledgers -ContentType 'application/json' -Body $body
curl "http://localhost:3000/finance/dashboard/$($ledger.id)?mode=all&top=5"
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

Create an empty ledger first, then upload into it. German headers are recognized automatically, so `columnMappings` is optional:

```powershell
curl -X POST http://localhost:3000/finance/upload `
  -F "file=@path/to/statement.csv;type=text/csv" `
  -F "ledgerId=LEDGER_UUID"
```

You can provide explicit mappings for another bank's headers. The mapping format is canonical field name to original CSV header. Mappings can also be saved and reused as named profiles in the upload UI:

```powershell
curl -X POST http://localhost:3000/finance/upload `
  -F "file=@path/to/statement.csv;type=text/csv" `
  -F 'columnMappings={"date":"Buchungstag","date_executed":"Wertstellung","transaction_type":"Umsatzart","text":"Buchungstext","amount":"Betrag","currency":"Währung","bank_number_owner":"IBAN Kontoinhaber","category":"Kategorie"}'
```

Supply `ledgerId` and optional `columnMappings` with each upload. The response includes `ledgerId` and `sourceId`. Uploaded files are limited to 1 MB.

## API endpoints

- `GET /` - health/status message.
- `GET /finance/ledgers` and `POST /finance/ledgers` - list or create a ledger; creation accepts `name`, optional loose `files`, and optional `importProfile`.
- `POST /finance/upload` - multipart upload with required `ledgerId` and `file`; optional `columnMappings` JSON field.
- `GET /finance/import-profiles` and `POST /finance/import-profiles` - list and save named column-mapping profiles.
- `GET /finance/dashboard/:ledgerId?mode=month&month=8&year=2025&top=5` - consistent scoped dashboard plus all spending categories, category definitions, available periods, complete-history evolution, and import summary.
- `GET /finance/calculate/execution-types-sums/:ledgerId` - totals grouped by transaction type.
- `GET /finance/calculate/most-amount-per-weekday/:ledgerId` - totals grouped by weekday.
- `GET /finance/calculate/highest-spending-day/:ledgerId` - weekday with the highest total.
- `GET /finance/calculate/top-spending-categories/:ledgerId?top=3&month=8&year=2025` - top spending categories for a selected month and year.

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
