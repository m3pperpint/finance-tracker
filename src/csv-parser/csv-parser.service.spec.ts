import { join } from 'path'
import { CsvParser } from '../core/csv/csv-parser'
import { mapRowToBankStatement } from '../core/common/helpers/finance-mapping.helper'

describe('CsvParser', () => {
    it('parses the German bank export used by the app', () => {
        const file = join(
            process.cwd(),
            'data',
            'uploads',
            'csv',
            '15aug2024_15aug_2026.csv'
        )
        const [row] = new CsvParser().parseCSVData(file)
        const statement = mapRowToBankStatement(row)

        expect(statement.date?.getFullYear()).toBe(2026)
        expect(statement.amount).toBeCloseTo(-7.95)
        expect(statement.category).toBe('Online- & Einzelhandel')
        expect(statement.sender).toBeUndefined()
        expect(statement.recipient).toBe('PayPal Europe S.a.r.l. et Cie S.C.A')
        expect(statement.purpose).toContain('Valve Corporation')
    })
})
