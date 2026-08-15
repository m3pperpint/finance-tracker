import { FinanceAnalyzer } from './finance-analyzer'

describe('FinanceAnalyzer dashboard scopes', () => {
    const analyzer = new FinanceAnalyzer([
        {
            date: new Date(2025, 0, 5),
            transaction_type: 'Card',
            amount: -100,
            category: 'Food',
        },
        {
            date: new Date(2025, 0, 15),
            transaction_type: 'Salary',
            amount: 1000,
            category: 'Income',
        },
        {
            date: new Date(2025, 1, 5),
            transaction_type: 'Card',
            amount: -50,
            category: 'Travel',
        },
    ])

    it('uses one scope for every selected-view calculation', () => {
        const january = analyzer.getDashboard(
            { mode: 'month', month: 1, year: 2025 },
            5
        )

        expect(january.transactionTypes).toEqual([
            { transaction_type: 'Card', totalAmount: -100 },
            { transaction_type: 'Salary', totalAmount: 1000 },
        ])
        expect(january.categories).toEqual([
            expect.objectContaining({
                category: 'Food',
                totalAmount: 100,
                shareOfSpending: 1,
                transactionCount: 1,
                necessity: 'unclassified',
                control: 'influenceable',
            }),
        ])
        expect(january.spendingTotal).toBe(100)
        expect(january.categoryDefinitions).toEqual(
            expect.arrayContaining([expect.objectContaining({ category: 'Food' })])
        )
        expect(january.weekdays).toHaveLength(2)
        expect(january.availablePeriods.months).toEqual(['2025-01', '2025-02'])
    })

    it('keeps evolution independent from the selected scope', () => {
        const february = analyzer.getDashboard(
            { mode: 'month', month: 2, year: 2025 },
            5
        )

        expect(february.transactionTypes).toEqual([
            { transaction_type: 'Card', totalAmount: -50 },
        ])
        expect(february.evolution.monthly).toHaveLength(2)
        expect(february.evolution.monthly[0].spending).toBe(100)
        expect(february.evolution.monthly[1].spending).toBe(50)
        expect(february.evolution.yearly[0].spending).toBe(150)
        expect(february.evolution.yearly[0].categories).toEqual([
            expect.objectContaining({
                category: 'Food',
                shareOfSpending: 2 / 3,
            }),
            expect.objectContaining({
                category: 'Travel',
                shareOfSpending: 1 / 3,
            }),
        ])
    })

    it('supports an explicit date range', () => {
        const scoped = analyzer.getDashboard(
            { mode: 'range', from: '2025-01-10', to: '2025-02-01' },
            5
        )

        expect(scoped.transactionTypes).toEqual([
            { transaction_type: 'Salary', totalAmount: 1000 },
        ])
    })
})
