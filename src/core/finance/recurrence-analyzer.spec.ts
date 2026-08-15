import { detectRecurring } from './recurrence-analyzer'

const date = (value: string) => {
    const [year, month, day] = value.split('-').map(Number)
    return new Date(year, month - 1, day)
}

describe('detectRecurring', () => {
    it('detects a monthly end-of-month payment and predicts the next date', () => {
        const result = detectRecurring([
            { date: date('2025-01-31'), amount: -9.99, recipient: 'Stream Co', purpose: 'Subscription' },
            { date: date('2025-02-28'), amount: -9.99, recipient: 'Stream Co', purpose: 'Subscription' },
            { date: date('2025-03-31'), amount: -9.99, recipient: 'Stream Co', purpose: 'Subscription' },
            { date: date('2025-04-30'), amount: -9.99, recipient: 'Stream Co', purpose: 'Subscription' },
        ])

        expect(result).toHaveLength(1)
        expect(result[0]).toEqual(expect.objectContaining({
            cadence: 'monthly',
            confidence: 'confirmed',
            nextExpectedDate: '2025-05-31',
        }))
        expect(result[0].anchor.endOfMonth).toBe(true)
    })

    it('keeps a monthly series when one cycle is missing', () => {
        const result = detectRecurring([
            { date: date('2025-01-15'), amount: -50, recipient: 'Provider', purpose: 'Plan' },
            { date: date('2025-03-15'), amount: -50, recipient: 'Provider', purpose: 'Plan' },
            { date: date('2025-04-15'), amount: -50, recipient: 'Provider', purpose: 'Plan' },
        ])

        expect(result[0].cadence).toBe('monthly')
        expect(result[0].evidence.skippedCycles).toBe(1)
        expect(result[0].confidence).toBe('probable')
    })

    it('detects yearly payments with a gradual amount increase', () => {
        const result = detectRecurring([
            { date: date('2023-06-15'), amount: -600, recipient: 'Insurance Co', purpose: 'Policy' },
            { date: date('2024-06-15'), amount: -630, recipient: 'Insurance Co', purpose: 'Policy' },
            { date: date('2025-06-15'), amount: -660, recipient: 'Insurance Co', purpose: 'Policy' },
        ])

        expect(result).toHaveLength(1)
        expect(result[0]).toEqual(expect.objectContaining({ cadence: 'yearly', confidence: 'confirmed' }))
        expect(result[0].amountModel.kind).toBe('inflation-adjusted')
        expect(result[0].nextExpectedDate).toBe('2026-06-15')
    })

    it('detects recurring income separately from expenses', () => {
        const result = detectRecurring([
            { date: date('2025-01-01'), amount: 2500, sender: 'Employer', purpose: 'Salary' },
            { date: date('2025-02-01'), amount: 3000, sender: 'Employer', purpose: 'Salary' },
            { date: date('2025-03-01'), amount: 3500, sender: 'Employer', purpose: 'Salary' },
        ])

        expect(result[0].direction).toBe('income')
        expect(result[0].amountModel.kind).toBe('variable')
    })

    it('uses purpose to separate merchants behind the same intermediary', () => {
        const result = detectRecurring([
            { date: date('2025-01-05'), amount: -9.99, recipient: 'PayPal', purpose: 'Apple Services ref 1001' },
            { date: date('2025-02-05'), amount: -9.99, recipient: 'PayPal', purpose: 'Apple Services ref 1002' },
            { date: date('2025-03-05'), amount: -9.99, recipient: 'PayPal', purpose: 'Apple Services ref 1003' },
            { date: date('2025-01-10'), amount: -7.99, recipient: 'PayPal', purpose: 'Valve Corporation ref 2001' },
            { date: date('2025-02-10'), amount: -7.99, recipient: 'PayPal', purpose: 'Valve Corporation ref 2002' },
            { date: date('2025-03-10'), amount: -7.99, recipient: 'PayPal', purpose: 'Valve Corporation ref 2003' },
        ])

        expect(result).toHaveLength(2)
        expect(result.map((series) => series.label).sort()).toEqual(['apple services', 'valve corporation'])
    })

    it('rejects a merchant with multiple purchases in the same month', () => {
        const result = detectRecurring([
            { date: date('2025-01-05'), amount: -20, recipient: 'Market', purpose: 'Groceries' },
            { date: date('2025-01-20'), amount: -30, recipient: 'Market', purpose: 'Groceries' },
            { date: date('2025-02-05'), amount: -25, recipient: 'Market', purpose: 'Groceries' },
            { date: date('2025-02-20'), amount: -35, recipient: 'Market', purpose: 'Groceries' },
            { date: date('2025-03-05'), amount: -22, recipient: 'Market', purpose: 'Groceries' },
            { date: date('2025-03-20'), amount: -32, recipient: 'Market', purpose: 'Groceries' },
        ])

        expect(result).toHaveLength(0)
    })
})
