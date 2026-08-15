export type RecurrenceDirection = 'income' | 'expense'
export type RecurrenceCadence = 'monthly' | 'yearly'
export type RecurrenceConfidence = 'candidate' | 'probable' | 'confirmed'
export type RecurrenceAmountKind = 'fixed' | 'inflation-adjusted' | 'variable'

export interface RecurringOccurrence {
    statementIndex: number
    statementId: string
    date: string
    amount: number
}

export interface RecurrenceEvidence {
    occurrenceCount: number
    coveredCycles: number
    expectedCycles: number
    skippedCycles: number
    cadenceFit: number
    dateFit: number
    amountMedian: number
    amountMad: number
}

export interface RecurringSeries {
    id: string
    direction: RecurrenceDirection
    currency: string
    counterparty: string
    label: string
    cadence: RecurrenceCadence
    intervalMonths: 1 | 12
    anchor: {
        day: number
        toleranceDays: number
        endOfMonth: boolean
    }
    occurrences: RecurringOccurrence[]
    amountModel: {
        kind: RecurrenceAmountKind
        typicalAmount: number
        minimumAmount: number
        maximumAmount: number
        yearlyChange?: number
    }
    nextExpectedDate: string
    expectedDateFrom: string
    expectedDateTo: string
    confidence: RecurrenceConfidence
    evidence: RecurrenceEvidence
}
