import { Injectable, NotFoundException } from '@nestjs/common'
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs'
import { createHash } from 'crypto'
import { basename, dirname, extname, join } from 'path'

type RuleRecord = Record<string, unknown>
type ChangeAction = 'added' | 'removed' | 'changed' | 'moved'

interface RuleChange {
    path: string
    action: ChangeAction
    before?: unknown
    after?: unknown
    beforeIndex?: number
    afterIndex?: number
    entityId?: string
    fields?: string[]
}

interface BaselineEntry {
    version: 1
    revision: 0
    timestamp: string
    kind: 'baseline'
    summary: string
    stateHash: string
    snapshot: RuleRecord
}

interface ChangeEntry {
    version: 1
    revision: number
    timestamp: string
    kind: 'change'
    source: 'finance-tracker'
    summary: string
    stateHash: string
    changes: RuleChange[]
}

type HistoryEntry = BaselineEntry | ChangeEntry

@Injectable()
export class FinanceRulesHistoryService {
    private readonly rulesPath = process.env.FINANCE_RULES_PATH || './data/finance-rules.json'
    private readonly historyPath = process.env.FINANCE_RULES_HISTORY_PATH || this.defaultHistoryPath()

    recordChange(before: RuleRecord, after: RuleRecord): boolean {
        const entries = this.readEntries()
        if (!entries.length) {
            this.append({
                version: 1,
                revision: 0,
                timestamp: new Date().toISOString(),
                kind: 'baseline',
                summary: 'Initial finance rules state',
                stateHash: this.stateHash(before),
                snapshot: before,
            })
            entries.push({
                version: 1,
                revision: 0,
                timestamp: new Date().toISOString(),
                kind: 'baseline',
                summary: 'Initial finance rules state',
                stateHash: this.stateHash(before),
                snapshot: before,
            })
        }

        const changes = this.diff(before, after)
        if (!changes.length) return false
        const latest = entries.at(-1)
        const revision = (latest?.revision ?? 0) + 1
        this.append({
            version: 1,
            revision,
            timestamp: new Date().toISOString(),
            kind: 'change',
            source: 'finance-tracker',
            summary: this.summarize(changes),
            stateHash: this.stateHash(after),
            changes,
        })
        return true
    }

    getHistory(limit = 100) {
        return this.readEntries().slice(-limit).reverse().map((entry) => {
            if (entry.kind === 'baseline') {
                return { revision: entry.revision, timestamp: entry.timestamp, kind: entry.kind, summary: entry.summary, stateHash: entry.stateHash, changes: [] }
            }
            return { revision: entry.revision, timestamp: entry.timestamp, kind: entry.kind, source: entry.source, summary: entry.summary, stateHash: entry.stateHash, changes: entry.changes }
        })
    }

    getStateAtRevision(revision: number): RuleRecord {
        const entries = this.readEntries()
        const baseline = entries.find((entry): entry is BaselineEntry => entry.kind === 'baseline')
        if (!baseline || !entries.some((entry) => entry.revision === revision)) throw new NotFoundException('Finance rules revision not found')
        let state = structuredClone(baseline.snapshot)
        for (const entry of entries) {
            if (entry.revision > revision) break
            if (entry.kind === 'change') state = this.applyChanges(state, entry.changes)
        }
        return state
    }

    private defaultHistoryPath() {
        const extension = extname(this.rulesPath)
        const name = basename(this.rulesPath, extension)
        return join(dirname(this.rulesPath), `${name}.history.jsonl`)
    }

    private readEntries(): HistoryEntry[] {
        if (!existsSync(this.historyPath)) return []
        const text = readFileSync(this.historyPath, 'utf8').trim()
        if (!text) return []
        return text.split(/\r?\n/).map((line) => JSON.parse(line) as HistoryEntry)
    }

    private append(entry: HistoryEntry) {
        mkdirSync(dirname(this.historyPath), { recursive: true })
        appendFileSync(this.historyPath, `${JSON.stringify(entry)}\n`, 'utf8')
    }

    private stateHash(value: unknown) {
        return createHash('sha256').update(this.stableJson(value)).digest('hex')
    }

    private stableJson(value: unknown): string {
        if (Array.isArray(value)) return `[${value.map((item) => this.stableJson(item)).join(',')}]`
        if (value && typeof value === 'object') {
            const object = value as Record<string, unknown>
            return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${this.stableJson(object[key])}`).join(',')}}`
        }
        return value === undefined ? 'undefined' : JSON.stringify(value)
    }

    private diff(before: unknown, after: unknown, path = ''): RuleChange[] {
        if (this.stableJson(before) === this.stableJson(after)) return []
        if (Array.isArray(before) && Array.isArray(after)) return this.diffArrays(before, after, path)
        if (this.isRecord(before) && this.isRecord(after)) {
            const changes: RuleChange[] = []
            for (const key of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
                const childPath = `${path}/${this.escapePointer(key)}`
                const hasBefore = Object.prototype.hasOwnProperty.call(before, key)
                const hasAfter = Object.prototype.hasOwnProperty.call(after, key)
                if (!hasBefore) changes.push({ path: childPath, action: 'added', after: after[key] })
                else if (!hasAfter) changes.push({ path: childPath, action: 'removed', before: before[key] })
                else changes.push(...this.diff(before[key], after[key], childPath))
            }
            return changes
        }
        return [{ path: path || '/', action: 'changed', before, after }]
    }

    private diffArrays(before: unknown[], after: unknown[], path: string): RuleChange[] {
        if (!this.isEntityArray(before, after)) return [{ path: path || '/', action: 'changed', before, after }]
        const beforeEntities = before as (RuleRecord & { id: string })[]
        const afterEntities = after as (RuleRecord & { id: string })[]
        const oldById = new Map(beforeEntities.map((entity, index) => [entity.id, { entity, index }]))
        const newById = new Map(afterEntities.map((entity, index) => [entity.id, { entity, index }]))
        const changes: RuleChange[] = []

        for (const [id, old] of oldById) {
            const current = newById.get(id)
            if (!current) {
                changes.push({ path, action: 'removed', entityId: id, before: old.entity, beforeIndex: old.index })
            } else if (this.stableJson(old.entity) !== this.stableJson(current.entity) || old.index !== current.index) {
                const action = old.index === current.index ? 'changed' : 'moved'
                const fields = [...new Set([...Object.keys(old.entity), ...Object.keys(current.entity)])]
                    .filter((field) => this.stableJson(old.entity[field]) !== this.stableJson(current.entity[field]))
                    .sort()
                changes.push({ path, action, entityId: id, before: old.entity, after: current.entity, beforeIndex: old.index, afterIndex: current.index, ...(fields.length ? { fields } : {}) })
            }
        }
        for (const [id, current] of newById) {
            if (!oldById.has(id)) changes.push({ path, action: 'added', entityId: id, after: current.entity, afterIndex: current.index })
        }
        return changes
    }

    private isEntityArray(before: unknown[], after: unknown[]): boolean {
        const all = [...before, ...after]
        return all.length > 0 && all.every((item) => this.isRecord(item) && typeof item.id === 'string')
    }

    private isRecord(value: unknown): value is RuleRecord {
        return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    }

    private escapePointer(value: string) { return value.replace(/~/g, '~0').replace(/\//g, '~1') }
    private unescapePointer(value: string) { return value.replace(/~1/g, '/').replace(/~0/g, '~') }

    private summarize(changes: RuleChange[]) {
        const added = changes.filter((change) => change.action === 'added').length
        const removed = changes.filter((change) => change.action === 'removed').length
        const changed = changes.filter((change) => change.action === 'changed' || change.action === 'moved').length
        return `${added} added, ${changed} changed, ${removed} removed`
    }

    private applyChanges(state: RuleRecord, changes: RuleChange[]): RuleRecord {
        const entityChanges = new Map<string, RuleChange[]>()
        for (const change of changes) {
            if (!change.entityId) {
                state = this.applyChange(state, change, true)
                continue
            }
            entityChanges.set(change.path, [...(entityChanges.get(change.path) ?? []), change])
        }

        for (const [path, collectionChanges] of entityChanges) {
            const collection = this.getPointer(state, path)
            if (!Array.isArray(collection)) throw new Error(`Invalid history collection: ${path}`)
            let result = [...collection]
            for (const change of collectionChanges) {
                const existing = result.findIndex((item) => this.isRecord(item) && item.id === change.entityId)
                if (change.action === 'removed') {
                    if (existing >= 0) result.splice(existing, 1)
                } else {
                    const item = structuredClone(change.after as RuleRecord)
                    if (existing >= 0) result.splice(existing, 1)
                    result.push(item)
                }
            }

            const targetIndexes = new Map(collectionChanges
                .filter((change) => change.action !== 'removed' && change.afterIndex !== undefined)
                .map((change) => [change.entityId!, change.afterIndex!]))
            const positioned = new Map<number, unknown>()
            const remaining: unknown[] = []
            for (const item of result) {
                const targetIndex = this.isRecord(item) && typeof item.id === 'string'
                    ? targetIndexes.get(item.id)
                    : undefined
                if (targetIndex === undefined) remaining.push(item)
                else positioned.set(targetIndex, item)
            }
            const ordered: unknown[] = []
            const length = result.length
            for (let index = 0; index < length; index += 1) {
                if (positioned.has(index)) ordered.push(positioned.get(index))
                else ordered.push(remaining.shift())
            }
            const finalCollection = ordered.filter((item) => item !== undefined)
            collection.splice(0, collection.length, ...finalCollection)
        }
        return state
    }

    private applyChange(state: RuleRecord, change: RuleChange, forward: boolean): RuleRecord {
        if (change.entityId) {
            const collection = this.getPointer(state, change.path)
            if (!Array.isArray(collection)) throw new Error(`Invalid history collection: ${change.path}`)
            const existing = collection.findIndex((item) => this.isRecord(item) && item.id === change.entityId)
            const action = forward ? change.action : ({ added: 'removed', removed: 'added', changed: 'changed', moved: 'moved' } as const)[change.action]
            if (action === 'removed') {
                if (existing >= 0) collection.splice(existing, 1)
            } else {
                const item = structuredClone((forward ? change.after : change.before) as RuleRecord)
                const index = forward ? change.afterIndex : change.beforeIndex
                if (existing >= 0) collection.splice(existing, 1)
                collection.splice(Math.min(index ?? collection.length, collection.length), 0, item)
            }
            return state
        }

        const tokens = change.path.split('/').slice(1).map((token) => this.unescapePointer(token))
        if (!tokens.length) throw new Error('Invalid root-level finance rules change')
        let parent: any = state
        for (const token of tokens.slice(0, -1)) parent = parent[token]
        const key = tokens.at(-1)!
        const action = forward ? change.action : ({ added: 'removed', removed: 'added', changed: 'changed', moved: 'moved' } as const)[change.action]
        if (action === 'removed') {
            if (Array.isArray(parent)) parent.splice(Number(key), 1)
            else delete parent[key]
        } else {
            const value = structuredClone((forward ? change.after : change.before))
            if (Array.isArray(parent)) parent.splice(Number(key), action === 'added' ? 0 : 1, value)
            else parent[key] = value
        }
        return state
    }

    private getPointer(value: unknown, path: string): unknown {
        if (!path) return value
        return path.split('/').slice(1).map((token) => this.unescapePointer(token)).reduce<any>((current, token) => current?.[token], value)
    }
}
