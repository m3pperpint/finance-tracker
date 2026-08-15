import { Injectable } from '@nestjs/common'
import { FinanceAnalyzer, BankStatement, FinanceScope } from '../core'
import { CsvParserService } from '../csv-parser/csv-parser.service'
import { mapRowToBankStatement } from '../core/common/helpers/finance-mapping.helper'
import { detectRecurring } from '../core/finance/recurrence-analyzer.js'
import { statementId } from '../core/finance/rule-model.js'
import { basename } from 'path'
import { RuleStoreService } from './rule-store.service.js'

@Injectable()
export class FinanceService {
    constructor(
        private readonly csvParser: CsvParserService,
        private readonly ruleStore: RuleStoreService
    ) {}

    private parseFile(file: string): BankStatement[] {
        const rows = this.csvParser.parseCSVData(file)
        return rows.map(mapRowToBankStatement)
    }

    getDashboard(file: string, scope: FinanceScope, top: number) {
        const statements = this.parseFile(file)
        const fileName = basename(file)
        const configuredDefinitions = this.ruleStore.getCategoryDefinitions(fileName, statements)
        return new FinanceAnalyzer(
            statements,
            this.ruleStore.getCategoryResolver(fileName, statements),
            () => configuredDefinitions,
            (category) => configuredDefinitions.find((definition) => definition.category === category) ?? {
                category,
                description: 'This transaction does not have a matching configured category.',
                necessity: 'unclassified',
                control: 'influenceable',
                pricePattern: 'variable',
            }
        ).getDashboard(scope, top)
    }

    getRules(file: string) {
        const statements = this.parseFile(file)
        return this.ruleStore.getRules(basename(file), statements)
    }

    getRecurring(file: string) {
        const statements = this.parseFile(file)
        const fileName = basename(file)
        const resolver = this.ruleStore.getCategoryResolver(fileName, statements)
        const definitions = this.ruleStore.getCategoryDefinitions(fileName, statements)
        const settings = this.ruleStore.getRecurringSettings(fileName)
        return detectRecurring(statements, {
            getStatementId: (index) => statementId(fileName, index),
        }).map((series) => {
            const categoryCounts = new Map<string, number>()
            for (const occurrence of series.occurrences) {
                const category = resolver(statements[occurrence.statementIndex], occurrence.statementIndex)
                if (category) categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1)
            }
            const category = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
            const definition = definitions.find((item) => item.category === category)
            return {
                ...series,
                ...(settings.aliases[series.id] ? { alias: settings.aliases[series.id] } : {}),
                reviewStatus: this.ruleStore.getRecurringDecision(fileName, series.id) ?? 'pending',
                ...(category ? {
                    category,
                    necessity: definition?.necessity ?? 'unclassified',
                    control: definition?.control ?? 'unclassified',
                } : {}),
            }
        })
    }

    getRecurringSettings(file: string) {
        return this.ruleStore.getRecurringSettings(basename(file))
    }

    setRecurringAlias(file: string, targetId: string, alias: string | undefined, seriesIds: string[]) {
        const fileName = basename(file)
        const currentObservationIds = this.ruleStore.getRecurringSettings(fileName).observationIds[targetId]
        const result = this.ruleStore.setRecurringAlias(fileName, targetId, alias)
        const scan = this.scanRecurring(file, seriesIds, alias, currentObservationIds)
        this.ruleStore.setRecurringObservationIds(fileName, targetId, scan.includedStatementIds)
        return { ...result, scan }
    }

    createRecurringGroup(file: string, seriesIds: string[]) {
        return this.ruleStore.createRecurringGroup(basename(file), seriesIds)
    }

    deleteRecurringGroup(file: string, groupId: string) {
        return this.ruleStore.deleteRecurringGroup(basename(file), groupId)
    }

    scanRecurring(file: string, seriesIds: string[], alias?: string, currentObservationIds?: string[]) {
        const statements = this.parseFile(file)
        const fileName = basename(file)
        const detected = detectRecurring(statements, { getStatementId: (index) => statementId(fileName, index) })
        const memberSeries = detected.filter((series) => seriesIds.includes(series.id))
        const beforeIds = currentObservationIds ?? [...new Set(memberSeries.flatMap((series) => series.occurrences.map((occurrence) => occurrence.statementId)))]
        const memberDirections = new Set(memberSeries.map((series) => series.direction))
        const memberCurrencies = new Set(memberSeries.map((series) => series.currency))
        const cleanAlias = alias?.trim().toLocaleLowerCase()
        const afterIds = cleanAlias
            ? statements.map((statement, index) => ({ statement, id: statementId(fileName, index) })).filter(({ statement }) => {
                const direction = statement.amount != null && statement.amount > 0 ? 'income' : 'expense'
                const currency = statement.currency?.trim() || 'unknown'
                const searchable = [statement.sender, statement.recipient, statement.purpose, statement.text, statement.transaction_type].filter(Boolean).join(' ').toLocaleLowerCase()
                return statement.amount != null && statement.amount !== 0 && memberDirections.has(direction) && memberCurrencies.has(currency) && searchable.includes(cleanAlias)
            }).map(({ id }) => id)
            : beforeIds
        const before = new Set(beforeIds)
        const after = new Set(afterIds)
        return {
            beforeCount: before.size,
            afterCount: after.size,
            addedCount: [...after].filter((id) => !before.has(id)).length,
            removedCount: [...before].filter((id) => !after.has(id)).length,
            includedStatementIds: [...after],
        }
    }

    setRecurringDecision(file: string, seriesId: string, decision: Parameters<RuleStoreService['setRecurringDecision']>[2]) {
        return this.ruleStore.setRecurringDecision(basename(file), seriesId, decision)
    }

    setManualRecurring(file: string, statementIdValue: string, direction: Parameters<RuleStoreService['setManualRecurring']>[2]) {
        return this.ruleStore.setManualRecurring(basename(file), statementIdValue, direction)
    }

    createCategory(name: string, necessity: 'necessity' | 'convenience') {
        return this.ruleStore.createCategory(name, necessity)
    }

    updateCategory(id: string, name: string, necessity: 'necessity' | 'convenience') {
        return this.ruleStore.updateCategory(id, name, necessity)
    }

    deleteCategory(id: string) {
        return this.ruleStore.deleteCategory(id)
    }

    createAlias(file: string, alias: Parameters<RuleStoreService['createAlias']>[1]) {
        return this.ruleStore.createAlias(basename(file), alias)
    }

    updateAlias(file: string, id: string, patch: Parameters<RuleStoreService['updateAlias']>[2]) {
        return this.ruleStore.updateAlias(basename(file), id, patch)
    }

    deleteAlias(file: string, id: string) {
        return this.ruleStore.deleteAlias(basename(file), id)
    }

    getExecutionTypesWithAmounts(file: string) {
        const statements = this.parseFile(file)
        const analyzer = new FinanceAnalyzer(statements)
        return analyzer.getExecutionTypesWithAmounts()
    }

    getTopSpendingCategoriesForMonth(
        file: string,
        top: number,
        month: number,
        year: number
    ) {
        const statements = this.parseFile(file)
        const analyzer = new FinanceAnalyzer(statements)
        return analyzer.getTopSpendingCategoriesForMonth(top, month, year)
    }

    getMostAmountSpentPerWeekday(file: string) {
        const statements = this.parseFile(file)
        const analyzer = new FinanceAnalyzer(statements)
        return analyzer.getMostAmountSpentPerWeekday()
    }

    getHighestSpendingDay(file: string) {
        const statements = this.parseFile(file)
        const analyzer = new FinanceAnalyzer(statements)
        return analyzer.getHighestSpendingDay()
    }
}
