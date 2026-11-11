import 'server-only'
import { adminClient, gameConfigured, sessionClient } from './supabase'
import { FarmError, FIELD_BATCH_SIZE, acknowledgeFarmCommand, applyFarmCommand, applyFieldCommand, automateFarm, createFarm, retimeFarm, displayFarm, publicFarm, socialCommand } from './farm-game.mjs'

const retryMessage = '다른 화면에서도 농장이 바뀌었어요. 다시 시도해 주세요.'
const unavailable = '농장을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.'
const shareCode = value => typeof value === 'string' && /^[a-f0-9]{24}$/.test(value)

export function storageConfigured() {
  return gameConfigured() && Boolean(process.env.SUPABASE_SECRET_KEY)
}

export async function farmAccount() {
  if (!gameConfigured()) return null
  const client = await sessionClient()
  const { data } = await client.auth.getClaims()
  const id = data?.claims?.sub
  const handle = data?.claims?.app_metadata?.farm_handle
  if (!id || typeof handle !== 'string' || !/^[a-z0-9_]{3,24}$/.test(handle)) return null
  return { id, handle }
}

async function rpc(client, functionName, args) {
  const { data, error } = await client.rpc(functionName, args)
  if (error) {
    console.error('Open farm RPC failed:', functionName, error.code)
    throw new FarmError(unavailable)
  }
  return data
}

function load(client, account) {
  return rpc(client, 'open_farm_load', { account: account.id })
}

export async function createNamedFarm(account, name) {
  if (!storageConfigured()) throw new FarmError('농장 서버의 접속 설정이 필요해요.')
  await rpc(adminClient(), 'open_farm_load', {
    account: account.id,
    initial: createFarm(account.handle, Date.now(), name),
  })
}

function present(state, revision) {
  return { ...displayFarm(state, Date.now()), requestVersion: revision }
}

export async function runForAccount(account, command = { type: 'view' }) {
  if (!storageConfigured()) throw new FarmError('농장 서버의 접속 설정이 필요해요.')
  const client = adminClient()
  for (let attempt = 0; attempt < 3; attempt++) {
    const record = await load(client, account)
    if (!record) return null
    const now = Date.now()
    const state = retimeFarm(record.state, now)
    const farm = command.type === 'view' ? automateFarm(state, now)
      : applyFarmCommand(state, command, now)
    if (farm === record.state) return present(farm, record.revision)
    if (await rpc(client, 'open_farm_save', { account: account.id, expected: record.revision, payload: farm })) {
      return present(farm, record.revision + 1)
    }
  }
  throw new FarmError(retryMessage)
}

export async function saveFieldBatch(account, commands) {
  if (!storageConfigured()) throw new FarmError(unavailable)
  if (!Array.isArray(commands) || commands.length < 1 || commands.length > FIELD_BATCH_SIZE) {
    return { blocked: '저장할 농장 작업을 확인해 주세요.' }
  }
  const client = adminClient()
  for (let attempt = 0; attempt < 3; attempt++) {
    const record = await load(client, account)
    if (!record) return { blocked: '먼저 내 농장을 만들어 주세요.' }
    const now = Date.now()
    let farm = retimeFarm(record.state, now)
    const errors = commands.map(command => {
      try {
        farm = applyFieldCommand(farm, command, now)
        return null
      } catch (error) {
        if (!(error instanceof FarmError)) throw error
        farm = acknowledgeFarmCommand(farm, command?.requestId, now, error.message)
        return error.message
      }
    })
    if (farm === record.state) return { farm: present(farm, record.revision), errors }
    if (await rpc(client, 'open_farm_save', { account: account.id, expected: record.revision, payload: farm })) {
      return { farm: present(farm, record.revision + 1), errors }
    }
  }
  throw new FarmError(retryMessage)
}

function visitorView(record, code, guest) {
  return { ...publicFarm(record.state, Date.now()), visitCode: code, canInteract: Boolean(guest), guestInventory: guest?.inventory ?? {} }
}

export async function visitFarm(code, visitor, command = { type: 'visit' }) {
  if (!storageConfigured() || !shareCode(code)) return null
  const client = adminClient()
  for (let attempt = 0; attempt < 3; attempt++) {
    const target = await rpc(client, 'open_farm_shared', { code })
    if (!target) return null
    if (!visitor || visitor.id === target.owner) {
      if (command.type !== 'visit') throw new FarmError('다른 농장을 방문하려면 로그인해 주세요.')
      return visitorView(target, code, null)
    }

    const guest = await load(client, visitor)
    if (!guest) {
      if (command.type !== 'visit') throw new FarmError('먼저 내 농장을 만들어 주세요.')
      return { ...visitorView(target, code, null), needsFarm: true }
    }
    const { owner, guest: sender } = socialCommand(target.state, guest.state, command, Date.now())
    if (owner === target.state) return visitorView(target, code, guest.state)
    const saved = await rpc(client, 'open_farm_pair', {
      target: target.owner, target_revision: target.revision, target_data: owner,
      sender: visitor.id, sender_revision: guest.revision, sender_data: sender === guest.state ? null : sender,
    })
    if (saved) return visitorView({ state: owner }, code, sender)
  }
  throw new FarmError(retryMessage)
}
