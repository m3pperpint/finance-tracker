import type { BankStatement } from '../common/common.dto.js'
import type {
    RecurrenceCadence,
    RecurrenceConfidence,
    RecurrenceDirection,
    RecurringOccurrence,
    RecurringSeries,
} from './recurrence-model.js'

export interface RecurrenceOptions {
    getStatementId?: (index: number) => string
}

interface Event {
    index: number
    date: Date
    amount: number
    direction: RecurrenceDirection
    currency: string
    counterparty: string
    label: string
    key: string
}

interface CadenceMatch {
    cadence: RecurrenceCadence
    intervalMonths: 1 | 12
    toleranceDays: number
    cadenceFit: number
    dateFit: number
    coveredCycles: number
    expectedCycles: number
    skippedCycles: number
    anchorDay: number
    endOfMonth: boolean
    selectedEventIndexes: number[]
}

const DEFAULT_STATEMENT_ID = (index: number) => String(index)

export function detectRecurring(
    statements: BankStatement[],
    options: RecurrenceOptions = {}
): RecurringSeries[] {
    const events = statements
        .map((statement, index) => toEvent(statement, index))
        .filter((event): event is Event => Boolean(event))

    const groups = new Map<string, Event[]>()
    for (const event of events) {
        const group = groups.get(event.key) ?? []
        group.push(event)
        groups.set(event.key, group)
    }

    const series: RecurringSeries[] = []
    for (const group of groups.values()) {
        const match = findBestCadence(group)
        if (!match) continue
        series.push(toSeries(group, match, options.getStatementId ?? DEFAULT_STATEMENT_ID))
    }

    return series.sort((a, b) => b.evidence.amountMedian - a.evidence.amountMedian)
}

function toEvent(statement: BankStatement, index: number): Event | undefined {
    const date = statement.date_executed ?? statement.date
    if (!date || !Number.isFinite(date.getTime()) || statement.amount == null || statement.amount === 0) {
        return undefined
    }

    const direction: RecurrenceDirection = statement.amount > 0 ? 'income' : 'expense'
    const rawCounterparty = (direction === 'income' ? statement.sender : statement.recipient)?.trim()
    const counterparty = rawCounterparty || 'Unknown counterparty'
    const stablePurpose = stableWords(statement.purpose || statement.text)
    const stableCounterparty = stableWords(counterparty)
    const identity = [stableCounterparty, stablePurpose].filter(Boolean).join(' ')
    if (!identity) return undefined

    return {
        index,
        date,
        amount: Math.abs(statement.amount),
        direction,
        currency: statement.currency?.trim() || 'unknown',
        counterparty,
        label: stablePurpose || counterparty,
        key: `${direction}|${statement.currency?.trim().toLocaleLowerCase() || 'unknown'}|${identity}`,
    }
}

function findBestCadence(events: Event[]): CadenceMatch | undefined {
    if (events.length < 2) return undefined

    const sorted = [...events].sort((a, b) => a.date.getTime() - b.date.getTime())
    const candidates = [
        evaluateCadence(sorted, 'monthly', 1, 7),
        evaluateCadence(sorted, 'yearly', 12, 14),
    ].filter((match): match is CadenceMatch => Boolean(match))

    return candidates
        .filter((match) => match.coveredCycles / match.expectedCycles >= 0.5)
        .sort((a, b) => cadenceScore(b) - cadenceScore(a))[0]
}

function evaluateCadence(
    events: Event[],
    cadence: RecurrenceCadence,
    intervalMonths: 1 | 12,
    toleranceDays: number
): CadenceMatch | undefined {
    const first = events[0]
    const firstMonth = monthIndex(first.date)
    const offsets = events.map((event) => Math.round((monthIndex(event.date) - firstMonth) / intervalMonths))
    const uniqueOffsets = new Set(offsets)
    const duplicateCount = events.length - uniqueOffsets.size
    if (duplicateCount >= uniqueOffsets.size * 0.5) return undefined

    const amountCenter = median(events.map((event) => event.amount))
    const selectedByOffset = new Map<number, Event>()
    for (const [index, offset] of offsets.entries()) {
        const event = events[index]
        const selected = selectedByOffset.get(offset)
        if (!selected || Math.abs(event.amount - amountCenter) < Math.abs(selected.amount - amountCenter)) {
            selectedByOffset.set(offset, event)
        }
    }
    const selectedEvents = [...selectedByOffset.values()].sort((a, b) => a.date.getTime() - b.date.getTime())
    const selectedOffsets = [...selectedByOffset.keys()].sort((a, b) => a - b)

    const expectedCycles = selectedOffsets.at(-1)! + 1
    const coveredCycles = uniqueOffsets.size
    const skippedCycles = expectedCycles - coveredCycles
    const gaps = selectedOffsets.slice(1).map((offset, index) => offset - selectedOffsets[index])
    const cadenceFit = gaps.length === 0
        ? 0
        : gaps.reduce((score, gap) => score + (gap === 1 ? 1 : gap === 2 ? 0.5 : 0), 0) / gaps.length

    if (cadence === 'yearly' && events.length < 2) return undefined
    if (cadence === 'monthly' && events.length < 3) return undefined
    if (cadenceFit < 0.5) return undefined

    const endOfMonth = selectedEvents.every((event) => isEndOfMonth(event.date))
    const dateDistances = selectedEvents.map((event, index) =>
        Math.abs(dayDifference(event.date, addMonths(first.date, selectedOffsets[index] * intervalMonths, endOfMonth)))
    )
    const dateFit = dateDistances.filter((distance) => distance <= toleranceDays).length / selectedEvents.length
    if (dateFit < 0.6) return undefined

    const days = selectedEvents.map((event) => event.date.getDate())
    const anchorDay = Math.round(median(days))
    return {
        cadence,
        intervalMonths,
        toleranceDays,
        cadenceFit,
        dateFit,
        coveredCycles,
        expectedCycles,
        skippedCycles,
        anchorDay,
        endOfMonth,
        selectedEventIndexes: selectedEvents.map((event) => event.index),
    }
}

function toSeries(
    events: Event[],
    match: CadenceMatch,
    getStatementId: (index: number) => string
): RecurringSeries {
    const selected = new Set(match.selectedEventIndexes)
    const sorted = events.filter((event) => selected.has(event.index)).sort((a, b) => a.date.getTime() - b.date.getTime())
    const amounts = sorted.map((event) => event.amount)
    const amountMedian = median(amounts)
    const amountMad = median(amounts.map((amount) => Math.abs(amount - amountMedian)))
    const yearlyChange = getYearlyChange(sorted)
    const amountKind = getAmountKind(amounts, amountMedian, amountMad, yearlyChange, match.cadence)
    const last = sorted.at(-1)!
    const nextDate = addMonths(last.date, match.intervalMonths, match.endOfMonth)
    const confidence: RecurrenceConfidence =
        sorted.length >= (match.cadence === 'yearly' ? 3 : 4) &&
        match.cadenceFit >= 0.85 &&
        match.dateFit >= 0.85 &&
        match.skippedCycles === 0
            ? 'confirmed'
            : 'probable'

    const occurrences: RecurringOccurrence[] = sorted.map((event) => ({
        statementIndex: event.index,
        statementId: getStatementId(event.index),
        date: dateKey(event.date),
        amount: event.amount,
    }))

    return {
        id: `${events[0].key}|${match.cadence}`,
        direction: events[0].direction,
        currency: events[0].currency,
        counterparty: events[0].counterparty,
        label: events[0].label,
        cadence: match.cadence,
        intervalMonths: match.intervalMonths,
        anchor: {
            day: match.anchorDay,
            toleranceDays: match.toleranceDays,
            endOfMonth: match.endOfMonth,
        },
        occurrences,
        amountModel: {
            kind: amountKind,
            typicalAmount: roundMoney(amountMedian),
            minimumAmount: roundMoney(Math.min(...amounts)),
            maximumAmount: roundMoney(Math.max(...amounts)),
            ...(match.cadence === 'yearly' && yearlyChange != null ? { yearlyChange: roundMoney(yearlyChange) } : {}),
        },
        nextExpectedDate: dateKey(nextDate),
        expectedDateFrom: dateKey(addDays(nextDate, -match.toleranceDays)),
        expectedDateTo: dateKey(addDays(nextDate, match.toleranceDays)),
        confidence,
        evidence: {
            occurrenceCount: sorted.length,
            coveredCycles: match.coveredCycles,
            expectedCycles: match.expectedCycles,
            skippedCycles: match.skippedCycles,
            cadenceFit: roundScore(match.cadenceFit),
            dateFit: roundScore(match.dateFit),
            amountMedian: roundMoney(amountMedian),
            amountMad: roundMoney(amountMad),
        },
    }
}

function cadenceScore(match: CadenceMatch): number {
    return match.cadenceFit * 0.5 + match.dateFit * 0.3 + (match.coveredCycles / match.expectedCycles) * 0.2
}

function getAmountKind(
    amounts: number[],
    medianAmount: number,
    mad: number,
    yearlyChange: number | undefined,
    cadence: RecurrenceCadence
): 'fixed' | 'inflation-adjusted' | 'variable' {
    if (mad <= Math.max(1, medianAmount * 0.05)) {
        if (cadence === 'yearly' && yearlyChange != null && Math.abs(yearlyChange) > Math.max(1, medianAmount * 0.03)) {
            return 'inflation-adjusted'
        }
        return 'fixed'
    }
    return 'variable'
}

function getYearlyChange(events: Event[]): number | undefined {
    if (events.length < 2) return undefined
    const first = events[0]
    const last = events.at(-1)!
    const years = (last.date.getTime() - first.date.getTime()) / (365.2425 * 24 * 60 * 60 * 1000)
    return years <= 0 ? undefined : (last.amount - first.amount) / years
}

function stableWords(value: string | undefined): string {
    if (!value) return ''
    const ignored = new Set([
        'bei', 'card', 'de', 'einmalig', 'end', 'einkauf', 'id', 'ihr', 'in',
        'kauf', 'mandat', 'payment', 'ref', 'reference', 'sepa', 'basislastschrift',
        'transfer', 'wiederholend',
    ])
    return value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length >= 2 && !ignored.has(word) && !/\d/.test(word))
        .join(' ')
}

function monthIndex(date: Date): number {
    return date.getFullYear() * 12 + date.getMonth()
}

function addMonths(date: Date, months: number, endOfMonth = false): Date {
    const result = new Date(date.getFullYear(), date.getMonth() + months, 1)
    const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()
    result.setDate(endOfMonth ? lastDay : Math.min(date.getDate(), lastDay))
    return result
}

function isEndOfMonth(date: Date): boolean {
    return date.getDate() === new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
}

function addDays(date: Date, days: number): Date {
    const result = new Date(date)
    result.setDate(result.getDate() + days)
    return result
}

function dayDifference(left: Date, right: Date): number {
    return (left.getTime() - right.getTime()) / (24 * 60 * 60 * 1000)
}

function median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b)
    const middle = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 0
        ? (sorted[middle - 1] + sorted[middle]) / 2
        : sorted[middle]
}

function dateKey(date: Date): string {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}

function roundMoney(value: number): number {
    return Math.round(value * 100) / 100
}

function roundScore(value: number): number {
    return Math.round(value * 1000) / 1000
}
