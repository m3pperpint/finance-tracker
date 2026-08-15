import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { basename, dirname } from 'path'
import { AliasRule, ClassifiedStatement, ManagedCategory, categoryId, classifyStatement, statementId } from '../core/finance/rule-model.js'
import type { BankStatement, SpendingCategoryDefinition, SpendingNecessity } from '../core/common/common.dto.js'
import type { RecurrenceDirection } from '../core/finance/recurrence-model.js'

export type RecurringDecision = 'confirmed' | 'denied'

interface RuleFile {
    version: 4
    categories: ManagedCategory[]
    aliasesByFile: Record<string, AliasRule[]>
    recurringDecisionsByFile: Record<string, Record<string, RecurringDecision>>
    manualRecurringByFile: Record<string, Record<string, RecurrenceDirection>>
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
                version: 4,
                categories: (parsed.categories ?? []).filter((category) => referenced.has(category.id)),
                aliasesByFile: parsed.aliasesByFile ?? {},
                recurringDecisionsByFile: {},
                manualRecurringByFile: {},
            }
        }
        if (parsed.version !== 3 && parsed.version !== 4) return this.empty()
        return {
            version: 4,
            categories: parsed.categories ?? [],
            aliasesByFile: parsed.aliasesByFile ?? {},
            recurringDecisionsByFile: parsed.recurringDecisionsByFile ?? {},
            manualRecurringByFile: parsed.manualRecurringByFile ?? {},
        }
    }

    private empty(): RuleFile {
        return { version: 4, categories: [], aliasesByFile: {}, recurringDecisionsByFile: {}, manualRecurringByFile: {} }
    }

    private write(data: RuleFile) {
        mkdirSync(dirname(this.path), { recursive: true })
        writeFileSync(this.path, JSON.stringify(data, null, 2))
    }

    ensure(fileName: string, statements: BankStatement[]) {
        const data = this.read()
        const key = basename(fileName)
        if (!data.aliasesByFile['*'] && data.aliasesByFile[key]) {
            data.aliasesByFile['*'] = data.aliasesByFile[key]
            delete data.aliasesByFile[key]
        }
        if (!data.aliasesByFile['*']) data.aliasesByFile['*'] = []
        this.write(data)
        return data
    }

    getRules(fileName: string, statements: BankStatement[]) {
        const data = this.ensure(fileName, statements)
        const aliases = data.aliasesByFile['*'] ?? []
        const classified = statements.map((statement, index) => classifyStatement(statement, statementId(basename(fileName), index), aliases))
        const aliasUsage = new Map<string, number>()
        for (const item of classified) for (const alias of item.matches) aliasUsage.set(alias.id, (aliasUsage.get(alias.id) ?? 0) + 1)
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
                recurringDirection: data.manualRecurringByFile['*']?.[item.id],
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
        }
    }

    setRecurringDecision(fileName: string, seriesId: string, decision: RecurringDecision) {
        const data = this.ensure(fileName, [])
        data.recurringDecisionsByFile['*'] ??= {}
        data.recurringDecisionsByFile['*'][seriesId] = decision
        this.write(data)
        return { seriesId, decision }
    }

    getRecurringDecision(fileName: string, seriesId: string): RecurringDecision | undefined {
        return this.read().recurringDecisionsByFile['*']?.[seriesId]
    }

    setManualRecurring(fileName: string, statement: string, direction: RecurrenceDirection | undefined) {
        const data = this.ensure(fileName, [])
        data.manualRecurringByFile['*'] ??= {}
        if (direction) data.manualRecurringByFile['*'][statement] = direction
        else delete data.manualRecurringByFile['*'][statement]
        this.write(data)
        return { statementId: statement, direction: direction ?? null }
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
        data.aliasesByFile['*'].push(created)
        this.write(data)
        return created
    }

    updateAlias(fileName: string, id: string, patch: Partial<Omit<AliasRule, 'id'>>) {
        const data = this.read()
        const aliases = data.aliasesByFile['*'] ?? []
        const alias = aliases.find((item) => item.id === id)
        if (!alias) throw new NotFoundException('Alias not found')
        if (patch.categoryId && !data.categories.some((category) => category.id === patch.categoryId)) throw new NotFoundException('Category not found')
        Object.assign(alias, patch)
        this.write(data)
        return alias
    }

    deleteAlias(fileName: string, id: string) {
        const data = this.read()
        const aliases = data.aliasesByFile['*'] ?? []
        const index = aliases.findIndex((item) => item.id === id)
        if (index === -1) throw new NotFoundException('Alias not found')
        const [removed] = aliases.splice(index, 1)
        this.write(data)
        return removed
    }

    resolveCategory(fileName: string, statement: BankStatement, index: number): string | undefined {
        const data = this.ensure(fileName, [])
        const aliases = data.aliasesByFile['*'] ?? []
        const result = classifyStatement(statement, statementId(basename(fileName), index), aliases)
        if (result.status !== 'matched') return undefined
        return data.categories.find((category) => category.id === result.matches[0].categoryId)?.name
    }

    getCategoryResolver(fileName: string, statements: BankStatement[]) {
        const data = this.ensure(fileName, statements)
        const aliases = data.aliasesByFile['*'] ?? []
        const names = new Map(data.categories.map((category) => [category.id, category.name]))
        const key = basename(fileName)
        return (statement: BankStatement, index: number) => {
            const result = classifyStatement(statement, statementId(key, index), aliases)
            return result.status === 'matched' ? names.get(result.matches[0].categoryId) : undefined
        }
    }
}
