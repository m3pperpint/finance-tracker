# Finance Dashboard Context

## Terms

- **Statement file**: A bank-export CSV selected by filename from the upload directory or uploaded through the API.
- **Transaction type total**: The net amount grouped by the bank's transaction type.
- **Spending category**: A named group of negative transactions within the selected scope, enriched with its definition, spending share, necessity, and control profile.
- **Category definition**: The explanation of what belongs in a spending category and whether it is usually necessary, committed, or influenceable.
- **Spending share**: The category's fraction of total negative transactions in the selected scope.
- **Committed spending**: A category whose amount is difficult to change in the short term, such as rent or insurance.
- **Influenceable spending**: A category whose amount or frequency can usually be changed through choices or habits.
- **Weekday total**: The net amount grouped by the weekday of the transaction date.
- **Selected timeframe**: The month, year, or all-time scope applied consistently to every selected-view statistic.
- **Overall trend**: A complete statement-history statistic, independent from the selected timeframe, displayed at monthly or yearly granularity.
- **Spending evolution**: Category spending grouped by month or year across the complete statement history; it is descriptive, not a forecast.
- **Dashboard snapshot**: The read-only set of scoped calculations, available periods, and complete-history evolution returned for one statement file.
