import { classifyStatement } from './rule-model.js'

describe('classifyStatement', () => {
    const statement = { text: 'Rent Apartment', transaction_type: 'SEPA Debit', amount: -950, category: 'Rent' }

    it('distinguishes one match, no match, and overlap', () => {
        expect(classifyStatement(statement, 'file:2', [{ id: 'rent', value: 'Rent', categoryId: 'housing', field: 'category' }]).status).toBe('matched')
        expect(classifyStatement(statement, 'file:2', []).status).toBe('unmatched')
        expect(classifyStatement(statement, 'file:2', [
            { id: 'rent', value: 'Rent', categoryId: 'housing', field: 'category' },
            { id: 'text', value: 'Rent Apartment', categoryId: 'housing', field: 'text' },
        ]).status).toBe('conflict')
    })

    it('supports pinning a statement while keeping the other rule reusable', () => {
        expect(classifyStatement(statement, 'file:2', [
            { id: 'pinned', value: 'Rent Apartment', categoryId: 'housing', field: 'text', statementId: 'file:2' },
            { id: 'other', value: 'Rent', categoryId: 'housing', field: 'category', excludedStatementIds: ['file:2'] },
        ]).status).toBe('matched')
    })

    it('matches imported statement details but ignores the source category for any-field rules', () => {
        const detailed = {
            text: 'Card payment',
            category: 'Groceries',
            sender: 'REWE Markt',
            recipient: 'Household account',
            purpose: 'Weekly shop',
        }

        expect(classifyStatement(detailed, 'file:3', [
            { id: 'merchant', value: 'REWE', categoryId: 'groceries', field: 'any' },
        ]).status).toBe('matched')
        expect(classifyStatement(detailed, 'file:3', [
            { id: 'source-category', value: 'Groceries', categoryId: 'groceries', field: 'any' },
        ]).status).toBe('unmatched')
    })
})
