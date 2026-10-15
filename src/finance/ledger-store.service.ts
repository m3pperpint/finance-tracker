import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { createHash, randomUUID } from 'crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'fs'
import { basename, extname, join } from 'path'

export interface LedgerSource {
    id: string
    originalName: string
    storedName: string
    importedAt: string
    mappings: Record<string, string>
    sha256: string
    legacyFileName?: string
}

export interface LedgerManifest {
    version: 1
    id: string
    name: string
    importProfile?: string
    createdAt: string
    sources: LedgerSource[]
}

@Injectable()
export class LedgerStoreService {
    private readonly uploadDirectory = process.env.CSV_FILE_UPLOAD_DESTINATION || './data/uploads/csv'
    private readonly ledgerDirectory = join(this.uploadDirectory, 'ledgers')
    private readonly bundledFiles = new Set(['bank_statements.csv', 'bank_statementsWrongHeader.csv'])

    list() {
        const ledgers = existsSync(this.ledgerDirectory)
            ? readdirSync(this.ledgerDirectory, { withFileTypes: true })
                .filter((entry) => entry.isDirectory())
                .flatMap((entry) => {
                    try { return [this.readManifest(entry.name)] } catch { return [] }
                })
                .sort((a, b) => a.name.localeCompare(b.name))
            : []
        const assigned = new Set(ledgers.flatMap((ledger) => ledger.sources.flatMap((source) => source.legacyFileName ? [source.legacyFileName] : [])))
        return { ledgers, unassignedFiles: this.findLooseFiles().filter((name) => !assigned.has(name)) }
    }

    get(id: string): LedgerManifest {
        if (!/^[0-9a-f-]{36}$/i.test(id)) throw new BadRequestException('ledgerId must be a UUID')
        try { return this.readManifest(id) } catch { throw new NotFoundException('Ledger not found') }
    }

    sourcePath(ledgerId: string, source: LedgerSource) {
        return join(this.ledgerDirectory, this.get(ledgerId).id, 'files', source.storedName)
    }

    create(name: string, files: string[], importProfile: string | undefined, profiles: Record<string, Record<string, string>>) {
        const cleanName = name.trim()
        if (!cleanName) throw new BadRequestException('Ledger name is required')
        if (importProfile && !profiles[importProfile]) throw new BadRequestException('Unknown import profile')
        const loose = new Set(this.findLooseFiles())
        if (files.some((file) => !loose.has(file) || basename(file) !== file)) throw new BadRequestException('One or more selected CSV files are unavailable')
        const manifest: LedgerManifest = { version: 1, id: randomUUID(), name: cleanName, ...(importProfile ? { importProfile } : {}), createdAt: new Date().toISOString(), sources: [] }
        mkdirSync(join(this.ledgerDirectory, manifest.id, 'files'), { recursive: true })
        for (const file of files) {
            const source = this.makeSource(file, profiles[importProfile ?? ''] ?? {}, file)
            copyFileSync(join(this.uploadDirectory, file), join(this.ledgerDirectory, manifest.id, 'files', source.storedName))
            manifest.sources.push(source)
        }
        this.writeManifest(manifest)
        return manifest
    }

    addUploaded(ledgerId: string, temporaryPath: string, originalName: string, mappings: Record<string, string>) {
        const manifest = this.get(ledgerId)
        const source = this.makeSource(originalName, mappings)
        const destination = join(this.ledgerDirectory, manifest.id, 'files', source.storedName)
        renameSync(temporaryPath, destination)
        manifest.sources.push(source)
        this.writeManifest(manifest)
        return { ledgerId: manifest.id, source }
    }

    private findLooseFiles() {
        if (!existsSync(this.uploadDirectory)) return []
        return readdirSync(this.uploadDirectory, { withFileTypes: true })
            .filter((entry) => entry.isFile() && !this.bundledFiles.has(entry.name))
            .map((entry) => entry.name)
            .filter((name) => {
                const extension = extname(name).toLocaleLowerCase()
                if (extension === '.csv') return true
                if (extension) return false
                try {
                    const sample = readFileSync(join(this.uploadDirectory, name)).subarray(0, 4096).toString('utf8')
                    return [';', ',', '\t'].some((delimiter) => (sample.split(/\r?\n/, 1)[0] ?? '').includes(delimiter))
                } catch { return false }
            })
            .sort((a, b) => a.localeCompare(b))
    }

    private makeSource(originalName: string, mappings: Record<string, string>, legacyFileName?: string): LedgerSource {
        const id = randomUUID()
        return {
            id,
            originalName: basename(originalName),
            storedName: `${id}.csv`,
            importedAt: new Date().toISOString(),
            mappings: { ...mappings },
            sha256: '',
            ...(legacyFileName ? { legacyFileName } : {}),
        }
    }

    private readManifest(id: string): LedgerManifest {
        const path = join(this.ledgerDirectory, id, 'manifest.json')
        const manifest = JSON.parse(readFileSync(path, 'utf8')) as LedgerManifest
        if (manifest.version !== 1 || manifest.id !== id || !Array.isArray(manifest.sources)) throw new Error('Invalid ledger manifest')
        return manifest
    }

    private writeManifest(manifest: LedgerManifest) {
        for (const source of manifest.sources) {
            if (!source.sha256) source.sha256 = createHash('sha256').update(readFileSync(join(this.ledgerDirectory, manifest.id, 'files', source.storedName))).digest('hex')
        }
        const folder = join(this.ledgerDirectory, manifest.id)
        const temporary = join(folder, 'manifest.json.tmp')
        writeFileSync(temporary, JSON.stringify(manifest, null, 2))
        renameSync(temporary, join(folder, 'manifest.json'))
    }
}
