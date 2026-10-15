import { BadRequestException, Injectable } from '@nestjs/common'
import { FinanceAnalyzer, BankStatement, FinanceScope } from '../core'
import { CsvParserService } from '../csv-parser/csv-parser.service'
import { mapRowToBankStatement } from '../core/common/helpers/finance-mapping.helper'
import { detectRecurring } from '../core/finance/recurrence-analyzer.js'
import { statementId } from '../core/finance/rule-model.js'
import { RuleStoreService } from './rule-store.service.js'
import { LedgerManifest, LedgerStoreService } from './ledger-store.service.js'

interface LedgerData {
    manifest: LedgerManifest
    statements: BankStatement[]
    ids: string[]
    duplicatesRemoved: number
}

@Injectable()
export class FinanceService {
    constructor(
        private readonly csvParser: CsvParserService,
        private readonly ruleStore: RuleStoreService,
        private readonly ledgerStore: LedgerStoreService
    ) {}

    getLedgers() { return this.ledgerStore.list() }
    getLedger(id: string) { return this.ledgerStore.get(id) }
    getImportProfiles() { return this.ruleStore.getImportProfiles() }
    saveImportProfile(name: string, mappings: Record<string, string>) {
        return this.ruleStore.saveImportProfile(name, mappings)
    }

    createLedger(name: string, files: string[], importProfile?: string, rulesTemplate: 'generic' | 'scratch' = 'scratch') {
        const manifest = this.ledgerStore.create(name, files, importProfile, this.getImportProfiles())
        this.ruleStore.initializeLedger(manifest.id)
        if (rulesTemplate === 'generic') this.ruleStore.applyGenericTemplate(manifest.id)
        return manifest
    }

    applyGenericRulesTemplate(ledgerId: string) {
        this.ledgerStore.get(ledgerId)
        return this.ruleStore.applyGenericTemplate(ledgerId)
    }

    addUploadedFile(ledgerId: string, temporaryPath: string, originalName: string, mappings: Record<string, string>) {
        const ledger = this.ledgerStore.get(ledgerId)
        const chosenMappings = Object.keys(mappings).length || !ledger.importProfile
            ? mappings
            : this.getImportProfiles()[ledger.importProfile] ?? mappings
        return this.ledgerStore.addUploaded(ledgerId, temporaryPath, originalName, chosenMappings)
    }

    private parseLedger(ledgerId: string): LedgerData {
        const manifest = this.ledgerStore.get(ledgerId)
        const statements: BankStatement[] = []
        const ids: string[] = []
        const maximumOccurrences = new Map<string, number>()
        let duplicatesRemoved = 0

        for (const source of [...manifest.sources].sort((a, b) => a.importedAt.localeCompare(b.importedAt) || a.id.localeCompare(b.id))) {
            const rows = this.csvParser.parseCSVData(this.ledgerStore.sourcePath(ledgerId, source), source.mappings)
            const sourceCounts = new Map<string, number>()
            const parsed = rows.map(mapRowToBankStatement)
            parsed.forEach((statement, index) => {
                const fingerprint = this.transactionFingerprint(statement)
                const occurrence = fingerprint ? (sourceCounts.get(fingerprint) ?? 0) + 1 : 0
                if (fingerprint) sourceCounts.set(fingerprint, occurrence)
                if (fingerprint && occurrence <= (maximumOccurrences.get(fingerprint) ?? 0)) {
                    duplicatesRemoved++
                    return
                }
                statements.push(statement)
                ids.push(statementId(source.legacyFileName ?? `${ledgerId}:${source.id}`, index))
            })
            for (const [fingerprint, count] of sourceCounts) {
                maximumOccurrences.set(fingerprint, Math.max(maximumOccurrences.get(fingerprint) ?? 0, count))
            }
        }
        return { manifest, statements, ids, duplicatesRemoved }
    }

    private transactionFingerprint(statement: BankStatement): string | undefined {
        if (!statement.date || statement.amount == null) return undefined
        const description = [statement.text, statement.transaction_type, statement.sender, statement.recipient, statement.purpose]
            .map((value) => value?.trim().toLocaleLowerCase().replace(/\s+/g, ' ') ?? '')
        if (description.filter(Boolean).length < 1) return undefined
        const date = `${statement.date.getFullYear()}-${String(statement.date.getMonth() + 1).padStart(2, '0')}-${String(statement.date.getDate()).padStart(2, '0')}`
        return JSON.stringify([date, statement.amount.toFixed(2), statement.currency?.trim().toLocaleUpperCase() ?? '', ...description])
    }

    getDashboard(ledgerId: string, scope: FinanceScope, top: number) {
        const ledger = this.parseLedger(ledgerId)
        const configuredDefinitions = this.ruleStore.getCategoryDefinitions(ledgerId, ledger.statements)
        const dashboard = new FinanceAnalyzer(
            ledger.statements,
            this.ruleStore.getCategoryResolver(ledgerId, ledger.statements, ledger.ids),
            () => configuredDefinitions,
            (category) => configuredDefinitions.find((definition) => definition.category === category) ?? {
                category,
                description: 'This transaction does not have a matching configured category.',
                necessity: 'unclassified',
                control: 'influenceable',
                pricePattern: 'variable',
            }
        ).getDashboard(scope, top)
        return { ...dashboard, importSummary: { sourceCount: ledger.manifest.sources.length, duplicateTransactionsRemoved: ledger.duplicatesRemoved } }
    }

    getRules(ledgerId: string) {
        const ledger = this.parseLedger(ledgerId)
        return this.ruleStore.getRules(ledgerId, ledger.statements, ledger.ids)
    }

    getRecurring(ledgerId: string) {
        const ledger = this.parseLedger(ledgerId)
        const resolver = this.ruleStore.getCategoryResolver(ledgerId, ledger.statements, ledger.ids)
        const definitions = this.ruleStore.getCategoryDefinitions(ledgerId, ledger.statements)
        const settings = this.ruleStore.getRecurringSettings(ledgerId)
        return detectRecurring(ledger.statements, {
            getStatementId: (index) => ledger.ids[index],
        }).map((series) => {
            const categoryCounts = new Map<string, number>()
            for (const occurrence of series.occurrences) {
                const category = resolver(ledger.statements[occurrence.statementIndex], occurrence.statementIndex)
                if (category) categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1)
            }
            const category = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
            const definition = definitions.find((item) => item.category === category)
            return {
                ...series,
                ...(settings.aliases[series.id] ? { alias: settings.aliases[series.id] } : {}),
                reviewStatus: this.ruleStore.getRecurringDecision(ledgerId, series.id) ?? 'pending',
                ...(category ? { category, necessity: definition?.necessity ?? 'unclassified', control: definition?.control ?? 'unclassified' } : {}),
            }
        })
    }

    getRecurringSettings(ledgerId: string) { return this.ruleStore.getRecurringSettings(ledgerId) }

    setRecurringAlias(ledgerId: string, targetId: string, alias: string | undefined, seriesIds: string[]) {
        const currentObservationIds = this.ruleStore.getRecurringSettings(ledgerId).observationIds[targetId]
        const result = this.ruleStore.setRecurringAlias(ledgerId, targetId, alias)
        const scan = this.scanRecurring(ledgerId, seriesIds, alias, currentObservationIds)
        this.ruleStore.setRecurringObservationIds(ledgerId, targetId, scan.includedStatementIds)
        return { ...result, scan }
    }

    createRecurringGroup(ledgerId: string, seriesIds: string[]) {
        const selectedIds = new Set(seriesIds)
        const selected = this.getRecurring(ledgerId).filter((series) => selectedIds.has(series.id))
        if (selected.length !== selectedIds.size) throw new BadRequestException('One or more recurring series are no longer available')
        const first = selected[0]
        if (selected.some((series) => series.direction !== first.direction || series.currency !== first.currency || series.cadence !== first.cadence || series.intervalMonths !== first.intervalMonths)) {
            throw new BadRequestException('Recurring series can only be merged when direction, currency, and cadence match')
        }
        return this.ruleStore.createRecurringGroup(ledgerId, seriesIds)
    }
    deleteRecurringGroup(ledgerId: string, groupId: string) { return this.ruleStore.deleteRecurringGroup(ledgerId, groupId) }

    scanRecurring(ledgerId: string, seriesIds: string[], alias?: string, currentObservationIds?: string[]) {
        const ledger = this.parseLedger(ledgerId)
        const detected = detectRecurring(ledger.statements, { getStatementId: (index) => ledger.ids[index] })
        const memberSeries = detected.filter((series) => seriesIds.includes(series.id))
        const beforeIds = currentObservationIds ?? [...new Set(memberSeries.flatMap((series) => series.occurrences.map((occurrence) => occurrence.statementId)))]
        const memberDirections = new Set(memberSeries.map((series) => series.direction))
        const memberCurrencies = new Set(memberSeries.map((series) => series.currency))
        const cleanAlias = alias?.trim().toLocaleLowerCase()
        const afterIds = cleanAlias
            ? ledger.statements.map((statement, index) => ({ statement, id: ledger.ids[index] })).filter(({ statement }) => {
                const direction = statement.amount != null && statement.amount > 0 ? 'income' : 'expense'
                const currency = statement.currency?.trim() || 'unknown'
                const searchable = [statement.sender, statement.recipient, statement.purpose, statement.text, statement.transaction_type].filter(Boolean).join(' ').toLocaleLowerCase()
                return statement.amount != null && statement.amount !== 0 && memberDirections.has(direction) && memberCurrencies.has(currency) && searchable.includes(cleanAlias)
            }).map(({ id }) => id)
            : beforeIds
        const before = new Set(beforeIds), after = new Set(afterIds)
        return { beforeCount: before.size, afterCount: after.size, addedCount: [...after].filter((id) => !before.has(id)).length, removedCount: [...before].filter((id) => !after.has(id)).length, includedStatementIds: [...after] }
    }

    setRecurringDecision(ledgerId: string, seriesId: string, decision: Parameters<RuleStoreService['setRecurringDecision']>[2]) { return this.ruleStore.setRecurringDecision(ledgerId, seriesId, decision) }
    setManualRecurring(ledgerId: string, statement: string, direction: Parameters<RuleStoreService['setManualRecurring']>[2]) { return this.ruleStore.setManualRecurring(ledgerId, statement, direction) }
    createCategory(ledgerId: string, name: string, necessity: 'necessity' | 'convenience') { return this.ruleStore.createCategory(ledgerId, name, necessity) }
    updateCategory(ledgerId: string, id: string, name: string, necessity: 'necessity' | 'convenience') { return this.ruleStore.updateCategory(ledgerId, id, name, necessity) }
    deleteCategory(ledgerId: string, id: string) { return this.ruleStore.deleteCategory(ledgerId, id) }
    createAlias(ledgerId: string, alias: Parameters<RuleStoreService['createAlias']>[1]) { return this.ruleStore.createAlias(ledgerId, alias) }
    updateAlias(ledgerId: string, id: string, patch: Parameters<RuleStoreService['updateAlias']>[2]) { return this.ruleStore.updateAlias(ledgerId, id, patch) }
    deleteAlias(ledgerId: string, id: string) { return this.ruleStore.deleteAlias(ledgerId, id) }

    getExecutionTypesWithAmounts(ledgerId: string) { return new FinanceAnalyzer(this.parseLedger(ledgerId).statements).getExecutionTypesWithAmounts() }
    getTopSpendingCategoriesForMonth(ledgerId: string, top: number, month: number, year: number) { return new FinanceAnalyzer(this.parseLedger(ledgerId).statements).getTopSpendingCategoriesForMonth(top, month, year) }
    getMostAmountSpentPerWeekday(ledgerId: string) { return new FinanceAnalyzer(this.parseLedger(ledgerId).statements).getMostAmountSpentPerWeekday() }
    getHighestSpendingDay(ledgerId: string) { return new FinanceAnalyzer(this.parseLedger(ledgerId).statements).getHighestSpendingDay() }
}
