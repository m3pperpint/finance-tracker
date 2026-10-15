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
        Copy,
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
    import type {
        DashboardView,
        FinanceScope,
        RecurringObservationScan,
        RecurringSeries,
        RecurringSettings,
        ViewMode,
    } from '$lib/domain/finance'
    import {
        FinanceApi,
        type LedgerInfo,
    } from '$lib/infrastructure/finance-api'
    import Badge from '$lib/components/ui/Badge.svelte'
    import Button from '$lib/components/ui/Button.svelte'
    import Card from '$lib/components/ui/Card.svelte'

    type Page =
        | 'dashboard'
        | 'spending'
        | 'recurring'
        | 'statements'
        | 'aliases'
        | 'categories'
        | 'review'
    const pageRoutes: Page[] = [
        'dashboard',
        'spending',
        'recurring',
        'review',
        'aliases',
        'categories',
        'statements',
    ]
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
        createdAt?: string
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
        stats: {
            total: number
            matched: number
            unmatched: number
            conflicts: number
        }
        aliasUsage: Record<string, number>
        keywordSuggestions: { value: string; count: number; share: number }[]
    }

    type RecurringRow = RecurringSeries & {
        memberSeriesIds: string[]
        members: RecurringSeries[]
        observationIds: string[]
    }

    const api = new FinanceApi()
    const currency = new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: 'EUR',
    })
    function pageFromUrl(): Page {
        if (typeof window === 'undefined') return 'dashboard'
        const candidate = new URLSearchParams(window.location.search).get(
            'page'
        ) as Page | null
        return candidate && pageRoutes.includes(candidate)
            ? candidate
            : 'dashboard'
    }

    let page: Page = pageFromUrl()
    let mode: ViewMode = 'month'
    let monthKey = ''
    let year = new Date().getFullYear()
    let fromDate = ''
    let toDate = ''
    let selectedLedgerId = ''
    let ledgers: LedgerInfo[] = []
    let unassignedFiles: string[] = []
    let selectedLegacyFiles: string[] = []
    let newLedgerName = ''
    let creatingLedger = false
    let dashboard: DashboardView | null = null
    let comparisonDashboard: DashboardView | null = null
    let comparePeriods = false
    let comparisonMonthKey = ''
    let comparisonYear = new Date().getFullYear() - 1
    let comparisonFromDate = ''
    let comparisonToDate = ''
    let comparisonLoading = false
    let comparisonError = ''
    let comparisonRequest = 0
    let recurring: RecurringSeries[] = []
    let recurringSettings: RecurringSettings = {
        aliases: {},
        groups: [],
        observationIds: {},
    }
    let rules: RulesView | null = null
    let selectedFile: File | null = null
    let importHeaders: string[] = []
    let columnMappings: Record<string, string> = {}
    let importProfile = ''
    let newLedgerRulesTemplate: 'generic' | 'scratch' = 'generic'
    let profileName = ''
    let importProfiles: { name: string; mappings: Record<string, string> }[] =
        []
    let loading = false
    let checkingLedgers = true
    let saving = false
    let error = ''
    let search = ''
    let quickAliasStatement: RuleStatement | null = null
    let quickAliasValue = ''
    let quickAliasCategoryId = ''
    let newAlias = {
        value: '',
        categoryId: '',
        field: 'any' as Alias['field'],
        transactionType: '',
    }
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
    let categoryNavSearch = ''
    let categoriesExpanded = true
    let selectedAliasId = ''
    let copiedAliasId = ''
    let showAliasCreateDialog = false
    let aliasSort: AliasSort = 'usage-desc'
    let aliasUsageFilter: AliasUsageFilter = 'all'
    let aliasFieldFilter: Alias['field'] | 'all' = 'all'
    let aliasCategoryFilter = 'all'
    let selectedRecurringIds: string[] = []
    let recurringDialog: {
        kind: 'alias' | 'observations' | 'end-date'
        row: RecurringRow
    } | null = null
    let recurringAliasDraft = ''
    let recurringEndDateDraft = ''
    let recurringAliasScan: RecurringObservationScan | null = null
    let recurringAliasScanning = false
    let recurringObservationLimit = 100

    $: categories = rules?.categories ?? []
    $: activeLedger = ledgers.find((ledger) => ledger.id === selectedLedgerId)
    $: aliases = rules?.aliases ?? []
    $: unmatched =
        rules?.statements.filter((item) => item.status === 'unmatched') ?? []
    $: conflicts =
        rules?.statements.filter((item) => item.status === 'conflict') ?? []
    $: coverage = rules?.stats.total
        ? Math.round((rules.stats.matched / rules.stats.total) * 100)
        : 0
    $: scopeLabel =
        mode === 'all'
            ? 'All time'
            : mode === 'year'
              ? String(year)
              : mode === 'range'
                ? rangeLabel(fromDate, toDate)
                : monthLabel(monthKey)
    $: monthlyPeriods = dashboard?.evolution.monthly ?? []
    $: comparisonOptions = [
        ...new Set(
            monthlyPeriods.flatMap((period) =>
                period.categories.map((item) => item.category)
            )
        ),
    ].sort()
    $: if (!comparisonCategory && comparisonOptions.length)
        comparisonCategory = comparisonOptions[0]
    $: if (
        comparisonCategory &&
        !comparisonOptions.includes(comparisonCategory)
    )
        comparisonCategory = comparisonOptions[0] ?? ''
    $: comparisonRows = monthlyPeriods.map((period, index) => {
        const amount =
            period.categories.find(
                (item) => item.category === comparisonCategory
            )?.totalAmount ?? 0
        const previous =
            index > 0
                ? (monthlyPeriods[index - 1].categories.find(
                      (item) => item.category === comparisonCategory
                  )?.totalAmount ?? 0)
                : null
        const priorAmounts = monthlyPeriods
            .slice(0, index)
            .map(
                (item) =>
                    item.categories.find(
                        (category) => category.category === comparisonCategory
                    )?.totalAmount ?? 0
            )
        const usual = priorAmounts.length
            ? priorAmounts.reduce((total, value) => total + value, 0) /
              priorAmounts.length
            : null
        return { ...period, amount, previous, usual }
    })
    $: comparisonAverage = comparisonRows.length
        ? comparisonRows.reduce((total, row) => total + row.amount, 0) /
          comparisonRows.length
        : 0
    $: comparisonPeriods =
        mode === 'year' ? (dashboard?.evolution.yearly ?? []) : monthlyPeriods
    $: activePeriodKey =
        mode === 'year' ? String(year) : mode === 'month' ? monthKey : ''
    $: activePeriod = comparisonPeriods.find(
        (period) => period.key === activePeriodKey
    )
    $: comparedCategories = [
        ...new Set([
            ...(dashboard?.categories ?? []).map((item) => item.category),
            ...(comparisonDashboard?.categories ?? []).map(
                (item) => item.category
            ),
        ]),
    ]
        .sort()
        .map((category) => {
            const current =
                dashboard?.categories.find((item) => item.category === category)
                    ?.totalAmount ?? 0
            const compared =
                comparisonDashboard?.categories.find(
                    (item) => item.category === category
                )?.totalAmount ?? 0
            return {
                category,
                current,
                compared,
                difference: current - compared,
            }
        })
    $: comparisonMetrics = [
        {
            label: 'Spending',
            current: dashboard?.metrics.spending,
            compared: comparisonDashboard?.metrics.spending,
        },
        {
            label: 'Income',
            current: dashboard?.metrics.income,
            compared: comparisonDashboard?.metrics.income,
        },
        {
            label: 'Net movement',
            current: dashboard?.metrics.netMovement,
            compared: comparisonDashboard?.metrics.netMovement,
        },
    ]
    $: comparisonUnavailable =
        !comparisonScope() ||
        sameScope(comparisonScope() ?? { mode: 'all' }, currentScope())
    $: usualPeriodSpending = activePeriod
        ? usualAmount(
              comparisonPeriods
                  .filter((period) => period.key !== activePeriodKey)
                  .map((period) => period.spending)
          )
        : null
    $: spendingDelta =
        activePeriod && usualPeriodSpending != null
            ? activePeriod.spending - usualPeriodSpending
            : null
    $: topChanges = activePeriod
        ? activePeriod.categories
              .map((category) => {
                  const usual = usualAmount(
                      comparisonPeriods
                          .filter((period) => period.key !== activePeriodKey)
                          .map(
                              (period) =>
                                  period.categories.find(
                                      (item) =>
                                          item.category === category.category
                                  )?.totalAmount ?? 0
                          )
                  )
                  return {
                      ...category,
                      usual,
                      difference:
                          usual == null ? null : category.totalAmount - usual,
                  }
              })
              .filter((category) => category.difference != null)
              .sort(
                  (a, b) =>
                      Math.abs(b.difference ?? 0) - Math.abs(a.difference ?? 0)
              )
              .slice(0, 3)
        : []
    $: spendingRows = (dashboard?.categories ?? []).map((category) => {
        const usual = activePeriod
            ? usualAmount(
                  comparisonPeriods
                      .filter((period) => period.key !== activePeriodKey)
                      .map(
                          (period) =>
                              period.categories.find(
                                  (item) => item.category === category.category
                              )?.totalAmount ?? 0
                      )
              )
            : null
        const recurringExpected = expectedRecurringForCategory(
            category.category
        )
        return {
            ...category,
            usual,
            recurringExpected,
            difference: usual == null ? null : category.totalAmount - usual,
        }
    })
    $: confirmedRecurring = recurringRows.filter(
        (series) => series.reviewStatus === 'confirmed'
    )
    $: expectedRecurringTotal = confirmedRecurring.reduce(
        (total, series) => total + expectedRecurringForSeries(series),
        0
    )
    $: expectedMovements = [mode, monthKey, year, fromDate, toDate, recurring]
        .length
        ? remainingExpectedMovements()
        : []
    $: expectedFixedExpenses = expectedMovements.filter(
        (item) => item.series.direction === 'expense'
    )
    $: expectedFixedIncome = expectedMovements.filter(
        (item) => item.series.direction === 'income'
    )
    $: estimatedFlexibleSpending = [
        mode,
        monthKey,
        year,
        fromDate,
        toDate,
        monthlyPeriods,
    ].length
        ? estimateRemainingFlexibleSpending()
        : null
    $: if (!selectedSpendingCategory && spendingRows.length)
        selectedSpendingCategory = spendingRows[0].category
    $: if (
        selectedSpendingCategory &&
        !spendingRows.some((item) => item.category === selectedSpendingCategory)
    )
        selectedSpendingCategory = spendingRows[0]?.category ?? ''
    $: scopedExpenseStatements = (rules?.statements ?? []).filter(
        (statement) =>
            statement.amount != null &&
            statement.amount < 0 &&
            statementInScope(statement.date)
    )
    $: merchantRows = buildMerchantRows(scopedExpenseStatements)
    $: selectedMerchantRows = merchantRows
        .filter((merchant) => merchant.category === selectedSpendingCategory)
        .slice(0, 8)
    $: manualRecurringStatements =
        rules?.statements.filter((statement) => statement.recurringDirection) ??
        []
    // Keep this derived list tied to the async API results. Svelte's legacy
    // reactive dependency analysis does not see variables read only inside a
    // function body, so a bare buildRecurringRows() stays at its initial []
    // after recurring/settings load.
    $: recurringRows =
        recurring.length ||
        recurringSettings.groups.length ||
        Object.keys(recurringSettings.aliases).length
            ? buildRecurringRows()
            : []
    // Merged rows represent one effective recurring stream throughout the app,
    // not just in the inventory table.
    $: activeRecurring = recurringRows.filter(
        (series) =>
            series.reviewStatus !== 'denied' &&
            (!series.endedAt || series.endedAt >= dateKey(startOfToday()))
    )
    $: recurringExpenses = activeRecurring.filter(
        (series) => series.direction === 'expense'
    )
    $: recurringIncome = activeRecurring.filter(
        (series) => series.direction === 'income'
    )
    $: monthlyRecurringExpenses = recurringExpenses.reduce(
        (total, series) =>
            total + series.amountModel.typicalAmount / series.intervalMonths,
        0
    )
    $: annualRecurringExpenses = recurringExpenses.reduce(
        (total, series) =>
            total +
            series.amountModel.typicalAmount * (12 / series.intervalMonths),
        0
    )
    $: if (!overallMonthKey && monthlyPeriods.length)
        overallMonthKey = monthlyPeriods.at(-1)?.key ?? ''
    $: if (
        overallMonthKey &&
        monthlyPeriods.length &&
        !monthlyPeriods.some((period) => period.key === overallMonthKey)
    )
        overallMonthKey = monthlyPeriods.at(-1)?.key ?? ''
    $: overallPeriod = monthlyPeriods.find(
        (period) => period.key === overallMonthKey
    )
    $: overallComparison = comparisonRows.find(
        (row) => row.key === overallMonthKey
    )
    $: chartWindowCount = Math.max(
        1,
        Math.ceil(monthlyPeriods.length / CHART_MONTHS)
    )
    $: if (chartWindowOffset >= chartWindowCount)
        chartWindowOffset = Math.max(0, chartWindowCount - 1)
    $: chartWindowStart = Math.max(
        0,
        monthlyPeriods.length - (chartWindowOffset + 1) * CHART_MONTHS
    )
    $: chartWindowEnd = monthlyPeriods.length - chartWindowOffset * CHART_MONTHS
    $: necessityPeriods = monthlyPeriods.map((period) => {
        const split = { necessity: 0, convenience: 0, unclassified: 0 }
        for (const category of period.categories)
            split[category.necessity] += category.totalAmount
        return { ...period, ...split }
    })
    $: visibleNecessityPeriods = necessityPeriods.slice(
        chartWindowStart,
        chartWindowEnd
    )
    $: maxNecessitySpending = Math.max(
        1,
        ...visibleNecessityPeriods.map((period) => period.spending)
    )
    $: necessityPeriod = necessityPeriods.find(
        (period) => period.key === overallMonthKey
    )
    $: selectedBreakdownCategories =
        necessityPeriod?.categories
            .filter(
                (category) => category.necessity === selectedNecessityBreakdown
            )
            .sort((a, b) => b.totalAmount - a.totalAmount)
            .slice(0, 5) ?? []
    $: eligibleAliases = aliases.filter((alias) => {
        const value = alias.value.toLocaleLowerCase()
        return (
            (aliasCategoryFilter === 'all' ||
                alias.categoryId === aliasCategoryFilter) &&
            (aliasFieldFilter === 'all' || alias.field === aliasFieldFilter) &&
            (!search.trim() ||
                value.includes(search.trim().toLocaleLowerCase()))
        )
    })
    $: filteredAliases = eligibleAliases.filter((alias) => {
        const usage = rules?.aliasUsage?.[alias.id] ?? 0
        return (
            aliasUsageFilter === 'all' ||
            (aliasUsageFilter === 'used' ? usage > 0 : usage === 0)
        )
    })
    $: categoryNavItems = categories.filter((category) =>
        category.name
            .toLocaleLowerCase()
            .includes(categoryNavSearch.trim().toLocaleLowerCase())
    )
    $: sortedFilteredAliases = [...filteredAliases].sort((a, b) =>
        compareAliases(a, b, aliasSort, rules?.aliasUsage ?? {})
    )
    $: selectedAlias =
        sortedFilteredAliases.find((alias) => alias.id === selectedAliasId) ??
        sortedFilteredAliases[0] ??
        null
    $: selectedAliasMatches = selectedAlias
        ? (rules?.statements ?? [])
              .filter((item) =>
                  item.matches.some((match) => match.id === selectedAlias.id)
              )
              .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
              .slice(0, 1)
        : []
    $: aliasResultCount = filteredAliases.length
    $: statementTypes = [
        ...new Set(
            (rules?.statements ?? [])
                .map((item) => item.transactionType)
                .filter(Boolean)
        ),
    ].sort()
    $: filteredStatements = (rules?.statements ?? []).filter((item) => {
        const haystack = [
            item.id,
            item.date,
            item.text,
            item.transactionType,
            item.amount,
            item.currency,
            item.sourceCategory,
            item.sender,
            item.recipient,
            item.purpose,
            item.bankNumberOwner,
            statementCategory(item),
        ]
            .filter((value) => value != null)
            .join(' ')
            .toLocaleLowerCase()
        const queryMatches =
            !statementSearch.trim() ||
            haystack.includes(statementSearch.trim().toLocaleLowerCase())
        const statusMatches =
            statementFilter === 'all' || item.status === statementFilter
        const typeMatches =
            statementTypeFilter === 'all' ||
            item.transactionType === statementTypeFilter
        return queryMatches && statusMatches && typeMatches
    })
    $: recurringStatementMeta = (() => {
        const result = new Map<string, { count: number; label: string }>()
        for (const row of recurringRows) {
            if (row.reviewStatus === 'denied') continue
            for (const statementId of row.observationIds) {
                const current = result.get(statementId)
                if (!current || row.observationIds.length > current.count)
                    result.set(statementId, {
                        count: row.observationIds.length,
                        label: row.label,
                    })
            }
        }
        return result
    })()
    $: visibleStatements = filteredStatements.slice(0, statementLimit)
    $: if (!newAlias.categoryId && categories.length)
        newAlias.categoryId = categories[0].id
    $: if (
        typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).get('page') !== page
    ) {
        const nextUrl = new URL(window.location.href)
        nextUrl.searchParams.set('page', page)
        window.history.replaceState({}, '', nextUrl)
    }

    onMount(() => {
        const syncPage = () => (page = pageFromUrl())
        window.addEventListener('popstate', syncPage)
        void (async () => {
            try {
                const profiles = await api.getImportProfiles()
                importProfiles = Object.entries(profiles).map(
                    ([name, mappings]) => ({ name, mappings })
                )
                const state = await api.getLedgers()
                ledgers = state.ledgers
                unassignedFiles = state.unassignedFiles
                if (ledgers.length === 1) {
                    selectedLedgerId = ledgers[0].id
                    importProfile = ledgers[0].importProfile ?? ''
                }
                if (selectedLedgerId) await refresh()
            } catch (cause) {
                error =
                    cause instanceof Error
                        ? cause.message
                        : 'Could not load statement ledgers.'
            } finally {
                checkingLedgers = false
            }
        })()
        return () => window.removeEventListener('popstate', syncPage)
    })

    async function refresh() {
        if (!selectedLedgerId.trim()) return
        loading = true
        error = ''
        try {
            let scope = currentScope()
            let nextDashboard = await loadDashboard(api, {
                ledgerId: selectedLedgerId.trim(),
                scope,
                top: 5,
            })
            if (
                mode === 'month' &&
                !nextDashboard.availablePeriods.months.includes(monthKey) &&
                nextDashboard.availablePeriods.lastMonth
            ) {
                monthKey = nextDashboard.availablePeriods.lastMonth
                scope = currentScope()
                nextDashboard = await loadDashboard(api, {
                    ledgerId: selectedLedgerId.trim(),
                    scope,
                    top: 5,
                })
            }
            if (
                mode === 'year' &&
                !nextDashboard.availablePeriods.years.includes(year) &&
                nextDashboard.availablePeriods.years.length
            ) {
                year = nextDashboard.availablePeriods.years.at(-1) ?? year
                scope = currentScope()
                nextDashboard = await loadDashboard(api, {
                    ledgerId: selectedLedgerId.trim(),
                    scope,
                    top: 5,
                })
            }
            dashboard = nextDashboard
            await refreshComparison()
            rules = await api.getRules(selectedLedgerId.trim())
            recurring = await api.getRecurring(selectedLedgerId.trim())
            recurringSettings = await api.getRecurringSettings(
                selectedLedgerId.trim()
            )
        } catch (cause) {
            error =
                cause instanceof Error
                    ? cause.message
                    : 'Could not load the finance workspace.'
        } finally {
            loading = false
        }
    }

    async function refreshRules() {
        await refresh()
    }

    function currentScope(): FinanceScope {
        if (mode === 'all') return { mode: 'all' }
        if (mode === 'year')
            return Number.isInteger(year)
                ? { mode: 'year', year }
                : { mode: 'all' }
        if (mode === 'range')
            return isDateKey(fromDate) &&
                isDateKey(toDate) &&
                fromDate <= toDate
                ? { mode: 'range', from: fromDate, to: toDate }
                : { mode: 'all' }
        if (!/^\d{4}-\d{2}$/.test(monthKey)) return { mode: 'all' }
        const [selectedYear, selectedMonth] = monthKey.split('-').map(Number)
        return { mode: 'month', year: selectedYear, month: selectedMonth }
    }

    function comparisonScope(): FinanceScope | null {
        if (mode === 'month' && /^\d{4}-\d{2}$/.test(comparisonMonthKey)) {
            const [selectedYear, selectedMonth] = comparisonMonthKey
                .split('-')
                .map(Number)
            return { mode: 'month', year: selectedYear, month: selectedMonth }
        }
        if (mode === 'year' && Number.isInteger(comparisonYear))
            return { mode: 'year', year: comparisonYear }
        if (
            mode === 'range' &&
            isDateKey(comparisonFromDate) &&
            isDateKey(comparisonToDate) &&
            comparisonFromDate <= comparisonToDate
        )
            return {
                mode: 'range',
                from: comparisonFromDate,
                to: comparisonToDate,
            }
        return null
    }

    function previousComparisonScope() {
        const current = currentScope()
        if (current.mode === 'month') {
            const choices = dashboard?.availablePeriods.months ?? []
            const previous = choices.filter((key) => key < monthKey).at(-1)
            const next = choices.find((key) => key > monthKey)
            comparisonMonthKey = previous ?? next ?? monthKey
        } else if (current.mode === 'year') {
            const choices = dashboard?.availablePeriods.years ?? []
            comparisonYear =
                choices.filter((item) => item < year).at(-1) ??
                choices.find((item) => item > year) ??
                year - 1
        } else if (current.mode === 'range') {
            const from = dateValue(fromDate)
            const to = dateValue(toDate)
            const days =
                Math.round((to.getTime() - from.getTime()) / 86400000) + 1
            const comparedTo = new Date(from.getTime() - 86400000)
            const comparedFrom = new Date(
                comparedTo.getTime() - (days - 1) * 86400000
            )
            comparisonFromDate = dateKey(comparedFrom)
            comparisonToDate = dateKey(comparedTo)
        }
    }

    async function refreshComparison() {
        const request = ++comparisonRequest
        comparisonError = ''
        comparisonDashboard = null
        const scope = comparePeriods ? comparisonScope() : null
        if (
            !scope ||
            sameScope(scope, currentScope()) ||
            !selectedLedgerId.trim()
        ) {
            comparisonLoading = false
            return
        }
        comparisonLoading = true
        try {
            const result = await loadDashboard(api, {
                ledgerId: selectedLedgerId.trim(),
                scope,
                top: 5,
            })
            if (request === comparisonRequest) comparisonDashboard = result
        } catch (cause) {
            if (request === comparisonRequest)
                comparisonError =
                    cause instanceof Error
                        ? cause.message
                        : 'Could not load comparison period.'
        } finally {
            if (request === comparisonRequest) comparisonLoading = false
        }
    }

    function sameScope(left: FinanceScope, right: FinanceScope) {
        return (
            left.mode === right.mode &&
            JSON.stringify(left) === JSON.stringify(right)
        )
    }

    function toggleComparison() {
        comparePeriods = !comparePeriods
        if (comparePeriods) previousComparisonScope()
        void refreshComparison()
    }

    function dateKey(value: Date) {
        return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
    }

    function comparisonPercent(current: number, compared: number) {
        return compared === 0
            ? current === 0
                ? '0%'
                : 'New'
            : `${(((current - compared) / Math.abs(compared)) * 100).toFixed(1)}%`
    }

    function statementInScope(value: string | undefined) {
        if (!value) return false
        const key = value.slice(0, 10)
        if (mode === 'all') return true
        if (mode === 'month') return key.startsWith(monthKey)
        if (mode === 'year') return key.startsWith(String(year))
        return (
            isDateKey(fromDate) &&
            isDateKey(toDate) &&
            key >= fromDate &&
            key <= toDate
        )
    }

    function statementCategory(statement: RuleStatement) {
        return statement.matches.length
            ? categoryName(statement.matches[0].categoryId)
            : statement.sourceCategory || 'Uncategorized'
    }

    function merchantLabel(statement: RuleStatement) {
        return (
            statement.recipient ||
            statement.sender ||
            statement.text ||
            statement.purpose ||
            'Unknown merchant'
        )
            .replace(/\s+/g, ' ')
            .trim()
    }

    function buildMerchantRows(statements: RuleStatement[]) {
        const groups = new Map<
            string,
            { merchant: string; category: string; total: number; count: number }
        >()
        for (const statement of statements) {
            const merchant = merchantLabel(statement)
            const category = statementCategory(statement)
            const key = `${category}|${merchant}`
            const current = groups.get(key) ?? {
                merchant,
                category,
                total: 0,
                count: 0,
            }
            current.total += Math.abs(statement.amount ?? 0)
            current.count += 1
            groups.set(key, current)
        }
        return [...groups.values()].sort((a, b) => b.total - a.total)
    }

    function expectedRecurringForCategory(category: string) {
        return confirmedRecurring
            .filter((series) => series.category === category)
            .reduce(
                (total, series) => total + expectedRecurringForSeries(series),
                0
            )
    }

    function buildRecurringRows(): RecurringRow[] {
        const byId = new Map(recurring.map((series) => [series.id, series]))
        const used = new Set<string>()
        const merged = recurringSettings.groups.flatMap((group) => {
            const members = group.seriesIds
                .map((id) => byId.get(id))
                .filter((series): series is RecurringSeries => Boolean(series))
            if (!members.length) return []
            members.forEach((series) => used.add(series.id))
            return [mergeRecurringRow(group.id, members)]
        })
        return [
            ...merged,
            ...recurring
                .filter((series) => !used.has(series.id))
                .map((series) => {
                    const observationIds =
                        recurringSettings.observationIds[series.id] ??
                        series.occurrences.map(
                            (occurrence) => occurrence.statementId
                        )
                    return {
                        ...series,
                        label:
                            recurringSettings.aliases[series.id] ??
                            series.alias ??
                            series.label,
                        memberSeriesIds: [series.id],
                        members: [series],
                        occurrences: observationsAsOccurrences(
                            [series],
                            observationIds
                        ),
                        observationIds,
                    }
                }),
        ]
    }

    function mergeRecurringRow(
        id: string,
        members: RecurringSeries[]
    ): RecurringRow {
        const base = members[0]
        const occurrences = [
            ...new Map(
                members
                    .flatMap((series) => series.occurrences)
                    .map((occurrence) => [occurrence.statementId, occurrence])
            ).values(),
        ].sort((a, b) => a.date.localeCompare(b.date))
        const observationIds =
            recurringSettings.observationIds[id] ??
            occurrences.map((occurrence) => occurrence.statementId)
        const amountModel = mergedAmountModel(members)
        const reviewStatus = members.every(
            (series) => series.reviewStatus === 'confirmed'
        )
            ? 'confirmed'
            : members.some((series) => series.reviewStatus === 'denied')
              ? 'denied'
              : 'pending'
        const latest = latestMember(members)
        const endedAt = members.every((series) => series.endedAt)
            ? members
                  .map((series) => series.endedAt!)
                  .sort()
                  .at(-1)
            : undefined
        return {
            ...base,
            id,
            label:
                recurringSettings.aliases[id] ??
                (members.length > 1
                    ? `${base.label} + ${members.length - 1} merged`
                    : (base.alias ?? base.label)),
            counterparty:
                members.length > 1
                    ? `${base.counterparty} + ${members.length - 1} more`
                    : base.counterparty,
            category: members.every(
                (series) => series.category === base.category
            )
                ? base.category
                : undefined,
            anchor: latest.anchor,
            nextExpectedDate: latest.nextExpectedDate,
            endedAt,
            expectedDateFrom: latest.expectedDateFrom,
            expectedDateTo: latest.expectedDateTo,
            necessity: members.every(
                (series) => series.category === base.category
            )
                ? base.necessity
                : undefined,
            control: members.every(
                (series) => series.category === base.category
            )
                ? base.control
                : undefined,
            occurrences: observationsAsOccurrences(members, observationIds),
            reviewStatus,
            amountModel: {
                ...base.amountModel,
                ...amountModel,
            },
            evidence: {
                ...base.evidence,
                occurrenceCount: observationIds.length,
            },
            memberSeriesIds: members.map((series) => series.id),
            members,
            observationIds,
        }
    }

    function mergedAmountModel(members: RecurringSeries[]) {
        const parent = members.map((_, index) => index)
        const find = (index: number): number => {
            if (parent[index] !== index) parent[index] = find(parent[index])
            return parent[index]
        }
        const join = (left: number, right: number) => {
            const leftRoot = find(left)
            const rightRoot = find(right)
            if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot
        }

        for (let left = 0; left < members.length; left += 1) {
            for (let right = left + 1; right < members.length; right += 1) {
                if (sameRecurringSchedule(members[left], members[right])) {
                    join(left, right)
                }
            }
        }

        const components = new Map<number, RecurringSeries[]>()
        members.forEach((member, index) => {
            const root = find(index)
            components.set(root, [...(components.get(root) ?? []), member])
        })

        const componentModels = [...components.values()].map((component) => {
            if (component.length === 1) return component[0].amountModel
            const occurrences = component
                .flatMap((series) => series.occurrences)
                .sort((a, b) => a.date.localeCompare(b.date))
            const clusters: (typeof occurrences)[] = []
            for (const occurrence of occurrences) {
                const cluster = clusters.at(-1)
                const first = cluster?.[0]
                const daysApart = first
                    ? Math.abs(
                          (new Date(`${occurrence.date}T00:00:00`).getTime() -
                              new Date(`${first.date}T00:00:00`).getTime()) /
                              86_400_000
                      )
                    : Number.POSITIVE_INFINITY
                if (cluster && daysApart <= 7) cluster.push(occurrence)
                else clusters.push([occurrence])
            }
            const representativeAmounts = clusters.map((cluster) =>
                median(cluster.map((occurrence) => occurrence.amount))
            )
            return {
                typicalAmount: median(representativeAmounts),
                minimumAmount: Math.min(...representativeAmounts),
                maximumAmount: Math.max(...representativeAmounts),
            }
        })

        return {
            typicalAmount: representativeMoney(
                componentModels.reduce(
                    (total, model) => total + model.typicalAmount,
                    0
                )
            ),
            minimumAmount: representativeMoney(
                componentModels.reduce(
                    (total, model) => total + model.minimumAmount,
                    0
                )
            ),
            maximumAmount: representativeMoney(
                componentModels.reduce(
                    (total, model) => total + model.maximumAmount,
                    0
                )
            ),
        }
    }

    function sameRecurringSchedule(
        left: RecurringSeries,
        right: RecurringSeries
    ) {
        if (
            left.cadence !== right.cadence ||
            left.direction !== right.direction ||
            left.currency !== right.currency
        ) {
            return false
        }
        const rightDates = right.occurrences.map((occurrence) =>
            new Date(`${occurrence.date}T00:00:00`).getTime()
        )
        const leftDates = left.occurrences.map((occurrence) =>
            new Date(`${occurrence.date}T00:00:00`).getTime()
        )
        const matched = new Set<number>()
        let matches = 0
        for (const date of leftDates) {
            let nearestIndex = -1
            let nearestDistance = 7 * 86_400_000 + 1
            rightDates.forEach((candidate, index) => {
                if (matched.has(index)) return
                const distance = Math.abs(date - candidate)
                if (distance < nearestDistance) {
                    nearestDistance = distance
                    nearestIndex = index
                }
            })
            if (nearestIndex >= 0 && nearestDistance <= 7 * 86_400_000) {
                matched.add(nearestIndex)
                matches += 1
            }
        }
        const requiredMatches = Math.max(
            2,
            Math.ceil(Math.min(leftDates.length, rightDates.length) * 0.5)
        )
        return (
            matches >= requiredMatches || adjacentRecurringSchedule(left, right)
        )
    }

    function adjacentRecurringSchedule(
        left: RecurringSeries,
        right: RecurringSeries
    ) {
        const leftFirst = left.occurrences[0]
        const leftLast = left.occurrences.at(-1)
        const rightFirst = right.occurrences[0]
        const rightLast = right.occurrences.at(-1)
        if (!leftFirst || !leftLast || !rightFirst || !rightLast) return false

        const [older, newer] =
            leftLast.date < rightFirst.date
                ? [left, right]
                : rightLast.date < leftFirst.date
                  ? [right, left]
                  : [undefined, undefined]
        if (!older || !newer) return false

        const olderLastDate = new Date(
            `${older.occurrences.at(-1)!.date}T00:00:00`
        )
        const newerFirstDate = new Date(`${newer.occurrences[0].date}T00:00:00`)
        const monthsApart =
            (newerFirstDate.getFullYear() - olderLastDate.getFullYear()) * 12 +
            newerFirstDate.getMonth() -
            olderLastDate.getMonth()
        const amountScale = Math.max(
            older.amountModel.typicalAmount,
            newer.amountModel.typicalAmount
        )
        const amountDifference = Math.abs(
            older.amountModel.typicalAmount - newer.amountModel.typicalAmount
        )
        return (
            monthsApart === older.intervalMonths &&
            amountDifference <= Math.max(1, amountScale * 0.05)
        )
    }

    function latestMember(members: RecurringSeries[]) {
        return members.reduce((latest, member) =>
            (member.occurrences.at(-1)?.date ?? '') >
            (latest.occurrences.at(-1)?.date ?? '')
                ? member
                : latest
        )
    }

    function median(values: number[]) {
        const sorted = [...values].sort((a, b) => a - b)
        const middle = Math.floor(sorted.length / 2)
        return sorted.length % 2
            ? sorted[middle]
            : (sorted[middle - 1] + sorted[middle]) / 2
    }

    function representativeMoney(value: number) {
        return Math.round(value * 100) / 100
    }

    function recurringObservationIds(row: RecurringRow) {
        return row.observationIds
    }

    function observationsAsOccurrences(
        members: RecurringSeries[],
        ids: string[]
    ) {
        const existing = new Map(
            members
                .flatMap((series) => series.occurrences)
                .map((occurrence) => [occurrence.statementId, occurrence])
        )
        const statements = new Map(
            (rules?.statements ?? []).map((statement) => [
                statement.id,
                statement,
            ])
        )
        return ids.map(
            (id) =>
                existing.get(id) ?? {
                    statementIndex: -1,
                    statementId: id,
                    date: statements.get(id)?.date?.slice(0, 10) ?? '',
                    amount: Math.abs(statements.get(id)?.amount ?? 0),
                }
        )
    }

    function recurringObservationStatements(
        row: RecurringRow,
        ids = recurringObservationIds(row)
    ) {
        const statementMap = new Map(
            (rules?.statements ?? []).map((statement) => [
                statement.id,
                statement,
            ])
        )
        return ids
            .map((id) => statementMap.get(id))
            .filter((statement): statement is RuleStatement =>
                Boolean(statement)
            )
            .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    }

    function expectedRecurringForSeries(series: RecurringSeries) {
        if (mode === 'all') return 0
        const window = scopeWindow()
        const firstDate = series.occurrences.map((item) => item.date).sort()[0]
        if (!window || !firstDate) return 0
        let dueDate = dateValue(firstDate)
        while (dueDate < window.from)
            dueDate = addRecurringInterval(
                dueDate,
                series.intervalMonths,
                series.anchor.endOfMonth
            )
        let count = 0
        while (
            dueDate <= window.to &&
            (!series.endedAt || dateKey(dueDate) <= series.endedAt)
        ) {
            count += 1
            dueDate = addRecurringInterval(
                dueDate,
                series.intervalMonths,
                series.anchor.endOfMonth
            )
        }
        return count * series.amountModel.typicalAmount
    }

    function scopeWindow(): { from: Date; to: Date } | null {
        if (mode === 'all') return null
        if (mode === 'month' && /^\d{4}-\d{2}$/.test(monthKey)) {
            const [selectedYear, selectedMonth] = monthKey
                .split('-')
                .map(Number)
            return {
                from: new Date(selectedYear, selectedMonth - 1, 1),
                to: new Date(selectedYear, selectedMonth, 0),
            }
        }
        if (mode === 'year' && Number.isInteger(year))
            return { from: new Date(year, 0, 1), to: new Date(year, 11, 31) }
        if (
            mode === 'range' &&
            isDateKey(fromDate) &&
            isDateKey(toDate) &&
            fromDate <= toDate
        )
            return { from: dateValue(fromDate), to: dateValue(toDate) }
        return null
    }

    function dateValue(value: string) {
        return new Date(`${value}T00:00:00`)
    }

    function startOfToday() {
        const today = new Date()
        return new Date(today.getFullYear(), today.getMonth(), today.getDate())
    }

    function addRecurringInterval(
        value: Date,
        intervalMonths: 1 | 12,
        endOfMonth = false
    ) {
        const target = new Date(
            value.getFullYear(),
            value.getMonth() + intervalMonths,
            1
        )
        const lastDay = new Date(
            target.getFullYear(),
            target.getMonth() + 1,
            0
        ).getDate()
        return new Date(
            target.getFullYear(),
            target.getMonth(),
            endOfMonth ? lastDay : Math.min(value.getDate(), lastDay)
        )
    }

    function remainingExpectedMovements() {
        const window = scopeWindow()
        if (!window) return [] as { series: RecurringSeries; date: Date }[]
        const start =
            window.from > startOfToday() ? window.from : startOfToday()
        return confirmedRecurring
            .flatMap((series) => {
                const movements: { series: RecurringSeries; date: Date }[] = []
                let next = dateValue(series.nextExpectedDate)
                if (series.endedAt && series.endedAt < dateKey(start))
                    return movements
                while (next < start)
                    next = addRecurringInterval(
                        next,
                        series.intervalMonths,
                        series.anchor.endOfMonth
                    )
                while (
                    next <= window.to &&
                    (!series.endedAt || dateKey(next) <= series.endedAt)
                ) {
                    movements.push({ series, date: next })
                    next = addRecurringInterval(
                        next,
                        series.intervalMonths,
                        series.anchor.endOfMonth
                    )
                }
                return movements
            })
            .sort((a, b) => a.date.getTime() - b.date.getTime())
    }

    function estimateRemainingFlexibleSpending() {
        const window = scopeWindow()
        if (!window || !monthlyPeriods.length) return null
        const start =
            window.from > startOfToday() ? window.from : startOfToday()
        if (start > window.to) return 0
        const daysInWindow = Math.max(
            1,
            Math.round(
                (window.to.getTime() - window.from.getTime()) / 86400000
            ) + 1
        )
        const remainingDays = Math.max(
            0,
            Math.round((window.to.getTime() - start.getTime()) / 86400000) + 1
        )
        const recurringCategories = new Set(
            confirmedRecurring
                .filter(
                    (series) =>
                        !series.endedAt ||
                        series.endedAt >= dateKey(startOfToday())
                )
                .map((series) => series.category)
                .filter(Boolean)
        )
        const recentPeriods = monthlyPeriods.slice(-3)
        const recentFlexibleAverage =
            recentPeriods.reduce(
                (total, period) =>
                    total +
                    period.categories
                        .filter(
                            (item) => !recurringCategories.has(item.category)
                        )
                        .reduce((sum, item) => sum + item.totalAmount, 0),
                0
            ) / recentPeriods.length
        const windowMonths = daysInWindow / 30.4375
        return (
            recentFlexibleAverage *
            windowMonths *
            (remainingDays / daysInWindow)
        )
    }

    function percentage(value: number, total: number) {
        return total ? Math.round((value / total) * 100) : 0
    }

    function monthLabel(key: string) {
        if (!key) return 'Select month'
        const [selectedYear, selectedMonth] = key.split('-').map(Number)
        return new Intl.DateTimeFormat('en-US', {
            month: 'long',
            year: 'numeric',
        }).format(new Date(selectedYear, selectedMonth - 1, 1))
    }

    function scopeLabelFor(scope: FinanceScope) {
        if (scope.mode === 'month')
            return monthLabel(
                `${scope.year}-${String(scope.month).padStart(2, '0')}`
            )
        if (scope.mode === 'year') return String(scope.year)
        if (scope.mode === 'range') return rangeLabel(scope.from, scope.to)
        return 'All time'
    }

    function rangeLabel(from: string, to: string) {
        if (!from || !to) return 'Choose a date range'
        return `${dateLabel(from)} – ${dateLabel(to)}`
    }

    function dateLabel(value: string) {
        if (!isDateKey(value)) return 'Select date'
        return new Intl.DateTimeFormat('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        }).format(new Date(`${value}T00:00:00`))
    }

    function aliasCreatedLabel(value?: string): string | null {
        if (!value) return null
        const date = new Date(value)
        if (Number.isNaN(date.getTime())) return null
        return `Created ${new Intl.DateTimeFormat(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
        }).format(date)}`
    }

    function isDateKey(value: string) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
        const [year, month, day] = value.split('-').map(Number)
        const date = new Date(year, month - 1, day)
        return (
            date.getFullYear() === year &&
            date.getMonth() === month - 1 &&
            date.getDate() === day
        )
    }

    function usualAmount(values: number[]) {
        if (values.length < 2) return null
        const sorted = [...values].sort((a, b) => a - b)
        const middle = Math.floor(sorted.length / 2)
        return sorted.length % 2
            ? sorted[middle]
            : (sorted[middle - 1] + sorted[middle]) / 2
    }

    function setMode(nextMode: ViewMode) {
        mode = nextMode
        if (nextMode === 'month' && !monthKey)
            monthKey = dashboard?.availablePeriods.lastMonth ?? ''
        if (
            nextMode === 'year' &&
            !dashboard?.availablePeriods.years.includes(year)
        )
            year = dashboard?.availablePeriods.years.at(-1) ?? year
        if (
            nextMode === 'range' &&
            (!isDateKey(fromDate) || !isDateKey(toDate)) &&
            dashboard?.availablePeriods.firstMonth
        ) {
            fromDate = `${dashboard.availablePeriods.firstMonth}-01`
            toDate = `${dashboard.availablePeriods.lastMonth}-${new Date(Number(dashboard.availablePeriods.lastMonth.slice(0, 4)), Number(dashboard.availablePeriods.lastMonth.slice(5, 7)), 0).getDate()}`
        }
        if (comparePeriods && nextMode !== 'all') previousComparisonScope()
        else if (nextMode === 'all') comparePeriods = false
        refresh()
    }

    function shiftChartWindow(direction: -1 | 1) {
        const nextOffset = Math.min(
            chartWindowCount - 1,
            Math.max(0, chartWindowOffset + direction)
        )
        chartWindowOffset = nextOffset
        const selectedIndex =
            monthlyPeriods.length - nextOffset * CHART_MONTHS - 1
        overallMonthKey = monthlyPeriods[selectedIndex]?.key ?? overallMonthKey
    }

    function chartMonthLabel(key: string) {
        const [selectedYear, selectedMonth] = key.split('-').map(Number)
        return new Intl.DateTimeFormat('en-US', { month: 'short' }).format(
            new Date(selectedYear, selectedMonth - 1, 1)
        )
    }

    function chartYearLabel(key: string) {
        return key.slice(0, 4)
    }

    function chooseMonth(event: Event) {
        monthKey = (event.currentTarget as HTMLSelectElement).value
        if (comparePeriods) previousComparisonScope()
        refresh()
    }

    function chooseYear(event: Event) {
        year = Number((event.currentTarget as HTMLSelectElement).value)
        if (comparePeriods) previousComparisonScope()
        refresh()
    }

    function chooseRange() {
        if (isDateKey(fromDate) && isDateKey(toDate) && fromDate <= toDate) {
            if (comparePeriods) previousComparisonScope()
            refresh()
        }
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
        return confidence === 'confirmed'
            ? 'success'
            : confidence === 'probable'
              ? 'warning'
              : 'neutral'
    }

    function delta(value: number | null) {
        if (value == null) return '—'
        return `${value > 0 ? '+' : ''}${money(value)}`
    }

    function compactMoney(value: number | null | undefined) {
        return value == null
            ? '—'
            : new Intl.NumberFormat('de-DE', {
                  style: 'currency',
                  currency: 'EUR',
                  notation: 'compact',
                  maximumFractionDigits: 1,
              }).format(value)
    }

    function categoryName(id: string) {
        return (
            categories.find((category) => category.id === id)?.name ??
            'Unknown category'
        )
    }

    function compareAliases(
        a: Alias,
        b: Alias,
        sort: AliasSort,
        usage: Record<string, number>
    ) {
        if (sort === 'name-asc') return a.value.localeCompare(b.value)
        if (sort === 'name-desc') return b.value.localeCompare(a.value)
        const difference = (usage[b.id] ?? 0) - (usage[a.id] ?? 0)
        return sort === 'usage-desc'
            ? difference || a.value.localeCompare(b.value)
            : -difference || a.value.localeCompare(b.value)
    }

    function fieldLabel(field: Alias['field']) {
        return field === 'any'
            ? 'Any statement field'
            : field === 'text'
              ? 'Description'
              : field === 'transaction_type'
                ? 'Transaction type'
                : 'Source category'
    }

    function chooseFile(event: Event) {
        selectedFile =
            (event.currentTarget as HTMLInputElement).files?.[0] ?? null
        columnMappings = {}
        importHeaders = []
        if (!selectedFile) return
        void selectedFile.text().then((text) => {
            const first = text.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] ?? ''
            const delimiter = [';', ',', '\t'].sort(
                (a, b) => first.split(b).length - first.split(a).length
            )[0]
            const cells: string[] = []
            let cell = '',
                quoted = false
            for (let i = 0; i < first.length; i++) {
                if (first[i] === '"') {
                    if (quoted && first[i + 1] === '"') {
                        cell += '"'
                        i++
                    } else quoted = !quoted
                } else if (!quoted && first[i] === delimiter) {
                    cells.push(cell.trim())
                    cell = ''
                } else cell += first[i]
            }
            cells.push(cell.trim())
            importHeaders = cells
            const known: Record<string, string> = {
                date: 'Buchungstag',
                date_executed: 'Wertstellung',
                transaction_type: 'Umsatzart',
                text: 'Buchungstext',
                amount: 'Betrag',
                currency: 'Währung',
                bank_number_owner: 'IBAN Kontoinhaber',
                category: 'Kategorie',
                sender: 'Sender',
                recipient: 'Empfänger',
                purpose: 'Verwendungszweck',
            }
            for (const [field, header] of Object.entries(known))
                if (cells.includes(header)) columnMappings[field] = header
            const saved = importProfiles.find(
                (profile) => profile.name === importProfile
            )
            if (saved) columnMappings = { ...saved.mappings }
        })
    }

    const importFields = [
        ['date', 'Transaction date'],
        ['date_executed', 'Value date'],
        ['transaction_type', 'Transaction type'],
        ['text', 'Description'],
        ['amount', 'Amount'],
        ['currency', 'Currency'],
        ['bank_number_owner', 'Account owner'],
        ['category', 'Bank category'],
        ['sender', 'Sender'],
        ['recipient', 'Recipient'],
        ['purpose', 'Purpose'],
    ] as const

    async function saveImportProfile() {
        if (!profileName.trim()) return
        try {
            await api.saveImportProfile(profileName.trim(), columnMappings)
            importProfile = profileName.trim()
            importProfiles = [
                ...importProfiles.filter(
                    (profile) => profile.name !== importProfile
                ),
                { name: importProfile, mappings: { ...columnMappings } },
            ]
            profileName = ''
        } catch {
            error = 'Could not save the import profile.'
        }
    }

    async function selectLedger() {
        dashboard = null
        rules = null
        recurring = []
        importProfile =
            ledgers.find((ledger) => ledger.id === selectedLedgerId)
                ?.importProfile ?? ''
        if (selectedLedgerId) await refresh()
    }

    async function createLedger() {
        if (!newLedgerName.trim()) {
            error = 'Enter a name for this account ledger.'
            return
        }
        saving = true
        try {
            const created = await api.createLedger(
                newLedgerName.trim(),
                selectedLegacyFiles,
                importProfile || undefined,
                newLedgerRulesTemplate
            )
            const state = await api.getLedgers()
            ledgers = state.ledgers
            unassignedFiles = state.unassignedFiles
            selectedLedgerId = created.id
            newLedgerName = ''
            selectedLegacyFiles = []
            newLedgerRulesTemplate = 'generic'
            creatingLedger = false
            await refresh()
        } catch (cause) {
            error =
                cause instanceof Error
                    ? cause.message
                    : 'Could not create the account ledger.'
        } finally {
            saving = false
        }
    }

    async function applyGenericRulesTemplate() {
        if (!selectedLedgerId) return
        saving = true
        try {
            await api.applyGenericRulesTemplate(selectedLedgerId)
            await refreshRules()
        } catch (cause) {
            error =
                cause instanceof Error
                    ? cause.message
                    : 'Could not apply the generic category template.'
        } finally {
            saving = false
        }
    }

    function toggleLegacyFile(file: string, selected: boolean) {
        selectedLegacyFiles = selected
            ? [...new Set([...selectedLegacyFiles, file])]
            : selectedLegacyFiles.filter((item) => item !== file)
    }

    async function upload() {
        if (!selectedFile || !selectedLedgerId) return
        saving = true
        try {
            await api.uploadStatement(
                selectedFile,
                columnMappings,
                selectedLedgerId
            )
            selectedFile = null
            importHeaders = []
            const state = await api.getLedgers()
            ledgers = state.ledgers
            unassignedFiles = state.unassignedFiles
            await refresh()
        } catch (cause) {
            error =
                cause instanceof Error
                    ? cause.message
                    : 'Could not upload the statement.'
        } finally {
            saving = false
        }
    }

    async function addAlias() {
        if (!newAlias.value.trim() || !newAlias.categoryId) return
        saving = true
        try {
            const created = (await api.createAlias(selectedLedgerId, {
                ...newAlias,
                transactionType: newAlias.transactionType || undefined,
            })) as Alias
            selectedAliasId = created.id
            aliasCategoryFilter = created.categoryId
            search = ''
            showAliasCreateDialog = false
            newAlias = {
                value: '',
                categoryId: newAlias.categoryId,
                field: 'any',
                transactionType: '',
            }
            await refreshRules()
        } catch (cause) {
            error =
                cause instanceof Error
                    ? cause.message
                    : 'Could not add the alias.'
        } finally {
            saving = false
        }
    }

    async function addKeywordSuggestion(value: string) {
        if (!newAlias.categoryId) {
            error = 'Create or select a category before adding a keyword.'
            return
        }
        saving = true
        try {
            await api.createAlias(selectedLedgerId, {
                value,
                categoryId: newAlias.categoryId,
                field: 'any',
            })
            await refreshRules()
        } catch (cause) {
            error =
                cause instanceof Error
                    ? cause.message
                    : 'Could not add the suggested keyword.'
        } finally {
            saving = false
        }
    }

    async function updateAlias(alias: Alias) {
        saving = true
        try {
            await api.updateAlias(selectedLedgerId, alias.id, {
                value: alias.value,
                categoryId: alias.categoryId,
                field: alias.field,
                transactionType: alias.transactionType,
                statementId: alias.statementId,
                excludedStatementIds: alias.excludedStatementIds,
            })
            editingAliasId = ''
            await refreshRules()
        } catch (cause) {
            error =
                cause instanceof Error
                    ? cause.message
                    : 'Could not update the alias.'
        } finally {
            saving = false
        }
    }

    async function removeAlias(id: string) {
        if (!confirm('Remove this alias?')) return
        saving = true
        error = ''
        try {
            await api.deleteAlias(selectedLedgerId, id)
            selectedAliasId = ''
            editingAliasId = ''
            await refreshRules()
        } catch (cause) {
            error =
                cause instanceof Error
                    ? cause.message
                    : 'Could not remove the alias.'
        } finally {
            saving = false
        }
    }

    async function addCategory() {
        if (!newCategory.name.trim()) return
        saving = true
        try {
            await api.createCategory(selectedLedgerId, newCategory)
            newCategory = { name: '', necessity: 'necessity' }
            await refreshRules()
        } catch (cause) {
            error =
                cause instanceof Error
                    ? cause.message
                    : 'Could not add the category.'
        } finally {
            saving = false
        }
    }

    async function updateCategory(category: Category) {
        saving = true
        try {
            await api.updateCategory(selectedLedgerId, category.id, category)
            editingCategoryId = ''
            await refreshRules()
        } catch (cause) {
            error =
                cause instanceof Error
                    ? cause.message
                    : 'Could not update the category.'
        } finally {
            saving = false
        }
    }

    async function removeCategory(category: Category) {
        if (category.aliasCount || !confirm(`Delete ${category.name}?`)) return
        try {
            await api.deleteCategory(selectedLedgerId, category.id)
            await refreshRules()
        } catch (cause) {
            error =
                cause instanceof Error
                    ? cause.message
                    : 'Could not delete the category.'
        }
    }

    async function moveCategory(necessity: Necessity) {
        const category = categories.find(
            (item) => item.id === draggedCategoryId
        )
        if (!category || category.necessity === necessity) return
        category.necessity = necessity
        await updateCategory(category)
        draggedCategoryId = ''
    }

    function quickCreate(statement: RuleStatement) {
        quickAliasStatement = statement
        quickAliasValue = suggestedAlias(statement)
        quickAliasCategoryId = newAlias.categoryId || categories[0]?.id || ''
    }

    async function saveQuickAlias() {
        if (!quickAliasValue.trim() || !quickAliasCategoryId) return
        saving = true
        try {
            await api.createAlias(selectedLedgerId, {
                value: quickAliasValue.trim(),
                categoryId: quickAliasCategoryId,
                field: 'any',
            })
            quickAliasStatement = null
            await refreshRules()
        } catch (cause) {
            error =
                cause instanceof Error
                    ? cause.message
                    : 'Could not create the alias.'
        } finally {
            saving = false
        }
    }

    function suggestedAlias(statement: RuleStatement) {
        const source =
            statement.recipient ||
            statement.sender ||
            statement.text ||
            statement.purpose ||
            statement.transactionType
        return source
            .trim()
            .replace(/\s+/g, ' ')
            .split(' ')
            .slice(0, 3)
            .join(' ')
    }

    async function pinAlias(statement: RuleStatement, aliasId: string) {
        saving = true
        try {
            for (const match of statement.matches.filter(
                (item) => item.id !== aliasId
            )) {
                const other = aliases.find((alias) => alias.id === match.id)
                await api.updateAlias(selectedLedgerId, match.id, {
                    excludedStatementIds: [
                        ...(other?.excludedStatementIds ?? []),
                        statement.id,
                    ],
                })
            }
            await api.updateAlias(selectedLedgerId, aliasId, {
                statementId: statement.id,
            })
            await refreshRules()
        } catch (cause) {
            error =
                cause instanceof Error
                    ? cause.message
                    : 'Could not narrow the alias.'
        } finally {
            saving = false
        }
    }

    async function setRecurringRowDecision(
        row: RecurringRow,
        decision: 'confirmed' | 'denied'
    ) {
        saving = true
        try {
            await Promise.all(
                row.memberSeriesIds.map((seriesId) =>
                    api.setRecurringDecision(
                        selectedLedgerId,
                        seriesId,
                        decision
                    )
                )
            )
            recurring = await api.getRecurring(selectedLedgerId)
        } catch (cause) {
            error =
                cause instanceof Error
                    ? cause.message
                    : 'Could not update the recurring decision.'
        } finally {
            saving = false
        }
    }

    function toggleRecurringSelection(row: RecurringRow) {
        if (row.members.length > 1) return
        selectedRecurringIds = selectedRecurringIds.includes(row.id)
            ? selectedRecurringIds.filter((id) => id !== row.id)
            : [...selectedRecurringIds, row.id]
    }

    async function mergeSelectedRecurring() {
        const seriesIds = recurringRows
            .filter((row) => selectedRecurringIds.includes(row.id))
            .flatMap((row) => row.memberSeriesIds)
        if (seriesIds.length < 2) return
        saving = true
        try {
            await api.createRecurringGroup(selectedLedgerId, seriesIds)
            selectedRecurringIds = []
            await refresh()
        } catch (cause) {
            error =
                cause instanceof Error
                    ? cause.message
                    : 'Could not merge the recurring series.'
        } finally {
            saving = false
        }
    }

    async function unmergeRecurring(row: RecurringRow) {
        if (
            row.members.length < 2 ||
            !confirm(
                'Split this merged recurring payment back into its detected series?'
            )
        )
            return
        saving = true
        try {
            await api.deleteRecurringGroup(selectedLedgerId, row.id)
            await refresh()
        } catch (cause) {
            error =
                cause instanceof Error
                    ? cause.message
                    : 'Could not split the recurring payment.'
        } finally {
            saving = false
        }
    }

    function openRecurringAlias(row: RecurringRow) {
        recurringDialog = { kind: 'alias', row }
        recurringAliasDraft =
            recurringSettings.aliases[row.id] ?? row.alias ?? ''
        recurringAliasScan = null
    }

    async function saveRecurringAlias() {
        if (!recurringDialog) return
        recurringAliasScanning = true
        try {
            const { row } = recurringDialog
            const result = await api.saveRecurringAlias(
                selectedLedgerId,
                row.id,
                row.memberSeriesIds,
                recurringAliasDraft.trim()
            )
            recurringAliasScan = result.scan
            recurringSettings = await api.getRecurringSettings(selectedLedgerId)
            recurring = await api.getRecurring(selectedLedgerId)
        } catch (cause) {
            error =
                cause instanceof Error
                    ? cause.message
                    : 'Could not save the recurring alias.'
        } finally {
            recurringAliasScanning = false
        }
    }

    function openRecurringObservations(row: RecurringRow) {
        recurringDialog = { kind: 'observations', row }
        recurringAliasScan = null
        recurringObservationLimit = 100
    }

    function openRecurringEndDate(row: RecurringRow) {
        recurringDialog = { kind: 'end-date', row }
        recurringEndDateDraft = row.endedAt ?? dateKey(startOfToday())
    }

    async function saveRecurringEndDate(endedAt: string | null) {
        if (!recurringDialog || recurringDialog.kind !== 'end-date') return
        saving = true
        try {
            const { row } = recurringDialog
            await Promise.all(
                row.memberSeriesIds.map((seriesId) =>
                    api.setRecurringEndDate(selectedLedgerId, seriesId, endedAt)
                )
            )
            recurring = await api.getRecurring(selectedLedgerId)
            closeRecurringDialog()
        } catch (cause) {
            error =
                cause instanceof Error
                    ? cause.message
                    : 'Could not update the recurring end date.'
        } finally {
            saving = false
        }
    }

    function closeRecurringDialog() {
        recurringDialog = null
        recurringAliasScan = null
    }

    async function toggleManualRecurring(statement: RuleStatement) {
        saving = true
        try {
            const direction = statement.recurringDirection
                ? null
                : statement.amount != null && statement.amount > 0
                  ? 'income'
                  : 'expense'
            await api.setManualRecurring(
                selectedLedgerId,
                statement.id,
                direction
            )
            await refreshRules()
        } catch (cause) {
            error =
                cause instanceof Error
                    ? cause.message
                    : 'Could not update the recurring statement.'
        } finally {
            saving = false
        }
    }

    function openNewAlias(value = '') {
        newAlias = { ...newAlias, value }
        page = 'aliases'
        openAliasCreate()
    }

    function openAliasCreate() {
        if (aliasCategoryFilter !== 'all')
            newAlias.categoryId = aliasCategoryFilter
        showAliasCreateDialog = true
    }

    function navigate(nextPage: Page) {
        if (page === nextPage) return
        page = nextPage
        const nextUrl = new URL(window.location.href)
        nextUrl.searchParams.set('page', nextPage)
        window.history.pushState({}, '', nextUrl)
    }

    function selectAliasCategory(categoryId: string) {
        aliasCategoryFilter = categoryId
        selectedAliasId = ''
        editingAliasId = ''
    }

    function goToAlias(aliasId: string) {
        const alias = aliases.find((item) => item.id === aliasId)
        if (!alias) return
        search = alias.value
        aliasCategoryFilter = alias.categoryId
        selectedAliasId = alias.id
        editingAliasId = alias.id
        page = 'aliases'
    }

    function goToCategory(categoryId: string) {
        page = 'categories'
        setTimeout(() => {
            document
                .getElementById(`category-${categoryId}`)
                ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
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

    function openStatementsForAlias(alias: Alias) {
        statementSearch = alias.value
        statementFilter = 'all'
        statementTypeFilter = 'all'
        statementLimit = 100
        navigate('statements')
    }

    async function copyAliasValue(alias: Alias) {
        try {
            await navigator.clipboard.writeText(alias.value)
            copiedAliasId = alias.id
            window.setTimeout(() => {
                if (copiedAliasId === alias.id) copiedAliasId = ''
            }, 1500)
        } catch {
            error = 'Could not copy this alias to the clipboard.'
        }
    }
</script>

<svelte:head
    ><title>Finance tracker · Spending overview</title><meta
        name="description"
        content="Understand spending, recurring payments, and where money goes."
    /></svelte:head
>

<main
    class="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.13),_transparent_32rem),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)]"
>
    <div class="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <header
            class="mb-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"
        >
            <div>
                <div class="flex flex-wrap items-center gap-2">
                    <label
                        class="flex h-10 max-w-64 items-center gap-2 rounded-xl border border-white/80 bg-white/80 px-3 text-sm shadow-sm backdrop-blur"
                    >
                        <FolderKanban size={16} class="text-slate-400" />
                        <select
                            bind:value={selectedLedgerId}
                            onchange={selectLedger}
                            class="min-w-0 bg-transparent outline-none"
                            aria-label="Selected ledger"
                        >
                            <option value="">Select account ledger</option>
                            {#each ledgers as ledger}<option value={ledger.id}
                                    >{ledger.name} · {ledger.sources.length} files</option
                                >{/each}
                        </select>
                    </label>
                    {#if selectedLedgerId}<Button
                            size="sm"
                            variant="outline"
                            onclick={() => (creatingLedger = !creatingLedger)}
                            ><Plus size={15} />New ledger</Button
                        >{/if}
                    <label
                        class="flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 text-xs font-semibold text-slate-600 hover:border-primary hover:bg-white"
                        ><Upload size={15} />{selectedFile?.name ??
                            'Upload CSV'}<input
                            id="statement-file-input"
                            type="file"
                            accept=".csv,text/csv"
                            class="sr-only"
                            disabled={!selectedLedgerId}
                            onchange={chooseFile}
                        /></label
                    >
                    {#if selectedFile}<Button
                            size="sm"
                            onclick={upload}
                            disabled={saving}
                            ><Upload size={14} />Save file</Button
                        >{/if}
                    <Button
                        variant="outline"
                        size="icon"
                        title="Refresh"
                        aria-label="Refresh"
                        onclick={refresh}
                        disabled={!selectedLedgerId.trim() || loading}
                        ><RefreshCw
                            size={16}
                            class={loading ? 'animate-spin' : ''}
                        /></Button
                    >
                </div>
            </div>
        </header>

        {#if !checkingLedgers && (!selectedLedgerId || creatingLedger) && !selectedFile}
            <Card
                className="mb-5 space-y-4 border-indigo-200 bg-indigo-50/70 p-6"
            >
                <div>
                    <h2 class="font-semibold text-slate-900">
                        {ledgers.length
                            ? 'Choose a ledger or create one'
                            : 'Create an account ledger'}
                    </h2>
                    <p class="mt-1 text-sm text-slate-600">
                        A ledger combines statements for one bank account.
                        Choose which existing CSVs belong together, or create an
                        empty ledger and upload into it.
                    </p>
                </div>
                <div class="flex flex-wrap items-center gap-2">
                    <input
                        class="rounded-lg border bg-white p-2 text-sm"
                        bind:value={newLedgerName}
                        placeholder="Account or person name"
                        aria-label="New ledger name"
                    />
                    <select
                        class="rounded-lg border bg-white p-2 text-sm"
                        bind:value={importProfile}
                        aria-label="Import profile for this ledger"
                    >
                        <option value="">Automatic headers / no profile</option>
                        {#each importProfiles as profile}<option
                                value={profile.name}>{profile.name}</option
                            >{/each}
                    </select>
                    <select
                        class="rounded-lg border bg-white p-2 text-sm"
                        bind:value={newLedgerRulesTemplate}
                        aria-label="Starting finance rules"
                    >
                        <option value="generic"
                            >Generic starter categories</option
                        >
                        <option value="scratch">Start from scratch</option>
                    </select>
                    <Button
                        onclick={createLedger}
                        disabled={saving || !newLedgerName.trim()}
                        ><Plus size={15} />Create ledger</Button
                    >
                </div>
                {#if ledgers.length}<p class="text-xs text-slate-500">
                        Or choose an existing ledger from the selector above.
                    </p>{/if}
                {#if unassignedFiles.length}
                    <fieldset
                        class="space-y-2 rounded-xl border border-indigo-100 bg-white p-4"
                    >
                        <legend
                            class="px-1 text-xs font-semibold text-slate-700"
                            >Existing CSV files to include in the new ledger</legend
                        >
                        {#each unassignedFiles as file}<label
                                class="flex items-center gap-2 text-sm text-slate-700"
                                ><input
                                    type="checkbox"
                                    checked={selectedLegacyFiles.includes(file)}
                                    onchange={(event) =>
                                        toggleLegacyFile(
                                            file,
                                            event.currentTarget.checked
                                        )}
                                />{file}</label
                            >{/each}
                    </fieldset>
                {/if}
            </Card>
        {/if}

        {#if selectedFile}
            <Card className="mb-5 space-y-4">
                <div>
                    <h2 class="font-semibold">Match CSV columns</h2>
                    <p class="mt-1 text-xs text-slate-500">
                        Amount is needed for spending totals. Date enables
                        timeframe views; other columns add detail.
                    </p>
                </div>
                <div class="flex flex-wrap items-end gap-2">
                    <label class="text-xs"
                        >Saved mapping<select
                            class="ml-2 rounded-lg border p-2"
                            bind:value={importProfile}
                            onchange={() => {
                                const saved = importProfiles.find(
                                    (profile) => profile.name === importProfile
                                )
                                if (saved)
                                    columnMappings = { ...saved.mappings }
                            }}
                            ><option value="">Detected / manual</option
                            >{#each importProfiles as savedProfile}<option
                                    value={savedProfile.name}
                                    >{savedProfile.name}</option
                                >{/each}</select
                        ></label
                    >
                    <input
                        class="rounded-lg border p-2 text-sm"
                        bind:value={profileName}
                        placeholder="Save mapping as profile"
                        aria-label="Import profile name"
                    />
                    <Button
                        size="sm"
                        variant="outline"
                        onclick={saveImportProfile}>Save mapping</Button
                    >
                </div>
                <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {#each importFields as [field, label]}
                        <label class="text-xs font-medium text-slate-600"
                            >{label}{field === 'amount'
                                ? ' · recommended'
                                : ''}<select
                                class="mt-1 block w-full rounded-lg border bg-white p-2 text-sm"
                                bind:value={columnMappings[field]}
                                ><option value="">Not present</option
                                >{#each importHeaders as header}<option
                                        value={header}>{header}</option
                                    >{/each}</select
                            ></label
                        >
                    {/each}
                </div>
            </Card>
        {/if}

        <nav
            class="mb-6 flex gap-1 overflow-x-auto rounded-2xl border border-white/80 bg-white/70 p-1.5 shadow-sm backdrop-blur"
            aria-label="Main navigation"
        >
            <button
                class:active-tab={page === 'dashboard'}
                class="tab"
                onclick={() => navigate('dashboard')}
                ><LayoutDashboard size={16} />Overview</button
            >
            <button
                class:active-tab={page === 'spending'}
                class="tab"
                onclick={() => navigate('spending')}
                ><ArrowDownUp size={16} />Spending</button
            >
            <button
                class:active-tab={page === 'recurring'}
                class="tab"
                onclick={() => navigate('recurring')}
                ><CalendarClock size={16} />Recurring {#if activeRecurring.length}<span
                        class="tab-count">{activeRecurring.length}</span
                    >{/if}</button
            >
            <button
                class:active-tab={page === 'review'}
                class="tab"
                onclick={() => navigate('review')}
                ><AlertTriangle size={16} />Review {#if unmatched.length + conflicts.length}<span
                        class="tab-count danger-count"
                        >{unmatched.length + conflicts.length}</span
                    >{/if}</button
            >
            <button
                class:active-tab={page === 'aliases'}
                class="tab"
                onclick={() => navigate('aliases')}
                ><Tag size={16} />Aliases
                <span class="tab-count">{aliases.length}</span></button
            >
            <button
                class:active-tab={page === 'categories'}
                class="tab"
                onclick={() => navigate('categories')}
                ><FolderKanban size={16} />Categories</button
            >
            <button
                class:active-tab={page === 'statements'}
                class="tab"
                onclick={() => navigate('statements')}
                ><ListFilter size={16} />Statements
                <span class="tab-count">{rules?.stats.total ?? 0}</span></button
            >
        </nav>

        {#if error}<Card
                className="mb-5 flex items-center gap-3 border-red-200 bg-red-50 p-4 text-sm text-red-800"
                ><AlertTriangle size={17} /><span>{error}</span><button
                    class="ml-auto text-xs font-bold"
                    onclick={() => (error = '')}>Dismiss</button
                ></Card
            >{/if}

        {#if !selectedLedgerId}
            <p class="sr-only" role="status">
                Choose an account ledger to load the finance dashboard.
            </p>
        {:else if page === 'dashboard'}
            <section class="space-y-5 animate-float-in">
                <Card
                    className="flex flex-col gap-4 border-indigo-100 bg-indigo-50/60 p-4 sm:flex-row sm:items-center sm:justify-between"
                    ><div>
                        <p class="label text-indigo-500">Analyze timeframe</p>
                    </div>
                    <div class="flex flex-wrap items-center gap-2">
                        <div class="inline-flex rounded-xl bg-white/70 p-1">
                            {#each [['month', 'Month'], ['year', 'Year'], ['range', 'Custom'], ['all', 'All time']] as option}<button
                                    class:active-mode={mode === option[0]}
                                    class="rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 transition hover:text-slate-950"
                                    onclick={() =>
                                        setMode(option[0] as ViewMode)}
                                    >{option[1]}</button
                                >{/each}
                        </div>
                        {#if mode === 'month'}<select
                                aria-label="Select month"
                                bind:value={monthKey}
                                onchange={chooseMonth}
                                class="field min-w-44 cursor-pointer text-left"
                                ><option value="" disabled>Select month</option
                                >{#each dashboard?.availablePeriods.months ?? [] as availableMonth}<option
                                        value={availableMonth}
                                        >{monthLabel(availableMonth)}</option
                                    >{/each}</select
                            >{:else if mode === 'year'}<div class="relative">
                                <button class="field min-w-28 text-left"
                                    >{year}</button
                                ><select
                                    aria-label="Select year"
                                    bind:value={year}
                                    onchange={chooseYear}
                                    class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                    >{#each dashboard?.availablePeriods.years ?? [year] as availableYear}<option
                                            value={availableYear}
                                            >{availableYear}</option
                                        >{/each}</select
                                >
                            </div>{:else if mode === 'range'}<div
                                class="flex flex-wrap items-center gap-2"
                            >
                                <input
                                    type="date"
                                    bind:value={fromDate}
                                    onchange={chooseRange}
                                    class="field"
                                    aria-label="Range start"
                                /><span
                                    class="text-xs font-semibold text-slate-400"
                                    >to</span
                                ><input
                                    type="date"
                                    bind:value={toDate}
                                    onchange={chooseRange}
                                    class="field"
                                    aria-label="Range end"
                                />
                            </div>{/if}
                    </div></Card
                >
                <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Card className="p-5"
                        ><div class="mb-5 flex items-center justify-between">
                            <span class="icon-tile bg-indigo-50 text-indigo-600"
                                ><Sparkles size={18} /></span
                            ><Badge>{scopeLabel}</Badge>
                        </div>
                        <p class="label">Net movement</p>
                        <p class="metric">
                            {money(dashboard?.metrics.netMovement)}
                        </p>
                        <p class="hint">Income minus spending</p></Card
                    >
                    <Card className="p-5"
                        ><div class="mb-5 flex items-center justify-between">
                            <span
                                class="icon-tile bg-emerald-50 text-emerald-600"
                                ><ArrowRight size={18} /></span
                            ><Badge>{scopeLabel}</Badge>
                        </div>
                        <p class="label">Income</p>
                        <p class="metric">{money(dashboard?.metrics.income)}</p>
                        <p class="hint">Money received in this period</p></Card
                    >
                    <Card className="p-5"
                        ><div class="mb-5 flex items-center justify-between">
                            <span class="icon-tile bg-amber-50 text-amber-600"
                                ><WandSparkles size={18} /></span
                            ><Badge>{scopeLabel}</Badge>
                        </div>
                        <p class="label">Spending</p>
                        <p class="metric">
                            {money(dashboard?.metrics.spending)}
                        </p>
                        <p class="hint">
                            Negative movements in this period
                        </p></Card
                    >
                    <Card className="p-5"
                        ><div class="mb-5 flex items-center justify-between">
                            <span class="icon-tile bg-violet-50 text-violet-600"
                                ><Sparkles size={18} /></span
                            ><Badge>{scopeLabel}</Badge>
                        </div>
                        <p class="label">Top category</p>
                        <p
                            class="truncate text-2xl font-semibold tracking-tight text-slate-950"
                        >
                            {dashboard?.metrics.topCategory?.category ?? '—'}
                        </p>
                        <p class="hint">
                            {money(dashboard?.metrics.topCategory?.totalAmount)} in
                            this period
                        </p></Card
                    >
                </div>

                <div class="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
                    <Card className="border-slate-200 bg-white p-5"
                        ><div class="flex items-start justify-between gap-4">
                            <div>
                                <p class="label">Period at a glance</p>
                                <h2
                                    class="mt-1 text-xl font-semibold text-slate-950"
                                >
                                    {spendingDelta == null
                                        ? 'Build your baseline'
                                        : spendingDelta >= 0
                                          ? `${money(spendingDelta)} above usual`
                                          : `${money(Math.abs(spendingDelta))} below usual`}
                                </h2>
                                <p class="hint">
                                    {usualPeriodSpending == null
                                        ? 'Select a month or year with enough history to compare.'
                                        : `Usual spending is ${money(usualPeriodSpending)} for this view.`}
                                </p>
                            </div>
                            <Badge
                                tone={spendingDelta != null && spendingDelta > 0
                                    ? 'warning'
                                    : 'success'}
                                >{spendingDelta == null
                                    ? 'No comparison'
                                    : spendingDelta > 0
                                      ? 'Above usual'
                                      : 'On track'}</Badge
                            >
                        </div>
                        {#if topChanges.length}<div class="mt-5 space-y-1">
                                {#each topChanges as item}<button
                                        class="dashboard-detail-row"
                                        onclick={() =>
                                            openSpendingCategory(item.category)}
                                        ><span
                                            class="min-w-0 truncate font-medium text-slate-700"
                                            >{item.category}</span
                                        ><span
                                            class={item.difference &&
                                            item.difference > 0
                                                ? 'font-semibold text-amber-700'
                                                : 'font-semibold text-emerald-700'}
                                            >{delta(item.difference)}
                                            <ArrowUpRight size={14} /></span
                                        ></button
                                    >{/each}
                            </div>{:else}<p class="mt-5 text-sm text-slate-500">
                                Your category comparison will appear once this
                                period has a usable history.
                            </p>{/if}</Card
                    >
                    <Card className="border-indigo-100 bg-indigo-50/50 p-5"
                        ><div class="flex items-start justify-between gap-4">
                            <div>
                                <p class="label text-indigo-500">
                                    Cash flow pulse
                                </p>
                                <h2
                                    class="mt-1 text-xl font-semibold text-slate-950"
                                >
                                    {money(dashboard?.metrics.netMovement)} net
                                </h2>
                                <p class="hint">
                                    Compare money in and money out for {scopeLabel.toLocaleLowerCase()}.
                                </p>
                            </div>
                            <button
                                class="icon-button"
                                title="Open spending analysis"
                                aria-label="Open spending analysis"
                                onclick={() => navigate('spending')}
                                ><ArrowRight size={17} /></button
                            >
                        </div>
                        <div class="mt-5 space-y-3">
                            <button
                                class="cashflow-row"
                                onclick={() => navigate('spending')}
                                ><span
                                    ><span class="cashflow-dot income"
                                    ></span>Income</span
                                ><strong
                                    >{money(dashboard?.metrics.income)}</strong
                                ></button
                            >
                            <div class="cashflow-track">
                                <span
                                    class="cashflow-fill income"
                                    style={`width:${Math.max(4, ((dashboard?.metrics.income ?? 0) / Math.max(dashboard?.metrics.income ?? 0, dashboard?.metrics.spending ?? 0, 1)) * 100)}%`}
                                ></span>
                            </div>
                            <button
                                class="cashflow-row"
                                onclick={() => navigate('spending')}
                                ><span
                                    ><span class="cashflow-dot spending"
                                    ></span>Spending</span
                                ><strong
                                    >{money(
                                        dashboard?.metrics.spending
                                    )}</strong
                                ></button
                            >
                            <div class="cashflow-track">
                                <span
                                    class="cashflow-fill spending"
                                    style={`width:${Math.max(4, ((dashboard?.metrics.spending ?? 0) / Math.max(dashboard?.metrics.income ?? 0, dashboard?.metrics.spending ?? 0, 1)) * 100)}%`}
                                ></span>
                            </div>
                        </div></Card
                    >
                </div>

                <div class="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
                    <Card className="p-5"
                        ><div class="mb-5 flex items-center justify-between">
                            <div>
                                <div class="flex items-center gap-2">
                                    <h2 class="section-title">
                                        Spending by category
                                    </h2>
                                    <Badge>{scopeLabel}</Badge>
                                </div>
                                <p class="hint">
                                    Resolved from aliases for the selected
                                    period
                                </p>
                            </div>
                            <button
                                class="icon-button"
                                title="Open categories"
                                aria-label="Open categories"
                                onclick={() => (page = 'categories')}
                                ><ArrowRight size={17} /></button
                            >
                        </div>
                        <div class="space-y-1">
                            {#each dashboard?.categories.slice(0, 6) ?? [] as item}<button
                                    class="dashboard-category-row"
                                    onclick={() =>
                                        openSpendingCategory(item.category)}
                                    ><div
                                        class="mb-1.5 flex items-center justify-between text-sm"
                                    >
                                        <span class="font-medium text-slate-700"
                                            >{item.category}</span
                                        ><span
                                            class="flex items-center gap-1 font-semibold text-slate-950"
                                            >{money(
                                                item.totalAmount
                                            )}<ArrowUpRight size={14} /></span
                                        >
                                    </div>
                                    <div class="progress">
                                        <span
                                            style={`width:${Math.max(5, item.shareOfSpending * 100)}%`}
                                        ></span>
                                    </div></button
                                >{:else}<p class="hint">
                                    No spending data yet.
                                </p>{/each}
                        </div></Card
                    >
                    <Card className="p-5"
                        ><div class="flex items-start justify-between gap-4">
                            <div>
                                <p class="label">Data quality</p>
                                <h2
                                    class="mt-1 text-xl font-semibold text-slate-950"
                                >
                                    {coverage}% classified
                                </h2>
                                <p class="hint">
                                    {unmatched.length + conflicts.length
                                        ? `${unmatched.length + conflicts.length} statements need attention.`
                                        : 'Every statement currently has one matching alias.'}
                                </p>
                            </div>
                            <button
                                class="icon-button"
                                title="Open data quality review"
                                aria-label="Open data quality review"
                                onclick={() => (page = 'review')}
                                ><ArrowRight size={17} /></button
                            >
                        </div>
                        <div class="mt-5 grid grid-cols-2 gap-3">
                            <div class="rounded-xl bg-amber-50 p-3">
                                <p class="label text-amber-600">Unmatched</p>
                                <p
                                    class="mt-1 text-xl font-semibold text-amber-700"
                                >
                                    {unmatched.length}
                                </p>
                            </div>
                            <div class="rounded-xl bg-red-50 p-3">
                                <p class="label text-red-600">Conflicts</p>
                                <p
                                    class="mt-1 text-xl font-semibold text-red-700"
                                >
                                    {conflicts.length}
                                </p>
                            </div>
                        </div></Card
                    >
                </div>

                <hr />
                <div
                    class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"
                >
                    <div class="flex items-center gap-2">
                        <span class="text-xs font-semibold text-slate-500"
                            >Compare category</span
                        ><select
                            bind:value={comparisonCategory}
                            class="field w-48"
                            aria-label="Category for monthly comparison"
                            >{#each comparisonOptions as category}<option
                                    value={category}>{category}</option
                                >{/each}</select
                        >
                    </div>
                </div>
                <Card className="overflow-hidden p-0">
                    <div class="border-b border-slate-100 p-5">
                        <div
                            class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
                        >
                            <div>
                                <div class="flex items-center gap-2">
                                    <h3 class="section-title">
                                        Necessity vs convenience
                                    </h3>
                                    <Badge>Last 12 months</Badge>
                                </div>
                                <p class="hint">
                                    Last 12 months · use the arrows to browse
                                    older history
                                </p>
                            </div>
                            <div
                                class="flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-500"
                            >
                                <span class="flex items-center gap-1.5"
                                    ><span class="dot emerald"
                                    ></span>Necessity</span
                                >
                                <span class="flex items-center gap-1.5"
                                    ><span class="dot violet"
                                    ></span>Convenience</span
                                >
                                {#if necessityPeriods.some((period) => period.unclassified > 0)}<span
                                        class="flex items-center gap-1.5"
                                        ><span
                                            class="h-2.5 w-2.5 rounded-full bg-slate-300"
                                        ></span>Unclassified</span
                                    >{/if}
                                <span class="inline-flex items-center gap-1">
                                    <button
                                        class="icon-button"
                                        title="Show older 12 months"
                                        aria-label="Show older 12 months"
                                        onclick={() => shiftChartWindow(1)}
                                        disabled={chartWindowOffset >=
                                            chartWindowCount - 1}
                                        ><ChevronLeft size={17} /></button
                                    >
                                    <button
                                        class="icon-button"
                                        title="Show newer 12 months"
                                        aria-label="Show newer 12 months"
                                        onclick={() => shiftChartWindow(-1)}
                                        disabled={chartWindowOffset === 0}
                                        ><ChevronRight size={17} /></button
                                    >
                                </span>
                            </div>
                        </div>
                        <div
                            class="necessity-chart"
                            role="img"
                            aria-label="Monthly necessity and convenience spending chart"
                        >
                            {#each visibleNecessityPeriods as period}
                                <button
                                    class:chart-bar-selected={period.key ===
                                        overallMonthKey}
                                    class="necessity-bar"
                                    aria-label={`${period.label}: ${money(period.necessity)} necessity, ${money(period.convenience)} convenience`}
                                    aria-pressed={period.key ===
                                        overallMonthKey}
                                    onclick={() =>
                                        (overallMonthKey = period.key)}
                                >
                                    <span class="necessity-value"
                                        >{compactMoney(period.spending)}</span
                                    >
                                    <span
                                        class="necessity-track"
                                        style={`height:${Math.max(4, (period.spending / maxNecessitySpending) * 100)}%`}
                                        ><span
                                            class="necessity-segment necessity"
                                            style={`height:${period.spending ? (period.necessity / period.spending) * 100 : 0}%`}
                                        ></span><span
                                            class="necessity-segment convenience"
                                            style={`height:${period.spending ? (period.convenience / period.spending) * 100 : 0}%`}
                                        ></span><span
                                            class="necessity-segment unclassified"
                                            style={`height:${period.spending ? (period.unclassified / period.spending) * 100 : 0}%`}
                                        ></span></span
                                    >
                                    <span class="chart-label"
                                        ><span
                                            >{chartMonthLabel(period.key)}</span
                                        ><span class="chart-year"
                                            >{chartYearLabel(period.key)}</span
                                        ></span
                                    >
                                </button>
                            {:else}
                                <p class="hint">
                                    No monthly category data available.
                                </p>
                            {/each}
                        </div>
                    </div>
                    <div class="grid gap-5 p-5 lg:grid-cols-[0.8fr_1.2fr]">
                        <div>
                            <div class="mb-4 flex items-center justify-between">
                                <div>
                                    <p class="label">Selected month</p>
                                    <p
                                        class="mt-1 text-lg font-semibold text-slate-950"
                                    >
                                        {overallPeriod?.label ?? '—'}
                                    </p>
                                </div>
                                <div class="text-right">
                                    <p class="label">Total spent</p>
                                    <p
                                        class="mt-1 text-lg font-semibold text-slate-950"
                                    >
                                        {money(overallPeriod?.spending)}
                                    </p>
                                </div>
                            </div>
                            <div
                                class="selected-breakdown"
                                aria-label="Selected month spending split"
                            >
                                <span
                                    class="selected-breakdown-segment necessity"
                                    style={`width:${percentage(necessityPeriod?.necessity ?? 0, overallPeriod?.spending ?? 0)}%`}
                                ></span>
                                <span
                                    class="selected-breakdown-segment convenience"
                                    style={`width:${percentage(necessityPeriod?.convenience ?? 0, overallPeriod?.spending ?? 0)}%`}
                                ></span>
                                <span
                                    class="selected-breakdown-segment unclassified"
                                    style={`width:${percentage(necessityPeriod?.unclassified ?? 0, overallPeriod?.spending ?? 0)}%`}
                                ></span>
                            </div>
                            <div
                                class="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-1"
                            >
                                <button
                                    class="breakdown-stat"
                                    aria-expanded={selectedNecessityBreakdown ===
                                        'necessity'}
                                    onclick={() =>
                                        (selectedNecessityBreakdown =
                                            selectedNecessityBreakdown ===
                                            'necessity'
                                                ? null
                                                : 'necessity')}
                                    ><span
                                        ><span class="dot emerald"
                                        ></span>Necessity</span
                                    ><strong
                                        >{money(necessityPeriod?.necessity)}
                                        <small
                                            >{percentage(
                                                necessityPeriod?.necessity ?? 0,
                                                overallPeriod?.spending ?? 0
                                            )}%</small
                                        >
                                        <ChevronDown
                                            size={14}
                                            class={selectedNecessityBreakdown ===
                                            'necessity'
                                                ? 'rotate-180'
                                                : ''}
                                        /></strong
                                    ></button
                                >
                                <button
                                    class="breakdown-stat"
                                    aria-expanded={selectedNecessityBreakdown ===
                                        'convenience'}
                                    onclick={() =>
                                        (selectedNecessityBreakdown =
                                            selectedNecessityBreakdown ===
                                            'convenience'
                                                ? null
                                                : 'convenience')}
                                    ><span
                                        ><span class="dot violet"
                                        ></span>Convenience</span
                                    ><strong
                                        >{money(necessityPeriod?.convenience)}
                                        <small
                                            >{percentage(
                                                necessityPeriod?.convenience ??
                                                    0,
                                                overallPeriod?.spending ?? 0
                                            )}%</small
                                        >
                                        <ChevronDown
                                            size={14}
                                            class={selectedNecessityBreakdown ===
                                            'convenience'
                                                ? 'rotate-180'
                                                : ''}
                                        /></strong
                                    ></button
                                >
                                {#if (necessityPeriod?.unclassified ?? 0) > 0}<div
                                        class="breakdown-stat"
                                    >
                                        <span
                                            ><span class="dot unclassified-dot"
                                            ></span>Unclassified</span
                                        ><strong
                                            >{money(
                                                necessityPeriod?.unclassified
                                            )}
                                            <small
                                                >{percentage(
                                                    necessityPeriod?.unclassified ??
                                                        0,
                                                    overallPeriod?.spending ?? 0
                                                )}%</small
                                            ></strong
                                        >
                                    </div>{/if}
                            </div>
                            {#if selectedNecessityBreakdown}
                                <div
                                    class="mt-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-3"
                                >
                                    <div
                                        class="mb-2 flex items-center justify-between gap-2"
                                    >
                                        <p class="label">
                                            Top {selectedNecessityBreakdown} categories
                                        </p>
                                        <button
                                            class="text-xs font-semibold text-primary hover:underline"
                                            onclick={() =>
                                                openStatementsForCategory(
                                                    selectedNecessityBreakdown ??
                                                        ''
                                                )}>Open statements</button
                                        >
                                    </div>
                                    {#each selectedBreakdownCategories as item}<button
                                            class="dashboard-detail-row"
                                            onclick={() =>
                                                openSpendingCategory(
                                                    item.category
                                                )}
                                            ><span class="min-w-0 truncate"
                                                ><span
                                                    class="font-medium text-slate-700"
                                                    >{item.category}</span
                                                ><span
                                                    class="ml-2 text-xs text-slate-400"
                                                    >{item.transactionCount} transactions</span
                                                ></span
                                            ><span
                                                class="flex items-center gap-1 font-semibold text-slate-950"
                                                >{money(
                                                    item.totalAmount
                                                )}<ArrowUpRight
                                                    size={14}
                                                /></span
                                            ></button
                                        >{:else}<p
                                            class="text-xs text-slate-500"
                                        >
                                            No category detail is available for
                                            this split.
                                        </p>{/each}
                                </div>
                            {/if}
                            <div
                                class="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-1"
                            >
                                <div class="trend-stat">
                                    <span>Monthly average</span><strong
                                        >{money(comparisonAverage)}</strong
                                    >
                                </div>
                                <div class="trend-stat">
                                    <span
                                        >{comparisonCategory || 'Category'} vs last
                                        month</span
                                    ><strong
                                        >{delta(
                                            overallComparison?.previous == null
                                                ? null
                                                : (overallComparison?.amount ??
                                                      0) -
                                                      overallComparison.previous
                                        )}</strong
                                    >
                                </div>
                                <div class="trend-stat">
                                    <span
                                        >{comparisonCategory || 'Category'} vs usual</span
                                    ><strong
                                        >{delta(
                                            overallComparison?.usual == null
                                                ? null
                                                : (overallComparison?.amount ??
                                                      0) -
                                                      overallComparison.usual
                                        )}</strong
                                    >
                                </div>
                            </div>
                        </div>
                        <div>
                            <div class="mb-4 flex items-center justify-between">
                                <div>
                                    <p class="label">Category mix</p>
                                    <p class="hint">
                                        Top five in {overallPeriod?.label ??
                                            'the selected month'}
                                    </p>
                                </div>
                                <span
                                    class="text-xs font-semibold text-slate-400"
                                    >{money(overallPeriod?.spending)} total</span
                                >
                            </div>
                            <div class="space-y-3">
                                {#each overallPeriod?.categories.slice(0, 5) ?? [] as item}
                                    <div>
                                        <div
                                            class="mb-1 flex items-center justify-between text-xs"
                                        >
                                            <span
                                                class="font-semibold text-slate-700"
                                                >{item.category}</span
                                            ><span
                                                class="font-semibold text-slate-950"
                                                >{money(item.totalAmount)}</span
                                            >
                                        </div>
                                        <div class="progress">
                                            <span
                                                style={`width:${Math.max(5, item.shareOfSpending * 100)}%`}
                                            ></span>
                                        </div>
                                    </div>
                                {:else}
                                    <p class="hint">
                                        No category mix available.
                                    </p>
                                {/each}
                            </div>
                        </div>
                    </div>
                </Card>
            </section>
        {:else if page === 'spending'}
            <section class="space-y-5 animate-float-in">
                <Card
                    className="flex flex-col gap-4 border-indigo-100 bg-indigo-50/60 p-4 sm:flex-row sm:items-center sm:justify-between"
                    ><div>
                        <p class="label text-indigo-500">Analyze timeframe</p>
                    </div>
                    <div class="flex flex-wrap items-center gap-2">
                        <div class="inline-flex rounded-xl bg-white/70 p-1">
                            {#each [['month', 'Month'], ['year', 'Year'], ['range', 'Custom'], ['all', 'All time']] as option}<button
                                    class:active-mode={mode === option[0]}
                                    class="rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 transition hover:text-slate-950"
                                    onclick={() =>
                                        setMode(option[0] as ViewMode)}
                                    >{option[1]}</button
                                >{/each}
                        </div>
                        {#if mode === 'month'}<select
                                aria-label="Select month"
                                bind:value={monthKey}
                                onchange={chooseMonth}
                                class="field min-w-44 cursor-pointer text-left"
                                ><option value="" disabled>Select month</option
                                >{#each dashboard?.availablePeriods.months ?? [] as availableMonth}<option
                                        value={availableMonth}
                                        >{monthLabel(availableMonth)}</option
                                    >{/each}</select
                            >{:else if mode === 'year'}<div class="relative">
                                <button class="field min-w-28 text-left"
                                    >{year}</button
                                ><select
                                    aria-label="Select year"
                                    bind:value={year}
                                    onchange={chooseYear}
                                    class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                    >{#each dashboard?.availablePeriods.years ?? [year] as availableYear}<option
                                            value={availableYear}
                                            >{availableYear}</option
                                        >{/each}</select
                                >
                            </div>{:else if mode === 'range'}<div
                                class="flex flex-wrap items-center gap-2"
                            >
                                <input
                                    type="date"
                                    bind:value={fromDate}
                                    onchange={chooseRange}
                                    class="field"
                                    aria-label="Range start"
                                /><span
                                    class="text-xs font-semibold text-slate-400"
                                    >to</span
                                ><input
                                    type="date"
                                    bind:value={toDate}
                                    onchange={chooseRange}
                                    class="field"
                                    aria-label="Range end"
                                />
                            </div>{/if}
                    </div></Card
                >
                <Card
                    className="flex flex-wrap items-center justify-between gap-3 p-4"
                >
                    <div>
                        <p class="font-semibold text-slate-900">
                            Compare periods
                        </p>
                        <p class="hint">
                            Compare this period with another period of the same
                            type.
                        </p>
                    </div>
                    <button
                        class:active-mode={comparePeriods}
                        class="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        aria-pressed={comparePeriods}
                        disabled={mode === 'all'}
                        onclick={toggleComparison}
                        >{comparePeriods ? 'Comparison on' : 'Compare'}</button
                    >
                    {#if comparePeriods}
                        <div
                            class="flex w-full flex-wrap items-center gap-2 border-t border-slate-100 pt-3"
                        >
                            <span class="text-sm text-slate-600"
                                >Selected period vs</span
                            >
                            {#if mode === 'month'}
                                <select
                                    aria-label="Comparison month"
                                    class="field"
                                    bind:value={comparisonMonthKey}
                                    onchange={() => refreshComparison()}
                                >
                                    {#if (dashboard?.availablePeriods.months ?? []).filter((item) => item !== monthKey).length === 0}<option
                                            value={comparisonMonthKey}
                                            disabled
                                            >No other month available</option
                                        >{/if}
                                    {#each dashboard?.availablePeriods.months ?? [] as availableMonth}
                                        {#if availableMonth !== monthKey}<option
                                                value={availableMonth}
                                                >{monthLabel(
                                                    availableMonth
                                                )}</option
                                            >{/if}
                                    {/each}
                                </select>
                            {:else if mode === 'year'}
                                <select
                                    aria-label="Comparison year"
                                    class="field"
                                    bind:value={comparisonYear}
                                    onchange={() => refreshComparison()}
                                >
                                    {#if (dashboard?.availablePeriods.years ?? []).filter((item) => item !== year).length === 0}<option
                                            value={comparisonYear}
                                            disabled
                                            >No other year available</option
                                        >{/if}
                                    {#each dashboard?.availablePeriods.years ?? [] as availableYear}
                                        {#if availableYear !== year}<option
                                                value={availableYear}
                                                >{availableYear}</option
                                            >{/if}
                                    {/each}
                                </select>
                            {:else if mode === 'range'}
                                <input
                                    type="date"
                                    aria-label="Comparison range start"
                                    class="field"
                                    bind:value={comparisonFromDate}
                                    onchange={() => refreshComparison()}
                                />
                                <span class="text-xs text-slate-500">to</span>
                                <input
                                    type="date"
                                    aria-label="Comparison range end"
                                    class="field"
                                    bind:value={comparisonToDate}
                                    onchange={() => refreshComparison()}
                                />
                            {/if}
                        </div>
                    {/if}
                </Card>
                {#if comparePeriods}
                    <Card className="overflow-hidden p-0">
                        <div
                            class="grid gap-3 border-b border-slate-100 p-5 md:grid-cols-3"
                        >
                            {#each comparisonMetrics as metric}
                                <div class="rounded-xl bg-slate-50 p-4">
                                    <p class="label">{metric.label}</p>
                                    <p
                                        class="mt-2 text-lg font-semibold text-slate-900"
                                    >
                                        {money(metric.current)}
                                        <span
                                            class="text-sm font-normal text-slate-400"
                                            >vs</span
                                        >
                                        {money(metric.compared)}
                                    </p>
                                    <p class="hint">
                                        Change: {metric.current != null &&
                                        metric.compared != null
                                            ? `${money(metric.current - metric.compared)} (${comparisonPercent(metric.current, metric.compared)})`
                                            : comparisonLoading
                                              ? 'Loading…'
                                              : '—'}
                                    </p>
                                </div>
                            {/each}
                            <p class="text-xs text-slate-500 md:col-span-3">
                                Selected: {scopeLabel} · Compared: {comparisonDashboard
                                    ? scopeLabelFor(comparisonDashboard.scope)
                                    : '—'}{mode === 'range'
                                    ? ' · Range totals are not adjusted for duration.'
                                    : ''}
                            </p>
                        </div>
                        {#if comparisonUnavailable}<p
                                class="p-5 text-sm text-slate-500"
                            >
                                Choose a different period to compare. This
                                ledger may not contain another period of this
                                type yet.
                            </p>
                        {:else if comparisonError}<p
                                class="p-5 text-sm text-rose-700"
                            >
                                {comparisonError}
                            </p>
                        {:else if comparisonLoading}<p
                                class="p-5 text-sm text-slate-500"
                            >
                                Loading comparison…
                            </p>
                        {:else if comparisonDashboard}
                            <div class="overflow-x-auto">
                                <table
                                    class="w-full min-w-[600px] text-left text-sm"
                                >
                                    <thead
                                        class="bg-slate-50 text-xs uppercase tracking-wider text-slate-400"
                                        ><tr
                                            ><th class="px-5 py-3">Category</th
                                            ><th class="px-5 py-3">Selected</th
                                            ><th class="px-5 py-3">Compared</th
                                            ><th class="px-5 py-3">Change</th
                                            ></tr
                                        ></thead
                                    ><tbody class="divide-y divide-slate-100"
                                        >{#each comparedCategories as item}<tr
                                                ><td
                                                    class="px-5 py-3 font-medium"
                                                    >{item.category}</td
                                                ><td class="px-5 py-3"
                                                    >{money(item.current)}</td
                                                ><td class="px-5 py-3"
                                                    >{money(item.compared)}</td
                                                ><td class="px-5 py-3"
                                                    >{money(item.difference)} · {comparisonPercent(
                                                        item.current,
                                                        item.compared
                                                    )}</td
                                                ></tr
                                            >{:else}<tr
                                                ><td
                                                    colspan="4"
                                                    class="px-5 py-6 text-center text-slate-500"
                                                    >No category spending in
                                                    these periods.</td
                                                ></tr
                                            >{/each}</tbody
                                    >
                                </table>
                            </div>
                        {/if}
                    </Card>
                {/if}
                <Card
                    className="flex flex-col gap-3 border-indigo-100 bg-indigo-50/60 p-4 sm:flex-row sm:items-center sm:justify-between"
                    ><div>
                        <p class="label text-indigo-500">Current scope</p>
                        <p class="mt-1 text-lg font-semibold text-slate-950">
                            {scopeLabel}
                        </p>
                    </div>
                    <div
                        class="flex flex-wrap gap-2 text-xs font-semibold text-slate-600"
                    >
                        <span class="rounded-full bg-white/80 px-3 py-1.5"
                            >{spendingRows.length} categories</span
                        ><span class="rounded-full bg-white/80 px-3 py-1.5"
                            >{scopedExpenseStatements.length} transactions</span
                        >
                    </div></Card
                >
                <div class="grid gap-4 md:grid-cols-4">
                    <Card className="p-5"
                        ><p class="label">Actual spending</p>
                        <p class="metric">
                            {money(dashboard?.metrics.spending)}
                        </p>
                        <p class="hint">In the selected scope.</p></Card
                    >
                    <Card className="p-5"
                        ><p class="label">Usual spending</p>
                        <p class="metric">{money(usualPeriodSpending)}</p>
                        <p class="hint">Median of comparable periods.</p></Card
                    >
                    <Card className="p-5"
                        ><p class="label">Difference</p>
                        <p
                            class={spendingDelta != null && spendingDelta > 0
                                ? 'metric text-amber-700'
                                : 'metric text-emerald-700'}
                        >
                            {delta(spendingDelta)}
                        </p>
                        <p class="hint">Compared with usual.</p></Card
                    >
                    <Card className="p-5"
                        ><p class="label">Expected recurring</p>
                        <p class="metric">
                            {mode === 'all'
                                ? '—'
                                : money(expectedRecurringTotal)}
                        </p>
                        <p class="hint">
                            Known recurring expenses in this scope.
                        </p></Card
                    >
                </div>
                <Card className="border-indigo-100 bg-indigo-50/40 p-5"
                    ><div
                        class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
                    >
                        <div>
                            <p class="label text-indigo-500">
                                Remaining outlook
                            </p>
                            <h3
                                class="mt-1 text-xl font-semibold text-slate-950"
                            >
                                What is still likely in {scopeLabel.toLocaleLowerCase()}?
                            </h3>
                        </div>
                        <Badge
                            >{mode === 'all'
                                ? 'Select a timeframe'
                                : `${expectedFixedExpenses.length + expectedFixedIncome.length} fixed movements`}</Badge
                        >
                    </div>
                    {#if mode === 'all'}<p
                            class="mt-4 rounded-xl bg-white/70 p-4 text-sm text-slate-600"
                        >
                            Choose a month, year, or custom range to see the
                            remaining expected amounts.
                        </p>{:else}<div class="mt-5 grid gap-4 lg:grid-cols-2">
                            <div class="rounded-2xl bg-white/80 p-4">
                                <div
                                    class="flex items-center justify-between gap-3"
                                >
                                    <div>
                                        <p class="label">Fixed / recurring</p>
                                        <p
                                            class="mt-1 text-2xl font-semibold text-slate-950"
                                        >
                                            {money(
                                                expectedFixedExpenses.reduce(
                                                    (total, item) =>
                                                        total +
                                                        item.series.amountModel
                                                            .typicalAmount,
                                                    0
                                                )
                                            )}
                                        </p>
                                        <p class="hint">
                                            Expected payments still ahead
                                        </p>
                                    </div>
                                    <div class="text-right">
                                        <p class="label text-emerald-600">
                                            Income
                                        </p>
                                        <p
                                            class="mt-1 font-semibold text-emerald-700"
                                        >
                                            +{money(
                                                expectedFixedIncome.reduce(
                                                    (total, item) =>
                                                        total +
                                                        item.series.amountModel
                                                            .typicalAmount,
                                                    0
                                                )
                                            )}
                                        </p>
                                    </div>
                                </div>
                                {#if expectedFixedExpenses.length || expectedFixedIncome.length}<div
                                        class="mt-4 space-y-2"
                                    >
                                        {#each [...expectedFixedExpenses, ...expectedFixedIncome].slice(0, 5) as item}<div
                                                class="flex items-center justify-between gap-3 text-sm"
                                            >
                                                <span
                                                    class="min-w-0 truncate font-medium text-slate-700"
                                                    >{item.series.label}</span
                                                ><span
                                                    class={item.series
                                                        .direction === 'income'
                                                        ? 'shrink-0 font-semibold text-emerald-700'
                                                        : 'shrink-0 font-semibold text-slate-900'}
                                                    >{item.series.direction ===
                                                    'income'
                                                        ? '+'
                                                        : '−'}{money(
                                                        item.series.amountModel
                                                            .typicalAmount
                                                    )} · {dateLabel(
                                                        item.date
                                                            .toISOString()
                                                            .slice(0, 10)
                                                    )}</span
                                                >
                                            </div>{/each}
                                    </div>{:else}<p
                                        class="mt-4 text-sm text-slate-500"
                                    >
                                        No confirmed recurring movements remain
                                        in this timeframe.
                                    </p>{/if}
                            </div>
                            <div class="rounded-2xl bg-white/80 p-4">
                                <p class="label">Flexible estimate</p>
                                <p
                                    class="mt-1 text-2xl font-semibold text-slate-950"
                                >
                                    {money(estimatedFlexibleSpending)}
                                </p>
                                <p class="hint">
                                    Variable spending based on your average
                                    monthly habits over the last 3 months.
                                </p>
                            </div>
                        </div>{/if}</Card
                >
                <Card className="overflow-hidden p-0">
                    <div class="border-b border-slate-100 p-5">
                        <div class="flex items-start justify-between gap-4">
                            <div>
                                <p class="label">Category comparison</p>
                                <h3
                                    class="mt-1 text-xl font-semibold text-slate-950"
                                >
                                    What changed in this period?
                                </h3>
                                <p class="hint">
                                    Select a category to inspect its merchants
                                    below.
                                </p>
                            </div>
                            <Badge>{scopeLabel}</Badge>
                        </div>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full min-w-[820px] text-left text-sm">
                            <thead
                                class="bg-slate-50/80 text-xs uppercase tracking-wider text-slate-400"
                                ><tr
                                    ><th class="px-5 py-3 font-bold"
                                        >Category</th
                                    ><th class="px-5 py-3 font-bold">Actual</th
                                    ><th class="px-5 py-3 font-bold">Usual</th
                                    ><th class="px-5 py-3 font-bold"
                                        >Recurring expected</th
                                    ><th class="px-5 py-3 font-bold"
                                        >Difference</th
                                    ><th class="px-5 py-3 font-bold">Share</th
                                    ><th class="px-5 py-3 font-bold"
                                        >Transactions</th
                                    ></tr
                                ></thead
                            ><tbody class="divide-y divide-slate-100"
                                >{#each spendingRows as item}<tr
                                        class:bg-indigo-50={selectedSpendingCategory ===
                                            item.category}
                                        class="cursor-pointer hover:bg-slate-50"
                                        onclick={() =>
                                            (selectedSpendingCategory =
                                                item.category)}
                                        ><td class="px-5 py-4"
                                            ><button
                                                class="text-left font-semibold text-slate-800 hover:text-primary"
                                                >{item.category}</button
                                            >
                                            <p
                                                class="mt-1 text-xs text-slate-400"
                                            >
                                                {item.control === 'committed'
                                                    ? 'Committed'
                                                    : item.control ===
                                                        'influenceable'
                                                      ? 'Influenceable'
                                                      : 'Unclassified'} · {item.necessity ===
                                                'necessity'
                                                    ? 'Necessary'
                                                    : item.necessity ===
                                                        'convenience'
                                                      ? 'Convenience'
                                                      : 'Unclassified'}
                                            </p></td
                                        ><td
                                            class="px-5 py-4 font-semibold text-slate-950"
                                            >{money(item.totalAmount)}</td
                                        ><td class="px-5 py-4 text-slate-600"
                                            >{money(item.usual)}</td
                                        ><td class="px-5 py-4 text-slate-600"
                                            >{mode === 'all'
                                                ? '—'
                                                : money(
                                                      item.recurringExpected
                                                  )}</td
                                        ><td
                                            class={item.difference != null &&
                                            item.difference > 0
                                                ? 'px-5 py-4 font-semibold text-amber-700'
                                                : 'px-5 py-4 font-semibold text-emerald-700'}
                                            >{delta(item.difference)}</td
                                        ><td class="px-5 py-4 text-slate-600"
                                            >{Math.round(
                                                item.shareOfSpending * 100
                                            )}%</td
                                        ><td class="px-5 py-4 text-slate-600"
                                            >{item.transactionCount}</td
                                        ></tr
                                    >{:else}<tr
                                        ><td
                                            colspan="7"
                                            class="px-5 py-10 text-center text-sm text-slate-500"
                                            >No spending categories found for
                                            this scope.</td
                                        ></tr
                                    >{/each}</tbody
                            >
                        </table>
                    </div>
                </Card>
                <Card className="overflow-hidden p-0">
                    <div class="border-b border-slate-100 p-5">
                        <div class="flex items-start justify-between gap-4">
                            <div>
                                <p class="label">Merchant detail</p>
                                <h3
                                    class="mt-1 text-xl font-semibold text-slate-950"
                                >
                                    {selectedSpendingCategory ||
                                        'Choose a category'}
                                </h3>
                                <p class="hint">
                                    The largest merchants behind this category
                                    in {scopeLabel}.
                                </p>
                            </div>
                            {#if selectedSpendingCategory}<div
                                    class="flex items-center gap-2"
                                >
                                    <Badge
                                        >{money(
                                            spendingRows.find(
                                                (item) =>
                                                    item.category ===
                                                    selectedSpendingCategory
                                            )?.totalAmount
                                        )} total</Badge
                                    ><button
                                        class="icon-button"
                                        title="Open matching statements"
                                        aria-label="Open matching statements"
                                        onclick={() =>
                                            openStatementsForCategory(
                                                selectedSpendingCategory
                                            )}
                                        ><ArrowUpRight size={17} /></button
                                    >
                                </div>{/if}
                        </div>
                    </div>
                    <div class="divide-y divide-slate-100">
                        {#each selectedMerchantRows as merchant}<button
                                class="merchant-detail-row"
                                onclick={() =>
                                    openStatementsForMerchant(
                                        merchant.merchant
                                    )}
                                ><div
                                    class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600"
                                >
                                    <ArrowDownUp size={16} />
                                </div>
                                <div class="min-w-0 flex-1 text-left">
                                    <p
                                        class="truncate font-semibold text-slate-800"
                                    >
                                        {merchant.merchant}
                                    </p>
                                    <p class="mt-1 text-xs text-slate-500">
                                        {merchant.count} transaction{merchant.count ===
                                        1
                                            ? ''
                                            : 's'}
                                    </p>
                                </div>
                                <p class="font-semibold text-slate-950">
                                    {money(merchant.total)}
                                </p>
                                <ArrowUpRight
                                    size={15}
                                    class="shrink-0 text-slate-300"
                                /></button
                            >{:else}<p
                                class="p-8 text-center text-sm text-slate-500"
                            >
                                No merchant details available for this category.
                            </p>{/each}
                    </div>
                </Card>
            </section>
        {:else if page === 'recurring'}
            <section class="space-y-5 animate-float-in">
                <div class="grid gap-4 md:grid-cols-3">
                    <Card className="p-5"
                        ><p class="label">Recurring expenses / month</p>
                        <p class="metric">{money(monthlyRecurringExpenses)}</p>
                        <p class="hint">
                            Yearly payments converted to a monthly run-rate.
                        </p></Card
                    >
                    <Card className="p-5"
                        ><p class="label">Recurring expenses / year</p>
                        <p class="metric">{money(annualRecurringExpenses)}</p>
                        <p class="hint">
                            Useful for seeing the real cost of small
                            subscriptions.
                        </p></Card
                    >
                    <Card className="p-5"
                        ><p class="label">Recurring income</p>
                        <p class="metric text-emerald-700">
                            {money(
                                recurringIncome.reduce(
                                    (total, series) =>
                                        total +
                                        series.amountModel.typicalAmount *
                                            (12 / series.intervalMonths),
                                    0
                                )
                            )}
                        </p>
                        <p class="hint">
                            Annualized from detected repeating income.
                        </p></Card
                    >
                </div>
                {#if manualRecurringStatements.length}<Card
                        className="overflow-hidden border-indigo-100 bg-indigo-50/40 p-0"
                        ><div class="border-b border-indigo-100 p-5">
                            <p class="label text-indigo-500">
                                Manual assignments
                            </p>
                            <h3
                                class="mt-1 text-xl font-semibold text-slate-950"
                            >
                                Statements you marked as recurring
                            </h3>
                        </div>
                        <div class="divide-y divide-indigo-100">
                            {#each manualRecurringStatements as item}<div
                                    class="flex items-center gap-3 px-5 py-3.5"
                                >
                                    <div class="min-w-0 flex-1">
                                        <p
                                            class="truncate font-semibold text-slate-800"
                                        >
                                            {item.recipient ||
                                                item.sender ||
                                                item.text ||
                                                'Untitled statement'}
                                        </p>
                                        <p class="mt-1 text-xs text-slate-500">
                                            {item.date
                                                ? dateLabel(
                                                      item.date.slice(0, 10)
                                                  )
                                                : 'No date'} · {money(
                                                item.amount
                                            )}
                                        </p>
                                    </div>
                                    <Badge
                                        tone={item.recurringDirection ===
                                        'income'
                                            ? 'success'
                                            : 'warning'}
                                        >Recurring {item.recurringDirection ===
                                        'income'
                                            ? 'income'
                                            : 'payment'}</Badge
                                    ><button
                                        class="icon-button danger-hover"
                                        title="Remove recurring assignment"
                                        aria-label="Remove recurring assignment"
                                        onclick={() =>
                                            toggleManualRecurring(item)}
                                        disabled={saving}
                                        ><X size={15} /></button
                                    >
                                </div>{/each}
                        </div></Card
                    >{/if}
                <Card className="overflow-hidden p-0">
                    <div class="border-b border-slate-100 p-5">
                        <div
                            class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
                        >
                            <div>
                                <p class="label">Recurring inventory</p>
                                <h3
                                    class="mt-1 text-xl font-semibold text-slate-950"
                                >
                                    Your repeating commitments and income
                                </h3>
                                <p class="hint">
                                    Select detected series to merge them, edit
                                    an alias to rescan observations, or open
                                    every statement found.
                                </p>
                            </div>
                            {#if selectedRecurringIds.length}<Button
                                    size="sm"
                                    onclick={mergeSelectedRecurring}
                                    disabled={saving ||
                                        selectedRecurringIds.length < 2}
                                    ><GitMerge size={14} />Merge {selectedRecurringIds.length}
                                    selected</Button
                                >{/if}
                        </div>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full min-w-[1040px] text-left text-sm">
                            <thead
                                class="bg-slate-50/80 text-xs uppercase tracking-wider text-slate-400"
                                ><tr
                                    ><th class="w-12 px-5 py-3 font-bold"
                                        ><span class="sr-only">Select</span></th
                                    ><th class="px-5 py-3 font-bold">Payment</th
                                    ><th class="px-5 py-3 font-bold">Cadence</th
                                    ><th class="px-5 py-3 font-bold">Typical</th
                                    ><th class="px-5 py-3 font-bold"
                                        >Observations</th
                                    ><th class="px-5 py-3 font-bold">Review</th
                                    ><th class="px-5 py-3 text-right font-bold"
                                        >Actions</th
                                    ></tr
                                ></thead
                            ><tbody class="divide-y divide-slate-100"
                                >{#each recurringRows as item}<tr
                                        class:item-denied={item.reviewStatus ===
                                            'denied'}
                                        class="hover:bg-slate-50/70"
                                        ><td class="px-5 py-4 align-top"
                                            ><input
                                                type="checkbox"
                                                checked={selectedRecurringIds.includes(
                                                    item.id
                                                )}
                                                disabled={item.members.length >
                                                    1}
                                                onchange={() =>
                                                    toggleRecurringSelection(
                                                        item
                                                    )}
                                                aria-label={`Select ${item.label} for merging`}
                                            /></td
                                        ><td class="px-5 py-4"
                                            ><p
                                                class="font-semibold text-slate-800"
                                            >
                                                {item.label}
                                            </p>
                                            <p
                                                class="mt-1 text-xs text-slate-500"
                                            >
                                                {item.counterparty} · {item.direction ===
                                                'expense'
                                                    ? 'Expense'
                                                    : 'Income'}{#if item.members.length > 1}
                                                    · {item.members.length} detected
                                                    series{/if}
                                            </p></td
                                        ><td class="px-5 py-4 text-slate-600"
                                            >{cadenceLabel(item)}</td
                                        ><td
                                            class={item.direction === 'expense'
                                                ? 'px-5 py-4 font-semibold text-slate-900'
                                                : 'px-5 py-4 font-semibold text-emerald-700'}
                                            >{recurringAmount(item)}<span
                                                class="ml-1 text-xs font-normal text-slate-400"
                                                >{item.currency}</span
                                            ></td
                                        ><td class="px-5 py-4"
                                            ><button
                                                class="observation-count"
                                                onclick={() =>
                                                    openRecurringObservations(
                                                        item
                                                    )}
                                                ><span
                                                    >{item.occurrences
                                                        .length}</span
                                                ><span
                                                    >{item.occurrences
                                                        .length === 1
                                                        ? 'statement'
                                                        : 'statements'}</span
                                                ><Eye size={14} /></button
                                            ></td
                                        ><td class="px-5 py-4"
                                            ><Badge
                                                tone={item.reviewStatus ===
                                                'confirmed'
                                                    ? 'success'
                                                    : item.reviewStatus ===
                                                        'denied'
                                                      ? 'danger'
                                                      : 'warning'}
                                                >{item.reviewStatus}</Badge
                                            >
                                            <p
                                                class="mt-1 text-xs text-slate-400"
                                            >
                                                {item.confidence}{#if item.endedAt}
                                                    · {item.endedAt <=
                                                    dateKey(startOfToday())
                                                        ? 'Ended'
                                                        : 'Ends'}
                                                    {dateLabel(
                                                        item.endedAt
                                                    )}{/if}
                                            </p></td
                                        ><td class="px-5 py-4"
                                            ><div
                                                class="flex justify-end gap-1"
                                            >
                                                <button
                                                    class="icon-button"
                                                    title="View all observations"
                                                    aria-label={`View all observations for ${item.label}`}
                                                    onclick={() =>
                                                        openRecurringObservations(
                                                            item
                                                        )}
                                                    ><Eye size={15} /></button
                                                ><button
                                                    class="icon-button"
                                                    title="Adjust recurring alias"
                                                    aria-label={`Adjust alias for ${item.label}`}
                                                    onclick={() =>
                                                        openRecurringAlias(
                                                            item
                                                        )}
                                                    ><Pencil
                                                        size={15}
                                                    /></button
                                                >{#if item.reviewStatus === 'confirmed'}<button
                                                        class="icon-button"
                                                        title={item.endedAt
                                                            ? 'Edit recurring end date'
                                                            : 'Mark recurring payment as ended'}
                                                        aria-label={item.endedAt
                                                            ? `Edit end date for ${item.label}`
                                                            : `Mark ${item.label} as ended`}
                                                        onclick={() =>
                                                            openRecurringEndDate(
                                                                item
                                                            )}
                                                        disabled={saving}
                                                        ><CalendarClock
                                                            size={15}
                                                        /></button
                                                    >{/if}
                                                >{#if item.members.length > 1}<button
                                                        class="icon-button danger-hover"
                                                        title="Split merged recurring payment"
                                                        aria-label={`Split ${item.label}`}
                                                        onclick={() =>
                                                            unmergeRecurring(
                                                                item
                                                            )}
                                                        disabled={saving}
                                                        ><GitMerge
                                                            size={15}
                                                        /></button
                                                    >{/if}{#if item.reviewStatus !== 'confirmed'}<button
                                                        class="icon-button recurring-confirm"
                                                        title="Confirm recurring series"
                                                        aria-label={`Confirm ${item.label} as recurring`}
                                                        onclick={() =>
                                                            setRecurringRowDecision(
                                                                item,
                                                                'confirmed'
                                                            )}
                                                        disabled={saving}
                                                        ><Check
                                                            size={15}
                                                        /></button
                                                    >{/if}{#if item.reviewStatus !== 'denied'}<button
                                                        class="icon-button danger-hover"
                                                        title="Deny recurring series"
                                                        aria-label={`Deny ${item.label} as recurring`}
                                                        onclick={() =>
                                                            setRecurringRowDecision(
                                                                item,
                                                                'denied'
                                                            )}
                                                        disabled={saving}
                                                        ><X size={15} /></button
                                                    >{/if}
                                            </div></td
                                        ></tr
                                    >{:else}<tr
                                        ><td
                                            colspan="7"
                                            class="px-5 py-10 text-center text-sm text-slate-500"
                                            >No recurring series found. More
                                            history makes yearly detections
                                            stronger.</td
                                        ></tr
                                    >{/each}</tbody
                            >
                        </table>
                    </div>
                </Card>
            </section>
        {:else if page === 'aliases'}
            <section class="space-y-4 animate-float-in">
                <Card className="p-3">
                    <div class="flex flex-wrap items-center gap-2">
                        <div class="relative min-w-56 flex-1">
                            <Search
                                size={15}
                                class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                            />
                            <input
                                bind:value={search}
                                class="field w-full pl-9"
                                placeholder="Search aliases"
                                aria-label="Search aliases"
                            />
                        </div>
                        <div class="flex items-center gap-1">
                            {#each [['all', 'All'], ['used', 'Used'], ['unused', 'Unused']] as filter}
                                <button
                                    class:active-filter={aliasUsageFilter ===
                                        filter[0]}
                                    class="filter-chip"
                                    onclick={() =>
                                        (aliasUsageFilter =
                                            filter[0] as AliasUsageFilter)}
                                >
                                    {filter[1]}
                                    <span
                                        >{filter[0] === 'all'
                                            ? eligibleAliases.length
                                            : filter[0] === 'used'
                                              ? eligibleAliases.filter(
                                                    (alias) =>
                                                        (rules?.aliasUsage?.[
                                                            alias.id
                                                        ] ?? 0) > 0
                                                ).length
                                              : eligibleAliases.filter(
                                                    (alias) =>
                                                        (rules?.aliasUsage?.[
                                                            alias.id
                                                        ] ?? 0) === 0
                                                ).length}</span
                                    >
                                </button>
                            {/each}
                        </div>
                        <select
                            bind:value={aliasFieldFilter}
                            class="field"
                            aria-label="Filter aliases by matched field"
                        >
                            <option value="all">All fields</option><option
                                value="any">Any statement field</option
                            ><option value="text">Description only</option
                            ><option value="transaction_type"
                                >Transaction type</option
                            ><option value="category">Source category</option>
                        </select>
                        <select
                            bind:value={aliasSort}
                            class="field"
                            aria-label="Sort aliases"
                        >
                            <option value="usage-desc">Most matches</option
                            ><option value="usage-asc">Fewest matches</option
                            ><option value="name-asc">Alias name A–Z</option
                            ><option value="name-desc">Alias name Z–A</option>
                        </select>
                        <Button onclick={openAliasCreate}
                            ><Plus size={15} />Create alias</Button
                        >
                    </div>
                    <p class="mt-2 text-xs text-slate-500">
                        {aliasResultCount} aliases · Matching is case-insensitive;
                        overlapping rules appear in Review.
                    </p>
                </Card>

                <div
                    class="grid gap-4 xl:h-[calc(100dvh-22rem)] xl:min-h-[320px] xl:grid-cols-[220px_minmax(320px,1fr)_minmax(320px,0.9fr)]"
                >
                    <Card className="min-h-0 overflow-hidden p-0">
                        <div class="border-b border-slate-100 p-4">
                            <h3 class="font-semibold text-slate-900">
                                Categories
                            </h3>
                            <div class="relative mt-3">
                                <Search
                                    size={14}
                                    class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                                />
                                <input
                                    bind:value={categoryNavSearch}
                                    class="field w-full pl-9"
                                    placeholder="Search categories"
                                    aria-label="Search categories"
                                />
                            </div>
                        </div>
                        <nav
                            class="max-h-[calc(100%-5.5rem)] space-y-1 overflow-y-auto p-2"
                            aria-label="Alias categories"
                        >
                            <div
                                class={`flex items-center rounded-lg pr-2 text-sm text-slate-700 hover:bg-slate-50 ${aliasCategoryFilter === 'all' ? 'active-mode' : ''}`}
                            >
                                <button
                                    class="flex min-w-0 flex-1 items-center justify-between px-3 py-2.5 text-left"
                                    onclick={() => selectAliasCategory('all')}
                                    aria-current={aliasCategoryFilter === 'all'
                                        ? 'true'
                                        : undefined}
                                >
                                    <span class="truncate font-medium"
                                        >All categories</span
                                    ><span class="count-pill ml-2"
                                        >{aliases.length}</span
                                    >
                                </button>
                                <button
                                    class="rounded p-1 text-slate-500 hover:bg-slate-200/60"
                                    onclick={() =>
                                        (categoriesExpanded =
                                            !categoriesExpanded)}
                                    aria-label={categoriesExpanded
                                        ? 'Collapse categories'
                                        : 'Expand categories'}
                                    aria-expanded={categoriesExpanded}
                                >
                                    {#if categoriesExpanded}<ChevronDown
                                            size={15}
                                        />{:else}<ChevronRight size={15} />{/if}
                                </button>
                            </div>
                            {#if categoriesExpanded}
                                <div
                                    class="ml-3 border-l border-slate-200 pl-2"
                                >
                                    {#each categoryNavItems as category}
                                        {@const count = aliases.filter(
                                            (alias) =>
                                                alias.categoryId === category.id
                                        ).length}
                                        <button
                                            class:active-mode={aliasCategoryFilter ===
                                                category.id}
                                            class="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                                            onclick={() =>
                                                selectAliasCategory(
                                                    category.id
                                                )}
                                        >
                                            <span class="min-w-0 truncate"
                                                >{category.name}</span
                                            ><span class="count-pill ml-2"
                                                >{count}</span
                                            >
                                        </button>
                                    {:else}
                                        <p
                                            class="px-3 py-5 text-center text-xs text-slate-500"
                                        >
                                            No categories found.
                                        </p>
                                    {/each}
                                </div>
                            {/if}
                        </nav>
                    </Card>

                    <Card className="flex min-h-0 flex-col overflow-hidden p-0">
                        <div class="border-b border-slate-100 px-4 py-4">
                            <div class="flex items-start justify-between gap-2">
                                <div class="min-w-0">
                                    <h3
                                        class="truncate text-lg font-semibold text-slate-900"
                                    >
                                        {aliasCategoryFilter === 'all'
                                            ? 'All aliases'
                                            : (categories.find(
                                                  (category) =>
                                                      category.id ===
                                                      aliasCategoryFilter
                                              )?.name ?? 'Aliases')}
                                    </h3>
                                    <p class="mt-1 text-xs text-slate-500">
                                        {aliasResultCount} matching rule{aliasResultCount ===
                                        1
                                            ? ''
                                            : 's'}
                                    </p>
                                </div>
                                {#if aliasSort === 'usage-desc'}<Badge
                                        >Most matches</Badge
                                    >{/if}
                            </div>
                        </div>
                        <div
                            class="min-h-0 flex-1 space-y-1 overflow-y-auto p-2"
                        >
                            {#each sortedFilteredAliases as alias}
                                {@const usage =
                                    rules?.aliasUsage?.[alias.id] ?? 0}
                                {@const category = categories.find(
                                    (item) => item.id === alias.categoryId
                                )}
                                <button
                                    class={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${selectedAlias?.id === alias.id ? 'border-indigo-200 bg-indigo-50/70' : 'border-transparent hover:border-slate-100 hover:bg-slate-50'}`}
                                    onclick={() => {
                                        selectedAliasId = alias.id
                                        editingAliasId = ''
                                    }}
                                >
                                    <span class="min-w-0 flex-1"
                                        ><span
                                            class="block truncate font-semibold text-slate-800"
                                            >{alias.value}</span
                                        ><span
                                            class="mt-1 block truncate text-xs text-slate-500"
                                            >{aliasCategoryFilter === 'all'
                                                ? (category?.name ??
                                                  'Uncategorized')
                                                : alias.field === 'text'
                                                  ? 'Description'
                                                  : alias.field ===
                                                      'transaction_type'
                                                    ? 'Transaction type'
                                                    : alias.field === 'category'
                                                      ? 'Source category'
                                                      : 'Any field'}</span
                                        ></span
                                    >
                                    <span
                                        class="shrink-0 text-xs font-semibold text-slate-500"
                                        >{usage} matches</span
                                    >
                                </button>
                            {:else}
                                <div class="p-8 text-center">
                                    <Search
                                        size={20}
                                        class="mx-auto text-slate-300"
                                    />
                                    <p
                                        class="mt-2 text-sm font-semibold text-slate-700"
                                    >
                                        No aliases found
                                    </p>
                                    <p class="mt-1 text-xs text-slate-500">
                                        Try another search or filter.
                                    </p>
                                </div>
                            {/each}
                        </div>
                    </Card>

                    <Card className="flex min-h-0 flex-col overflow-hidden p-0">
                        {#if selectedAlias}
                            {@const selectedCategory = categories.find(
                                (item) => item.id === selectedAlias.categoryId
                            )}
                            <div
                                class="shrink-0 border-b border-slate-100 px-4 py-4"
                            >
                                <div class="min-w-0">
                                    <p class="label">Alias details</p>
                                    <h3
                                        class="mt-1 truncate text-xl font-bold tracking-tight text-slate-950"
                                    >
                                        {selectedAlias.value}
                                    </h3>
                                </div>
                            </div>
                            {#if editingAliasId === selectedAlias.id}
                                <div
                                    class="min-h-0 flex-1 space-y-3 overflow-y-auto p-4"
                                >
                                    <label
                                        class="block text-sm font-medium text-slate-700"
                                        >Match phrase<input
                                            bind:value={selectedAlias.value}
                                            class="field mt-1 w-full"
                                        /></label
                                    >
                                    <label
                                        class="block text-sm font-medium text-slate-700"
                                        >Category<select
                                            bind:value={
                                                selectedAlias.categoryId
                                            }
                                            class="field mt-1 w-full"
                                            >{#each categories as category}<option
                                                    value={category.id}
                                                    >{category.name}</option
                                                >{/each}</select
                                        ></label
                                    >
                                    <label
                                        class="block text-sm font-medium text-slate-700"
                                        >Match field<select
                                            bind:value={selectedAlias.field}
                                            class="field mt-1 w-full"
                                            ><option value="any"
                                                >Any statement field</option
                                            ><option value="text"
                                                >Description only</option
                                            ><option value="transaction_type"
                                                >Transaction type</option
                                            ><option value="category"
                                                >Source category</option
                                            ></select
                                        ></label
                                    >
                                    <label
                                        class="block text-sm font-medium text-slate-700"
                                        >Transaction type filter<input
                                            bind:value={
                                                selectedAlias.transactionType
                                            }
                                            class="field mt-1 w-full"
                                            placeholder="Optional"
                                        /></label
                                    >
                                    <Button
                                        class="w-full justify-center"
                                        onclick={() =>
                                            updateAlias(selectedAlias)}
                                        disabled={saving ||
                                            !selectedAlias.value.trim()}
                                        ><Check size={14} />Save changes</Button
                                    >
                                </div>
                                <div
                                    class="flex shrink-0 justify-end border-t border-slate-100 p-3"
                                >
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onclick={() => (editingAliasId = '')}
                                        >Cancel</Button
                                    >
                                </div>
                            {:else}
                                <div class="min-h-0 flex-1 overflow-y-auto">
                                    <dl
                                        class="divide-y divide-slate-100 px-4 text-sm"
                                    >
                                        <div
                                            class="grid grid-cols-[minmax(90px,0.7fr)_minmax(0,1fr)] items-center gap-3 py-3"
                                        >
                                            <dt class="text-slate-500">
                                                Match phrase
                                            </dt>
                                            <dd
                                                class="flex min-w-0 items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 font-semibold text-slate-800"
                                            >
                                                <span class="truncate"
                                                    >{selectedAlias.value}</span
                                                ><button
                                                    class="icon-button h-8 w-8 shrink-0"
                                                    title="Copy match phrase"
                                                    aria-label="Copy match phrase"
                                                    onclick={() =>
                                                        copyAliasValue(
                                                            selectedAlias
                                                        )}
                                                    >{#if copiedAliasId === selectedAlias.id}<Check
                                                            size={15}
                                                        />{:else}<Copy
                                                            size={15}
                                                        />{/if}</button
                                                >
                                            </dd>
                                        </div>
                                        <div
                                            class="grid grid-cols-[minmax(90px,0.7fr)_minmax(0,1fr)] items-center gap-3 py-3"
                                        >
                                            <dt class="text-slate-500">
                                                Category
                                            </dt>
                                            <dd
                                                class="min-w-0 truncate rounded-lg bg-slate-50 px-3 py-2 font-semibold text-slate-800"
                                            >
                                                {selectedCategory?.name ??
                                                    'Uncategorized'}
                                            </dd>
                                        </div>
                                        <div
                                            class="grid grid-cols-[minmax(90px,0.7fr)_minmax(0,1fr)] items-center gap-3 py-3"
                                        >
                                            <dt class="text-slate-500">
                                                Match
                                            </dt>
                                            <dd
                                                class="min-w-0 truncate rounded-lg bg-slate-50 px-3 py-2 font-semibold text-slate-800"
                                            >
                                                {selectedAlias.field === 'text'
                                                    ? 'Description only'
                                                    : selectedAlias.field ===
                                                        'transaction_type'
                                                      ? 'Transaction type'
                                                      : selectedAlias.field ===
                                                          'category'
                                                        ? 'Source category'
                                                        : 'Any statement field'}
                                            </dd>
                                        </div>
                                        {#if selectedAlias.transactionType}<div
                                                class="grid grid-cols-[minmax(90px,0.7fr)_minmax(0,1fr)] items-center gap-3 py-3"
                                            >
                                                <dt class="text-slate-500">
                                                    Transaction type
                                                </dt>
                                                <dd
                                                    class="min-w-0 truncate rounded-lg bg-slate-50 px-3 py-2 font-semibold text-slate-800"
                                                >
                                                    {selectedAlias.transactionType}
                                                </dd>
                                            </div>{/if}
                                        <div
                                            class="grid grid-cols-[minmax(90px,0.7fr)_minmax(0,1fr)] items-center gap-3 py-3"
                                        >
                                            <dt class="text-slate-500">
                                                Matches
                                            </dt>
                                            <dd
                                                class="font-semibold text-slate-800"
                                            >
                                                {rules?.aliasUsage?.[
                                                    selectedAlias.id
                                                ] ?? 0} statements
                                            </dd>
                                        </div>
                                        {#if aliasCreatedLabel(selectedAlias.createdAt)}<div
                                                class="grid grid-cols-[minmax(90px,0.7fr)_minmax(0,1fr)] items-center gap-3 py-3"
                                            >
                                                <dt class="text-slate-500">
                                                    Created
                                                </dt>
                                                <dd
                                                    class="font-medium text-slate-800"
                                                >
                                                    {aliasCreatedLabel(
                                                        selectedAlias.createdAt
                                                    )}
                                                </dd>
                                            </div>{/if}
                                    </dl>
                                </div>
                                <section
                                    class="shrink-0 border-t border-slate-100 px-4 py-3"
                                >
                                    <h4
                                        class="text-sm font-bold text-slate-900"
                                    >
                                        Recent matching statement
                                    </h4>
                                    {#if selectedAliasMatches[0]}
                                        {@const statement =
                                            selectedAliasMatches[0]}
                                        <button
                                            class="mt-2 flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-indigo-200 hover:bg-indigo-50/60"
                                            onclick={() =>
                                                openStatementsForAlias(
                                                    selectedAlias
                                                )}
                                            title="Open matching statements"
                                        >
                                            <span class="min-w-0 flex-1"
                                                ><span
                                                    class="block truncate text-sm font-semibold text-slate-800"
                                                    >{statement.text ||
                                                        statement.transactionType ||
                                                        'Untitled statement'}</span
                                                ><span
                                                    class="mt-1 block text-xs text-slate-500"
                                                    >{statement.transactionType ||
                                                        'Unknown type'} · {statement.date
                                                        ? dateLabel(
                                                              statement.date.slice(
                                                                  0,
                                                                  10
                                                              )
                                                          )
                                                        : 'No date'}</span
                                                ></span
                                            >
                                            <span
                                                class="shrink-0 text-right text-sm font-semibold text-slate-800"
                                                >{money(statement.amount)}<span
                                                    class="ml-1 text-xs font-medium text-slate-500"
                                                    >{statement.currency}</span
                                                ></span
                                            ><ChevronRight
                                                size={16}
                                                class="shrink-0 text-slate-500"
                                            />
                                        </button>
                                    {:else}
                                        <p
                                            class="mt-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500"
                                        >
                                            No matching statements in this
                                            ledger.
                                        </p>
                                    {/if}
                                </section>
                                <div
                                    class="grid shrink-0 grid-cols-2 gap-2 border-t border-slate-100 p-3"
                                >
                                    <button
                                        class="flex h-10 items-center justify-center gap-2 rounded-lg border border-indigo-300 bg-white px-3 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50"
                                        onclick={() =>
                                            (editingAliasId = selectedAlias.id)}
                                        ><Pencil size={15} />Edit alias</button
                                    >
                                    <button
                                        class="flex h-10 items-center justify-center gap-2 rounded-lg border border-rose-300 bg-white px-3 text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
                                        onclick={() =>
                                            removeAlias(selectedAlias.id)}
                                        ><Trash2 size={15} />Delete alias</button
                                    >
                                </div>
                            {/if}
                        {:else}
                            <div
                                class="flex h-full min-h-64 flex-col items-center justify-center p-8 text-center"
                            >
                                <Tag size={23} class="text-slate-300" />
                                <h3 class="mt-3 font-semibold text-slate-800">
                                    Select an alias
                                </h3>
                                <p class="mt-1 max-w-56 text-sm text-slate-500">
                                    Choose a rule from the list to inspect or
                                    edit its details.
                                </p>
                            </div>
                        {/if}
                    </Card>
                </div>
            </section>
        {:else if page === 'statements'}
            <section class="space-y-5 animate-float-in">
                <Card className="p-4"
                    ><div class="flex flex-col gap-3 lg:flex-row">
                        <div class="relative min-w-0 flex-1">
                            <Search
                                size={16}
                                class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                            /><input
                                bind:value={statementSearch}
                                oninput={() => (statementLimit = 100)}
                                class="field w-full pl-9"
                                placeholder="Search merchant, purpose, amount, date, sender..."
                                aria-label="Search statements"
                            />
                        </div>
                        <select
                            bind:value={statementTypeFilter}
                            class="field lg:w-52"
                            aria-label="Filter transaction type"
                            ><option value="all">All transaction types</option
                            >{#each statementTypes as transactionType}<option
                                    value={transactionType}
                                    >{transactionType}</option
                                >{/each}</select
                        >
                    </div>
                    <div class="mt-3 flex flex-wrap items-center gap-2">
                        <span
                            class="mr-1 text-xs font-bold uppercase tracking-wider text-slate-400"
                            >Show</span
                        >{#each [['all', 'All'], ['matched', 'Has alias'], ['unmatched', 'Needs alias'], ['conflict', 'Conflicts']] as filter}<button
                                class:active-filter={statementFilter ===
                                    filter[0]}
                                class="filter-chip"
                                onclick={() => {
                                    statementFilter =
                                        filter[0] as typeof statementFilter
                                    statementLimit = 100
                                }}
                                >{filter[1]}
                                <span
                                    >{filter[0] === 'all'
                                        ? (rules?.stats.total ?? 0)
                                        : filter[0] === 'matched'
                                          ? (rules?.stats.matched ?? 0)
                                          : filter[0] === 'unmatched'
                                            ? (rules?.stats.unmatched ?? 0)
                                            : (rules?.stats.conflicts ??
                                              0)}</span
                                ></button
                            >{/each}<span
                            class="ml-auto text-xs font-semibold text-slate-400"
                            >{filteredStatements.length} result{filteredStatements.length ===
                            1
                                ? ''
                                : 's'}</span
                        >
                    </div></Card
                >
                <Card className="overflow-hidden p-0"
                    ><div class="divide-y divide-slate-100">
                        {#each visibleStatements as item}<details
                                class="statement-row"
                            >
                                <summary
                                    class="flex cursor-pointer list-none flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center"
                                    ><div class="w-24 shrink-0">
                                        <p
                                            class="text-sm font-semibold text-slate-800"
                                        >
                                            {item.date
                                                ? new Date(
                                                      item.date
                                                  ).toLocaleDateString('en-GB')
                                                : 'No date'}
                                        </p>
                                        <p
                                            class="mt-1 text-[11px] text-slate-400"
                                        >
                                            {item.id.split(':').at(-1)}
                                        </p>
                                    </div>
                                    <div class="min-w-0 flex-1">
                                        <p
                                            class="truncate font-semibold text-slate-800"
                                        >
                                            {item.recipient ||
                                                item.sender ||
                                                item.text ||
                                                item.transactionType ||
                                                'Untitled statement'}
                                        </p>
                                        <p
                                            class="mt-1 truncate text-xs text-slate-400"
                                        >
                                            {item.text ||
                                                item.purpose ||
                                                item.transactionType ||
                                                'No description'}
                                        </p>
                                    </div>
                                    <div
                                        class="flex items-center gap-2 sm:w-64 sm:justify-end"
                                    >
                                        <span
                                            class={`status-dot ${item.status}`}
                                        ></span><span
                                            class="text-right text-sm font-semibold text-slate-800"
                                            >{money(item.amount)}</span
                                        ><Badge
                                            tone={item.status === 'matched'
                                                ? 'success'
                                                : item.status === 'conflict'
                                                  ? 'danger'
                                                  : 'warning'}
                                            >{item.status === 'matched'
                                                ? 'Has alias'
                                                : item.status === 'conflict'
                                                  ? 'Conflict'
                                                  : 'Needs alias'}</Badge
                                        ><button
                                            class:recurring-button-active={item.recurringDirection}
                                            class="icon-button recurring-button"
                                            title={item.recurringDirection
                                                ? `Remove recurring ${item.recurringDirection === 'income' ? 'income' : 'payment'}`
                                                : `Mark as recurring ${item.amount != null && item.amount > 0 ? 'income' : 'payment'}`}
                                            aria-label={item.recurringDirection
                                                ? 'Remove recurring assignment'
                                                : `Mark as recurring ${item.amount != null && item.amount > 0 ? 'income' : 'payment'}`}
                                            onclick={(event) => {
                                                event.stopPropagation()
                                                toggleManualRecurring(item)
                                            }}
                                            disabled={saving}
                                            ><Repeat2 size={15} /></button
                                        >
                                    </div></summary
                                >
                                <div
                                    class="grid gap-4 border-t border-slate-100 bg-slate-50/70 px-5 py-4 text-sm md:grid-cols-[1fr_auto]"
                                >
                                    <div class="grid gap-3 sm:grid-cols-2">
                                        <div>
                                            <p class="label">Description</p>
                                            <p
                                                class="mt-1 break-words text-slate-700"
                                            >
                                                {item.text || '—'}
                                            </p>
                                        </div>
                                        <div>
                                            <p class="label">Purpose</p>
                                            <p
                                                class="mt-1 break-words text-slate-700"
                                            >
                                                {item.purpose || '—'}
                                            </p>
                                        </div>
                                        <div>
                                            <p class="label">
                                                Sender / recipient
                                            </p>
                                            <p
                                                class="mt-1 break-words text-slate-700"
                                            >
                                                {item.sender ||
                                                    '—'}{#if item.recipient}
                                                    → {item.recipient}{/if}
                                            </p>
                                        </div>
                                        <div>
                                            <p class="label">
                                                Transaction type
                                            </p>
                                            <p class="mt-1 text-slate-700">
                                                {item.transactionType || '—'} · {item.currency ||
                                                    '—'}
                                            </p>
                                        </div>
                                        <div>
                                            <p class="label">
                                                Imported CSV label
                                            </p>
                                            <p class="mt-1 text-slate-500">
                                                {item.sourceCategory || '—'}
                                                <span class="text-[11px]"
                                                    >(audit only)</span
                                                >
                                            </p>
                                        </div>
                                        <div>
                                            <p class="label">Statement id</p>
                                            <p
                                                class="mt-1 break-all text-slate-500"
                                            >
                                                {item.id}
                                            </p>
                                        </div>
                                        <div class="sm:col-span-2">
                                            <p class="label">
                                                Recurring assignment
                                            </p>
                                            {#if item.recurringDirection}<Badge
                                                    tone="success"
                                                    >Recurring {item.recurringDirection ===
                                                    'income'
                                                        ? 'income'
                                                        : 'payment'}</Badge
                                                >{:else}<p
                                                    class="mt-1 text-slate-500"
                                                >
                                                    Not manually assigned.
                                                </p>{/if}
                                        </div>
                                        <div class="sm:col-span-2">
                                            <p class="label">Alias grip</p>
                                            {#if item.matches.length}<div
                                                    class="mt-2 flex flex-wrap gap-2"
                                                >
                                                    {#each item.matches as match}<span
                                                            class="statement-match"
                                                            ><button
                                                                class="match-alias"
                                                                title="Go to alias"
                                                                onclick={() =>
                                                                    goToAlias(
                                                                        match.id
                                                                    )}
                                                                >“{match.value}” <ArrowUpRight
                                                                    size={12}
                                                                /></button
                                                            ><button
                                                                class="match-category"
                                                                title="Go to category"
                                                                onclick={() =>
                                                                    goToCategory(
                                                                        match.categoryId
                                                                    )}
                                                                >{categoryName(
                                                                    match.categoryId
                                                                )}
                                                                <ArrowUpRight
                                                                    size={12}
                                                                /></button
                                                            ></span
                                                        >{/each}
                                                </div>{:else}<p
                                                    class="mt-1 text-slate-500"
                                                >
                                                    No alias currently grips
                                                    this statement.
                                                </p>{/if}
                                        </div>
                                    </div>
                                    <div class="flex items-start justify-end">
                                        {#if item.status === 'unmatched'}<Button
                                                size="sm"
                                                variant="outline"
                                                onclick={() =>
                                                    quickCreate(item)}
                                                disabled={saving}
                                                ><WandSparkles
                                                    size={14}
                                                />Create suggested alias</Button
                                            >{:else if item.status === 'conflict'}<button
                                                class="text-xs font-semibold text-primary hover:underline"
                                                onclick={() =>
                                                    (page = 'review')}
                                                >Resolve conflict</button
                                            >{/if}
                                    </div>
                                </div>
                            </details>{:else}<div class="p-10 text-center">
                                <Search
                                    size={22}
                                    class="mx-auto text-slate-300"
                                />
                                <p class="mt-3 font-semibold text-slate-700">
                                    No statements found
                                </p>
                                <p class="mt-1 text-sm text-slate-400">
                                    Try a different search or filter.
                                </p>
                            </div>{/each}
                    </div>
                    {#if visibleStatements.length < filteredStatements.length}<div
                            class="border-t border-slate-100 p-4 text-center"
                        >
                            <Button
                                variant="outline"
                                onclick={() => (statementLimit += 100)}
                                >Load 100 more</Button
                            >
                        </div>{/if}</Card
                >
            </section>
        {:else if page === 'categories'}
            <section class="space-y-5 animate-float-in">
                {#if rules && categories.length === 0 && aliases.length === 0}
                    <Card
                        className="flex flex-wrap items-center justify-between gap-3 border-indigo-200 bg-indigo-50/70 p-5"
                    >
                        <div>
                            <h3 class="font-semibold text-slate-900">
                                Start with a generic category set?
                            </h3>
                            <p class="mt-1 text-sm text-slate-600">
                                Adds common household categories to this ledger.
                                You can rename or remove them later.
                            </p>
                        </div>
                        <Button
                            size="sm"
                            onclick={applyGenericRulesTemplate}
                            disabled={saving}>Use generic categories</Button
                        >
                    </Card>
                {/if}
                <Card className="border-indigo-100 bg-indigo-50/60 p-5"
                    ><div class="mb-4 flex items-center gap-2">
                        <Plus size={17} class="text-primary" />
                        <h3 class="font-semibold text-slate-950">
                            Create a category
                        </h3>
                    </div>
                    <div class="flex flex-col gap-3 sm:flex-row">
                        <input
                            bind:value={newCategory.name}
                            class="field flex-1"
                            placeholder="e.g. Health & wellbeing"
                            aria-label="New category name"
                        /><select
                            bind:value={newCategory.necessity}
                            class="field sm:w-48"
                            aria-label="New category type"
                            ><option value="necessity">Necessity</option><option
                                value="convenience">Convenience</option
                            ></select
                        ><Button
                            onclick={addCategory}
                            disabled={saving || !newCategory.name.trim()}
                            ><Plus size={15} />Create</Button
                        >
                    </div></Card
                >
                <div class="grid gap-5 lg:grid-cols-2">
                    {#each [['necessity', 'Necessities', 'Things that support essential living or an obligation.', 'emerald'] as const, ['convenience', 'Conveniences', 'Comfort, leisure, and optional consumption.', 'violet'] as const] as column}
                        <div
                            role="list"
                            class={`category-column ${column[0]}`}
                            ondragover={(event) => event.preventDefault()}
                            ondrop={() => moveCategory(column[0])}
                        >
                            <div class="mb-3 flex items-start justify-between">
                                <div>
                                    <div class="flex items-center gap-2">
                                        <span class={`dot ${column[3]}`}></span>
                                        <h3 class="section-title">
                                            {column[1]}
                                        </h3>
                                    </div>
                                    <p class="mt-1 text-xs text-slate-500">
                                        {column[2]}
                                    </p>
                                </div>
                                <span class="count-pill"
                                    >{categories.filter(
                                        (category) =>
                                            category.necessity === column[0]
                                    ).length}</span
                                >
                            </div>
                            <div class="space-y-3">
                                {#each categories.filter((category) => category.necessity === column[0]) as category}<article
                                        id={`category-${category.id}`}
                                        class="category-card"
                                        draggable="true"
                                        ondragstart={() =>
                                            (draggedCategoryId = category.id)}
                                    >
                                        <div
                                            class="flex items-start justify-between gap-3"
                                        >
                                            <div class="min-w-0">
                                                <p
                                                    class="truncate font-semibold text-slate-800"
                                                >
                                                    {category.name}
                                                </p>
                                                <p
                                                    class="mt-1 text-xs text-slate-500"
                                                >
                                                    {category.aliasCount}
                                                    {category.aliasCount === 1
                                                        ? 'alias'
                                                        : 'aliases'} assigned
                                                </p>
                                            </div>
                                            <div class="flex gap-1">
                                                <button
                                                    class="icon-button"
                                                    title="Edit category"
                                                    aria-label="Edit category"
                                                    onclick={() =>
                                                        (editingCategoryId =
                                                            editingCategoryId ===
                                                            category.id
                                                                ? ''
                                                                : category.id)}
                                                    ><Pencil
                                                        size={15}
                                                    /></button
                                                ><button
                                                    class="icon-button danger-hover"
                                                    title="Delete category"
                                                    aria-label="Delete category"
                                                    disabled={category.aliasCount >
                                                        0}
                                                    onclick={() =>
                                                        removeCategory(
                                                            category
                                                        )}
                                                    ><Trash2
                                                        size={15}
                                                    /></button
                                                >
                                            </div>
                                        </div>
                                        {#if editingCategoryId === category.id}<div
                                                class="mt-3 flex gap-2"
                                            >
                                                <input
                                                    bind:value={category.name}
                                                    class="field min-w-0 flex-1"
                                                    aria-label="Edit category name"
                                                /><Button
                                                    size="sm"
                                                    onclick={() =>
                                                        updateCategory(
                                                            category
                                                        )}
                                                    ><Check
                                                        size={14}
                                                    />Save</Button
                                                >
                                            </div>{/if}
                                    </article>{:else}<div class="empty-drop">
                                        Drop categories here
                                    </div>{/each}
                            </div>
                        </div>
                    {/each}
                </div>
                <p class="flex items-center gap-2 text-xs text-slate-500">
                    <Filter size={14} />A category can only be deleted when no
                    alias points to it. Reassign or remove its aliases first.
                </p>
            </section>
        {:else}
            <section class="space-y-5 animate-float-in">
                <div class="grid gap-4 md:grid-cols-3">
                    <Card className="p-4"
                        ><p class="label">Unmatched</p>
                        <p class="mt-2 text-2xl font-semibold text-amber-600">
                            {unmatched.length}
                        </p>
                        <p class="hint">No alias grips this row</p></Card
                    ><Card className="p-4"
                        ><p class="label">Conflicts</p>
                        <p class="mt-2 text-2xl font-semibold text-red-600">
                            {conflicts.length}
                        </p>
                        <p class="hint">More than one alias grips it</p></Card
                    ><Card className="p-4"
                        ><p class="label">Goal</p>
                        <p class="mt-2 text-2xl font-semibold text-emerald-700">
                            100%
                        </p>
                        <p class="hint">
                            Exactly one alias per statement
                        </p></Card
                    >
                </div>
                <Card className="overflow-hidden p-0"
                    ><div class="border-b border-slate-100 px-5 py-4">
                        <div
                            class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
                        >
                            <div>
                                <h3 class="section-title">No alias found</h3>
                                <p class="hint">
                                    Create a focused alias from the description
                                    or transaction type. The category below is
                                    where those new aliases will be saved.
                                </p>
                            </div>
                        </div>
                    </div>
                    <div class="divide-y divide-slate-100">
                        {#each unmatched as item}<div
                                class="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                            >
                                <div class="min-w-0">
                                    <p
                                        class="truncate font-semibold text-slate-800"
                                    >
                                        {item.text ||
                                            item.transactionType ||
                                            'Untitled statement'}
                                    </p>
                                    <p class="mt-1 text-xs text-slate-500">
                                        {item.transactionType || 'Unknown type'} ·
                                        {money(item.amount)} · {item.date
                                            ? new Date(
                                                  item.date
                                              ).toLocaleDateString('en-GB')
                                            : 'No date'}
                                    </p>
                                </div>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onclick={() => quickCreate(item)}
                                    disabled={saving}
                                    className="h-10 w-28 shrink-0 whitespace-nowrap px-3"
                                    ><WandSparkles size={14} />Create alias</Button
                                >
                            </div>{:else}<p
                                class="p-6 text-sm text-emerald-700"
                            >
                                Every statement has at least one alias.
                            </p>{/each}
                    </div></Card
                >
                <Card className="overflow-hidden border-red-100 p-0"
                    ><div
                        class="border-b border-red-100 bg-red-50/50 px-5 py-4"
                    >
                        <h3 class="section-title">Overlapping aliases</h3>
                        <p class="hint">
                            These rows have more than one match. Narrow one
                            alias by type or pin the chosen rule to this
                            statement.
                        </p>
                    </div>
                    <div class="divide-y divide-slate-100">
                        {#each conflicts as item}<div class="px-5 py-4">
                                <div
                                    class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
                                >
                                    <div>
                                        <p class="font-semibold text-slate-800">
                                            {item.text ||
                                                item.transactionType ||
                                                'Untitled statement'}
                                        </p>
                                        <p class="mt-1 text-xs text-slate-500">
                                            {item.transactionType ||
                                                'Unknown type'} · {money(
                                                item.amount
                                            )}
                                        </p>
                                    </div>
                                    <Badge tone="danger"
                                        >{item.matches.length} matches</Badge
                                    >
                                </div>
                                <div class="mt-3 flex flex-wrap gap-2">
                                    {#each item.matches as match}<span
                                            class="rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700"
                                            >{match.value} → {categoryName(
                                                match.categoryId
                                            )}</span
                                        >{/each}
                                </div>
                                <div class="mt-4 flex flex-wrap gap-2">
                                    <span
                                        class="mr-1 flex items-center gap-1 text-xs font-semibold text-slate-500"
                                        ><ChevronDown size={14} />Resolve</span
                                    >{#each item.matches as match}<Button
                                            size="sm"
                                            variant="outline"
                                            onclick={() =>
                                                pinAlias(item, match.id)}
                                            disabled={saving}
                                            ><Settings2 size={13} />Pin “{match.value}”</Button
                                        >{/each}<button
                                        class="text-xs font-semibold text-primary hover:underline"
                                        onclick={() => openNewAlias(item.text)}
                                        >Edit aliases</button
                                    >
                                </div>
                            </div>{:else}<p
                                class="p-6 text-sm text-emerald-700"
                            >
                                No overlapping aliases found.
                            </p>{/each}
                    </div></Card
                >
            </section>
        {/if}
    </div>
    {#if quickAliasStatement}
        <div
            class="modal-backdrop"
            role="presentation"
            onclick={() => (quickAliasStatement = null)}
        >
            <div
                class="modal-panel max-w-lg"
                role="dialog"
                aria-modal="true"
                aria-labelledby="quick-alias-title"
                tabindex="-1"
                onclick={(event) => event.stopPropagation()}
                onkeydown={(event) => event.stopPropagation()}
            >
                <div class="border-b border-slate-100 px-5 py-4">
                    <p class="label text-indigo-500">Unmatched statement</p>
                    <h2
                        id="quick-alias-title"
                        class="mt-1 text-xl font-semibold text-slate-950"
                    >
                        Create alias
                    </h2>
                    <p class="mt-2 text-sm text-slate-600">
                        {quickAliasStatement.text ||
                            quickAliasStatement.transactionType ||
                            'Untitled statement'}
                    </p>
                </div>
                <div class="space-y-4 p-5">
                    <label class="block text-sm font-medium text-slate-700"
                        >Alias phrase
                        <input
                            bind:value={quickAliasValue}
                            class="field mt-1 w-full"
                            aria-label="Alias phrase"
                        />
                    </label>
                    <label class="block text-sm font-medium text-slate-700"
                        >Save to category
                        <select
                            bind:value={quickAliasCategoryId}
                            class="field mt-1 w-full"
                            aria-label="Alias category"
                        >
                            <option value="">Choose category</option>
                            {#each categories as category}<option
                                    value={category.id}>{category.name}</option
                                >{/each}
                        </select>
                    </label>
                    <div class="flex justify-end gap-2">
                        <Button
                            variant="outline"
                            onclick={() => (quickAliasStatement = null)}
                            >Cancel</Button
                        >
                        <Button
                            onclick={saveQuickAlias}
                            disabled={saving ||
                                !quickAliasValue.trim() ||
                                !quickAliasCategoryId}
                            ><WandSparkles size={14} />Create alias</Button
                        >
                    </div>
                </div>
            </div>
        </div>
    {/if}
    {#if showAliasCreateDialog}
        <div
            class="modal-backdrop"
            role="presentation"
            onclick={() => (showAliasCreateDialog = false)}
        >
            <div
                class="modal-panel max-w-lg"
                role="dialog"
                aria-modal="true"
                aria-labelledby="create-alias-title"
                tabindex="-1"
                onclick={(event) => event.stopPropagation()}
                onkeydown={(event) => event.stopPropagation()}
            >
                <div class="border-b border-slate-100 px-5 py-4">
                    <p class="label text-indigo-500">
                        Rules · {aliases.length}
                    </p>
                    <h2
                        id="create-alias-title"
                        class="mt-1 text-xl font-semibold text-slate-950"
                    >
                        Create alias
                    </h2>
                    <p class="mt-1 text-sm text-slate-500">
                        Matching is case-insensitive and applies to future
                        statement imports.
                    </p>
                </div>
                <div class="space-y-4 p-5">
                    <label class="block text-sm font-medium text-slate-700"
                        >Match phrase<input
                            bind:value={newAlias.value}
                            class="field mt-1 w-full"
                            placeholder="e.g. Rewe, Edeka, salary"
                        /></label
                    >
                    <label class="block text-sm font-medium text-slate-700"
                        >Category<select
                            bind:value={newAlias.categoryId}
                            class="field mt-1 w-full"
                            >{#each categories as category}<option
                                    value={category.id}>{category.name}</option
                                >{/each}</select
                        ></label
                    >
                    <label class="block text-sm font-medium text-slate-700"
                        >Match field<select
                            bind:value={newAlias.field}
                            class="field mt-1 w-full"
                            ><option value="any">Any statement field</option
                            ><option value="text">Description only</option
                            ><option value="transaction_type"
                                >Transaction type</option
                            ><option value="category">Source category</option
                            ></select
                        ></label
                    >
                    <label class="block text-sm font-medium text-slate-700"
                        >Transaction type filter<input
                            bind:value={newAlias.transactionType}
                            class="field mt-1 w-full"
                            placeholder="Optional"
                        /></label
                    >
                    <div class="flex justify-end gap-2">
                        <Button
                            variant="outline"
                            onclick={() => (showAliasCreateDialog = false)}
                            >Cancel</Button
                        ><Button
                            onclick={addAlias}
                            disabled={saving ||
                                !newAlias.value.trim() ||
                                !newAlias.categoryId}
                            ><Plus size={14} />Create alias</Button
                        >
                    </div>
                </div>
            </div>
        </div>
    {/if}
    {#if recurringDialog}
        <div
            class="modal-backdrop"
            role="presentation"
            onclick={closeRecurringDialog}
        >
            <div
                class="modal-panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby="recurring-dialog-title"
                tabindex="-1"
                onclick={(event) => event.stopPropagation()}
                onkeydown={(event) => event.stopPropagation()}
            >
                <div
                    class="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4"
                >
                    <div class="min-w-0">
                        <p class="label text-indigo-500">Recurring payment</p>
                        <h2
                            id="recurring-dialog-title"
                            class="mt-1 truncate text-xl font-semibold text-slate-950"
                        >
                            {recurringDialog.row.label}
                        </h2>
                        <p class="mt-1 text-xs text-slate-500">
                            {recurringDialog.row.counterparty} · {recurringDialog
                                .row.members.length} detected series · {recurringObservationIds(
                                recurringDialog.row
                            ).length} detected observations
                        </p>
                    </div>
                    <button
                        class="icon-button"
                        title="Close"
                        aria-label="Close"
                        onclick={closeRecurringDialog}><X size={17} /></button
                    >
                </div>
                {#if recurringDialog.kind === 'alias'}
                    <div class="space-y-5 p-5">
                        <div>
                            <label class="label" for="recurring-alias"
                                >Recurring alias</label
                            ><input
                                id="recurring-alias"
                                bind:value={recurringAliasDraft}
                                class="field mt-2 w-full"
                                placeholder="e.g. Netflix, Spotify family plan"
                            />
                            <p class="hint">
                                This phrase is scanned across the matching
                                payment/income direction and currency to find
                                the statements that belong to it.
                            </p>
                        </div>
                        <div
                            class="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4"
                        >
                            <div
                                class="flex items-center justify-between gap-3"
                            >
                                <div>
                                    <p class="label text-indigo-500">
                                        Observation impact
                                    </p>
                                    <p class="mt-1 text-sm text-slate-700">
                                        Save the alias to rescan the ledger
                                        automatically.
                                    </p>
                                </div>
                                {#if recurringAliasScanning}<RefreshCw
                                        size={17}
                                        class="animate-spin text-primary"
                                    />{/if}
                            </div>
                            {#if recurringAliasScan}<div
                                    class="mt-4 grid grid-cols-3 gap-2 text-center"
                                >
                                    <div class="rounded-xl bg-white/80 p-3">
                                        <p class="label">Before</p>
                                        <p
                                            class="mt-1 text-lg font-semibold text-slate-950"
                                        >
                                            {recurringAliasScan.beforeCount}
                                        </p>
                                    </div>
                                    <div class="rounded-xl bg-white/80 p-3">
                                        <p class="label">After</p>
                                        <p
                                            class="mt-1 text-lg font-semibold text-slate-950"
                                        >
                                            {recurringAliasScan.afterCount}
                                        </p>
                                    </div>
                                    <div class="rounded-xl bg-white/80 p-3">
                                        <p class="label">Change</p>
                                        <p
                                            class={`mt-1 text-lg font-semibold ${recurringAliasScan.addedCount > recurringAliasScan.removedCount ? 'text-emerald-700' : recurringAliasScan.addedCount < recurringAliasScan.removedCount ? 'text-amber-700' : 'text-slate-700'}`}
                                        >
                                            {recurringAliasScan.afterCount -
                                                recurringAliasScan.beforeCount >
                                            0
                                                ? '+'
                                                : ''}{recurringAliasScan.afterCount -
                                                recurringAliasScan.beforeCount}
                                        </p>
                                    </div>
                                </div>
                                <p class="mt-3 text-xs text-slate-500">
                                    {recurringAliasScan.addedCount} statement{recurringAliasScan.addedCount ===
                                    1
                                        ? ''
                                        : 's'} added · {recurringAliasScan.removedCount}
                                    removed. The saved alias now includes {recurringAliasScan.afterCount}
                                    observations.
                                </p>{:else}<p
                                    class="mt-4 text-sm text-slate-500"
                                >
                                    No scan has run for this alias yet.
                                </p>{/if}
                        </div>
                        <div class="flex justify-end gap-2">
                            <Button
                                variant="outline"
                                onclick={closeRecurringDialog}>Done</Button
                            ><Button
                                onclick={saveRecurringAlias}
                                disabled={recurringAliasScanning}
                                ><Check size={14} />Save and scan</Button
                            >
                        </div>
                    </div>
                {:else if recurringDialog.kind === 'end-date'}
                    <div class="space-y-5 p-5">
                        <p class="text-sm text-slate-600">
                            Keep this payment confirmed for its history, and
                            stop forecasting it after the date it ended.
                        </p>
                        <label
                            class="block text-sm font-medium text-slate-700"
                            for="recurring-end-date"
                            >Effective end date
                            <input
                                id="recurring-end-date"
                                type="date"
                                bind:value={recurringEndDateDraft}
                                class="field mt-1 w-full"
                            />
                        </label>
                        <div class="flex flex-wrap justify-end gap-2">
                            {#if recurringDialog.row.endedAt}<Button
                                    variant="outline"
                                    onclick={() => saveRecurringEndDate(null)}
                                    disabled={saving}>Remove end date</Button
                                >{/if}
                            <Button
                                variant="outline"
                                onclick={closeRecurringDialog}>Cancel</Button
                            >
                            <Button
                                onclick={() =>
                                    saveRecurringEndDate(recurringEndDateDraft)}
                                disabled={saving ||
                                    !isDateKey(recurringEndDateDraft)}
                                ><Check size={14} />Save end date</Button
                            >
                        </div>
                    </div>
                {:else}
                    {@const dialogObservationIds =
                        recurringAliasScan?.includedStatementIds ??
                        recurringObservationIds(recurringDialog.row)}
                    {@const dialogObservations = recurringObservationStatements(
                        recurringDialog.row,
                        dialogObservationIds
                    )}
                    <div class="max-h-[70vh] overflow-y-auto">
                        <div
                            class="border-b border-slate-100 bg-slate-50/70 px-5 py-3 text-xs font-semibold text-slate-500"
                        >
                            Showing {Math.min(
                                recurringObservationLimit,
                                dialogObservations.length
                            )} of {dialogObservations.length} statements
                        </div>
                        <div class="divide-y divide-slate-100">
                            {#each dialogObservations.slice(0, recurringObservationLimit) as item}<div
                                    class="px-5 py-3.5"
                                >
                                    <div
                                        class="flex items-center justify-between gap-3"
                                    >
                                        <p
                                            class="min-w-0 truncate font-semibold text-slate-800"
                                        >
                                            {item.recipient ||
                                                item.sender ||
                                                item.text ||
                                                'Untitled statement'}
                                        </p>
                                        <p
                                            class={item.amount != null &&
                                            item.amount > 0
                                                ? 'shrink-0 font-semibold text-emerald-700'
                                                : 'shrink-0 font-semibold text-slate-950'}
                                        >
                                            {money(item.amount)}
                                        </p>
                                    </div>
                                    <p class="mt-1 text-xs text-slate-500">
                                        {item.date
                                            ? dateLabel(item.date.slice(0, 10))
                                            : 'No date'} · {item.text ||
                                            item.purpose ||
                                            item.transactionType ||
                                            'No description'}
                                    </p>
                                    <p
                                        class="mt-1 break-all text-[11px] text-slate-400"
                                    >
                                        {item.id}
                                    </p>
                                </div>{:else}<p
                                    class="p-8 text-center text-sm text-slate-500"
                                >
                                    No statements found.
                                </p>{/each}
                        </div>
                        {#if recurringObservationLimit < dialogObservations.length}<div
                                class="border-t border-slate-100 p-4 text-center"
                            >
                                <Button
                                    variant="outline"
                                    onclick={() =>
                                        (recurringObservationLimit += 100)}
                                    >Load 100 more</Button
                                >
                            </div>{/if}
                    </div>
                {/if}
            </div>
        </div>
    {/if}
</main>
