import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { applyFieldCommand, FIELD_BATCH_SIZE } from '../lib/farm-game.mjs'
import { runFieldActions } from './actions'

function project(farm, commands) {
  for (const command of commands) {
    try {
      farm = applyFieldCommand(farm, command, Number(command.requestId.slice(0, 13)), true)
    } catch {
      // A newer server snapshot can invalidate an outstanding action. The server reports its outcome.
    }
  }
  return farm
}

export function useFarmFieldQueue(initialFarm, accountId) {
  const prefix = `muyaho:field:${accountId}:`
  const base = useRef(initialFarm)
  const clock = useRef(Date.now())
  const commands = useRef([])
  const draining = useRef(null)
  const lastIssued = useRef(0)
  const delay = useRef(1500)
  const [confirmed, setConfirmed] = useState(initialFarm)
  const [queued, setQueued] = useState([])
  const [sync, setSync] = useState(null)
  const [settled, setSettled] = useState(null)
  const hasQueued = Boolean(queued.length)
  const farm = useMemo(() => project(confirmed, queued), [confirmed, queued])

  const accept = useCallback(next => {
    if ((next.requestVersion ?? 0) < (base.current.requestVersion ?? 0)) return
    base.current = next
    clock.current = Date.now()
    setConfirmed(next)
  }, [])

  const flush = useCallback(() => {
    if (draining.current) return draining.current
    if (!commands.current.length) return Promise.resolve(true)
    const run = async () => {
      while (commands.current.length) {
        const batch = commands.current.slice(0, FIELD_BATCH_SIZE)
        let result
        try {
          result = await runFieldActions(accountId, batch)
        } catch {
          result = { retry: true }
        }
        if (!result?.farm) {
          setSync({
            text: result?.blocked ?? '연결되면 밭 작업을 저장할게요.',
            retryAt: result?.blocked ? null : Date.now() + delay.current,
          })
          delay.current = Math.min(delay.current * 2, 15000)
          return false
        }

        const before = base.current
        accept(result.farm)
        const saved = new Set(batch.map(command => command.requestId))
        commands.current = commands.current.filter(command => !saved.has(command.requestId))
        setQueued(commands.current)
        for (const id of saved) {
          try { localStorage.removeItem(prefix + id) } catch { /* an acknowledged copy can be replayed safely */ }
        }
        setSettled({ before, after: result.farm, error: result.errors.find(Boolean) })
        delay.current = 1500
        setSync(null)
      }
      return true
    }
    draining.current = run().finally(() => { draining.current = null })
    return draining.current
  }, [accept, accountId, prefix])

  useEffect(() => {
    if (!accountId) return
    const restored = []
    try {
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index)
        if (!key?.startsWith(prefix)) continue
        try {
          const command = JSON.parse(localStorage.getItem(key))
          if (typeof command?.requestId === 'string' && key === prefix + command.requestId) restored.push(command)
        } catch { /* ignore a malformed local entry */ }
      }
    } catch { /* browser storage can be unavailable */ }
    const known = new Set(commands.current.map(command => command.requestId))
    commands.current = [...restored.filter(command => !known.has(command.requestId)), ...commands.current]
      .sort((a, b) => a.requestId.localeCompare(b.requestId))
    lastIssued.current = Math.max(lastIssued.current, Number(commands.current.at(-1)?.requestId.slice(0, 13)) || 0)
    setQueued(commands.current)
    window.addEventListener('online', flush)
    return () => window.removeEventListener('online', flush)
  }, [accountId, prefix, flush])

  useEffect(() => {
    if (!accountId || !hasQueued || sync?.retryAt === null) return
    const timer = window.setTimeout(flush, sync ? Math.max(0, sync.retryAt - Date.now()) : 75)
    return () => window.clearTimeout(timer)
  }, [accountId, hasQueued, sync, flush])

  function enqueue(build) {
    const now = base.current.now + (Date.now() - clock.current)
    const shown = project(base.current, commands.current)
    const next = build(shown, now)
    if (!next) return { error: '이 밭에서 할 수 있는 작업이 없어요.' }
    lastIssued.current = Math.max(now, lastIssued.current + 1)
    const nonce = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2).padEnd(12, '0')
    const command = { ...next, requestId: `${lastIssued.current}_${nonce}` }
    try {
      applyFieldCommand(shown, command, lastIssued.current, true)
    } catch (error) {
      return { error: error.message }
    }
    let local = true
    try {
      localStorage.setItem(prefix + command.requestId, JSON.stringify(command))
    } catch {
      local = false
    }
    commands.current = [...commands.current, command]
    setQueued(commands.current)
    return { command, local }
  }

  return { farm, confirmed, accept, enqueue, flush, hasQueued, sync, settled }
}
