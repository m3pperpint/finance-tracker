import {
    AmountPerWeekday,
    AvailablePeriods,
    ExecutionTypeWithAmounts,
    FinanceDashboard,
    FinanceScope,
    SpendingPeriod,
    TopSpendingCategoryForMonth,
    BankStatement,
    SpendingCategoryDefinition,
    SpendingCategoryReport,
} from '../common/common.dto'
import {
    getSpendingCategoryDefinition,
    getSpendingCategoryDefinitions,
} from './category-catalog'

type EvolutionGranularity = 'month' | 'year'

/**
 * FinanceAnalyzer performs finance-specific calculations on bank statement data.
 * Every calculation can operate on the same explicit scope, which keeps a
 * dashboard snapshot internally consistent.
 */
export class FinanceAnalyzer {
    constructor(
        private readonly statements: BankStatement[],
        private readonly resolveCategory?: (statement: BankStatement, index: number) => string | undefined,
        private readonly getConfiguredCategoryDefinitions?: () => SpendingCategoryDefinition[],
        private readonly getConfiguredCategoryDefinition?: (category: string) => SpendingCategoryDefinition
    ) {}

    getDashboard(scope: FinanceScope, _top: number): FinanceDashboard {
        const scoped = this.filterStatements(scope)
        const categoryReport = this.getSpendingCategoryReport(scoped)

        return {
            scope,
            transactionTypes: this.getExecutionTypesWithAmounts(scoped) ?? [],
            categories: categoryReport.categories,
            categoryDefinitions: this.getCategoryDefinitions(),
            spendingTotal: categoryReport.totalSpending,
            weekdays: this.getMostAmountSpentPerWeekday(scoped),
            highestSpendingDay: this.getHighestSpendingDay(scoped),
            availablePeriods: this.getAvailablePeriods(),
            evolution: {
                monthly: this.getEvolution('month'),
                yearly: this.getEvolution('year'),
            },
        }
    }

    getExecutionTypesWithAmounts(
        statements = this.statements
    ): ExecutionTypeWithAmounts[] | null {
        if (
            !statements.some((s) => s.transaction_type && s.amount != null)
        )
            return null

        const totals: Record<string, number> = {}
        for (const s of statements) {
            if (!s.transaction_type || s.amount == null) continue
            totals[s.transaction_type] =
                (totals[s.transaction_type] || 0) + s.amount
        }

        return Object.entries(totals).map(
            ([transaction_type, totalAmount]) => ({
                transaction_type,
                totalAmount,
            })
        )
    }

    getTopSpendingCategoriesForMonth(
        top: number,
        month: number,
        year: number
    ): TopSpendingCategoryForMonth[] | null {
        return this.getTopSpendingCategories(
            this.filterStatements({ mode: 'month', month, year }),
            top
        )
    }

    getMostAmountSpentPerWeekday(
        statements = this.statements
    ): AmountPerWeekday[] {
        const valid = statements.filter((s) => s.date && s.amount != null)
        if (valid.length === 0) return []

        const map: Record<string, number> = {}
        valid.forEach((s) => {
            const weekday = s.date!.toLocaleDateString('en-GB', {
                weekday: 'long',
            })
            map[weekday] = (map[weekday] || 0) + s.amount!
        })

        return Object.entries(map).map(([weekday, totalAmount]) => ({
            weekday,
            totalAmount,
        }))
    }

    getHighestSpendingDay(
        statements = this.statements
    ): AmountPerWeekday | null {
        const days = this.getMostAmountSpentPerWeekday(statements)
        if (days.length === 0) return null
        return days.reduce((prev, curr) =>
            curr.totalAmount > prev.totalAmount ? curr : prev
        )
    }

    private getTopSpendingCategories(
        statements: BankStatement[],
        top: number
    ): TopSpendingCategoryForMonth[] | null {
        const categories = this.getSpendingCategoryReport(statements).categories
        if (categories.length === 0) return null

        return categories
            .map(({ category, totalAmount }) => ({ category, totalAmount }))
            .sort((a, b) => b.totalAmount - a.totalAmount)
            .slice(0, top)
    }

    private getSpendingCategoryReport(statements: BankStatement[]): {
        categories: SpendingCategoryReport[]
        totalSpending: number
    } {
        const totals = new Map<string, { totalAmount: number; transactionCount: number }>()
        let totalSpending = 0

        for (const statement of statements) {
            if (statement.amount == null || statement.amount >= 0) continue

            const category = this.resolveCategory
                ? (this.resolveCategory(statement, this.statements.indexOf(statement)) ?? 'Uncategorized')
                : (statement.category?.trim() || 'Uncategorized')
            const total = Math.abs(statement.amount)
            totalSpending += total
            const current = totals.get(category) ?? { totalAmount: 0, transactionCount: 0 }
            totals.set(category, {
                totalAmount: current.totalAmount + total,
                transactionCount: current.transactionCount + 1,
            })
        }

        const categories = [...totals.entries()]
            .map(([category, totalsForCategory]) => ({
                ...(this.getConfiguredCategoryDefinition?.(category) ?? getSpendingCategoryDefinition(category)),
                ...totalsForCategory,
                shareOfSpending:
                    totalSpending === 0
                        ? 0
                        : totalsForCategory.totalAmount / totalSpending,
            }))
            .sort((a, b) => b.totalAmount - a.totalAmount)

        return { categories, totalSpending }
    }

    private getCategoryDefinitions() {
        if (this.getConfiguredCategoryDefinitions) return this.getConfiguredCategoryDefinitions()
        const definitions = getSpendingCategoryDefinitions()
        const known = new Set(definitions.map((definition) => definition.category))
        const customCategories = this.statements
            .filter((statement) => statement.amount != null && statement.amount < 0)
            .map((statement) => statement.category?.trim() || 'Uncategorized')
            .filter((category) => !known.has(category))

        return [
            ...definitions,
            ...[...new Set(customCategories)].map(getSpendingCategoryDefinition),
        ].sort((a, b) => a.category.localeCompare(b.category))
    }

    private filterStatements(scope: FinanceScope): BankStatement[] {
        if (scope.mode === 'all') return this.statements

        return this.statements.filter((statement) => {
            if (!statement.date) return false
            if (scope.mode === 'range') {
                const key = this.dateKey(statement.date)
                return key >= scope.from && key <= scope.to
            }
            if (scope.mode === 'year') {
                return statement.date.getFullYear() === scope.year
            }
            return (
                statement.date.getFullYear() === scope.year &&
                statement.date.getMonth() + 1 === scope.month
            )
        })
    }

    private getAvailablePeriods(): AvailablePeriods {
        const dates = this.statements
            .map((statement) => statement.date)
            .filter((date): date is Date => Boolean(date))

        if (dates.length === 0) {
            return { firstMonth: '', lastMonth: '', months: [], years: [] }
        }

        const first = new Date(Math.min(...dates.map((date) => date.getTime())))
        const last = new Date(Math.max(...dates.map((date) => date.getTime())))
        const months: string[] = []
        const cursor = new Date(first.getFullYear(), first.getMonth(), 1)
        const lastMonth = new Date(last.getFullYear(), last.getMonth(), 1)

        while (cursor <= lastMonth) {
            months.push(this.monthKey(cursor.getFullYear(), cursor.getMonth() + 1))
            cursor.setMonth(cursor.getMonth() + 1)
        }

        return {
            firstMonth: months[0],
            lastMonth: months[months.length - 1],
            months,
            years: Array.from(
                { length: last.getFullYear() - first.getFullYear() + 1 },
                (_, index) => first.getFullYear() + index
            ),
        }
    }

    private getEvolution(granularity: EvolutionGranularity): SpendingPeriod[] {
        const available = this.getAvailablePeriods()
        const keys =
            granularity === 'month'
                ? available.months
                : available.years.map(String)

        return keys.map((key) => {
            const monthScope =
                granularity === 'month' ? this.scopeFromMonthKey(key) : null
            const scope =
                monthScope ?? { mode: 'year' as const, year: Number(key) }
            const statements = this.filterStatements(scope)
            const amounts = statements
                .map((statement) => statement.amount)
                .filter((amount): amount is number => amount != null)
            const netMovement = amounts.reduce((total, amount) => total + amount, 0)
            const income = amounts
                .filter((amount) => amount > 0)
                .reduce((total, amount) => total + amount, 0)
            const spending = Math.abs(
                amounts
                    .filter((amount) => amount < 0)
                    .reduce((total, amount) => total + amount, 0)
            )

            return {
                key,
                label:
                    granularity === 'month'
                        ? this.monthLabel(monthScope!.year, monthScope!.month)
                        : key,
                transactionCount: statements.length,
                netMovement,
                income,
                spending,
                categories: this.getSpendingCategoryReport(statements).categories,
            }
        })
    }

    private scopeFromMonthKey(key: string): Extract<FinanceScope, { mode: 'month' }> {
        const [year, month] = key.split('-').map(Number)
        return { mode: 'month', year, month }
    }

    private monthKey(year: number, month: number): string {
        return `${year}-${String(month).padStart(2, '0')}`
    }

    private dateKey(date: Date): string {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    }

    private monthLabel(year: number, month: number): string {
        return new Intl.DateTimeFormat('en-US', {
            month: 'short',
            year: 'numeric',
        }).format(new Date(year, month - 1, 1))
    }
}
