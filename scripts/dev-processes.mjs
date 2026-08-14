import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { execFileSync, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const stateDir = join(rootDir, '.temp')
const stateFile = join(stateDir, 'finance-tracker-dev.json')
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

function terminate(pid) {
    try {
        if (process.platform === 'win32') {
            execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
                stdio: 'ignore',
            })
            return
        }

        process.kill(-pid, 'SIGTERM')
    } catch {
        try {
            process.kill(pid, 'SIGTERM')
        } catch {
            // Process already stopped.
        }
    }
}

function readState() {
    try {
        return JSON.parse(readFileSync(stateFile, 'utf8'))
    } catch {
        return null
    }
}

function clearState() {
    try {
        unlinkSync(stateFile)
    } catch {
        // State file already removed.
    }
}

function listeningPids() {
    if (process.platform !== 'win32') return []

    try {
        const output = execFileSync('netstat', ['-ano', '-p', 'tcp'], {
            encoding: 'utf8',
        })
        const pids = new Set()
        for (const line of output.split(/\r?\n/)) {
            if (!/LISTENING/i.test(line) || !/:(3000|5173)\s/.test(line)) continue
            const pid = line.trim().split(/\s+/).at(-1)
            if (pid && /^\d+$/.test(pid)) pids.add(Number(pid))
        }
        return [...pids]
    } catch {
        return []
    }
}

function stopExisting() {
    const state = readState()
    const pids = new Set(state?.pids ?? [])
    for (const pid of listeningPids()) pids.add(pid)
    if (pids.size === 0) return false

    for (const pid of pids) terminate(pid)
    clearState()
    return true
}

function start() {
    stopExisting()
    mkdirSync(stateDir, { recursive: true })

    const children = [
        ['backend', ['run', 'start:dev'], rootDir],
        ['frontend', ['--prefix', 'frontend', 'run', 'dev'], rootDir],
    ].map(([name, args, cwd]) => ({
        name,
        process: spawn(npmCommand, args, {
            cwd,
            detached: process.platform !== 'win32',
            shell: process.platform === 'win32',
            stdio: 'inherit',
        }),
    }))

    writeFileSync(
        stateFile,
        JSON.stringify({ pids: children.map(({ process: child }) => child.pid) }, null, 2)
    )

    let stopping = false
    const shutdown = (code = 0) => {
        if (stopping) return
        stopping = true
        for (const { process: child } of children) terminate(child.pid)
        clearState()
        process.exit(code)
    }

    for (const { name, process: child } of children) {
        child.on('error', (error) => {
            console.error(`${name} failed to start: ${error.message}`)
            shutdown(1)
        })
        child.on('exit', (code) => {
            if (!stopping) {
                console.log(`${name} stopped${code == null ? '' : ` with code ${code}`}`)
                shutdown(code ?? 1)
            }
        })
    }

    process.on('SIGINT', () => shutdown())
    process.on('SIGTERM', () => shutdown())
    console.log('Backend: http://localhost:3000')
    console.log('Frontend: http://localhost:5173')
    console.log('Run `npm run stop:all` from another terminal to stop both.')
}

if (process.argv[2] === 'stop') {
    console.log(stopExisting() ? 'Stopped Finance Tracker services.' : 'No Finance Tracker services are running.')
} else {
    start()
}
