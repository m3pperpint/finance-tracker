# Finance Analysis Context

This context turns bank-statement facts into consistent spending reports. It owns the meaning of spending categories and the classifications used to reason about cost-cutting opportunities.

## Spending language

**Bank statement**:
A source record containing a dated money movement and the bank's optional category label.
_Avoid_: Report row, dashboard item

**Spending category**:
A named group of negative money movements, such as housing, insurance, or restaurants.
_Avoid_: Transaction type

**Category definition**:
The agreed explanation of what belongs in a spending category and how it should be interpreted.
_Avoid_: UI label, tooltip text

**Necessary spending**:
Spending that supports essential living or an existing obligation.
_Avoid_: Good spending, mandatory spending

**Convenience spending**:
Spending that provides comfort, leisure, or optional consumption and is usually easier to change.
_Avoid_: Bad spending, waste

**Committed spending**:
Spending that is difficult to change in the short term, such as rent or insurance premiums.
_Avoid_: Fixed spending

**Influenceable spending**:
Spending whose amount or frequency can usually be changed through choices or habits.
_Avoid_: Discretionary spending

**Spending share**:
The fraction of total negative money movements represented by one spending category in a selected period.
_Avoid_: Percentage of income

**Spending evolution**:
Category spending grouped by month or year across the complete statement history.
_Avoid_: Forecast, price prediction
