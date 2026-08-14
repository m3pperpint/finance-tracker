import {
    type DashboardQuery,
    type DashboardSnapshot,
    summarize,
    type DashboardView,
} from '../domain/finance'

export interface FinanceGateway {
    loadDashboard(query: DashboardQuery): Promise<DashboardSnapshot>
    uploadStatement(file: File): Promise<{ fileName: string }>
}

export async function loadDashboard(
    gateway: FinanceGateway,
    query: DashboardQuery
): Promise<DashboardView> {
    const snapshot = await gateway.loadDashboard(query)
    return { ...snapshot, metrics: summarize(snapshot) }
}
