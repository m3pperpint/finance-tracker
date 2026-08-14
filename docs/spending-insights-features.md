# Spending insights and savings features

This is the proposed next layer on top of the alias-based classification. The goal is not to add more charts for their own sake; it is to answer **“what changed, is it worth caring about, and what could I do about it?”**

## Navigation

Recommended order:

1. **Overview** — the current period, health of the rules, and the most useful signals.
2. **Review** — unresolved aliases and overlapping rules that need action.
3. **Aliases** — the reusable matching vocabulary.
4. **Categories** — the spending taxonomy and necessity/convenience split.
5. **Statements** — the detailed ledger/search tool for investigation.

Statements is deliberately last: it is valuable when investigating a question, but it is not the first decision most users make when opening the app.

## 1. Automatic unusual-change detection

### What should be analysed

Analyse spending at three levels:

- **Alias / merchant**: the same insurance provider, gym, phone provider, or supermarket.
- **Category**: total spending in Groceries, Online shopping, Dog, and so on.
- **Recurring commitment**: charges that repeat on a roughly monthly, quarterly, or annual cadence.

Use the classified amount, not the imported CSV category. Ignore income, refunds, transfers, cash deposits, and bank-generated zero-value notices unless they are explicitly selected for analysis.

### Baseline model

The first version should be deliberately robust and explainable:

1. Group matching statements by alias and category.
2. Use the last 6–12 comparable charges where available.
3. Calculate the median amount and median absolute deviation rather than relying on the average. This prevents one unusual bill from distorting the baseline.
4. Compare both amount and cadence. A €600 annual insurance payment should not be compared with monthly €50 payments.
5. Require at least three historical observations before calling a recurring price change an alert.

Suggested initial thresholds:

- minimum absolute change: **€10**;
- relative change: **20%** for recurring charges;
- high-severity change: **50%** or more;
- category surge: at least **€50** and **1.5×** the user’s recent category baseline;
- suppress alerts for a single first-time purchase unless it is unusually large for the account.

These thresholds should be configuration later, not hardcoded into the UI.

### Signals worth flagging

| Signal | Example | Suggested action |
| --- | --- | --- |
| Price increase | An insurance debit rises from roughly €14 to €22 | “Check policy price” |
| Price decrease | A subscription becomes cheaper | “Confirm this is intentional” |
| New recurring charge | A provider appears monthly for the first time | “Review new commitment” |
| Missing recurring charge | A normally monthly charge did not arrive | “Check whether this is delayed or cancelled” |
| Category surge | Online shopping is 2× its usual monthly level | “Open the merchants behind the increase” |
| Merchant frequency spike | Many small purchases at the same retailer | “Review the small leaks” |
| Duplicate charge | Two near-identical charges close together | “Check for duplicate billing” |
| Annual renewal | A yearly insurance or service payment is approaching | “Prepare for the upcoming charge” |
| Merchant drift | A recurring alias starts matching a new provider or description | “Review alias scope” |
| Large one-off | A purchase is far above the user’s normal transaction size | “Mark expected” or “Investigate” |

### How the user should see it

Add a compact **“Worth a look”** section to Overview, above the long-history charts:

- one line per signal;
- amount, baseline, and difference shown together;
- plain-language explanation, e.g. “PANDA InsurTech is €18 above its usual charge”;
- severity represented by a restrained dot/badge, not a wall of red;
- actions: **Open statements**, **Mark expected**, **Snooze**, **Adjust rule**.

The detail view should show the small evidence set that caused the flag: recent charges, baseline line, and the exact alias/category used. Users should never have to trust a mysterious score.

## 2. Reports that help save money

### P0 — high-value, actionable reports

#### Savings cockpit

One short section answering:

- How much was spent on conveniences this month?
- Which three convenience categories increased most versus the usual month?
- Which recurring services could be reviewed?
- What is the estimated avoidable amount if the unusual spend stopped?

This should distinguish **“influenceable”** from **“unusual”**. A high grocery bill is not automatically wasteful; an unusual online-shopping spike is a better savings lead.

#### Non-essential spend map

Show convenience spending as a ranked set of tiles:

- category total;
- share of all spending;
- change versus last month;
- change versus the user’s normal month;
- number of purchase days;
- number of merchants.

The most useful visual is a “high amount / high frequency” matrix. It surfaces both large purchases and small repeated leaks.

#### Recurring commitments inventory

List monthly, quarterly, and annual commitments with:

- provider / alias;
- usual amount;
- cadence;
- estimated annual cost;
- last charge;
- price trend;
- necessity or convenience.

The annualized view is important: €9.99/month feels small, but the user should see €119.88/year immediately.

#### Price-change watchlist

A focused report for insurance, phone, internet, memberships, and other stable charges. Rank by:

1. absolute annualized increase;
2. percentage increase;
3. confidence in the recurring baseline.

This is more useful than a generic “top categories” report because it points to a concrete renegotiation or cancellation decision.

### P1 — behaviour and comparison reports

#### Monthly category leaderboard

For each month, show the top five spending categories with compact comparison badges:

- above/below previous month;
- above/below usual month;
- necessity versus convenience.

The existing monthly history already contains most of this data; the missing piece is making the comparison the primary visual rather than a secondary selector.

#### Merchant concentration

Show where a category’s money goes. For example:

- Groceries: REWE, ALDI, FAMILA, and others;
- Online shopping: Amazon, Zalando, Apple, and others;
- Dining: Foodora, Takeaway, cafés, and restaurants.

Useful prompts include “three merchants make up 72% of this category” and “purchase frequency rose while average purchase size fell.”

#### Small-leak report

Group low-value purchases by merchant and week. A €3–€8 purchase is not individually interesting, but 18 visits in a month is. Show:

- total;
- visit count;
- average purchase;
- purchase days;
- change from the usual month.

#### Spending rhythm that leads to action

Do not show a generic weekday chart alone. Show behaviour patterns with a possible intervention:

- “Most convenience purchases happen Friday evening.”
- “Online shopping is concentrated in the first three days after payday.”
- “Dining spend rises when grocery spend falls.”

The report should only appear when the pattern is strong enough to be believable and should include the supporting amount and sample size.

### P2 — richer planning tools

#### Counterfactual savings scenarios

Let the user test simple changes without pretending to forecast perfectly:

- remove one subscription;
- reduce a category by 10%;
- cap a merchant at the normal-month level;
- avoid the unusual spike only.

Show monthly and annual savings, with the assumptions visible.

#### Essential-cost floor

Estimate the minimum recurring monthly cost from stable necessities: rent, utilities, insurance, debt, and other committed categories. Compare current spending with this floor to show how much flexibility exists.

#### Sinking-fund calendar

Convert annual or irregular commitments into a monthly preparation amount. A €600 annual payment becomes “set aside €50/month.” This turns surprise detection into prevention.

#### Subscription cancellation evidence

For each convenience subscription, show cost, usage proxy (charge count and cadence), price trend, and last change. The app cannot know whether the user used a service, but it can provide the facts needed for a cancellation decision.

## 3. Suggested data/API shape

Keep this separate from the existing category and alias CRUD. Add a read-only insights response first:

```ts
interface SpendingInsight {
  id: string
  kind: 'price-change' | 'new-recurring' | 'missing-recurring' | 'category-surge' | 'duplicate' | 'large-one-off'
  severity: 'info' | 'attention' | 'urgent'
  title: string
  explanation: string
  categoryId?: string
  aliasId?: string
  amount?: number
  baselineAmount?: number
  annualizedImpact?: number
  statementIds: string[]
}
```

The first implementation can calculate this in memory from the already-loaded statements and aliases. At the current scale, this is fast enough and avoids adding a database or background job prematurely.

## 4. Recommended delivery order

1. Navigation reorder — already small and immediately improves orientation.
2. Overview **Worth a look** card with price-change, new-recurring, category-surge, and duplicate signals.
3. Recurring commitments inventory with annualized cost.
4. Savings cockpit focused on convenience spending.
5. Merchant concentration and small-leak report.
6. Counterfactual scenarios and sinking-fund calendar.

The key product rule is: every insight should either explain a change, quantify an opportunity, or offer a next action. If it does none of those, it belongs in raw exploration rather than the main dashboard.
