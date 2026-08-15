import type { DashboardQuery, DashboardSnapshot, RecurringSeries, RecurringReviewStatus, RecurrenceDirection, RecurringSettings, RecurringObservationScan } from '../domain/finance'
import type { FinanceGateway } from '../application/load-dashboard'

const DEFAULT_API_BASE_URL = 'http://localhost:3000'

export class FinanceApi implements FinanceGateway {
    private readonly baseUrl = (
        import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL
    ).replace(/\/$/, '')

    async loadDashboard(query: DashboardQuery): Promise<DashboardSnapshot> {
        const file = encodeURIComponent(query.fileName)
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

    async getRecurring(fileName: string): Promise<RecurringSeries[]> {
        return this.get<RecurringSeries[]>(`/finance/recurring/${encodeURIComponent(fileName)}`)
    }

    async getRecurringSettings(fileName: string): Promise<RecurringSettings> {
        return this.get<RecurringSettings>(`/finance/recurring/${encodeURIComponent(fileName)}/settings`)
    }

    async saveRecurringAlias(fileName: string, targetId: string, seriesIds: string[], alias: string): Promise<{ targetId: string; alias: string | null; scan: RecurringObservationScan }> {
        return this.send(`/finance/recurring/${encodeURIComponent(fileName)}/aliases/${encodeURIComponent(targetId)}`, 'PUT', { seriesIds, alias })
    }

    async createRecurringGroup(fileName: string, seriesIds: string[]) {
        return this.send(`/finance/recurring/${encodeURIComponent(fileName)}/groups`, 'POST', { seriesIds })
    }

    async deleteRecurringGroup(fileName: string, groupId: string) {
        return this.send(`/finance/recurring/${encodeURIComponent(fileName)}/groups/${encodeURIComponent(groupId)}`, 'DELETE')
    }

    async setRecurringDecision(fileName: string, seriesId: string, decision: Exclude<RecurringReviewStatus, 'pending'>) {
        return this.send(`/finance/recurring/${encodeURIComponent(fileName)}/decisions/${encodeURIComponent(seriesId)}`, 'PUT', { decision })
    }

    async setManualRecurring(fileName: string, statementId: string, direction: RecurrenceDirection | null) {
        return this.send(`/finance/recurring/${encodeURIComponent(fileName)}/statements/${encodeURIComponent(statementId)}`, 'PUT', { direction })
    }

    async uploadStatement(file: File): Promise<{ fileName: string }> {
        const body = new FormData()
        body.append('file', file)

        const response = await fetch(`${this.baseUrl}/finance/upload`, {
            method: 'POST',
            body,
        })

        if (!response.ok) {
            throw new Error(`Upload failed (${response.status})`)
        }

        const result = (await response.json()) as { fileName?: string }
        if (!result.fileName) throw new Error('The API did not return a filename')
        return { fileName: result.fileName }
    }

    async getRules(fileName: string): Promise<any> {
        return this.get(`/finance/rules/${encodeURIComponent(fileName)}`)
    }

    async createCategory(body: { name: string; necessity: 'necessity' | 'convenience' }) {
        return this.send('/finance/categories', 'POST', body)
    }

    async updateCategory(id: string, body: { name: string; necessity: 'necessity' | 'convenience' }) {
        return this.send(`/finance/categories/${encodeURIComponent(id)}`, 'PUT', body)
    }

    async deleteCategory(id: string) {
        return this.send(`/finance/categories/${encodeURIComponent(id)}`, 'DELETE')
    }

    async createAlias(fileName: string, body: Record<string, unknown>) {
        return this.send(`/finance/rules/${encodeURIComponent(fileName)}/aliases`, 'POST', body)
    }

    async updateAlias(fileName: string, id: string, body: Record<string, unknown>) {
        return this.send(`/finance/rules/${encodeURIComponent(fileName)}/aliases/${encodeURIComponent(id)}`, 'PUT', body)
    }

    async deleteAlias(fileName: string, id: string) {
        return this.send(`/finance/rules/${encodeURIComponent(fileName)}/aliases/${encodeURIComponent(id)}`, 'DELETE')
    }

    private async get<T>(path: string): Promise<T> {
        const response = await fetch(`${this.baseUrl}${path}`)
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
