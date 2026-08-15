export interface TransactionTypeTotal {
    transaction_type: string
    totalAmount: number
}

export interface CategoryTotal {
    category: string
    totalAmount: number
}

export type SpendingNecessity = 'necessity' | 'convenience' | 'unclassified'
export type SpendingControl = 'committed' | 'influenceable' | 'unclassified'
export type SpendingPricePattern = 'mostly-fixed' | 'variable'

export interface SpendingCategoryDefinition {
    category: string
    description: string
    necessity: SpendingNecessity
    control: SpendingControl
    pricePattern: SpendingPricePattern
}

export interface SpendingCategoryReport extends SpendingCategoryDefinition {
    totalAmount: number
    shareOfSpending: number
    transactionCount: number
}

export interface WeekdayTotal {
    weekday: string
    totalAmount: number
}

export interface HighestSpendingDay {
    weekday: string
    totalAmount: number
}

export type ViewMode = 'month' | 'year' | 'range' | 'all'

export type FinanceScope =
    | { mode: 'month'; month: number; year: number }
    | { mode: 'year'; year: number }
    | { mode: 'range'; from: string; to: string }
    | { mode: 'all' }

export type RecurrenceCadence = 'monthly' | 'yearly'
export type RecurrenceDirection = 'income' | 'expense'
export type RecurrenceConfidence = 'candidate' | 'probable' | 'confirmed'
export type RecurringReviewStatus = 'pending' | 'confirmed' | 'denied'

export interface RecurringSeries {
    id: string
    direction: RecurrenceDirection
    currency: string
    counterparty: string
    label: string
    category?: string
    necessity?: SpendingNecessity
    control?: SpendingControl
    cadence: RecurrenceCadence
    intervalMonths: 1 | 12
    anchor: { day: number; toleranceDays: number; endOfMonth: boolean }
    occurrences: { statementIndex: number; statementId: string; date: string; amount: number }[]
    amountModel: {
        kind: 'fixed' | 'inflation-adjusted' | 'variable'
        typicalAmount: number
        minimumAmount: number
        maximumAmount: number
        yearlyChange?: number
    }
    nextExpectedDate: string
    expectedDateFrom: string
    expectedDateTo: string
    confidence: RecurrenceConfidence
    reviewStatus: RecurringReviewStatus
    evidence: {
        occurrenceCount: number
        coveredCycles: number
        expectedCycles: number
        skippedCycles: number
        cadenceFit: number
        dateFit: number
        amountMedian: number
        amountMad: number
    }
}

export interface AvailablePeriods {
    firstMonth: string
    lastMonth: string
    months: string[]
    years: number[]
}

export interface SpendingPeriod {
    key: string
    label: string
    transactionCount: number
    netMovement: number
    income: number
    spending: number
    categories: SpendingCategoryReport[]
}

export interface DashboardQuery {
    fileName: string
    scope: FinanceScope
    top: number
}

export interface DashboardSnapshot {
    scope: FinanceScope
    transactionTypes: TransactionTypeTotal[]
    categories: SpendingCategoryReport[]
    categoryDefinitions: SpendingCategoryDefinition[]
    spendingTotal: number
    weekdays: WeekdayTotal[]
    highestSpendingDay: HighestSpendingDay | null
    availablePeriods: AvailablePeriods
    evolution: {
        monthly: SpendingPeriod[]
        yearly: SpendingPeriod[]
    }
}

export interface DashboardMetrics {
    netMovement: number
    income: number
    spending: number
    topCategory: SpendingCategoryReport | null
    necessarySpending: number
    influenceableSpending: number
}

export interface DashboardView extends DashboardSnapshot {
    metrics: DashboardMetrics
}

export function summarize(snapshot: DashboardSnapshot): DashboardMetrics {
    const netMovement = snapshot.transactionTypes.reduce(
        (total, item) => total + item.totalAmount,
        0
    )
    const income = snapshot.transactionTypes
        .filter((item) => item.totalAmount > 0)
        .reduce((total, item) => total + item.totalAmount, 0)
    const spending = Math.abs(
        snapshot.transactionTypes
            .filter((item) => item.totalAmount < 0)
            .reduce((total, item) => total + item.totalAmount, 0)
    )

    return {
        netMovement,
        income,
        spending,
        topCategory: snapshot.categories[0] ?? null,
        necessarySpending: snapshot.categories
            .filter((item) => item.necessity === 'necessity')
            .reduce((total, item) => total + item.totalAmount, 0),
        influenceableSpending: snapshot.categories
            .filter((item) => item.control === 'influenceable')
            .reduce((total, item) => total + item.totalAmount, 0),
    }
}
