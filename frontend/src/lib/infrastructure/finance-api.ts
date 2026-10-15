import type { DashboardQuery, DashboardSnapshot, RecurringSeries, RecurringReviewStatus, RecurrenceDirection, RecurringSettings, RecurringObservationScan } from '../domain/finance'
import type { FinanceGateway } from '../application/load-dashboard'

const DEFAULT_API_BASE_URL = 'http://localhost:3000'

export interface LedgerInfo {
    id: string
    name: string
    importProfile?: string
    sources: { id: string; originalName: string; importedAt: string }[]
}

export class FinanceApi implements FinanceGateway {
    private readonly baseUrl = (
        import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL
    ).replace(/\/$/, '')

    async loadDashboard(query: DashboardQuery): Promise<DashboardSnapshot> {
        const file = encodeURIComponent(query.ledgerId)
        const params = new URLSearchParams({
            mode: query.scope.mode,
            top: String(query.top),
        })
        if (query.scope.mode === 'month') {
            params.set('month', String(query.scope.month))
            params.set('year', String(query.scope.year))
        }
        if (query.scope.mode === 'year') {
            params.set('year', String(query.scope.year))
        }
        if (query.scope.mode === 'range') {
            params.set('from', query.scope.from)
            params.set('to', query.scope.to)
        }

        return this.get<DashboardSnapshot>(
            `/finance/dashboard/${file}?${params.toString()}`
        )
    }

    async getRecurring(ledgerId: string): Promise<RecurringSeries[]> {
        return this.get<RecurringSeries[]>(`/finance/recurring/${encodeURIComponent(ledgerId)}`)
    }

    async getRecurringSettings(ledgerId: string): Promise<RecurringSettings> {
        return this.get<RecurringSettings>(`/finance/recurring/${encodeURIComponent(ledgerId)}/settings`)
    }

    async saveRecurringAlias(ledgerId: string, targetId: string, seriesIds: string[], alias: string): Promise<{ targetId: string; alias: string | null; scan: RecurringObservationScan }> {
        return this.send(`/finance/recurring/${encodeURIComponent(ledgerId)}/aliases/${encodeURIComponent(targetId)}`, 'PUT', { seriesIds, alias })
    }

    async createRecurringGroup(ledgerId: string, seriesIds: string[]) {
        return this.send(`/finance/recurring/${encodeURIComponent(ledgerId)}/groups`, 'POST', { seriesIds })
    }

    async deleteRecurringGroup(ledgerId: string, groupId: string) {
        return this.send(`/finance/recurring/${encodeURIComponent(ledgerId)}/groups/${encodeURIComponent(groupId)}`, 'DELETE')
    }

    async setRecurringDecision(ledgerId: string, seriesId: string, decision: Exclude<RecurringReviewStatus, 'pending'>) {
        return this.send(`/finance/recurring/${encodeURIComponent(ledgerId)}/decisions/${encodeURIComponent(seriesId)}`, 'PUT', { decision })
    }

    async setRecurringEndDate(ledgerId: string, seriesId: string, endedAt: string | null) {
        return this.send(`/finance/recurring/${encodeURIComponent(ledgerId)}/ends/${encodeURIComponent(seriesId)}`, 'PUT', { endedAt })
    }

    async setManualRecurring(ledgerId: string, statementId: string, direction: RecurrenceDirection | null) {
        return this.send(`/finance/recurring/${encodeURIComponent(ledgerId)}/statements/${encodeURIComponent(statementId)}`, 'PUT', { direction })
    }

    async getLedgers(): Promise<{ ledgers: LedgerInfo[]; unassignedFiles: string[] }> {
        return this.get('/finance/ledgers')
    }

    async createLedger(name: string, files: string[], importProfile?: string, rulesTemplate: 'generic' | 'scratch' = 'scratch'): Promise<LedgerInfo> {
        return this.send('/finance/ledgers', 'POST', { name, files, importProfile, rulesTemplate })
    }

    async applyGenericRulesTemplate(ledgerId: string) {
        return this.send(`/finance/ledgers/${encodeURIComponent(ledgerId)}/rules/template`, 'POST')
    }

    async uploadStatement(file: File, columnMappings: Record<string, string>, ledgerId: string): Promise<{ ledgerId: string; sourceId: string }> {
        const body = new FormData()
        body.append('file', file)
        body.append('columnMappings', JSON.stringify(columnMappings))
        body.append('ledgerId', ledgerId)

        const response = await fetch(`${this.baseUrl}/finance/upload`, {
            method: 'POST',
            body,
        })

        if (!response.ok) {
            throw new Error(`Upload failed (${response.status})`)
        }

        const result = (await response.json()) as { ledgerId?: string; sourceId?: string }
        if (!result.ledgerId || !result.sourceId) throw new Error('The API did not return the saved statement source')
        return { ledgerId: result.ledgerId, sourceId: result.sourceId }
    }

    async getImportProfiles(): Promise<Record<string, Record<string, string>>> {
        return this.get('/finance/import-profiles')
    }

    async saveImportProfile(name: string, mappings: Record<string, string>) {
        return this.send('/finance/import-profiles', 'POST', { name, mappings })
    }

    async getRules(ledgerId: string): Promise<any> {
        return this.get(`/finance/rules/${encodeURIComponent(ledgerId)}`)
    }

    async createCategory(ledgerId: string, body: { name: string; necessity: 'necessity' | 'convenience' }) {
        return this.send(`/finance/ledgers/${encodeURIComponent(ledgerId)}/categories`, 'POST', body)
    }

    async updateCategory(ledgerId: string, id: string, body: { name: string; necessity: 'necessity' | 'convenience' }) {
        return this.send(`/finance/ledgers/${encodeURIComponent(ledgerId)}/categories/${encodeURIComponent(id)}`, 'PUT', body)
    }

    async deleteCategory(ledgerId: string, id: string) {
        return this.send(`/finance/ledgers/${encodeURIComponent(ledgerId)}/categories/${encodeURIComponent(id)}`, 'DELETE')
    }

    async createAlias(ledgerId: string, body: Record<string, unknown>) {
        return this.send(`/finance/rules/${encodeURIComponent(ledgerId)}/aliases`, 'POST', body)
    }

    async updateAlias(ledgerId: string, id: string, body: Record<string, unknown>) {
        return this.send(`/finance/rules/${encodeURIComponent(ledgerId)}/aliases/${encodeURIComponent(id)}`, 'PUT', body)
    }

    async deleteAlias(ledgerId: string, id: string) {
        return this.send(`/finance/rules/${encodeURIComponent(ledgerId)}/aliases/${encodeURIComponent(id)}`, 'DELETE')
    }

    private async get<T>(path: string): Promise<T> {
        const response = await fetch(`${this.baseUrl}${path}`, { cache: 'no-store' })
        if (!response.ok) {
            throw new Error(`Request failed (${response.status}) for ${path}`)
        }
        return (await response.json()) as T
    }

    private async send<T>(path: string, method: string, body?: unknown): Promise<T> {
        const response = await fetch(`${this.baseUrl}${path}`, {
            method,
            headers: body ? { 'Content-Type': 'application/json' } : undefined,
            body: body ? JSON.stringify(body) : undefined,
        })
        if (!response.ok) {
            const message = await response.text()
            throw new Error(message || `Request failed (${response.status})`)
        }
        return (await response.json()) as T
    }

}
