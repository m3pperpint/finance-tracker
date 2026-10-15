import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { basename, dirname } from 'path'
import { AliasRule, ClassifiedStatement, ManagedCategory, categoryId, classifyStatement, statementId } from '../core/finance/rule-model.js'
import type { BankStatement, SpendingCategoryDefinition, SpendingNecessity } from '../core/common/common.dto.js'
import type { RecurrenceDirection } from '../core/finance/recurrence-model.js'

export type RecurringDecision = 'confirmed' | 'denied'

export interface RecurringMergeGroup {
    id: string
    seriesIds: string[]
}

interface RuleFile {
    version: 5
    categories: ManagedCategory[]
    aliasesByFile: Record<string, AliasRule[]>
    recurringDecisionsByFile: Record<string, Record<string, RecurringDecision>>
    manualRecurringByFile: Record<string, Record<string, RecurrenceDirection>>
    recurringAliasesByFile: Record<string, Record<string, string>>
    recurringGroupsByFile: Record<string, RecurringMergeGroup[]>
    recurringObservationIdsByFile: Record<string, Record<string, string[]>>
    importProfiles: Record<string, Record<string, string>>
    profileByFile: Record<string, string>
}

@Injectable()
export class RuleStoreService {
    private readonly path = process.env.FINANCE_RULES_PATH || './data/finance-rules.json'

    private read(): RuleFile {
        if (!existsSync(this.path)) return this.empty()
        const parsed = JSON.parse(readFileSync(this.path, 'utf8')) as Partial<Omit<RuleFile, 'version'>> & { version?: number }
        if (parsed.version === 2) {
            const aliases = Object.values(parsed.aliasesByFile ?? {}).flat()
            const referenced = new Set(aliases.map((alias) => alias.categoryId))
            return {
                version: 5,
                categories: (parsed.categories ?? []).filter((category) => referenced.has(category.id)),
                aliasesByFile: parsed.aliasesByFile ?? {},
                recurringDecisionsByFile: {},
                manualRecurringByFile: {},
                recurringAliasesByFile: {},
                recurringGroupsByFile: {},
                recurringObservationIdsByFile: {},
                importProfiles: {}, profileByFile: {},
            }
        }
        if (parsed.version !== 3 && parsed.version !== 4 && parsed.version !== 5) return this.empty()
        return {
            version: 5,
            categories: parsed.categories ?? [],
            aliasesByFile: parsed.aliasesByFile ?? {},
            recurringDecisionsByFile: parsed.recurringDecisionsByFile ?? {},
            manualRecurringByFile: parsed.manualRecurringByFile ?? {},
            recurringAliasesByFile: parsed.recurringAliasesByFile ?? {},
            recurringGroupsByFile: parsed.recurringGroupsByFile ?? {},
            recurringObservationIdsByFile: parsed.recurringObservationIdsByFile ?? {},
            importProfiles: parsed.importProfiles ?? {}, profileByFile: parsed.profileByFile ?? {},
        }
    }

    private empty(): RuleFile {
        return { version: 5, categories: [], aliasesByFile: {}, recurringDecisionsByFile: {}, manualRecurringByFile: {}, recurringAliasesByFile: {}, recurringGroupsByFile: {}, recurringObservationIdsByFile: {}, importProfiles: {}, profileByFile: {} }
    }

    getImportProfiles() { return this.read().importProfiles }

    saveImportProfile(name: string, mappings: Record<string, string>, fileName?: string) {
        const data = this.read(), key = name.trim()
        if (!key) throw new ConflictException('Profile name is required')
        data.importProfiles[key] = mappings
        if (fileName) data.profileByFile[basename(fileName)] = key
        this.write(data)
        return { name: key, mappings }
    }

    private ledgerKey(ledgerId: string) { return `ledger:${ledgerId}` }

    private aliasKey(data: RuleFile, ledgerId: string) { return this.ledgerKey(ledgerId) }

    initializeLedger(ledgerId: string, legacyFiles: string[], importProfile?: string) {
        const data = this.read(), key = this.ledgerKey(ledgerId)
        let changed = false
        if (!data.aliasesByFile[key]) {
            const candidates = legacyFiles.flatMap((file) => {
                const oldProfile = data.profileByFile[basename(file)]
                return [data.aliasesByFile[basename(file)], oldProfile ? data.aliasesByFile[`profile:${oldProfile}`] : undefined].filter((items): items is AliasRule[] => Boolean(items))
            })
            const inherited = candidates.length
                ? candidates.flat()
                : importProfile
                  ? data.aliasesByFile[`profile:${importProfile}`] ?? []
                  : legacyFiles.length ? data.aliasesByFile['*'] ?? [] : []
            data.aliasesByFile[key] = [...new Map(inherited.map((alias) => [alias.id, alias])).values()]
            changed = true
        }
        for (const collection of [data.recurringDecisionsByFile, data.manualRecurringByFile, data.recurringAliasesByFile, data.recurringObservationIdsByFile]) {
            if (!collection[key]) { collection[key] = {}; changed = true }
        }
        if (!data.recurringGroupsByFile[key]) { data.recurringGroupsByFile[key] = []; changed = true }
        if (changed) this.write(data)
    }

    private write(data: RuleFile) {
        mkdirSync(dirname(this.path), { recursive: true })
        writeFileSync(this.path, JSON.stringify(data, null, 2))
    }

    ensure(fileName: string, statements: BankStatement[]) {
        const data = this.read()
        const key = this.aliasKey(data, fileName)
        if (!data.aliasesByFile[key]) data.aliasesByFile[key] = data.aliasesByFile['*'] ?? []
        this.write(data)
        return data
    }

    getRules(fileName: string, statements: BankStatement[], statementIds: string[] = statements.map((_, index) => statementId(fileName, index))) {
        const data = this.ensure(fileName, statements)
        const aliases = data.aliasesByFile[this.aliasKey(data, fileName)] ?? []
        const classified = statements.map((statement, index) => classifyStatement(statement, statementIds[index], aliases))
        const aliasUsage = new Map<string, number>()
        for (const item of classified) for (const alias of item.matches) aliasUsage.set(alias.id, (aliasUsage.get(alias.id) ?? 0) + 1)
        const expenses = statements.filter((statement) => statement.amount != null && statement.amount < 0)
        const keywordCounts = new Map<string, number>()
        for (const statement of expenses) {
            const words = new Set([statement.sender, statement.recipient, statement.text, statement.purpose]
                .filter((value): value is string => Boolean(value))
                .flatMap((value) => value.toLocaleLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}&.'-]{2,}/gu) ?? [])
                .filter((word) => !['payment', 'card', 'debit', 'credit', 'lastschrift', 'zahlung', 'gmbh', 'europa', 'europe'].includes(word)))
            for (const word of words) keywordCounts.set(word, (keywordCounts.get(word) ?? 0) + 1)
        }
        return {
            categories: data.categories.map((category) => ({ ...category, aliasCount: aliases.filter((alias) => alias.categoryId === category.id).length })),
            aliases,
            statements: [...classified].sort((a, b) => (b.statement.date?.getTime() ?? 0) - (a.statement.date?.getTime() ?? 0)).map((item) => ({
                id: item.id,
                date: item.statement.date?.toISOString(),
                dateExecuted: item.statement.date_executed?.toISOString(),
                text: item.statement.text ?? '',
                transactionType: item.statement.transaction_type ?? '',
                amount: item.statement.amount ?? null,
                currency: item.statement.currency ?? '',
                sourceCategory: item.statement.category ?? '',
                sender: item.statement.sender ?? '',
                recipient: item.statement.recipient ?? '',
                purpose: item.statement.purpose ?? '',
                bankNumberOwner: item.statement.bank_number_owner ?? '',
                status: item.status,
                recurringDirection: data.manualRecurringByFile[this.ledgerKey(fileName)]?.[item.id] ?? data.manualRecurringByFile['*']?.[item.id],
                matches: item.matches.map((alias) => ({ id: alias.id, value: alias.value, categoryId: alias.categoryId })),
                suggestions: item.status === 'conflict' ? [
                    { kind: 'transaction-type', label: `Keep one match for ${item.statement.transaction_type || 'this transaction type'}` },
                    { kind: 'statement-id', label: 'Pin an alias to this statement only' },
                ] : [],
            })),
            stats: {
                total: statements.length,
                matched: classified.filter((item) => item.status === 'matched').length,
                unmatched: classified.filter((item) => item.status === 'unmatched').length,
                conflicts: classified.filter((item) => item.status === 'conflict').length,
            },
            aliasUsage: Object.fromEntries(aliasUsage),
            keywordSuggestions: [...keywordCounts.entries()].filter(([, count]) => count >= 2).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([value, count]) => ({ value, count, share: count / Math.max(expenses.length, 1) })),
        }
    }

    setRecurringDecision(fileName: string, seriesId: string, decision: RecurringDecision) {
        const data = this.ensure(fileName, [])
        const key = this.ledgerKey(fileName)
        data.recurringDecisionsByFile[key] ??= {}
        data.recurringDecisionsByFile[key][seriesId] = decision
        this.write(data)
        return { seriesId, decision }
    }

    getRecurringDecision(fileName: string, seriesId: string): RecurringDecision | undefined {
        const data = this.read()
        return data.recurringDecisionsByFile[this.ledgerKey(fileName)]?.[seriesId] ?? data.recurringDecisionsByFile['*']?.[seriesId]
    }

    setManualRecurring(fileName: string, statement: string, direction: RecurrenceDirection | undefined) {
        const data = this.ensure(fileName, [])
        const key = this.ledgerKey(fileName)
        data.manualRecurringByFile[key] ??= {}
        if (direction) data.manualRecurringByFile[key][statement] = direction
        else delete data.manualRecurringByFile[key][statement]
        this.write(data)
        return { statementId: statement, direction: direction ?? null }
    }

    getRecurringSettings(fileName: string) {
        const data = this.ensure(fileName, [])
        return {
            aliases: data.recurringAliasesByFile[this.ledgerKey(fileName)] ?? data.recurringAliasesByFile['*'] ?? {},
            groups: data.recurringGroupsByFile[this.ledgerKey(fileName)] ?? data.recurringGroupsByFile['*'] ?? [],
            observationIds: data.recurringObservationIdsByFile[this.ledgerKey(fileName)] ?? data.recurringObservationIdsByFile['*'] ?? {},
        }
    }

    setRecurringAlias(fileName: string, targetId: string, alias: string | undefined) {
        const data = this.ensure(fileName, [])
        const key = this.ledgerKey(fileName)
        data.recurringAliasesByFile[key] ??= {}
        if (alias) data.recurringAliasesByFile[key][targetId] = alias
        else delete data.recurringAliasesByFile[key][targetId]
        this.write(data)
        return { targetId, alias: alias ?? null }
    }

    setRecurringObservationIds(fileName: string, targetId: string, observationIds: string[]) {
        const data = this.ensure(fileName, [])
        const key = this.ledgerKey(fileName)
        data.recurringObservationIdsByFile[key] ??= {}
        data.recurringObservationIdsByFile[key][targetId] = observationIds
        this.write(data)
    }

    createRecurringGroup(fileName: string, seriesIds: string[]) {
        const data = this.ensure(fileName, [])
        const key = this.ledgerKey(fileName)
        const existing = data.recurringGroupsByFile[key] ?? []
        const ids = [...new Set(seriesIds)]
        if (ids.length < 2) throw new ConflictException('Select at least two recurring series to merge')
        if (ids.some((id) => existing.some((group) => group.seriesIds.includes(id)))) throw new ConflictException('A recurring series is already part of a merged payment')
        const group = { id: `recurring-group-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, seriesIds: ids }
        existing.push(group)
        data.recurringGroupsByFile[key] = existing
        this.write(data)
        return group
    }

    deleteRecurringGroup(fileName: string, groupId: string) {
        const data = this.ensure(fileName, [])
        const key = this.ledgerKey(fileName)
        const groups = data.recurringGroupsByFile[key] ?? []
        const index = groups.findIndex((group) => group.id === groupId)
        if (index === -1) throw new NotFoundException('Recurring group not found')
        const [removed] = groups.splice(index, 1)
        delete data.recurringAliasesByFile[key]?.[groupId]
        delete data.recurringObservationIdsByFile[key]?.[groupId]
        this.write(data)
        return removed
    }

    getCategoryDefinitions(fileName: string, statements: BankStatement[]): SpendingCategoryDefinition[] {
        const data = this.ensure(fileName, statements)
        return data.categories.map((category) => ({
            category: category.name,
            description: category.description,
            necessity: category.necessity,
            control: category.necessity === 'necessity' ? 'committed' as const : 'influenceable' as const,
            pricePattern: 'variable' as const,
        })).sort((a, b) => a.category.localeCompare(b.category))
    }

    createCategory(name: string, necessity: Exclude<SpendingNecessity, 'unclassified'>) {
        const data = this.read()
        const clean = name.trim()
        if (!clean) throw new ConflictException('Category name is required')
        const id = categoryId(clean)
        if (data.categories.some((category) => category.id === id)) throw new ConflictException('Category already exists')
        data.categories.push({ id, name: clean, necessity, description: 'Custom spending category.' })
        this.write(data)
        return data.categories.at(-1)
    }

    updateCategory(id: string, name: string, necessity: Exclude<SpendingNecessity, 'unclassified'>) {
        const data = this.read()
        const category = data.categories.find((item) => item.id === id)
        if (!category) throw new NotFoundException('Category not found')
        const clean = name.trim()
        const nextId = categoryId(clean)
        if (!clean) throw new ConflictException('Category name is required')
        if (nextId !== id && data.categories.some((item) => item.id === nextId)) throw new ConflictException('Category already exists')
        category.name = clean
        category.necessity = necessity
        if (nextId !== id) {
            category.id = nextId
            for (const aliases of Object.values(data.aliasesByFile)) for (const alias of aliases) if (alias.categoryId === id) alias.categoryId = nextId
        }
        this.write(data)
        return category
    }

    deleteCategory(id: string) {
        const data = this.read()
        if (Object.values(data.aliasesByFile).some((aliases) => aliases.some((alias) => alias.categoryId === id))) throw new ConflictException('Remove or reassign this category’s aliases first')
        const index = data.categories.findIndex((category) => category.id === id)
        if (index === -1) throw new NotFoundException('Category not found')
        const [removed] = data.categories.splice(index, 1)
        this.write(data)
        return removed
    }

    createAlias(fileName: string, alias: Omit<AliasRule, 'id'>) {
        const data = this.ensure(fileName, [])
        if (!data.categories.some((category) => category.id === alias.categoryId)) throw new NotFoundException('Category not found')
        const created = { ...alias, id: `alias-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }
        const key = this.aliasKey(data, fileName)
        data.aliasesByFile[key] ??= []
        data.aliasesByFile[key].push(created)
        this.write(data)
        return created
    }

    updateAlias(fileName: string, id: string, patch: Partial<Omit<AliasRule, 'id'>>) {
        const data = this.read()
        const aliases = data.aliasesByFile[this.aliasKey(data, fileName)] ?? []
        const alias = aliases.find((item) => item.id === id)
        if (!alias) throw new NotFoundException('Alias not found')
        if (patch.categoryId && !data.categories.some((category) => category.id === patch.categoryId)) throw new NotFoundException('Category not found')
        Object.assign(alias, patch)
        this.write(data)
        return alias
    }

    deleteAlias(fileName: string, id: string) {
        const data = this.read()
        const aliases = data.aliasesByFile[this.aliasKey(data, fileName)] ?? []
        const index = aliases.findIndex((item) => item.id === id)
        if (index === -1) throw new NotFoundException('Alias not found')
        const [removed] = aliases.splice(index, 1)
        this.write(data)
        return removed
    }

    resolveCategory(fileName: string, statement: BankStatement, index: number): string | undefined {
        const data = this.ensure(fileName, [])
        const aliases = data.aliasesByFile[this.aliasKey(data, fileName)] ?? []
        const result = classifyStatement(statement, statementId(fileName, index), aliases)
        if (result.status !== 'matched') return undefined
        return data.categories.find((category) => category.id === result.matches[0].categoryId)?.name
    }

    getCategoryResolver(fileName: string, statements: BankStatement[], statementIds: string[] = statements.map((_, index) => statementId(fileName, index))) {
        const data = this.ensure(fileName, statements)
        const aliases = data.aliasesByFile[this.aliasKey(data, fileName)] ?? []
        const names = new Map(data.categories.map((category) => [category.id, category.name]))
        return (statement: BankStatement, index: number) => {
            const result = classifyStatement(statement, statementIds[index], aliases)
            return result.status === 'matched' ? names.get(result.matches[0].categoryId) : undefined
        }
    }
}
