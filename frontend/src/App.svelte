<script lang="ts">
    import { onMount } from 'svelte'
    import {
        AlertTriangle,
        ArrowDownUp,
        ArrowRight,
        ArrowUpRight,
        CalendarClock,
        Check,
        ChevronDown,
        ChevronLeft,
        ChevronRight,
        FileSpreadsheet,
        Filter,
        FolderKanban,
        Eye,
        GitMerge,
        LayoutDashboard,
        ListFilter,
        Pencil,
        Plus,
        RefreshCw,
        Search,
        Settings2,
        Sparkles,
        Tag,
        Trash2,
        Upload,
        WandSparkles,
        Repeat2,
        X,
    } from '@lucide/svelte'
    import { loadDashboard } from '$lib/application/load-dashboard'
    import type { DashboardView, FinanceScope, RecurringObservationScan, RecurringSeries, RecurringSettings, ViewMode } from '$lib/domain/finance'
    import { FinanceApi } from '$lib/infrastructure/finance-api'
    import Badge from '$lib/components/ui/Badge.svelte'
    import Button from '$lib/components/ui/Button.svelte'
    import Card from '$lib/components/ui/Card.svelte'

    type Page = 'dashboard' | 'spending' | 'recurring' | 'statements' | 'aliases' | 'categories' | 'review'
    const pageRoutes: Page[] = ['dashboard', 'spending', 'recurring', 'review', 'aliases', 'categories', 'statements']
    const CHART_MONTHS = 12
    type Necessity = 'necessity' | 'convenience'
    type AliasSort = 'usage-desc' | 'usage-asc' | 'name-asc' | 'name-desc'
    type AliasUsageFilter = 'all' | 'used' | 'unused'

    interface Category {
        id: string
        name: string
        necessity: Necessity
        description: string
        aliasCount: number
    }

    interface Alias {
        id: string
        value: string
        categoryId: string
        field: 'any' | 'text' | 'transaction_type' | 'category'
        transactionType?: string
        statementId?: string
        excludedStatementIds?: string[]
    }

    interface RuleStatement {
        id: string
        date?: string
        text: string
        transactionType: string
        amount: number | null
        currency: string
        sourceCategory: string
        sender: string
        recipient: string
        purpose: string
        bankNumberOwner: string
        status: 'matched' | 'unmatched' | 'conflict'
        recurringDirection?: 'income' | 'expense'
        matches: { id: string; value: string; categoryId: string }[]
        suggestions: { kind: string; label: string }[]
    }

    interface RulesView {
        categories: Category[]
        aliases: Alias[]
        statements: RuleStatement[]
        stats: { total: number; matched: number; unmatched: number; conflicts: number }
        aliasUsage: Record<string, number>
    }

    type RecurringRow = RecurringSeries & { memberSeriesIds: string[]; members: RecurringSeries[]; observationIds: string[] }

    const api = new FinanceApi()
    const DEFAULT_FILE = '15aug2024_15aug_2026.csv'
    const currency = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
    function pageFromUrl(): Page {
        if (typeof window === 'undefined') return 'dashboard'
        const candidate = new URLSearchParams(window.location.search).get('page') as Page | null
        return candidate && pageRoutes.includes(candidate) ? candidate : 'dashboard'
    }

    let page: Page = pageFromUrl()
    let mode: ViewMode = 'month'
    let monthKey = ''
    let year = new Date().getFullYear()
    let fromDate = ''
    let toDate = ''
    let fileName = DEFAULT_FILE
    let dashboard: DashboardView | null = null
    let recurring: RecurringSeries[] = []
    let recurringSettings: RecurringSettings = { aliases: {}, groups: [], observationIds: {} }
    let rules: RulesView | null = null
    let selectedFile: File | null = null
    let loading = false
    let saving = false
    let error = ''
    let search = ''
    let quickCategoryId = ''
    let newAlias = { value: '', categoryId: '', field: 'any' as Alias['field'], transactionType: '' }
    let editingAliasId = ''
    let editingCategoryId = ''
    let newCategory = { name: '', necessity: 'necessity' as Necessity }
    let draggedCategoryId = ''
    let comparisonCategory = ''
    let selectedSpendingCategory = ''
    let selectedNecessityBreakdown: Necessity | null = null
    let overallMonthKey = ''
    let chartWindowOffset = 0
    let statementSearch = ''
    let statementFilter: 'all' | 'matched' | 'unmatched' | 'conflict' = 'all'
    let statementTypeFilter = 'all'
    let statementLimit = 100
    let aliasCategorySearch: Record<string, string> = {}
    let aliasCategoryExpanded: Record<string, boolean> = {}
    let aliasSort: AliasSort = 'usage-desc'
    let aliasUsageFilter: AliasUsageFilter = 'all'
    let aliasFieldFilter: Alias['field'] | 'all' = 'all'
    let aliasCategoryFilter = 'all'
    let selectedRecurringIds: string[] = []
    let recurringDialog: { kind: 'alias' | 'observations'; row: RecurringRow } | null = null
    let recurringAliasDraft = ''
    let recurringAliasScan: RecurringObservationScan | null = null
    let recurringAliasScanning = false
    let recurringObservationLimit = 100

    $: categories = rules?.categories ?? []
    $: aliases = rules?.aliases ?? []
    $: unmatched = rules?.statements.filter((item) => item.status === 'unmatched') ?? []
    $: conflicts = rules?.statements.filter((item) => item.status === 'conflict') ?? []
    $: coverage = rules?.stats.total ? Math.round((rules.stats.matched / rules.stats.total) * 100) : 0
    $: scopeLabel = mode === 'all' ? 'All time' : mode === 'year' ? String(year) : mode === 'range' ? rangeLabel(fromDate, toDate) : monthLabel(monthKey)
    $: monthlyPeriods = dashboard?.evolution.monthly ?? []
    $: comparisonOptions = [...new Set(monthlyPeriods.flatMap((period) => period.categories.map((item) => item.category)))].sort()
    $: if (!comparisonCategory && comparisonOptions.length) comparisonCategory = comparisonOptions[0]
    $: if (comparisonCategory && !comparisonOptions.includes(comparisonCategory)) comparisonCategory = comparisonOptions[0] ?? ''
    $: comparisonRows = monthlyPeriods.map((period, index) => {
        const amount = period.categories.find((item) => item.category === comparisonCategory)?.totalAmount ?? 0
        const previous = index > 0 ? monthlyPeriods[index - 1].categories.find((item) => item.category === comparisonCategory)?.totalAmount ?? 0 : null
        const priorAmounts = monthlyPeriods.slice(0, index).map((item) => item.categories.find((category) => category.category === comparisonCategory)?.totalAmount ?? 0)
        const usual = priorAmounts.length ? priorAmounts.reduce((total, value) => total + value, 0) / priorAmounts.length : null
        return { ...period, amount, previous, usual }
    })
    $: comparisonAverage = comparisonRows.length ? comparisonRows.reduce((total, row) => total + row.amount, 0) / comparisonRows.length : 0
    $: comparisonPeriods = mode === 'year' ? (dashboard?.evolution.yearly ?? []) : monthlyPeriods
    $: activePeriodKey = mode === 'year' ? String(year) : mode === 'month' ? monthKey : ''
    $: activePeriod = comparisonPeriods.find((period) => period.key === activePeriodKey)
    $: usualPeriodSpending = activePeriod ? usualAmount(comparisonPeriods.filter((period) => period.key !== activePeriodKey).map((period) => period.spending)) : null
    $: spendingDelta = activePeriod && usualPeriodSpending != null ? activePeriod.spending - usualPeriodSpending : null
    $: topChanges = activePeriod ? activePeriod.categories.map((category) => {
        const usual = usualAmount(comparisonPeriods.filter((period) => period.key !== activePeriodKey).map((period) => period.categories.find((item) => item.category === category.category)?.totalAmount ?? 0))
        return { ...category, usual, difference: usual == null ? null : category.totalAmount - usual }
    }).filter((category) => category.difference != null).sort((a, b) => Math.abs(b.difference ?? 0) - Math.abs(a.difference ?? 0)).slice(0, 3) : []
    $: spendingRows = (dashboard?.categories ?? []).map((category) => {
        const usual = activePeriod ? usualAmount(comparisonPeriods.filter((period) => period.key !== activePeriodKey).map((period) => period.categories.find((item) => item.category === category.category)?.totalAmount ?? 0)) : null
        const recurringExpected = expectedRecurringForCategory(category.category)
        return { ...category, usual, recurringExpected, difference: usual == null ? null : category.totalAmount - usual }
    })
    $: confirmedRecurring = activeRecurring.filter((series) => series.reviewStatus === 'confirmed')
    $: expectedRecurringTotal = confirmedRecurring.reduce((total, series) => total + expectedRecurringForSeries(series), 0)
    $: expectedMovements = [mode, monthKey, year, fromDate, toDate, recurring].length ? remainingExpectedMovements() : []
    $: expectedFixedExpenses = expectedMovements.filter((item) => item.series.direction === 'expense')
    $: expectedFixedIncome = expectedMovements.filter((item) => item.series.direction === 'income')
    $: estimatedFlexibleSpending = [mode, monthKey, year, fromDate, toDate, monthlyPeriods].length ? estimateRemainingFlexibleSpending() : null
    $: if (!selectedSpendingCategory && spendingRows.length) selectedSpendingCategory = spendingRows[0].category
    $: if (selectedSpendingCategory && !spendingRows.some((item) => item.category === selectedSpendingCategory)) selectedSpendingCategory = spendingRows[0]?.category ?? ''
    $: scopedExpenseStatements = (rules?.statements ?? []).filter((statement) => statement.amount != null && statement.amount < 0 && statementInScope(statement.date))
    $: merchantRows = buildMerchantRows(scopedExpenseStatements)
    $: selectedMerchantRows = merchantRows.filter((merchant) => merchant.category === selectedSpendingCategory).slice(0, 8)
    $: activeRecurring = recurring.filter((series) => series.reviewStatus !== 'denied')
    $: recurringExpenses = activeRecurring.filter((series) => series.direction === 'expense')
    $: recurringIncome = activeRecurring.filter((series) => series.direction === 'income')
    $: manualRecurringStatements = rules?.statements.filter((statement) => statement.recurringDirection) ?? []
    // Keep this derived list tied to the async API results. Svelte's legacy
    // reactive dependency analysis does not see variables read only inside a
    // function body, so a bare buildRecurringRows() stays at its initial []
    // after recurring/settings load.
    $: recurringRows = recurring.length || recurringSettings.groups.length || Object.keys(recurringSettings.aliases).length
        ? buildRecurringRows()
        : []
    $: monthlyRecurringExpenses = recurringExpenses.reduce((total, series) => total + series.amountModel.typicalAmount / series.intervalMonths, 0)
    $: annualRecurringExpenses = recurringExpenses.reduce((total, series) => total + series.amountModel.typicalAmount * (12 / series.intervalMonths), 0)
    $: if (!overallMonthKey && monthlyPeriods.length) overallMonthKey = monthlyPeriods.at(-1)?.key ?? ''
    $: if (overallMonthKey && monthlyPeriods.length && !monthlyPeriods.some((period) => period.key === overallMonthKey)) overallMonthKey = monthlyPeriods.at(-1)?.key ?? ''
    $: overallPeriod = monthlyPeriods.find((period) => period.key === overallMonthKey)
    $: overallComparison = comparisonRows.find((row) => row.key === overallMonthKey)
    $: chartWindowCount = Math.max(1, Math.ceil(monthlyPeriods.length / CHART_MONTHS))
    $: if (chartWindowOffset >= chartWindowCount) chartWindowOffset = Math.max(0, chartWindowCount - 1)
    $: chartWindowStart = Math.max(0, monthlyPeriods.length - ((chartWindowOffset + 1) * CHART_MONTHS))
    $: chartWindowEnd = monthlyPeriods.length - (chartWindowOffset * CHART_MONTHS)
    $: necessityPeriods = monthlyPeriods.map((period) => {
        const split = { necessity: 0, convenience: 0, unclassified: 0 }
        for (const category of period.categories) split[category.necessity] += category.totalAmount
        return { ...period, ...split }
    })
    $: visibleNecessityPeriods = necessityPeriods.slice(chartWindowStart, chartWindowEnd)
    $: maxNecessitySpending = Math.max(1, ...visibleNecessityPeriods.map((period) => period.spending))
    $: necessityPeriod = necessityPeriods.find((period) => period.key === overallMonthKey)
    $: selectedBreakdownCategories = necessityPeriod?.categories
        .filter((category) => category.necessity === selectedNecessityBreakdown)
        .sort((a, b) => b.totalAmount - a.totalAmount)
        .slice(0, 5) ?? []
    $: aliasGroups = categories.filter((category) => aliasCategoryFilter === 'all' || category.id === aliasCategoryFilter).map((category) => {
        const categoryQuery = aliasCategorySearch[category.id]?.trim().toLocaleLowerCase() ?? ''
        const categoryAliases = aliases.filter((alias) => {
            const usage = rules?.aliasUsage?.[alias.id] ?? 0
            const searchMatches = !search.trim() || alias.value.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
            const categorySearchMatches = !categoryQuery || alias.value.toLocaleLowerCase().includes(categoryQuery)
            const usageMatches = aliasUsageFilter === 'all' || (aliasUsageFilter === 'used' ? usage > 0 : usage === 0)
            const fieldMatches = aliasFieldFilter === 'all' || alias.field === aliasFieldFilter
            return alias.categoryId === category.id && searchMatches && categorySearchMatches && usageMatches && fieldMatches
        }).sort((a, b) => compareAliases(a, b, aliasSort, rules?.aliasUsage ?? {}))
        const visible = aliasCategoryExpanded[category.id] ? categoryAliases : categoryAliases.slice(0, 5)
        return { category, aliases: visible, total: categoryAliases.length, hiddenCount: Math.max(0, categoryAliases.length - visible.length) }
    }).filter((group) => group.total > 0 || !search.trim())
    $: aliasResultCount = aliases.filter((alias) => {
        const usage = rules?.aliasUsage?.[alias.id] ?? 0
        return (aliasCategoryFilter === 'all' || alias.categoryId === aliasCategoryFilter) && (aliasUsageFilter === 'all' || (aliasUsageFilter === 'used' ? usage > 0 : usage === 0)) && (aliasFieldFilter === 'all' || alias.field === aliasFieldFilter) && (!search.trim() || alias.value.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
    }).length
    $: statementTypes = [...new Set((rules?.statements ?? []).map((item) => item.transactionType).filter(Boolean))].sort()
    $: filteredStatements = (rules?.statements ?? []).filter((item) => {
        const haystack = [item.id, item.date, item.text, item.transactionType, item.amount, item.currency, item.sourceCategory, item.sender, item.recipient, item.purpose, item.bankNumberOwner, statementCategory(item)].filter((value) => value != null).join(' ').toLocaleLowerCase()
        const queryMatches = !statementSearch.trim() || haystack.includes(statementSearch.trim().toLocaleLowerCase())
        const statusMatches = statementFilter === 'all' || item.status === statementFilter
        const typeMatches = statementTypeFilter === 'all' || item.transactionType === statementTypeFilter
        return queryMatches && statusMatches && typeMatches
    })
    $: recurringStatementMeta = (() => {
        const result = new Map<string, { count: number; label: string }>()
        for (const row of recurringRows) {
            if (row.reviewStatus === 'denied') continue
            for (const statementId of row.observationIds) {
                const current = result.get(statementId)
                if (!current || row.observationIds.length > current.count) result.set(statementId, { count: row.observationIds.length, label: row.label })
            }
        }
        return result
    })()
    $: visibleStatements = filteredStatements.slice(0, statementLimit)
    $: if (!newAlias.categoryId && categories.length) newAlias.categoryId = categories[0].id
    $: if (!quickCategoryId && categories.length) quickCategoryId = categories[0].id
    $: if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('page') !== page) {
        const nextUrl = new URL(window.location.href)
        nextUrl.searchParams.set('page', page)
        window.history.replaceState({}, '', nextUrl)
    }

    onMount(() => {
        const syncPage = () => page = pageFromUrl()
        window.addEventListener('popstate', syncPage)
        refresh()
        return () => window.removeEventListener('popstate', syncPage)
    })

    async function refresh() {
        if (!fileName.trim()) return
        loading = true
        error = ''
        try {
            let scope = currentScope()
            let nextDashboard = await loadDashboard(api, { fileName: fileName.trim(), scope, top: 5 })
            if (mode === 'month' && !nextDashboard.availablePeriods.months.includes(monthKey) && nextDashboard.availablePeriods.lastMonth) {
                monthKey = nextDashboard.availablePeriods.lastMonth
                scope = currentScope()
                nextDashboard = await loadDashboard(api, { fileName: fileName.trim(), scope, top: 5 })
            }
            if (mode === 'year' && !nextDashboard.availablePeriods.years.includes(year) && nextDashboard.availablePeriods.years.length) {
                year = nextDashboard.availablePeriods.years.at(-1) ?? year
                scope = currentScope()
                nextDashboard = await loadDashboard(api, { fileName: fileName.trim(), scope, top: 5 })
            }
            dashboard = nextDashboard
            rules = await api.getRules(fileName.trim())
            recurring = await api.getRecurring(fileName.trim())
            recurringSettings = await api.getRecurringSettings(fileName.trim())
        } catch (cause) {
            error = cause instanceof Error ? cause.message : 'Could not load the finance workspace.'
        } finally {
            loading = false
        }
    }

    async function refreshRules() {
        rules = await api.getRules(fileName.trim())
        await refresh()
    }

    function currentScope(): FinanceScope {
        if (mode === 'all') return { mode: 'all' }
        if (mode === 'year') return Number.isInteger(year) ? { mode: 'year', year } : { mode: 'all' }
        if (mode === 'range') return isDateKey(fromDate) && isDateKey(toDate) && fromDate <= toDate ? { mode: 'range', from: fromDate, to: toDate } : { mode: 'all' }
        if (!/^\d{4}-\d{2}$/.test(monthKey)) return { mode: 'all' }
        const [selectedYear, selectedMonth] = monthKey.split('-').map(Number)
        return { mode: 'month', year: selectedYear, month: selectedMonth }
    }

    function statementInScope(value: string | undefined) {
        if (!value) return false
        const key = value.slice(0, 10)
        if (mode === 'all') return true
        if (mode === 'month') return key.startsWith(monthKey)
        if (mode === 'year') return key.startsWith(String(year))
        return isDateKey(fromDate) && isDateKey(toDate) && key >= fromDate && key <= toDate
    }

    function statementCategory(statement: RuleStatement) {
        return statement.matches.length ? categoryName(statement.matches[0].categoryId) : statement.sourceCategory || 'Uncategorized'
    }

    function merchantLabel(statement: RuleStatement) {
        return (statement.recipient || statement.sender || statement.text || statement.purpose || 'Unknown merchant').replace(/\s+/g, ' ').trim()
    }

    function buildMerchantRows(statements: RuleStatement[]) {
        const groups = new Map<string, { merchant: string; category: string; total: number; count: number }>()
        for (const statement of statements) {
            const merchant = merchantLabel(statement)
            const category = statementCategory(statement)
            const key = `${category}|${merchant}`
            const current = groups.get(key) ?? { merchant, category, total: 0, count: 0 }
            current.total += Math.abs(statement.amount ?? 0)
            current.count += 1
            groups.set(key, current)
        }
        return [...groups.values()].sort((a, b) => b.total - a.total)
    }

    function expectedRecurringForCategory(category: string) {
        return confirmedRecurring
            .filter((series) => series.category === category)
            .reduce((total, series) => total + expectedRecurringForSeries(series), 0)
    }

    function buildRecurringRows(): RecurringRow[] {
        const byId = new Map(recurring.map((series) => [series.id, series]))
        const used = new Set<string>()
        const merged = recurringSettings.groups.flatMap((group) => {
            const members = group.seriesIds.map((id) => byId.get(id)).filter((series): series is RecurringSeries => Boolean(series))
            if (!members.length) return []
            members.forEach((series) => used.add(series.id))
            return [mergeRecurringRow(group.id, members)]
        })
        return [...merged, ...recurring.filter((series) => !used.has(series.id)).map((series) => {
            const observationIds = recurringSettings.observationIds[series.id] ?? series.occurrences.map((occurrence) => occurrence.statementId)
            return ({
            ...series,
            label: recurringSettings.aliases[series.id] ?? series.alias ?? series.label,
            memberSeriesIds: [series.id],
            members: [series],
            occurrences: observationsAsOccurrences([series], observationIds),
            observationIds,
        })})]
    }

    function mergeRecurringRow(id: string, members: RecurringSeries[]): RecurringRow {
        const base = members[0]
        const occurrences = [...new Map(members.flatMap((series) => series.occurrences).map((occurrence) => [occurrence.statementId, occurrence])).values()]
            .sort((a, b) => a.date.localeCompare(b.date))
        const observationIds = recurringSettings.observationIds[id] ?? occurrences.map((occurrence) => occurrence.statementId)
        const typicalAmount = members.reduce((total, series) => total + series.amountModel.typicalAmount, 0)
        const reviewStatus = members.every((series) => series.reviewStatus === 'confirmed') ? 'confirmed' : members.some((series) => series.reviewStatus === 'denied') ? 'denied' : 'pending'
        return {
            ...base,
            id,
            label: recurringSettings.aliases[id] ?? (members.length > 1 ? `${base.label} + ${members.length - 1} merged` : base.alias ?? base.label),
            counterparty: members.length > 1 ? `${base.counterparty} + ${members.length - 1} more` : base.counterparty,
            occurrences: observationsAsOccurrences(members, observationIds),
            reviewStatus,
            amountModel: { ...base.amountModel, typicalAmount, minimumAmount: members.reduce((total, series) => total + series.amountModel.minimumAmount, 0), maximumAmount: members.reduce((total, series) => total + series.amountModel.maximumAmount, 0) },
            evidence: { ...base.evidence, occurrenceCount: observationIds.length },
            memberSeriesIds: members.map((series) => series.id),
            members,
            observationIds,
        }
    }

    function recurringObservationIds(row: RecurringRow) {
        return row.observationIds
    }

    function observationsAsOccurrences(members: RecurringSeries[], ids: string[]) {
        const existing = new Map(members.flatMap((series) => series.occurrences).map((occurrence) => [occurrence.statementId, occurrence]))
        const statements = new Map((rules?.statements ?? []).map((statement) => [statement.id, statement]))
        return ids.map((id) => existing.get(id) ?? {
            statementIndex: -1,
            statementId: id,
            date: statements.get(id)?.date?.slice(0, 10) ?? '',
            amount: Math.abs(statements.get(id)?.amount ?? 0),
        })
    }

    function recurringObservationStatements(row: RecurringRow, ids = recurringObservationIds(row)) {
        const statementMap = new Map((rules?.statements ?? []).map((statement) => [statement.id, statement]))
        return ids.map((id) => statementMap.get(id)).filter((statement): statement is RuleStatement => Boolean(statement)).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    }

    function expectedRecurringForSeries(series: RecurringSeries) {
        if (mode === 'all') return 0
        if (mode === 'month') {
            if (series.cadence === 'monthly') return series.amountModel.typicalAmount
            const anchorMonth = series.occurrences[0]?.date.slice(5, 7)
            return anchorMonth === monthKey.slice(5, 7) ? series.amountModel.typicalAmount : 0
        }
        if (mode === 'year') return series.amountModel.typicalAmount * (12 / series.intervalMonths)
        if (!isDateKey(fromDate) || !isDateKey(toDate)) return 0
        const from = new Date(`${fromDate}T00:00:00`)
        const to = new Date(`${toDate}T00:00:00`)
        const anchorMonth = series.occurrences[0]?.date.slice(5, 7)
        let count = 0
        for (const cursor = new Date(from.getFullYear(), from.getMonth(), 1); cursor <= to; cursor.setMonth(cursor.getMonth() + 1)) {
            if (series.cadence === 'monthly' || String(cursor.getMonth() + 1).padStart(2, '0') === anchorMonth) count += 1
        }
        return count * series.amountModel.typicalAmount
    }

    function scopeWindow(): { from: Date; to: Date } | null {
        if (mode === 'all') return null
        if (mode === 'month' && /^\d{4}-\d{2}$/.test(monthKey)) {
            const [selectedYear, selectedMonth] = monthKey.split('-').map(Number)
            return { from: new Date(selectedYear, selectedMonth - 1, 1), to: new Date(selectedYear, selectedMonth, 0) }
        }
        if (mode === 'year' && Number.isInteger(year)) return { from: new Date(year, 0, 1), to: new Date(year, 11, 31) }
        if (mode === 'range' && isDateKey(fromDate) && isDateKey(toDate) && fromDate <= toDate) return { from: dateValue(fromDate), to: dateValue(toDate) }
        return null
    }

    function dateValue(value: string) {
        return new Date(`${value}T00:00:00`)
    }

    function startOfToday() {
        const today = new Date()
        return new Date(today.getFullYear(), today.getMonth(), today.getDate())
    }

    function addRecurringInterval(value: Date, intervalMonths: 1 | 12) {
        const target = new Date(value.getFullYear(), value.getMonth() + intervalMonths, 1)
        const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
        return new Date(target.getFullYear(), target.getMonth(), Math.min(value.getDate(), lastDay))
    }

    function remainingExpectedMovements() {
        const window = scopeWindow()
        if (!window) return [] as { series: RecurringSeries; date: Date }[]
        const start = window.from > startOfToday() ? window.from : startOfToday()
        return confirmedRecurring.flatMap((series) => {
            const movements: { series: RecurringSeries; date: Date }[] = []
            let next = dateValue(series.nextExpectedDate)
            while (next < start) next = addRecurringInterval(next, series.intervalMonths)
            while (next <= window.to) {
                movements.push({ series, date: next })
                next = addRecurringInterval(next, series.intervalMonths)
            }
            return movements
        }).sort((a, b) => a.date.getTime() - b.date.getTime())
    }

    function estimateRemainingFlexibleSpending() {
        const window = scopeWindow()
        if (!window || !monthlyPeriods.length) return null
        const start = window.from > startOfToday() ? window.from : startOfToday()
        if (start > window.to) return 0
        const daysInWindow = Math.max(1, Math.round((window.to.getTime() - window.from.getTime()) / 86400000) + 1)
        const remainingDays = Math.max(0, Math.round((window.to.getTime() - start.getTime()) / 86400000) + 1)
        const recurringCategories = new Set(confirmedRecurring.map((series) => series.category).filter(Boolean))
        const recentPeriods = monthlyPeriods.slice(-3)
        const recentFlexibleAverage = recentPeriods.reduce((total, period) => total + period.categories.filter((item) => !recurringCategories.has(item.category)).reduce((sum, item) => sum + item.totalAmount, 0), 0) / recentPeriods.length
        const windowMonths = daysInWindow / 30.4375
        return recentFlexibleAverage * windowMonths * (remainingDays / daysInWindow)
    }

    function percentage(value: number, total: number) {
        return total ? Math.round((value / total) * 100) : 0
    }

    function monthLabel(key: string) {
        if (!key) return 'Select month'
        const [selectedYear, selectedMonth] = key.split('-').map(Number)
        return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(selectedYear, selectedMonth - 1, 1))
    }

    function rangeLabel(from: string, to: string) {
        if (!from || !to) return 'Choose a date range'
        return `${dateLabel(from)} – ${dateLabel(to)}`
    }

    function dateLabel(value: string) {
        if (!isDateKey(value)) return 'Select date'
        return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T00:00:00`))
    }

    function isDateKey(value: string) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
        const [year, month, day] = value.split('-').map(Number)
        const date = new Date(year, month - 1, day)
        return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    }

    function usualAmount(values: number[]) {
        if (values.length < 2) return null
        const sorted = [...values].sort((a, b) => a - b)
        const middle = Math.floor(sorted.length / 2)
        return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
    }

    function setMode(nextMode: ViewMode) {
        mode = nextMode
        if (nextMode === 'month' && !monthKey) monthKey = dashboard?.availablePeriods.lastMonth ?? ''
        if (nextMode === 'year' && !dashboard?.availablePeriods.years.includes(year)) year = dashboard?.availablePeriods.years.at(-1) ?? year
        if (nextMode === 'range' && (!isDateKey(fromDate) || !isDateKey(toDate)) && dashboard?.availablePeriods.firstMonth) {
            fromDate = `${dashboard.availablePeriods.firstMonth}-01`
            toDate = `${dashboard.availablePeriods.lastMonth}-${new Date(Number(dashboard.availablePeriods.lastMonth.slice(0, 4)), Number(dashboard.availablePeriods.lastMonth.slice(5, 7)), 0).getDate()}`
        }
        refresh()
    }

    function shiftChartWindow(direction: -1 | 1) {
        const nextOffset = Math.min(chartWindowCount - 1, Math.max(0, chartWindowOffset + direction))
        chartWindowOffset = nextOffset
        const selectedIndex = monthlyPeriods.length - (nextOffset * CHART_MONTHS) - 1
        overallMonthKey = monthlyPeriods[selectedIndex]?.key ?? overallMonthKey
    }

    function chartMonthLabel(key: string) {
        const [selectedYear, selectedMonth] = key.split('-').map(Number)
        return new Intl.DateTimeFormat('en-US', { month: 'short' }).format(new Date(selectedYear, selectedMonth - 1, 1))
    }

    function chartYearLabel(key: string) {
        return key.slice(0, 4)
    }

    function chooseMonth(event: Event) {
        monthKey = (event.currentTarget as HTMLInputElement).value
        refresh()
    }

    function chooseYear(event: Event) {
        year = Number((event.currentTarget as HTMLSelectElement).value)
        refresh()
    }

    function chooseRange() {
        if (isDateKey(fromDate) && isDateKey(toDate) && fromDate <= toDate) refresh()
    }

    function money(value: number | null | undefined) {
        return value == null ? '—' : currency.format(value)
    }

    function recurringAmount(series: RecurringSeries) {
        return `${series.direction === 'expense' ? '−' : '+'}${money(series.amountModel.typicalAmount)}`
    }

    function cadenceLabel(series: RecurringSeries) {
        return series.cadence === 'monthly' ? 'Monthly' : 'Yearly'
    }

    function confidenceTone(confidence: RecurringSeries['confidence']) {
        return confidence === 'confirmed' ? 'success' : confidence === 'probable' ? 'warning' : 'neutral'
    }

    function delta(value: number | null) {
        if (value == null) return '—'
        return `${value > 0 ? '+' : ''}${money(value)}`
    }

    function compactMoney(value: number | null | undefined) {
        return value == null ? '—' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 }).format(value)
    }

    function categoryName(id: string) {
        return categories.find((category) => category.id === id)?.name ?? 'Unknown category'
    }

    function compareAliases(a: Alias, b: Alias, sort: AliasSort, usage: Record<string, number>) {
        if (sort === 'name-asc') return a.value.localeCompare(b.value)
        if (sort === 'name-desc') return b.value.localeCompare(a.value)
        const difference = (usage[b.id] ?? 0) - (usage[a.id] ?? 0)
        return sort === 'usage-desc' ? difference || a.value.localeCompare(b.value) : -difference || a.value.localeCompare(b.value)
    }

    function fieldLabel(field: Alias['field']) {
        return field === 'any' ? 'Any statement field' : field === 'text' ? 'Description' : field === 'transaction_type' ? 'Transaction type' : 'Source category'
    }

    function chooseFile(event: Event) {
        selectedFile = (event.currentTarget as HTMLInputElement).files?.[0] ?? null
    }

    async function upload() {
        if (!selectedFile) return
        saving = true
        try {
            const result = await api.uploadStatement(selectedFile)
            fileName = result.fileName
            selectedFile = null
            await refresh()
        } catch (cause) {
            error = cause instanceof Error ? cause.message : 'Could not upload the statement.'
        } finally {
            saving = false
        }
    }

    async function addAlias() {
        if (!newAlias.value.trim() || !newAlias.categoryId) return
        saving = true
        try {
            await api.createAlias(fileName, { ...newAlias, transactionType: newAlias.transactionType || undefined })
            newAlias = { value: '', categoryId: newAlias.categoryId, field: 'any', transactionType: '' }
            await refreshRules()
        } catch (cause) {
            error = cause instanceof Error ? cause.message : 'Could not add the alias.'
        } finally {
            saving = false
        }
    }

    async function updateAlias(alias: Alias) {
        saving = true
        try {
            await api.updateAlias(fileName, alias.id, { value: alias.value, categoryId: alias.categoryId, field: alias.field, transactionType: alias.transactionType, statementId: alias.statementId, excludedStatementIds: alias.excludedStatementIds })
            editingAliasId = ''
            await refreshRules()
        } catch (cause) {
            error = cause instanceof Error ? cause.message : 'Could not update the alias.'
        } finally {
            saving = false
        }
    }

    async function removeAlias(id: string) {
        if (!confirm('Remove this alias?')) return
        await api.deleteAlias(fileName, id)
        await refreshRules()
    }

    async function addCategory() {
        if (!newCategory.name.trim()) return
        saving = true
        try {
            await api.createCategory(newCategory)
            newCategory = { name: '', necessity: 'necessity' }
            await refreshRules()
        } catch (cause) {
            error = cause instanceof Error ? cause.message : 'Could not add the category.'
        } finally {
            saving = false
        }
    }

    async function updateCategory(category: Category) {
        saving = true
        try {
            await api.updateCategory(category.id, category)
            editingCategoryId = ''
            await refreshRules()
        } catch (cause) {
            error = cause instanceof Error ? cause.message : 'Could not update the category.'
        } finally {
            saving = false
        }
    }

    async function removeCategory(category: Category) {
        if (category.aliasCount || !confirm(`Delete ${category.name}?`)) return
        try {
            await api.deleteCategory(category.id)
            await refreshRules()
        } catch (cause) {
            error = cause instanceof Error ? cause.message : 'Could not delete the category.'
        }
    }

    async function moveCategory(necessity: Necessity) {
        const category = categories.find((item) => item.id === draggedCategoryId)
        if (!category || category.necessity === necessity) return
        category.necessity = necessity
        await updateCategory(category)
        draggedCategoryId = ''
    }

    async function quickCreate(statement: RuleStatement) {
        if (!quickCategoryId) return
        saving = true
        try {
            const value = suggestedAlias(statement)
            await api.createAlias(fileName, { value, categoryId: quickCategoryId, field: 'any' })
            await refreshRules()
        } catch (cause) {
            error = cause instanceof Error ? cause.message : 'Could not create the alias.'
        } finally {
            saving = false
        }
    }

    function suggestedAlias(statement: RuleStatement) {
        const source = statement.recipient || statement.sender || statement.text || statement.purpose || statement.transactionType
        return source.trim().replace(/\s+/g, ' ').split(' ').slice(0, 3).join(' ')
    }

    async function pinAlias(statement: RuleStatement, aliasId: string) {
        saving = true
        try {
            for (const match of statement.matches.filter((item) => item.id !== aliasId)) {
                const other = aliases.find((alias) => alias.id === match.id)
                await api.updateAlias(fileName, match.id, { excludedStatementIds: [...(other?.excludedStatementIds ?? []), statement.id] })
            }
            await api.updateAlias(fileName, aliasId, { statementId: statement.id })
            await refreshRules()
        } catch (cause) {
            error = cause instanceof Error ? cause.message : 'Could not narrow the alias.'
        } finally {
            saving = false
        }
    }

    async function setRecurringRowDecision(row: RecurringRow, decision: 'confirmed' | 'denied') {
        saving = true
        try {
            await Promise.all(row.memberSeriesIds.map((seriesId) => api.setRecurringDecision(fileName, seriesId, decision)))
            recurring = await api.getRecurring(fileName)
        } catch (cause) {
            error = cause instanceof Error ? cause.message : 'Could not update the recurring decision.'
        } finally {
            saving = false
        }
    }

    function toggleRecurringSelection(row: RecurringRow) {
        if (row.members.length > 1) return
        selectedRecurringIds = selectedRecurringIds.includes(row.id) ? selectedRecurringIds.filter((id) => id !== row.id) : [...selectedRecurringIds, row.id]
    }

    async function mergeSelectedRecurring() {
        const seriesIds = recurringRows.filter((row) => selectedRecurringIds.includes(row.id)).flatMap((row) => row.memberSeriesIds)
        if (seriesIds.length < 2) return
        saving = true
        try {
            await api.createRecurringGroup(fileName, seriesIds)
            selectedRecurringIds = []
            await refresh()
        } catch (cause) {
            error = cause instanceof Error ? cause.message : 'Could not merge the recurring series.'
        } finally {
            saving = false
        }
    }

    async function unmergeRecurring(row: RecurringRow) {
        if (row.members.length < 2 || !confirm('Split this merged recurring payment back into its detected series?')) return
        saving = true
        try {
            await api.deleteRecurringGroup(fileName, row.id)
            await refresh()
        } catch (cause) {
            error = cause instanceof Error ? cause.message : 'Could not split the recurring payment.'
        } finally {
            saving = false
        }
    }

    function openRecurringAlias(row: RecurringRow) {
        recurringDialog = { kind: 'alias', row }
        recurringAliasDraft = recurringSettings.aliases[row.id] ?? row.alias ?? ''
        recurringAliasScan = null
    }

    async function saveRecurringAlias() {
        if (!recurringDialog) return
        recurringAliasScanning = true
        try {
            const { row } = recurringDialog
            const result = await api.saveRecurringAlias(fileName, row.id, row.memberSeriesIds, recurringAliasDraft.trim())
            recurringAliasScan = result.scan
            recurringSettings = await api.getRecurringSettings(fileName)
            recurring = await api.getRecurring(fileName)
        } catch (cause) {
            error = cause instanceof Error ? cause.message : 'Could not save the recurring alias.'
        } finally {
            recurringAliasScanning = false
        }
    }

    function openRecurringObservations(row: RecurringRow) {
        recurringDialog = { kind: 'observations', row }
        recurringAliasScan = null
        recurringObservationLimit = 100
    }

    function closeRecurringDialog() {
        recurringDialog = null
        recurringAliasScan = null
    }

    async function toggleManualRecurring(statement: RuleStatement) {
        saving = true
        try {
            const direction = statement.recurringDirection ? null : statement.amount != null && statement.amount > 0 ? 'income' : 'expense'
            await api.setManualRecurring(fileName, statement.id, direction)
            await refreshRules()
        } catch (cause) {
            error = cause instanceof Error ? cause.message : 'Could not update the recurring statement.'
        } finally {
            saving = false
        }
    }

    function openNewAlias(value = '') {
        newAlias = { ...newAlias, value }
        page = 'aliases'
    }

    function navigate(nextPage: Page) {
        if (page === nextPage) return
        page = nextPage
        const nextUrl = new URL(window.location.href)
        nextUrl.searchParams.set('page', nextPage)
        window.history.pushState({}, '', nextUrl)
    }

    function setCategoryAliasSearch(categoryId: string, value: string) {
        aliasCategorySearch = { ...aliasCategorySearch, [categoryId]: value }
        aliasCategoryExpanded = { ...aliasCategoryExpanded, [categoryId]: false }
    }

    function loadMoreAliases(categoryId: string) {
        aliasCategoryExpanded = { ...aliasCategoryExpanded, [categoryId]: true }
    }

    function goToAlias(aliasId: string) {
        const alias = aliases.find((item) => item.id === aliasId)
        if (!alias) return
        search = alias.value
        editingAliasId = alias.id
        page = 'aliases'
    }

    function goToCategory(categoryId: string) {
        page = 'categories'
        setTimeout(() => {
            document.getElementById(`category-${categoryId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 50)
    }

    function openSpendingCategory(category: string) {
        selectedSpendingCategory = category
        navigate('spending')
    }

    function openStatementsForCategory(category: string) {
        statementSearch = category
        statementFilter = 'all'
        statementTypeFilter = 'all'
        statementLimit = 100
        navigate('statements')
    }

    function openStatementsForMerchant(merchant: string) {
        statementSearch = merchant
        statementFilter = 'all'
        statementTypeFilter = 'all'
        statementLimit = 100
        navigate('statements')
    }
</script>

<svelte:head><title>Finance tracker · Spending overview</title><meta name="description" content="Understand spending, recurring payments, and where money goes." /></svelte:head>

<main class="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.13),_transparent_32rem),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)]">
    <div class="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <header class="mb-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
                <div class="mb-3 flex items-center gap-2"><span class="h-2 w-2 rounded-full bg-emerald-500"></span><span class="text-xs font-bold uppercase tracking-[0.22em] text-emerald-700">Finance workspace</span></div>
                <h1 class="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Understand your money, then decide.</h1>
                <p class="mt-2 max-w-2xl text-sm leading-6 text-slate-600">See what changed, what repeats, and where your spending has room to move.</p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
                <label class="flex h-10 max-w-64 items-center gap-2 rounded-xl border border-white/80 bg-white/80 px-3 text-sm shadow-sm backdrop-blur"><FileSpreadsheet size={16} class="text-slate-400" /><input bind:value={fileName} onkeydown={(event) => event.key === 'Enter' && refresh()} class="min-w-0 bg-transparent outline-none" aria-label="Statement filename" /></label>
                <label class="flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 text-xs font-semibold text-slate-600 hover:border-primary hover:bg-white"><Upload size={15} />{selectedFile?.name ?? 'Upload'}<input type="file" accept=".csv,text/csv" class="sr-only" onchange={chooseFile} /></label>
                {#if selectedFile}<Button size="sm" onclick={upload} disabled={saving}><Upload size={14} />Save file</Button>{/if}
                <Button variant="outline" size="icon" title="Refresh" aria-label="Refresh" onclick={refresh} disabled={loading}><RefreshCw size={16} class={loading ? 'animate-spin' : ''} /></Button>
            </div>
        </header>

        <nav class="mb-6 flex gap-1 overflow-x-auto rounded-2xl border border-white/80 bg-white/70 p-1.5 shadow-sm backdrop-blur" aria-label="Main navigation">
            <button class:active-tab={page === 'dashboard'} class="tab" onclick={() => navigate('dashboard')}><LayoutDashboard size={16} />Overview</button>
            <button class:active-tab={page === 'spending'} class="tab" onclick={() => navigate('spending')}><ArrowDownUp size={16} />Spending</button>
            <button class:active-tab={page === 'recurring'} class="tab" onclick={() => navigate('recurring')}><CalendarClock size={16} />Recurring {#if activeRecurring.length}<span class="tab-count">{activeRecurring.length}</span>{/if}</button>
            <button class:active-tab={page === 'review'} class="tab" onclick={() => navigate('review')}><AlertTriangle size={16} />Review {#if unmatched.length + conflicts.length}<span class="tab-count danger-count">{unmatched.length + conflicts.length}</span>{/if}</button>
            <button class:active-tab={page === 'aliases'} class="tab" onclick={() => navigate('aliases')}><Tag size={16} />Aliases <span class="tab-count">{aliases.length}</span></button>
            <button class:active-tab={page === 'categories'} class="tab" onclick={() => navigate('categories')}><FolderKanban size={16} />Categories</button>
            <button class:active-tab={page === 'statements'} class="tab" onclick={() => navigate('statements')}><ListFilter size={16} />Statements <span class="tab-count">{rules?.stats.total ?? 0}</span></button>
        </nav>

        {#if error}<Card className="mb-5 flex items-center gap-3 border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertTriangle size={17} /><span>{error}</span><button class="ml-auto text-xs font-bold" onclick={() => error = ''}>Dismiss</button></Card>{/if}

        {#if page === 'dashboard'}
            <section class="space-y-5 animate-float-in">
                {#if recurringRows.some((row) => row.reviewStatus !== 'denied')}
                    <Card className="overflow-hidden border-emerald-100 bg-white p-0"><div class="border-b border-emerald-100 bg-emerald-50/50 px-5 py-4"><p class="label text-emerald-600">Auto-detected recurring</p><h3 class="mt-1 text-lg font-semibold text-slate-950">Recurring series found in this ledger</h3><p class="hint">These counts are the total non-denied observations found for each repeating payment or income.</p></div><div class="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">{#each recurringRows.filter((row) => row.reviewStatus !== 'denied').slice(0, 6) as row}<button class="recurring-context-row" onclick={() => navigate('recurring')}><span class="min-w-0 text-left"><span class="block truncate font-semibold text-slate-800">{row.label}</span><span class="mt-1 block truncate text-xs text-slate-500">Auto-detected · {row.direction === 'income' ? 'income' : 'payment'}</span></span><span class="shrink-0 text-right"><strong class="block text-emerald-700">{row.observationIds.length}</strong><span class="text-[11px] text-slate-400">observations</span></span></button>{/each}</div>{#if recurringRows.filter((row) => row.reviewStatus !== 'denied').length > 6}<button class="load-more-link" onclick={() => navigate('recurring')}>Open all {recurringRows.filter((row) => row.reviewStatus !== 'denied').length} recurring series <ArrowUpRight size={14} /></button>{/if}</Card>
                {/if}
                <div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><Badge tone="success">Selected period</Badge><h2 class="mt-2 page-title">What happened in {scopeLabel}</h2><p class="page-subtitle">Start with a period, then compare what happened with what is usual.</p></div><span class="text-xs font-semibold text-slate-400">{fileName}</span></div>
                <Card className="flex flex-col gap-4 border-indigo-100 bg-indigo-50/60 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p class="label text-indigo-500">Analyze your money</p><p class="mt-1 text-sm text-slate-700">Choose the period that should drive every number below.</p></div><div class="flex flex-wrap items-center gap-2"><div class="inline-flex rounded-xl bg-white/70 p-1">{#each [['month', 'Month'], ['year', 'Year'], ['range', 'Custom'], ['all', 'All time']] as option}<button class:active-mode={mode === option[0]} class="rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 transition hover:text-slate-950" onclick={() => setMode(option[0] as ViewMode)}>{option[1]}</button>{/each}</div>{#if mode === 'month'}<div class="relative"><button class="field min-w-44 text-left">{scopeLabel}</button><input type="month" aria-label="Select month" bind:value={monthKey} min={dashboard?.availablePeriods.firstMonth} max={dashboard?.availablePeriods.lastMonth} onchange={chooseMonth} class="absolute inset-0 h-full w-full cursor-pointer opacity-0" /></div>{:else if mode === 'year'}<div class="relative"><button class="field min-w-28 text-left">{year}</button><select aria-label="Select year" bind:value={year} onchange={chooseYear} class="absolute inset-0 h-full w-full cursor-pointer opacity-0">{#each dashboard?.availablePeriods.years ?? [year] as availableYear}<option value={availableYear}>{availableYear}</option>{/each}</select></div>{:else if mode === 'range'}<div class="flex flex-wrap items-center gap-2"><input type="date" bind:value={fromDate} onchange={chooseRange} class="field" aria-label="Range start" /><span class="text-xs font-semibold text-slate-400">to</span><input type="date" bind:value={toDate} onchange={chooseRange} class="field" aria-label="Range end" /></div>{/if}</div></Card>
                <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Card className="p-5"><div class="mb-5 flex items-center justify-between"><span class="icon-tile bg-indigo-50 text-indigo-600"><Sparkles size={18} /></span><Badge>{scopeLabel}</Badge></div><p class="label">Net movement</p><p class="metric">{money(dashboard?.metrics.netMovement)}</p><p class="hint">Income minus spending</p></Card>
                    <Card className="p-5"><div class="mb-5 flex items-center justify-between"><span class="icon-tile bg-emerald-50 text-emerald-600"><ArrowRight size={18} /></span><Badge>{scopeLabel}</Badge></div><p class="label">Income</p><p class="metric">{money(dashboard?.metrics.income)}</p><p class="hint">Money received in this period</p></Card>
                    <Card className="p-5"><div class="mb-5 flex items-center justify-between"><span class="icon-tile bg-amber-50 text-amber-600"><WandSparkles size={18} /></span><Badge>{scopeLabel}</Badge></div><p class="label">Spending</p><p class="metric">{money(dashboard?.metrics.spending)}</p><p class="hint">Negative movements in this period</p></Card>
                    <Card className="p-5"><div class="mb-5 flex items-center justify-between"><span class="icon-tile bg-violet-50 text-violet-600"><Sparkles size={18} /></span><Badge>{scopeLabel}</Badge></div><p class="label">Top category</p><p class="truncate text-2xl font-semibold tracking-tight text-slate-950">{dashboard?.metrics.topCategory?.category ?? '—'}</p><p class="hint">{money(dashboard?.metrics.topCategory?.totalAmount)} in this period</p></Card>
                </div>

                <div class="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
                    <Card className="border-slate-200 bg-white p-5"><div class="flex items-start justify-between gap-4"><div><p class="label">Period at a glance</p><h2 class="mt-1 text-xl font-semibold text-slate-950">{spendingDelta == null ? 'Build your baseline' : spendingDelta >= 0 ? `${money(spendingDelta)} above usual` : `${money(Math.abs(spendingDelta))} below usual`}</h2><p class="hint">{usualPeriodSpending == null ? 'Select a month or year with enough history to compare.' : `Usual spending is ${money(usualPeriodSpending)} for this view.`}</p></div><Badge tone={spendingDelta != null && spendingDelta > 0 ? 'warning' : 'success'}>{spendingDelta == null ? 'No comparison' : spendingDelta > 0 ? 'Above usual' : 'On track'}</Badge></div>{#if topChanges.length}<div class="mt-5 space-y-1">{#each topChanges as item}<button class="dashboard-detail-row" onclick={() => openSpendingCategory(item.category)}><span class="min-w-0 truncate font-medium text-slate-700">{item.category}</span><span class={item.difference && item.difference > 0 ? 'font-semibold text-amber-700' : 'font-semibold text-emerald-700'}>{delta(item.difference)} <ArrowUpRight size={14} /></span></button>{/each}</div>{:else}<p class="mt-5 text-sm text-slate-500">Your category comparison will appear once this period has a usable history.</p>{/if}</Card>
                    <Card className="border-indigo-100 bg-indigo-50/50 p-5"><div class="flex items-start justify-between gap-4"><div><p class="label text-indigo-500">Cash flow pulse</p><h2 class="mt-1 text-xl font-semibold text-slate-950">{money(dashboard?.metrics.netMovement)} net</h2><p class="hint">Compare money in and money out for {scopeLabel.toLocaleLowerCase()}.</p></div><button class="icon-button" title="Open spending analysis" aria-label="Open spending analysis" onclick={() => navigate('spending')}><ArrowRight size={17} /></button></div><div class="mt-5 space-y-3"><button class="cashflow-row" onclick={() => navigate('spending')}><span><span class="cashflow-dot income"></span>Income</span><strong>{money(dashboard?.metrics.income)}</strong></button><div class="cashflow-track"><span class="cashflow-fill income" style={`width:${Math.max(4, ((dashboard?.metrics.income ?? 0) / Math.max(dashboard?.metrics.income ?? 0, dashboard?.metrics.spending ?? 0, 1)) * 100)}%`}></span></div><button class="cashflow-row" onclick={() => navigate('spending')}><span><span class="cashflow-dot spending"></span>Spending</span><strong>{money(dashboard?.metrics.spending)}</strong></button><div class="cashflow-track"><span class="cashflow-fill spending" style={`width:${Math.max(4, ((dashboard?.metrics.spending ?? 0) / Math.max(dashboard?.metrics.income ?? 0, dashboard?.metrics.spending ?? 0, 1)) * 100)}%`}></span></div></div></Card>
                </div>

                <div class="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
                    <Card className="p-5"><div class="mb-5 flex items-center justify-between"><div><div class="flex items-center gap-2"><h2 class="section-title">Spending by category</h2><Badge>{scopeLabel}</Badge></div><p class="hint">Resolved from aliases for the selected period</p></div><button class="icon-button" title="Open categories" aria-label="Open categories" onclick={() => page = 'categories'}><ArrowRight size={17} /></button></div><div class="space-y-1">{#each dashboard?.categories.slice(0, 6) ?? [] as item}<button class="dashboard-category-row" onclick={() => openSpendingCategory(item.category)}><div class="mb-1.5 flex items-center justify-between text-sm"><span class="font-medium text-slate-700">{item.category}</span><span class="flex items-center gap-1 font-semibold text-slate-950">{money(item.totalAmount)}<ArrowUpRight size={14} /></span></div><div class="progress"><span style={`width:${Math.max(5, item.shareOfSpending * 100)}%`}></span></div></button>{:else}<p class="hint">No spending data yet.</p>{/each}</div></Card>
                    <Card className="p-5"><div class="flex items-start justify-between gap-4"><div><p class="label">Data quality</p><h2 class="mt-1 text-xl font-semibold text-slate-950">{coverage}% classified</h2><p class="hint">{unmatched.length + conflicts.length ? `${unmatched.length + conflicts.length} statements need attention.` : 'Every statement currently has one matching alias.'}</p></div><button class="icon-button" title="Open data quality review" aria-label="Open data quality review" onclick={() => page = 'review'}><ArrowRight size={17} /></button></div><div class="mt-5 grid grid-cols-2 gap-3"><div class="rounded-xl bg-amber-50 p-3"><p class="label text-amber-600">Unmatched</p><p class="mt-1 text-xl font-semibold text-amber-700">{unmatched.length}</p></div><div class="rounded-xl bg-red-50 p-3"><p class="label text-red-600">Conflicts</p><p class="mt-1 text-xl font-semibold text-red-700">{conflicts.length}</p></div></div></Card>
                </div>

                <div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><Badge>Overall history</Badge><h2 class="mt-2 page-title">See the pattern, then inspect a month.</h2><p class="page-subtitle">The chart splits total spending across every category. Choose a category to compare it inside the selected month below.</p></div><div class="flex items-center gap-2"><span class="text-xs font-semibold text-slate-500">Compare category</span><select bind:value={comparisonCategory} class="field w-48" aria-label="Category for monthly comparison">{#each comparisonOptions as category}<option value={category}>{category}</option>{/each}</select></div></div>
                <Card className="overflow-hidden p-0">
                    <div class="border-b border-slate-100 p-5">
                        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                                <div class="flex items-center gap-2">
                                    <h3 class="section-title">Necessity vs convenience</h3>
                                    <Badge>Last 12 months</Badge>
                                </div>
                                <p class="hint">Last 12 months · use the arrows to browse older history</p>
                            </div>
                            <div class="flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-500">
                                <span class="flex items-center gap-1.5"><span class="dot emerald"></span>Necessity</span>
                                <span class="flex items-center gap-1.5"><span class="dot violet"></span>Convenience</span>
                                {#if necessityPeriods.some((period) => period.unclassified > 0)}<span class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-full bg-slate-300"></span>Unclassified</span>{/if}
                                <span class="inline-flex items-center gap-1">
                                    <button class="icon-button" title="Show older 12 months" aria-label="Show older 12 months" onclick={() => shiftChartWindow(1)} disabled={chartWindowOffset >= chartWindowCount - 1}><ChevronLeft size={17} /></button>
                                    <button class="icon-button" title="Show newer 12 months" aria-label="Show newer 12 months" onclick={() => shiftChartWindow(-1)} disabled={chartWindowOffset === 0}><ChevronRight size={17} /></button>
                                </span>
                            </div>
                        </div>
                        <div class="necessity-chart" role="img" aria-label="Monthly necessity and convenience spending chart">
                            {#each visibleNecessityPeriods as period}
                                <button class:chart-bar-selected={period.key === overallMonthKey} class="necessity-bar" aria-label={`${period.label}: ${money(period.necessity)} necessity, ${money(period.convenience)} convenience`} aria-pressed={period.key === overallMonthKey} onclick={() => overallMonthKey = period.key}>
                                    <span class="necessity-value">{compactMoney(period.spending)}</span>
                                    <span class="necessity-track" style={`height:${Math.max(4, (period.spending / maxNecessitySpending) * 100)}%`}><span class="necessity-segment necessity" style={`height:${period.spending ? (period.necessity / period.spending) * 100 : 0}%`}></span><span class="necessity-segment convenience" style={`height:${period.spending ? (period.convenience / period.spending) * 100 : 0}%`}></span><span class="necessity-segment unclassified" style={`height:${period.spending ? (period.unclassified / period.spending) * 100 : 0}%`}></span></span>
                                    <span class="chart-label"><span>{chartMonthLabel(period.key)}</span><span class="chart-year">{chartYearLabel(period.key)}</span></span>
                                </button>
                            {:else}
                                <p class="hint">No monthly category data available.</p>
                            {/each}
                        </div>
                    </div>
                    <div class="grid gap-5 p-5 lg:grid-cols-[0.8fr_1.2fr]">
                        <div>
                            <div class="mb-4 flex items-center justify-between">
                                <div>
                                    <p class="label">Selected month</p>
                                    <p class="mt-1 text-lg font-semibold text-slate-950">{overallPeriod?.label ?? '—'}</p>
                                </div>
                                <div class="text-right"><p class="label">Total spent</p><p class="mt-1 text-lg font-semibold text-slate-950">{money(overallPeriod?.spending)}</p></div>
                            </div>
                            <div class="selected-breakdown" aria-label="Selected month spending split">
                                <span class="selected-breakdown-segment necessity" style={`width:${percentage(necessityPeriod?.necessity ?? 0, overallPeriod?.spending ?? 0)}%`}></span>
                                <span class="selected-breakdown-segment convenience" style={`width:${percentage(necessityPeriod?.convenience ?? 0, overallPeriod?.spending ?? 0)}%`}></span>
                                <span class="selected-breakdown-segment unclassified" style={`width:${percentage(necessityPeriod?.unclassified ?? 0, overallPeriod?.spending ?? 0)}%`}></span>
                            </div>
                            <div class="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
                                <button class="breakdown-stat" aria-expanded={selectedNecessityBreakdown === 'necessity'} onclick={() => selectedNecessityBreakdown = selectedNecessityBreakdown === 'necessity' ? null : 'necessity'}><span><span class="dot emerald"></span>Necessity</span><strong>{money(necessityPeriod?.necessity)} <small>{percentage(necessityPeriod?.necessity ?? 0, overallPeriod?.spending ?? 0)}%</small> <ChevronDown size={14} class={selectedNecessityBreakdown === 'necessity' ? 'rotate-180' : ''} /></strong></button>
                                <button class="breakdown-stat" aria-expanded={selectedNecessityBreakdown === 'convenience'} onclick={() => selectedNecessityBreakdown = selectedNecessityBreakdown === 'convenience' ? null : 'convenience'}><span><span class="dot violet"></span>Convenience</span><strong>{money(necessityPeriod?.convenience)} <small>{percentage(necessityPeriod?.convenience ?? 0, overallPeriod?.spending ?? 0)}%</small> <ChevronDown size={14} class={selectedNecessityBreakdown === 'convenience' ? 'rotate-180' : ''} /></strong></button>
                                {#if (necessityPeriod?.unclassified ?? 0) > 0}<div class="breakdown-stat"><span><span class="dot unclassified-dot"></span>Unclassified</span><strong>{money(necessityPeriod?.unclassified)} <small>{percentage(necessityPeriod?.unclassified ?? 0, overallPeriod?.spending ?? 0)}%</small></strong></div>{/if}
                            </div>
                            {#if selectedNecessityBreakdown}
                                <div class="mt-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
                                    <div class="mb-2 flex items-center justify-between gap-2"><p class="label">Top {selectedNecessityBreakdown} categories</p><button class="text-xs font-semibold text-primary hover:underline" onclick={() => openStatementsForCategory(selectedNecessityBreakdown ?? '')}>Open statements</button></div>
                                    {#each selectedBreakdownCategories as item}<button class="dashboard-detail-row" onclick={() => openSpendingCategory(item.category)}><span class="min-w-0 truncate"><span class="font-medium text-slate-700">{item.category}</span><span class="ml-2 text-xs text-slate-400">{item.transactionCount} transactions</span></span><span class="flex items-center gap-1 font-semibold text-slate-950">{money(item.totalAmount)}<ArrowUpRight size={14} /></span></button>{:else}<p class="text-xs text-slate-500">No category detail is available for this split.</p>{/each}
                                </div>
                            {/if}
                            <div class="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                                <div class="trend-stat"><span>Monthly average</span><strong>{money(comparisonAverage)}</strong></div>
                                <div class="trend-stat"><span>{comparisonCategory || 'Category'} vs last month</span><strong>{delta(overallComparison?.previous == null ? null : (overallComparison?.amount ?? 0) - overallComparison.previous)}</strong></div>
                                <div class="trend-stat"><span>{comparisonCategory || 'Category'} vs usual</span><strong>{delta(overallComparison?.usual == null ? null : (overallComparison?.amount ?? 0) - overallComparison.usual)}</strong></div>
                            </div>
                        </div>
                        <div>
                            <div class="mb-4 flex items-center justify-between">
                                <div>
                                    <p class="label">Category mix</p>
                                    <p class="hint">Top five in {overallPeriod?.label ?? 'the selected month'}</p>
                                </div>
                                <span class="text-xs font-semibold text-slate-400">{money(overallPeriod?.spending)} total</span>
                            </div>
                            <div class="space-y-3">
                                {#each overallPeriod?.categories.slice(0, 5) ?? [] as item}
                                    <div>
                                        <div class="mb-1 flex items-center justify-between text-xs"><span class="font-semibold text-slate-700">{item.category}</span><span class="font-semibold text-slate-950">{money(item.totalAmount)}</span></div>
                                        <div class="progress"><span style={`width:${Math.max(5, item.shareOfSpending * 100)}%`}></span></div>
                                    </div>
                                {:else}
                                    <p class="hint">No category mix available.</p>
                                {/each}
                            </div>
                        </div>
                    </div>
                </Card>
            </section>
        {:else if page === 'spending'}
            <section class="space-y-5 animate-float-in">
                <div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><Badge tone="success">Spending analysis</Badge><h2 class="mt-2 page-title">Where did the money go?</h2><p class="page-subtitle">Compare this period with what is usual, then open a category to see the merchants behind the change.</p></div><span class="text-xs font-semibold text-slate-400">{fileName}</span></div>
                <Card className="flex flex-col gap-4 border-indigo-100 bg-indigo-50/60 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p class="label text-indigo-500">Analyze this timeframe</p><p class="mt-1 text-sm text-slate-700">Every number on this page follows the selected period.</p></div><div class="flex flex-wrap items-center gap-2"><div class="inline-flex rounded-xl bg-white/70 p-1">{#each [['month', 'Month'], ['year', 'Year'], ['range', 'Custom'], ['all', 'All time']] as option}<button class:active-mode={mode === option[0]} class="rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 transition hover:text-slate-950" onclick={() => setMode(option[0] as ViewMode)}>{option[1]}</button>{/each}</div>{#if mode === 'month'}<div class="relative"><button class="field min-w-44 text-left">{scopeLabel}</button><input type="month" aria-label="Select month" bind:value={monthKey} min={dashboard?.availablePeriods.firstMonth} max={dashboard?.availablePeriods.lastMonth} onchange={chooseMonth} class="absolute inset-0 h-full w-full cursor-pointer opacity-0" /></div>{:else if mode === 'year'}<div class="relative"><button class="field min-w-28 text-left">{year}</button><select aria-label="Select year" bind:value={year} onchange={chooseYear} class="absolute inset-0 h-full w-full cursor-pointer opacity-0">{#each dashboard?.availablePeriods.years ?? [year] as availableYear}<option value={availableYear}>{availableYear}</option>{/each}</select></div>{:else if mode === 'range'}<div class="flex flex-wrap items-center gap-2"><input type="date" bind:value={fromDate} onchange={chooseRange} class="field" aria-label="Range start" /><span class="text-xs font-semibold text-slate-400">to</span><input type="date" bind:value={toDate} onchange={chooseRange} class="field" aria-label="Range end" /></div>{/if}</div></Card>
                <Card className="flex flex-col gap-3 border-indigo-100 bg-indigo-50/60 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p class="label text-indigo-500">Current scope</p><p class="mt-1 text-lg font-semibold text-slate-950">{scopeLabel}</p></div><div class="flex flex-wrap gap-2 text-xs font-semibold text-slate-600"><span class="rounded-full bg-white/80 px-3 py-1.5">{spendingRows.length} categories</span><span class="rounded-full bg-white/80 px-3 py-1.5">{scopedExpenseStatements.length} transactions</span></div></Card>
                <div class="grid gap-4 md:grid-cols-4">
                    <Card className="p-5"><p class="label">Actual spending</p><p class="metric">{money(dashboard?.metrics.spending)}</p><p class="hint">In the selected scope.</p></Card>
                    <Card className="p-5"><p class="label">Usual spending</p><p class="metric">{money(usualPeriodSpending)}</p><p class="hint">Median of comparable periods.</p></Card>
                    <Card className="p-5"><p class="label">Difference</p><p class={spendingDelta != null && spendingDelta > 0 ? 'metric text-amber-700' : 'metric text-emerald-700'}>{delta(spendingDelta)}</p><p class="hint">Compared with usual.</p></Card>
                    <Card className="p-5"><p class="label">Expected recurring</p><p class="metric">{mode === 'all' ? '—' : money(expectedRecurringTotal)}</p><p class="hint">Known recurring expenses in this scope.</p></Card>
                </div>
                <Card className="border-indigo-100 bg-indigo-50/40 p-5"><div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p class="label text-indigo-500">Remaining outlook</p><h3 class="mt-1 text-xl font-semibold text-slate-950">What is still likely in {scopeLabel.toLocaleLowerCase()}?</h3><p class="hint">Fixed movements use confirmed recurring series. Flexible spending is an estimate from the last three months.</p></div><Badge>{mode === 'all' ? 'Select a timeframe' : `${expectedFixedExpenses.length + expectedFixedIncome.length} fixed movements`}</Badge></div>{#if mode === 'all'}<p class="mt-4 rounded-xl bg-white/70 p-4 text-sm text-slate-600">Choose a month, year, or custom range to see the remaining expected amounts.</p>{:else}<div class="mt-5 grid gap-4 lg:grid-cols-2"><div class="rounded-2xl bg-white/80 p-4"><div class="flex items-center justify-between gap-3"><div><p class="label">Fixed / recurring</p><p class="mt-1 text-2xl font-semibold text-slate-950">{money(expectedFixedExpenses.reduce((total, item) => total + item.series.amountModel.typicalAmount, 0))}</p><p class="hint">Expected payments still ahead</p></div><div class="text-right"><p class="label text-emerald-600">Income</p><p class="mt-1 font-semibold text-emerald-700">+{money(expectedFixedIncome.reduce((total, item) => total + item.series.amountModel.typicalAmount, 0))}</p></div></div>{#if expectedFixedExpenses.length || expectedFixedIncome.length}<div class="mt-4 space-y-2">{#each [...expectedFixedExpenses, ...expectedFixedIncome].slice(0, 5) as item}<div class="flex items-center justify-between gap-3 text-sm"><span class="min-w-0 truncate font-medium text-slate-700">{item.series.label}</span><span class={item.series.direction === 'income' ? 'shrink-0 font-semibold text-emerald-700' : 'shrink-0 font-semibold text-slate-900'}>{item.series.direction === 'income' ? '+' : '−'}{money(item.series.amountModel.typicalAmount)} · {dateLabel(item.date.toISOString().slice(0, 10))}</span></div>{/each}</div>{:else}<p class="mt-4 text-sm text-slate-500">No confirmed recurring movements remain in this timeframe.</p>{/if}</div><div class="rounded-2xl bg-white/80 p-4"><p class="label">Flexible estimate</p><p class="mt-1 text-2xl font-semibold text-slate-950">{money(estimatedFlexibleSpending)}</p><p class="hint">Variable spending based on your average monthly habits over the last 3 months.</p><div class="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">This is a guide, not a promise. Groceries, dining, shopping, and other changing categories can move above or below it.</div></div></div>{/if}</Card>
                <Card className="overflow-hidden p-0">
                    <div class="border-b border-slate-100 p-5"><div class="flex items-start justify-between gap-4"><div><p class="label">Category comparison</p><h3 class="mt-1 text-xl font-semibold text-slate-950">What changed in this period?</h3><p class="hint">Select a category to inspect its merchants below.</p></div><Badge>{scopeLabel}</Badge></div></div>
                    <div class="overflow-x-auto"><table class="w-full min-w-[820px] text-left text-sm"><thead class="bg-slate-50/80 text-xs uppercase tracking-wider text-slate-400"><tr><th class="px-5 py-3 font-bold">Category</th><th class="px-5 py-3 font-bold">Actual</th><th class="px-5 py-3 font-bold">Usual</th><th class="px-5 py-3 font-bold">Recurring expected</th><th class="px-5 py-3 font-bold">Difference</th><th class="px-5 py-3 font-bold">Share</th><th class="px-5 py-3 font-bold">Transactions</th></tr></thead><tbody class="divide-y divide-slate-100">{#each spendingRows as item}<tr class:bg-indigo-50={selectedSpendingCategory === item.category} class="cursor-pointer hover:bg-slate-50" onclick={() => selectedSpendingCategory = item.category}><td class="px-5 py-4"><button class="text-left font-semibold text-slate-800 hover:text-primary">{item.category}</button><p class="mt-1 text-xs text-slate-400">{item.control === 'committed' ? 'Committed' : item.control === 'influenceable' ? 'Influenceable' : 'Unclassified'} · {item.necessity === 'necessity' ? 'Necessary' : item.necessity === 'convenience' ? 'Convenience' : 'Unclassified'}</p></td><td class="px-5 py-4 font-semibold text-slate-950">{money(item.totalAmount)}</td><td class="px-5 py-4 text-slate-600">{money(item.usual)}</td><td class="px-5 py-4 text-slate-600">{mode === 'all' ? '—' : money(item.recurringExpected)}</td><td class={item.difference != null && item.difference > 0 ? 'px-5 py-4 font-semibold text-amber-700' : 'px-5 py-4 font-semibold text-emerald-700'}>{delta(item.difference)}</td><td class="px-5 py-4 text-slate-600">{Math.round(item.shareOfSpending * 100)}%</td><td class="px-5 py-4 text-slate-600">{item.transactionCount}</td></tr>{:else}<tr><td colspan="7" class="px-5 py-10 text-center text-sm text-slate-500">No spending categories found for this scope.</td></tr>{/each}</tbody></table></div>
                </Card>
                <Card className="overflow-hidden p-0">
                    <div class="border-b border-slate-100 p-5"><div class="flex items-start justify-between gap-4"><div><p class="label">Merchant detail</p><h3 class="mt-1 text-xl font-semibold text-slate-950">{selectedSpendingCategory || 'Choose a category'}</h3><p class="hint">The largest merchants behind this category in {scopeLabel}.</p></div>{#if selectedSpendingCategory}<div class="flex items-center gap-2"><Badge>{money(spendingRows.find((item) => item.category === selectedSpendingCategory)?.totalAmount)} total</Badge><button class="icon-button" title="Open matching statements" aria-label="Open matching statements" onclick={() => openStatementsForCategory(selectedSpendingCategory)}><ArrowUpRight size={17} /></button></div>{/if}</div></div>
                    <div class="divide-y divide-slate-100">{#each selectedMerchantRows as merchant}<button class="merchant-detail-row" onclick={() => openStatementsForMerchant(merchant.merchant)}><div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600"><ArrowDownUp size={16} /></div><div class="min-w-0 flex-1 text-left"><p class="truncate font-semibold text-slate-800">{merchant.merchant}</p><p class="mt-1 text-xs text-slate-500">{merchant.count} transaction{merchant.count === 1 ? '' : 's'}</p></div><p class="font-semibold text-slate-950">{money(merchant.total)}</p><ArrowUpRight size={15} class="shrink-0 text-slate-300" /></button>{:else}<p class="p-8 text-center text-sm text-slate-500">No merchant details available for this category.</p>{/each}</div>
                </Card>
            </section>
        {:else if page === 'recurring'}
            <section class="space-y-5 animate-float-in">
                <div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><Badge tone="success">Planning view · {activeRecurring.length} active</Badge><h2 class="mt-2 page-title">Recurring money, made visible.</h2><p class="page-subtitle">Review detected payments and income, then confirm what belongs in your recurring plan.</p></div><span class="text-xs font-semibold text-slate-400">Derived from statement history</span></div>
                <div class="grid gap-4 md:grid-cols-3">
                    <Card className="p-5"><p class="label">Recurring expenses / month</p><p class="metric">{money(monthlyRecurringExpenses)}</p><p class="hint">Yearly payments converted to a monthly run-rate.</p></Card>
                    <Card className="p-5"><p class="label">Recurring expenses / year</p><p class="metric">{money(annualRecurringExpenses)}</p><p class="hint">Useful for seeing the real cost of small subscriptions.</p></Card>
                    <Card className="p-5"><p class="label">Recurring income</p><p class="metric text-emerald-700">{money(recurringIncome.reduce((total, series) => total + series.amountModel.typicalAmount * (12 / series.intervalMonths), 0))}</p><p class="hint">Annualized from detected repeating income.</p></Card>
                </div>
                {#if manualRecurringStatements.length}<Card className="overflow-hidden border-indigo-100 bg-indigo-50/40 p-0"><div class="border-b border-indigo-100 p-5"><p class="label text-indigo-500">Manual assignments</p><h3 class="mt-1 text-xl font-semibold text-slate-950">Statements you marked as recurring</h3></div><div class="divide-y divide-indigo-100">{#each manualRecurringStatements as item}<div class="flex items-center gap-3 px-5 py-3.5"><div class="min-w-0 flex-1"><p class="truncate font-semibold text-slate-800">{item.recipient || item.sender || item.text || 'Untitled statement'}</p><p class="mt-1 text-xs text-slate-500">{item.date ? dateLabel(item.date.slice(0, 10)) : 'No date'} · {money(item.amount)}</p></div><Badge tone={item.recurringDirection === 'income' ? 'success' : 'warning'}>Recurring {item.recurringDirection === 'income' ? 'income' : 'payment'}</Badge><button class="icon-button danger-hover" title="Remove recurring assignment" aria-label="Remove recurring assignment" onclick={() => toggleManualRecurring(item)} disabled={saving}><X size={15} /></button></div>{/each}</div></Card>{/if}
                <Card className="overflow-hidden p-0">
                    <div class="border-b border-slate-100 p-5"><div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p class="label">Recurring inventory</p><h3 class="mt-1 text-xl font-semibold text-slate-950">Your repeating commitments and income</h3><p class="hint">Select detected series to merge them, edit an alias to rescan observations, or open every statement found.</p></div>{#if selectedRecurringIds.length}<Button size="sm" onclick={mergeSelectedRecurring} disabled={saving || selectedRecurringIds.length < 2}><GitMerge size={14} />Merge {selectedRecurringIds.length} selected</Button>{/if}</div></div>
                    <div class="overflow-x-auto"><table class="w-full min-w-[1040px] text-left text-sm"><thead class="bg-slate-50/80 text-xs uppercase tracking-wider text-slate-400"><tr><th class="w-12 px-5 py-3 font-bold"><span class="sr-only">Select</span></th><th class="px-5 py-3 font-bold">Payment</th><th class="px-5 py-3 font-bold">Cadence</th><th class="px-5 py-3 font-bold">Typical</th><th class="px-5 py-3 font-bold">Observations</th><th class="px-5 py-3 font-bold">Review</th><th class="px-5 py-3 text-right font-bold">Actions</th></tr></thead><tbody class="divide-y divide-slate-100">{#each recurringRows as item}<tr class:item-denied={item.reviewStatus === 'denied'} class="hover:bg-slate-50/70"><td class="px-5 py-4 align-top"><input type="checkbox" checked={selectedRecurringIds.includes(item.id)} disabled={item.members.length > 1} onchange={() => toggleRecurringSelection(item)} aria-label={`Select ${item.label} for merging`} /></td><td class="px-5 py-4"><p class="font-semibold text-slate-800">{item.label}</p><p class="mt-1 text-xs text-slate-500">{item.counterparty} · {item.direction === 'expense' ? 'Expense' : 'Income'}{#if item.members.length > 1} · {item.members.length} detected series{/if}</p></td><td class="px-5 py-4 text-slate-600">{cadenceLabel(item)}</td><td class={item.direction === 'expense' ? 'px-5 py-4 font-semibold text-slate-900' : 'px-5 py-4 font-semibold text-emerald-700'}>{recurringAmount(item)}<span class="ml-1 text-xs font-normal text-slate-400">{item.currency}</span></td><td class="px-5 py-4"><button class="observation-count" onclick={() => openRecurringObservations(item)}><span>{item.occurrences.length}</span><span>{item.occurrences.length === 1 ? 'statement' : 'statements'}</span><Eye size={14} /></button></td><td class="px-5 py-4"><Badge tone={item.reviewStatus === 'confirmed' ? 'success' : item.reviewStatus === 'denied' ? 'danger' : 'warning'}>{item.reviewStatus}</Badge><p class="mt-1 text-xs text-slate-400">{item.confidence}</p></td><td class="px-5 py-4"><div class="flex justify-end gap-1"><button class="icon-button" title="View all observations" aria-label={`View all observations for ${item.label}`} onclick={() => openRecurringObservations(item)}><Eye size={15} /></button><button class="icon-button" title="Adjust recurring alias" aria-label={`Adjust alias for ${item.label}`} onclick={() => openRecurringAlias(item)}><Pencil size={15} /></button>{#if item.members.length > 1}<button class="icon-button danger-hover" title="Split merged recurring payment" aria-label={`Split ${item.label}`} onclick={() => unmergeRecurring(item)} disabled={saving}><GitMerge size={15} /></button>{/if}{#if item.reviewStatus !== 'confirmed'}<button class="icon-button recurring-confirm" title="Confirm recurring series" aria-label={`Confirm ${item.label} as recurring`} onclick={() => setRecurringRowDecision(item, 'confirmed')} disabled={saving}><Check size={15} /></button>{/if}{#if item.reviewStatus !== 'denied'}<button class="icon-button danger-hover" title="Deny recurring series" aria-label={`Deny ${item.label} as recurring`} onclick={() => setRecurringRowDecision(item, 'denied')} disabled={saving}><X size={15} /></button>{/if}</div></td></tr>{:else}<tr><td colspan="7" class="px-5 py-10 text-center text-sm text-slate-500">No recurring series found. More history makes yearly detections stronger.</td></tr>{/each}</tbody></table></div>
                </Card>
            </section>
        {:else if page === 'aliases'}
            <section class="alias-page space-y-5 animate-float-in">
                <div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><Badge tone="success">Rules · {aliases.length}</Badge><h2 class="mt-2 page-title">Aliases that do the sorting.</h2><p class="page-subtitle">An alias is a literal “contains” match. For example, add <strong>Rewe</strong> and <strong>Edeka</strong> as Description aliases assigned to Groceries; future matching statements will be classified automatically.</p></div><div class="relative"><Search size={16} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input bind:value={search} class="h-10 w-56 rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-primary" placeholder="Search aliases" /></div></div>
                <Card className="p-4"><div class="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between"><div class="flex flex-wrap items-center gap-2"><span class="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400"><Filter size={14} />Filter</span>{#each [['all', 'All aliases'], ['used', 'Used'], ['unused', 'Unused']] as filter}<button class:active-filter={aliasUsageFilter === filter[0]} class="filter-chip" onclick={() => aliasUsageFilter = filter[0] as AliasUsageFilter}>{filter[1]} <span>{filter[0] === 'all' ? aliases.length : filter[0] === 'used' ? aliases.filter((alias) => (rules?.aliasUsage?.[alias.id] ?? 0) > 0).length : aliases.filter((alias) => (rules?.aliasUsage?.[alias.id] ?? 0) === 0).length}</span></button>{/each}</div><div class="flex flex-col gap-2 sm:flex-row"><select bind:value={aliasCategoryFilter} class="field sm:w-48" aria-label="Filter aliases by category"><option value="all">All categories</option>{#each categories as category}<option value={category.id}>{category.name}</option>{/each}</select><select bind:value={aliasFieldFilter} class="field sm:w-48" aria-label="Filter aliases by matched field"><option value="all">All matched fields</option><option value="any">Any statement field</option><option value="text">Description only</option><option value="transaction_type">Transaction type</option><option value="category">Source category</option></select><label class="flex items-center gap-2"><ArrowDownUp size={15} class="text-slate-400" /><select bind:value={aliasSort} class="field sm:w-48" aria-label="Sort aliases"><option value="usage-desc">Most statements matched</option><option value="usage-asc">Fewest statements matched</option><option value="name-asc">Alias name A–Z</option><option value="name-desc">Alias name Z–A</option></select></label></div></div><div class="mt-3 flex items-center justify-between text-xs text-slate-500"><span>Showing {aliasResultCount} of {aliases.length} aliases</span><span>{aliasSort === 'usage-desc' ? 'High-impact rules first' : aliasSort === 'usage-asc' ? 'Rules needing attention first' : 'Sorted alphabetically'}</span></div></Card>
                <Card className="border-indigo-100 bg-indigo-50/60 p-5"><div class="mb-4 flex items-center gap-2"><Plus size={17} class="text-primary" /><h3 class="font-semibold text-slate-950">Add an alias</h3></div><div class="grid gap-3 md:grid-cols-[1.5fr_1fr_0.9fr_1fr_auto]"><input bind:value={newAlias.value} class="field" placeholder="e.g. Rewe, Edeka, salary" aria-label="Alias text" /><select bind:value={newAlias.categoryId} class="field" aria-label="Alias category">{#each categories as category}<option value={category.id}>{category.name}</option>{/each}</select><select bind:value={newAlias.field} class="field" aria-label="Alias field"><option value="any">Any statement field</option><option value="text">Description only</option><option value="transaction_type">Transaction type</option><option value="category">Source category</option></select><input bind:value={newAlias.transactionType} class="field" placeholder="Optional type filter" aria-label="Transaction type filter" /><Button onclick={addAlias} disabled={saving || !newAlias.value.trim()}><Plus size={15} />Add</Button></div><p class="mt-3 text-xs text-slate-500">Matching is case-insensitive and future uploads use the same rules. If two aliases overlap, Review will flag the statement.</p></Card>
                <div class="alias-group-grid grid gap-4 lg:grid-cols-2">
                    {#each aliasGroups as group}
                        <Card className="alias-group-card overflow-hidden p-0">
                            <div class="border-b border-slate-100 bg-white/80 px-4 py-4">
                                <div class="flex items-start justify-between gap-3">
                                    <div class="min-w-0"><p class="label">{group.category.necessity === 'necessity' ? 'Essential' : 'Flexible'}</p><h3 class="mt-1 truncate text-lg font-semibold text-slate-950">{group.category.name}</h3><p class="mt-1 text-xs text-slate-500">{group.total} alias{group.total === 1 ? '' : 'es'} · variants of this category</p></div>
                                    <span class="count-pill">{group.total}</span>
                                </div>
                                <div class="relative mt-3"><Search size={14} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={aliasCategorySearch[group.category.id] ?? ''} oninput={(event) => setCategoryAliasSearch(group.category.id, (event.currentTarget as HTMLInputElement).value)} class="field w-full pl-9" placeholder={`Search ${group.category.name}`} aria-label={`Search ${group.category.name} aliases`} /></div>
                            </div>
                            <div class="space-y-2 p-3">
                                {#each group.aliases as alias}
                                    <div id={`alias-${alias.id}`} class="alias-chip-row">
                                        <button class="alias-chip" title="Edit alias" onclick={() => editingAliasId = editingAliasId === alias.id ? '' : alias.id}><span class="min-w-0 truncate font-semibold">“{alias.value}”</span><span class="alias-chip-meta">{rules?.aliasUsage?.[alias.id] ?? 0} matches</span></button>
                                        <button class="icon-button" title="Edit alias" aria-label="Edit alias" onclick={() => editingAliasId = editingAliasId === alias.id ? '' : alias.id}><Pencil size={14} /></button><button class="icon-button danger-hover" title="Remove alias" aria-label="Remove alias" onclick={() => removeAlias(alias.id)}><Trash2 size={14} /></button>
                                    </div>
                                    {#if editingAliasId === alias.id}<div class="alias-edit-panel"><input bind:value={alias.value} class="field" aria-label="Edit alias text" /><select bind:value={alias.categoryId} class="field" aria-label="Edit alias category">{#each categories as category}<option value={category.id}>{category.name}</option>{/each}</select><select bind:value={alias.field} class="field" aria-label="Edit alias field"><option value="any">Any statement field</option><option value="text">Description only</option><option value="transaction_type">Transaction type</option><option value="category">Source category</option></select><input bind:value={alias.transactionType} class="field" placeholder="Type filter" aria-label="Edit type filter" /><Button size="sm" onclick={() => updateAlias(alias)}><Check size={14} />Save</Button></div>{/if}
                                {:else}<p class="px-2 py-3 text-sm text-slate-500">No aliases match this search.</p>{/each}
                                {#if group.hiddenCount > 0}<button class="load-more-link" onclick={() => loadMoreAliases(group.category.id)}>Show {group.hiddenCount} more <ChevronDown size={14} /></button>{/if}
                            </div>
                        </Card>
                    {:else}<Card className="p-8 text-center lg:col-span-2"><Search size={22} class="mx-auto text-slate-300" /><p class="mt-3 font-semibold text-slate-700">No aliases found</p><p class="mt-1 text-sm text-slate-400">Try a different category or alias search.</p></Card>{/each}
                </div>
            </section>
        {:else if page === 'statements'}
            <section class="space-y-5 animate-float-in">
                {#if recurringRows.some((row) => row.reviewStatus !== 'denied')}
                    <Card className="overflow-hidden border-emerald-100 bg-white p-0"><div class="border-b border-emerald-100 bg-emerald-50/50 px-5 py-4"><p class="label text-emerald-600">Auto-detected recurring</p><h3 class="mt-1 text-lg font-semibold text-slate-950">Recurring series found in this ledger</h3><p class="hint">These counts are the total non-denied observations found for each repeating payment or income.</p></div><div class="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">{#each recurringRows.filter((row) => row.reviewStatus !== 'denied').slice(0, 6) as row}<button class="recurring-context-row" onclick={() => navigate('recurring')}><span class="min-w-0 text-left"><span class="block truncate font-semibold text-slate-800">{row.label}</span><span class="mt-1 block truncate text-xs text-slate-500">Auto-detected · {row.direction === 'income' ? 'income' : 'payment'}</span></span><span class="shrink-0 text-right"><strong class="block text-emerald-700">{row.observationIds.length}</strong><span class="text-[11px] text-slate-400">observations</span></span></button>{/each}</div>{#if recurringRows.filter((row) => row.reviewStatus !== 'denied').length > 6}<button class="load-more-link" onclick={() => navigate('recurring')}>Open all {recurringRows.filter((row) => row.reviewStatus !== 'denied').length} recurring series <ArrowUpRight size={14} /></button>{/if}</Card>
                {/if}
                <Card className="border-emerald-100 bg-emerald-50/50 p-4"><div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p class="label text-emerald-600">Recurring context</p><p class="mt-1 text-sm text-slate-700">Auto-detected recurring statements stay linked to their series, with confirmed and pending observations available from the Recurring view.</p></div><div class="flex items-center gap-2"><span class="rounded-xl bg-white/80 px-3 py-2 text-xs font-semibold text-emerald-700">{recurringRows.filter((row) => row.reviewStatus !== 'denied').reduce((total, row) => total + row.observationIds.length, 0)} observations</span><button class="icon-button" title="Open recurring view" aria-label="Open recurring view" onclick={() => navigate('recurring')}><ArrowUpRight size={17} /></button></div></div></Card>
                <div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><Badge tone="success">Ledger · {rules?.stats.total ?? 0}</Badge><h2 class="mt-2 page-title">Find any statement, fast.</h2><p class="page-subtitle">Search every imported field, inspect the raw details, and fix gaps without leaving the ledger.</p></div><div class="text-xs font-semibold text-slate-400">Latest first</div></div>
                <Card className="p-4"><div class="flex flex-col gap-3 lg:flex-row"><div class="relative min-w-0 flex-1"><Search size={16} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input bind:value={statementSearch} oninput={() => statementLimit = 100} class="field w-full pl-9" placeholder="Search merchant, purpose, amount, date, sender..." aria-label="Search statements" /></div><select bind:value={statementTypeFilter} class="field lg:w-52" aria-label="Filter transaction type"><option value="all">All transaction types</option>{#each statementTypes as transactionType}<option value={transactionType}>{transactionType}</option>{/each}</select></div><div class="mt-3 flex flex-wrap items-center gap-2"><span class="mr-1 text-xs font-bold uppercase tracking-wider text-slate-400">Show</span>{#each [['all', 'All'], ['matched', 'Has alias'], ['unmatched', 'Needs alias'], ['conflict', 'Conflicts']] as filter}<button class:active-filter={statementFilter === filter[0]} class="filter-chip" onclick={() => { statementFilter = filter[0] as typeof statementFilter; statementLimit = 100 }}>{filter[1]} <span>{filter[0] === 'all' ? rules?.stats.total ?? 0 : filter[0] === 'matched' ? rules?.stats.matched ?? 0 : filter[0] === 'unmatched' ? rules?.stats.unmatched ?? 0 : rules?.stats.conflicts ?? 0}</span></button>{/each}<span class="ml-auto text-xs font-semibold text-slate-400">{filteredStatements.length} result{filteredStatements.length === 1 ? '' : 's'}</span></div></Card>
                <Card className="overflow-hidden p-0"><div class="divide-y divide-slate-100">{#each visibleStatements as item}<details class="statement-row"><summary class="flex cursor-pointer list-none flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center"><div class="w-24 shrink-0"><p class="text-sm font-semibold text-slate-800">{item.date ? new Date(item.date).toLocaleDateString('en-GB') : 'No date'}</p><p class="mt-1 text-[11px] text-slate-400">{item.id.split(':').at(-1)}</p></div><div class="min-w-0 flex-1"><p class="truncate font-semibold text-slate-800">{item.recipient || item.sender || item.text || item.transactionType || 'Untitled statement'}</p><p class="mt-1 truncate text-xs text-slate-400">{item.text || item.purpose || item.transactionType || 'No description'}</p></div><div class="flex items-center gap-2 sm:w-64 sm:justify-end"><span class={`status-dot ${item.status}`}></span><span class="text-right text-sm font-semibold text-slate-800">{money(item.amount)}</span><Badge tone={item.status === 'matched' ? 'success' : item.status === 'conflict' ? 'danger' : 'warning'}>{item.status === 'matched' ? 'Has alias' : item.status === 'conflict' ? 'Conflict' : 'Needs alias'}</Badge><button class:recurring-button-active={item.recurringDirection} class="icon-button recurring-button" title={item.recurringDirection ? `Remove recurring ${item.recurringDirection === 'income' ? 'income' : 'payment'}` : `Mark as recurring ${item.amount != null && item.amount > 0 ? 'income' : 'payment'}`} aria-label={item.recurringDirection ? 'Remove recurring assignment' : `Mark as recurring ${item.amount != null && item.amount > 0 ? 'income' : 'payment'}`} onclick={(event) => { event.stopPropagation(); toggleManualRecurring(item) }} disabled={saving}><Repeat2 size={15} /></button></div></summary><div class="grid gap-4 border-t border-slate-100 bg-slate-50/70 px-5 py-4 text-sm md:grid-cols-[1fr_auto]"><div class="grid gap-3 sm:grid-cols-2"><div><p class="label">Description</p><p class="mt-1 break-words text-slate-700">{item.text || '—'}</p></div><div><p class="label">Purpose</p><p class="mt-1 break-words text-slate-700">{item.purpose || '—'}</p></div><div><p class="label">Sender / recipient</p><p class="mt-1 break-words text-slate-700">{item.sender || '—'}{#if item.recipient} → {item.recipient}{/if}</p></div><div><p class="label">Transaction type</p><p class="mt-1 text-slate-700">{item.transactionType || '—'} · {item.currency || '—'}</p></div><div><p class="label">Imported CSV label</p><p class="mt-1 text-slate-500">{item.sourceCategory || '—'} <span class="text-[11px]">(audit only)</span></p></div><div><p class="label">Statement id</p><p class="mt-1 break-all text-slate-500">{item.id}</p></div><div class="sm:col-span-2"><p class="label">Recurring assignment</p>{#if item.recurringDirection}<Badge tone="success">Recurring {item.recurringDirection === 'income' ? 'income' : 'payment'}</Badge>{:else}<p class="mt-1 text-slate-500">Not manually assigned.</p>{/if}</div><div class="sm:col-span-2"><p class="label">Alias grip</p>{#if item.matches.length}<div class="mt-2 flex flex-wrap gap-2">{#each item.matches as match}<span class="statement-match"><button class="match-alias" title="Go to alias" onclick={() => goToAlias(match.id)}>“{match.value}” <ArrowUpRight size={12} /></button><button class="match-category" title="Go to category" onclick={() => goToCategory(match.categoryId)}>{categoryName(match.categoryId)} <ArrowUpRight size={12} /></button></span>{/each}</div>{:else}<p class="mt-1 text-slate-500">No alias currently grips this statement.</p>{/if}</div></div><div class="flex items-start justify-end">{#if item.status === 'unmatched'}<Button size="sm" variant="outline" onclick={() => quickCreate(item)} disabled={saving}><WandSparkles size={14} />Create suggested alias</Button>{:else if item.status === 'conflict'}<button class="text-xs font-semibold text-primary hover:underline" onclick={() => page = 'review'}>Resolve conflict</button>{/if}</div></div></details>{:else}<div class="p-10 text-center"><Search size={22} class="mx-auto text-slate-300" /><p class="mt-3 font-semibold text-slate-700">No statements found</p><p class="mt-1 text-sm text-slate-400">Try a different search or filter.</p></div>{/each}</div>{#if visibleStatements.length < filteredStatements.length}<div class="border-t border-slate-100 p-4 text-center"><Button variant="outline" onclick={() => statementLimit += 100}>Load 100 more</Button></div>{/if}</Card>
            </section>
        {:else if page === 'categories'}
            <section class="space-y-5 animate-float-in">
                <div><Badge tone="success">Taxonomy · {categories.length}</Badge><h2 class="mt-2 page-title">Categories with a point of view.</h2><p class="page-subtitle">Keep necessities and conveniences separate. Drag a card between columns whenever your perspective changes.</p></div>
                <Card className="border-indigo-100 bg-indigo-50/60 p-5"><div class="mb-4 flex items-center gap-2"><Plus size={17} class="text-primary" /><h3 class="font-semibold text-slate-950">Create a category</h3></div><div class="flex flex-col gap-3 sm:flex-row"><input bind:value={newCategory.name} class="field flex-1" placeholder="e.g. Health & wellbeing" aria-label="New category name" /><select bind:value={newCategory.necessity} class="field sm:w-48" aria-label="New category type"><option value="necessity">Necessity</option><option value="convenience">Convenience</option></select><Button onclick={addCategory} disabled={saving || !newCategory.name.trim()}><Plus size={15} />Create</Button></div></Card>
                <div class="grid gap-5 lg:grid-cols-2">
                    {#each [['necessity', 'Necessities', 'Things that support essential living or an obligation.', 'emerald'] as const, ['convenience', 'Conveniences', 'Comfort, leisure, and optional consumption.', 'violet'] as const] as column}
                        <div role="list" class={`category-column ${column[0]}`} ondragover={(event) => event.preventDefault()} ondrop={() => moveCategory(column[0])}>
                            <div class="mb-3 flex items-start justify-between"><div><div class="flex items-center gap-2"><span class={`dot ${column[3]}`}></span><h3 class="section-title">{column[1]}</h3></div><p class="mt-1 text-xs text-slate-500">{column[2]}</p></div><span class="count-pill">{categories.filter((category) => category.necessity === column[0]).length}</span></div>
                            <div class="space-y-3">{#each categories.filter((category) => category.necessity === column[0]) as category}<article id={`category-${category.id}`} class="category-card" draggable="true" ondragstart={() => draggedCategoryId = category.id}><div class="flex items-start justify-between gap-3"><div class="min-w-0"><p class="truncate font-semibold text-slate-800">{category.name}</p><p class="mt-1 text-xs text-slate-500">{category.aliasCount} {category.aliasCount === 1 ? 'alias' : 'aliases'} assigned</p></div><div class="flex gap-1"><button class="icon-button" title="Edit category" aria-label="Edit category" onclick={() => editingCategoryId = editingCategoryId === category.id ? '' : category.id}><Pencil size={15} /></button><button class="icon-button danger-hover" title="Delete category" aria-label="Delete category" disabled={category.aliasCount > 0} onclick={() => removeCategory(category)}><Trash2 size={15} /></button></div></div>{#if editingCategoryId === category.id}<div class="mt-3 flex gap-2"><input bind:value={category.name} class="field min-w-0 flex-1" aria-label="Edit category name" /><Button size="sm" onclick={() => updateCategory(category)}><Check size={14} />Save</Button></div>{/if}</article>{:else}<div class="empty-drop">Drop categories here</div>{/each}</div>
                        </div>
                    {/each}
                </div>
                <p class="flex items-center gap-2 text-xs text-slate-500"><Filter size={14} />A category can only be deleted when no alias points to it. Reassign or remove its aliases first.</p>
            </section>
        {:else}
            <section class="space-y-5 animate-float-in">
                <div><Badge tone={unmatched.length || conflicts.length ? 'danger' : 'success'}>{unmatched.length || conflicts.length ? `${unmatched.length + conflicts.length} need attention` : 'All clear'}</Badge><h2 class="mt-2 page-title">Review the edges.</h2><p class="page-subtitle">Unmatched statements need a new alias. Conflicts need a sharper rule so every statement lands exactly once.</p></div>
                <div class="grid gap-4 md:grid-cols-3"><Card className="p-4"><p class="label">Unmatched</p><p class="mt-2 text-2xl font-semibold text-amber-600">{unmatched.length}</p><p class="hint">No alias grips this row</p></Card><Card className="p-4"><p class="label">Conflicts</p><p class="mt-2 text-2xl font-semibold text-red-600">{conflicts.length}</p><p class="hint">More than one alias grips it</p></Card><Card className="p-4"><p class="label">Goal</p><p class="mt-2 text-2xl font-semibold text-emerald-700">100%</p><p class="hint">Exactly one alias per statement</p></Card></div>
                <Card className="overflow-hidden p-0"><div class="border-b border-slate-100 px-5 py-4"><div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h3 class="section-title">No alias found</h3><p class="hint">Create a focused alias from the description or transaction type. The category below is where those new aliases will be saved.</p></div>{#if unmatched.length}<label class="flex shrink-0 items-center gap-2 text-xs font-semibold text-slate-500">New aliases go to<select bind:value={quickCategoryId} class="field h-9 w-48" aria-label="Category for new aliases">{#each categories as category}<option value={category.id}>{category.name}</option>{/each}</select></label>{/if}</div></div><div class="divide-y divide-slate-100">{#each unmatched as item}<div class="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div class="min-w-0"><p class="truncate font-semibold text-slate-800">{item.text || item.transactionType || 'Untitled statement'}</p><p class="mt-1 text-xs text-slate-500">{item.transactionType || 'Unknown type'} · {money(item.amount)} · {item.date ? new Date(item.date).toLocaleDateString('en-GB') : 'No date'}</p></div><Button size="sm" variant="outline" onclick={() => quickCreate(item)} disabled={saving}><WandSparkles size={14} />Create alias</Button></div>{:else}<p class="p-6 text-sm text-emerald-700">Every statement has at least one alias.</p>{/each}</div></Card>
                <Card className="overflow-hidden border-red-100 p-0"><div class="border-b border-red-100 bg-red-50/50 px-5 py-4"><h3 class="section-title">Overlapping aliases</h3><p class="hint">These rows have more than one match. Narrow one alias by type or pin the chosen rule to this statement.</p></div><div class="divide-y divide-slate-100">{#each conflicts as item}<div class="px-5 py-4"><div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p class="font-semibold text-slate-800">{item.text || item.transactionType || 'Untitled statement'}</p><p class="mt-1 text-xs text-slate-500">{item.transactionType || 'Unknown type'} · {money(item.amount)}</p></div><Badge tone="danger">{item.matches.length} matches</Badge></div><div class="mt-3 flex flex-wrap gap-2">{#each item.matches as match}<span class="rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700">{match.value} → {categoryName(match.categoryId)}</span>{/each}</div><div class="mt-4 flex flex-wrap gap-2"><span class="mr-1 flex items-center gap-1 text-xs font-semibold text-slate-500"><ChevronDown size={14} />Resolve</span>{#each item.matches as match}<Button size="sm" variant="outline" onclick={() => pinAlias(item, match.id)} disabled={saving}><Settings2 size={13} />Pin “{match.value}”</Button>{/each}<button class="text-xs font-semibold text-primary hover:underline" onclick={() => openNewAlias(item.text)}>Edit aliases</button></div></div>{:else}<p class="p-6 text-sm text-emerald-700">No overlapping aliases found.</p>{/each}</div></Card>
            </section>
        {/if}
    </div>
    {#if recurringDialog}
        <div class="modal-backdrop" role="presentation" onclick={closeRecurringDialog}>
            <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="recurring-dialog-title" tabindex="-1" onclick={(event) => event.stopPropagation()} onkeydown={(event) => event.stopPropagation()}>
                <div class="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4"><div class="min-w-0"><p class="label text-indigo-500">Recurring payment</p><h2 id="recurring-dialog-title" class="mt-1 truncate text-xl font-semibold text-slate-950">{recurringDialog.row.label}</h2><p class="mt-1 text-xs text-slate-500">{recurringDialog.row.counterparty} · {recurringDialog.row.members.length} detected series · {recurringObservationIds(recurringDialog.row).length} detected observations</p></div><button class="icon-button" title="Close" aria-label="Close" onclick={closeRecurringDialog}><X size={17} /></button></div>
                {#if recurringDialog.kind === 'alias'}
                    <div class="space-y-5 p-5"><div><label class="label" for="recurring-alias">Recurring alias</label><input id="recurring-alias" bind:value={recurringAliasDraft} class="field mt-2 w-full" placeholder="e.g. Netflix, Spotify family plan" /><p class="hint">This phrase is scanned across the matching payment/income direction and currency to find the statements that belong to it.</p></div><div class="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4"><div class="flex items-center justify-between gap-3"><div><p class="label text-indigo-500">Observation impact</p><p class="mt-1 text-sm text-slate-700">Save the alias to rescan the ledger automatically.</p></div>{#if recurringAliasScanning}<RefreshCw size={17} class="animate-spin text-primary" />{/if}</div>{#if recurringAliasScan}<div class="mt-4 grid grid-cols-3 gap-2 text-center"><div class="rounded-xl bg-white/80 p-3"><p class="label">Before</p><p class="mt-1 text-lg font-semibold text-slate-950">{recurringAliasScan.beforeCount}</p></div><div class="rounded-xl bg-white/80 p-3"><p class="label">After</p><p class="mt-1 text-lg font-semibold text-slate-950">{recurringAliasScan.afterCount}</p></div><div class="rounded-xl bg-white/80 p-3"><p class="label">Change</p><p class={`mt-1 text-lg font-semibold ${recurringAliasScan.addedCount > recurringAliasScan.removedCount ? 'text-emerald-700' : recurringAliasScan.addedCount < recurringAliasScan.removedCount ? 'text-amber-700' : 'text-slate-700'}`}>{recurringAliasScan.afterCount - recurringAliasScan.beforeCount > 0 ? '+' : ''}{recurringAliasScan.afterCount - recurringAliasScan.beforeCount}</p></div></div><p class="mt-3 text-xs text-slate-500">{recurringAliasScan.addedCount} statement{recurringAliasScan.addedCount === 1 ? '' : 's'} added · {recurringAliasScan.removedCount} removed. The saved alias now includes {recurringAliasScan.afterCount} observations.</p>{:else}<p class="mt-4 text-sm text-slate-500">No scan has run for this alias yet.</p>{/if}</div><div class="flex justify-end gap-2"><Button variant="outline" onclick={closeRecurringDialog}>Done</Button><Button onclick={saveRecurringAlias} disabled={recurringAliasScanning}><Check size={14} />Save and scan</Button></div></div>
                {:else}
                    {@const dialogObservationIds = recurringAliasScan?.includedStatementIds ?? recurringObservationIds(recurringDialog.row)}
                    {@const dialogObservations = recurringObservationStatements(recurringDialog.row, dialogObservationIds)}
                    <div class="max-h-[70vh] overflow-y-auto"><div class="border-b border-slate-100 bg-slate-50/70 px-5 py-3 text-xs font-semibold text-slate-500">Showing {Math.min(recurringObservationLimit, dialogObservations.length)} of {dialogObservations.length} statements</div><div class="divide-y divide-slate-100">{#each dialogObservations.slice(0, recurringObservationLimit) as item}<div class="px-5 py-3.5"><div class="flex items-center justify-between gap-3"><p class="min-w-0 truncate font-semibold text-slate-800">{item.recipient || item.sender || item.text || 'Untitled statement'}</p><p class={item.amount != null && item.amount > 0 ? 'shrink-0 font-semibold text-emerald-700' : 'shrink-0 font-semibold text-slate-950'}>{money(item.amount)}</p></div><p class="mt-1 text-xs text-slate-500">{item.date ? dateLabel(item.date.slice(0, 10)) : 'No date'} · {item.text || item.purpose || item.transactionType || 'No description'}</p><p class="mt-1 break-all text-[11px] text-slate-400">{item.id}</p></div>{:else}<p class="p-8 text-center text-sm text-slate-500">No statements found.</p>{/each}</div>{#if recurringObservationLimit < dialogObservations.length}<div class="border-t border-slate-100 p-4 text-center"><Button variant="outline" onclick={() => recurringObservationLimit += 100}>Load 100 more</Button></div>{/if}</div>
                {/if}
            </div>
        </div>
    {/if}
</main>
