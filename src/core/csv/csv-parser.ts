import { readFileSync, writeFileSync } from 'fs'

const knownHeaders: Record<string, string> = {
    Buchungstag: 'date',
    Wertstellung: 'date_executed',
    Umsatzart: 'transaction_type',
    Buchungstext: 'text',
    Betrag: 'amount',
    Währung: 'currency',
    'IBAN Kontoinhaber': 'bank_number_owner',
    Kategorie: 'category',
    Sender: 'sender',
    Empfänger: 'recipient',
    Empfaenger: 'recipient',
    Verwendungszweck: 'purpose',
    date: 'date',
    'transaction date': 'date',
    'booking date': 'date',
    'value date': 'date_executed',
    'transaction type': 'transaction_type',
    type: 'transaction_type',
    description: 'text',
    'transaction description': 'text',
    amount: 'amount',
    currency: 'currency',
    category: 'category',
    sender: 'sender',
    recipient: 'recipient',
    payee: 'recipient',
    payer: 'sender',
    purpose: 'purpose',
}

/**
 * CsvParser is a generic CSV utility for reading, parsing,
 * and optionally remapping headers of CSV files.
 */
export class CsvParser {
    /**
     * Overrides the headers of a CSV file according to the input mapping.
     * Updates the file in place.
     *
     * @param fileName - Path to the CSV file.
     * @param columnMapping - Object mapping original column names to new field names.
     */
    overrideCsvColumnNames(
        fileName: string,
        columnMapping: Record<string, string>
    ): void {
        const rows = this.readCsvText(fileName).split(/\r?\n/)
        const delimiter = this.detectDelimiter(rows[0] ?? '')
        const headers = this.parseRecords(rows[0] ?? '', delimiter)[0] ?? []

        const updatedHeaders = headers.map((header) =>
            this.getMappedHeader(header, columnMapping)
        )

        rows[0] = updatedHeaders.join(delimiter)
        writeFileSync(fileName, rows.join('\r\n'), 'utf-8')
    }

    /**
     * Parses a CSV file into an array of objects.
     * Each row is represented as a key-value object using headers as keys.
     *
     * @param fileName - Path to the CSV file.
     * @returns Array of objects representing CSV rows.
     */
    parseCSVData(fileName: string, columnMapping: Record<string, string> = {}): Record<string, string>[] {
        const content = this.readCsvText(fileName)
        const delimiter = this.detectDelimiter(content)
        const [rawHeaders = [], ...rows] = this.parseRecords(content, delimiter)
        const headers = rawHeaders.map((header) => this.getMappedHeader(header, columnMapping))
        return rows.filter((row) => row.some((cell) => cell.trim())).map((row) =>
            Object.fromEntries(headers.flatMap((header, index) => row[index] === undefined ? [] : [[header, row[index].trim()]]))
        )
    }

    private readCsvText(fileName: string): string {
        const buffer = readFileSync(fileName)
        if (buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.toString('utf16le', 2)
        if (buffer[0] === 0xfe && buffer[1] === 0xff) {
            const swapped = Buffer.from(buffer.subarray(2))
            for (let i = 0; i + 1 < swapped.length; i += 2) [swapped[i], swapped[i + 1]] = [swapped[i + 1], swapped[i]]
            return swapped.toString('utf16le')
        }
        return buffer.toString('utf8').replace(/^\uFEFF/, '')
    }

    /**
     * Parses a single CSV row into an object.
     * Returns null if the row is empty.
     *
     * @param row - CSV row string
     * @param headers - Array of header names
     */
    private detectDelimiter(content: string): string {
        const firstLine = content.split(/\r?\n/, 1)[0] ?? ''
        return [';', ',', '\t'].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0]
    }

    private parseRecords(content: string, delimiter: string): string[][] {
        const records: string[][] = []
        let row: string[] = [], cell = '', quoted = false
        for (let i = 0; i < content.length; i++) {
            const char = content[i]
            if (char === '"') {
                if (quoted && content[i + 1] === '"') { cell += '"'; i++ }
                else quoted = !quoted
            } else if (!quoted && char === delimiter) { row.push(cell); cell = '' }
            else if (!quoted && (char === '\n' || char === '\r')) {
                if (char === '\r' && content[i + 1] === '\n') i++
                row.push(cell); records.push(row); row = []; cell = ''
            } else cell += char
        }
        row.push(cell)
        if (row.some((value) => value.length) || records.length === 0) records.push(row)
        return records
    }

    /**
     * Maps a header value to a new field name if provided in mapping.
     *
     * @param header - Original CSV header
     * @param columnMapping - Object mapping original names to new names
     */
    private getMappedHeader(
        header: string,
        columnMapping: Record<string, string>
    ): string {
        const trimmed = header.trim()
        return (
            Object.entries(columnMapping).find(
                ([, mapped]) => mapped?.trim() === trimmed
            )?.[0] ?? this.normalizeHeader(header)
        )
    }

    private normalizeHeader(header: string): string {
        const clean = header.replace(/^\uFEFF/, '').trim()
        const known = Object.entries(knownHeaders).find(([name]) => name.toLocaleLowerCase() === clean.toLocaleLowerCase())?.[1]
        return known ?? clean
    }
}
