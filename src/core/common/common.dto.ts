export type CsvColumnMappings = Partial<{
    [K in keyof BankStatement]?: string
}>

export interface AmountPerWeekday {
    weekday: string
    totalAmount: number
}
export interface BankStatement {
    date?: Date
    date_executed?: Date
    transaction_type?: string
    text?: string
    amount?: number
    currency?: string
    bank_number_owner?: string
    category?: string
    sender?: string
    recipient?: string
    purpose?: string
}
export interface ExecutionTypeWithAmounts {
    transaction_type: string
    totalAmount: number
}

export interface TopSpendingCategoryForMonth {
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

export type FinanceScope =
    | { mode: 'month'; month: number; year: number }
    | { mode: 'year'; year: number }
    | { mode: 'all' }

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

export interface FinanceDashboard {
    scope: FinanceScope
    transactionTypes: ExecutionTypeWithAmounts[]
    categories: SpendingCategoryReport[]
    categoryDefinitions: SpendingCategoryDefinition[]
    spendingTotal: number
    weekdays: AmountPerWeekday[]
    highestSpendingDay: AmountPerWeekday | null
    availablePeriods: AvailablePeriods
    evolution: {
        monthly: SpendingPeriod[]
        yearly: SpendingPeriod[]
    }
}
