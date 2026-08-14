import type { BankStatement, SpendingNecessity } from '../common/common.dto.js'

export interface ManagedCategory {
    id: string
    name: string
    necessity: Exclude<SpendingNecessity, 'unclassified'>
    description: string
}

export interface AliasRule {
    id: string
    value: string
    categoryId: string
    field: 'any' | 'text' | 'transaction_type' | 'category'
    transactionType?: string
    statementId?: string
    excludedStatementIds?: string[]
}

export interface ClassifiedStatement {
    id: string
    statement: BankStatement
    matches: AliasRule[]
    status: 'matched' | 'unmatched' | 'conflict'
}

export function categoryId(name: string): string {
    return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function statementId(fileName: string, index: number): string {
    return `${fileName}:${index + 1}`
}

export function searchableStatement(statement: BankStatement): string {
    return [
        statement.date?.toISOString(),
        statement.date_executed?.toISOString(),
        statement.transaction_type,
        statement.text,
        statement.amount,
        statement.currency,
        statement.bank_number_owner,
        statement.sender,
        statement.recipient,
        statement.purpose,
    ].filter((value) => value != null).join(' ').toLocaleLowerCase()
}

export function classifyStatement(statement: BankStatement, id: string, aliases: AliasRule[]): ClassifiedStatement {
    const searchable = searchableStatement(statement)
    const matches = aliases.filter((alias) => {
        if (alias.statementId && alias.statementId !== id) return false
        if (alias.excludedStatementIds?.includes(id)) return false
        if (alias.transactionType && alias.transactionType.toLocaleLowerCase() !== statement.transaction_type?.toLocaleLowerCase()) return false
        const value = alias.value.trim().toLocaleLowerCase()
        if (!value) return false
        if (alias.field === 'text') return statement.text?.toLocaleLowerCase().includes(value) ?? false
        if (alias.field === 'transaction_type') return statement.transaction_type?.toLocaleLowerCase().includes(value) ?? false
        if (alias.field === 'category') return statement.category?.toLocaleLowerCase().includes(value) ?? false
        return searchable.includes(value)
    })

    return { id, statement, matches, status: matches.length === 1 ? 'matched' : matches.length === 0 ? 'unmatched' : 'conflict' }
}
