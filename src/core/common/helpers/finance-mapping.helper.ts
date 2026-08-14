import { BankStatement } from '../common.dto'
import { parseDate } from './date.helper'

/**
 * Maps a generic CSV row to a BankStatement.
 */
export function mapRowToBankStatement(
    row: Record<string, string>
): BankStatement {
    const statement: BankStatement = {}

    if (row.date) {
        const parsed = parseDate(row.date)
        if (parsed) statement.date = parsed
    }

    if (row.date_executed) {
        const parsed = parseDate(row.date_executed)
        if (parsed) statement.date_executed = parsed
    }

    if (row.amount) {
        const parsed = parseAmount(row.amount)
        if (!isNaN(parsed)) statement.amount = parsed
    }

    if (row.transaction_type) statement.transaction_type = row.transaction_type
    if (row.text) statement.text = row.text
    if (row.currency) statement.currency = row.currency
    if (row.bank_number_owner)
        statement.bank_number_owner = row.bank_number_owner
    if (row.category) statement.category = row.category
    if (row.sender) statement.sender = row.sender
    if (row.recipient) statement.recipient = row.recipient
    if (row.purpose) statement.purpose = row.purpose

    return statement
}

function parseAmount(value: string): number {
    const normalized = value.trim().replace(/\s/g, '')
    const decimalSeparator = normalized.lastIndexOf(',') > normalized.lastIndexOf('.')
        ? ','
        : '.'
    const thousandsSeparator = decimalSeparator === ',' ? '.' : ','

    return Number(
        normalized
            .replaceAll(thousandsSeparator, '')
            .replace(decimalSeparator, '.')
    )
}
