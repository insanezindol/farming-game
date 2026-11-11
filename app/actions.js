'use server'

import { redirect } from 'next/navigation'
import { accountId, internalEmail, validPassword, newRecoveryCode, recoveryDigest } from '../lib/credentials.mjs'
import { adminClient, gameConfigured, sessionClient } from '../lib/supabase'
import { FarmError } from '../lib/farm-game.mjs'
import { createNamedFarm, farmAccount, runForAccount, saveFieldBatch, visitFarm } from '../lib/farm-storage'

const setupMessage = '농장 서버의 접속 설정이 필요해요.'
const authError = 'ID와 비밀번호를 다시 확인해 주세요.'
const recoveryError = 'ID와 복구 코드를 다시 확인해 주세요.'

function requestedVisit(form) {
  const path = form.get('returnTo')
  return typeof path === 'string' && /^\/visit\/[a-f0-9]{24}$/.test(path) ? path.slice(7) : null
}

export async function accountAction(_previous, form) {
  const id = accountId(form.get('id'))
  const password = form.get('password')
  const mode = form.get('mode')
  if (!id) return { field: 'id', error: 'ID는 영문, 숫자, 밑줄 3~24자로 입력해 주세요.' }
  if (!['login', 'signup', 'recover'].includes(mode)) return { error: '할 일을 다시 선택해 주세요.' }
  if (!validPassword(password)) return { field: 'password', error: '비밀번호는 8자 이상, 영문 기준 72자 이하로 입력해 주세요.' }

  const pepper = process.env.FARM_AUTH_PEPPER
  if (!gameConfigured() || !/^[a-f0-9]{64}$/.test(pepper ?? '')) return { error: setupMessage }
  if (mode !== 'login' && !process.env.SUPABASE_SECRET_KEY) return { error: setupMessage }
  const email = internalEmail(id, pepper)

  if (mode === 'signup') {
    const code = newRecoveryCode()
    const { error } = await adminClient().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { farm_handle: id, farm_recovery: recoveryDigest(id, code, pepper) },
    })
    if (error?.code === 'email_exists' || error?.code === 'user_already_exists') {
      return { field: 'id', error: '이미 사용 중인 ID예요.' }
    }
    if (error?.code === 'weak_password') return { field: 'password', error: '다른 비밀번호를 선택해 주세요.' }
    if (error) return { error: '농장을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.' }
    return { code, id }
  }

  if (mode === 'recover') {
    const code = form.get('code')
    if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{32}$/.test(code.trim())) {
      return { field: 'code', error: recoveryError }
    }
    const admin = adminClient()
    const { data: user, error } = await admin.rpc('farm_recovery_user', {
      account_handle: id,
      code_digest: recoveryDigest(id, code.trim(), pepper),
    })
    if (error) return { error: '복구를 완료하지 못했어요. 잠시 뒤 다시 시도해 주세요.' }
    if (!user) return { field: 'code', error: recoveryError }
    const updated = await admin.auth.admin.updateUserById(user, { password })
    if (updated.error?.code === 'weak_password') return { field: 'password', error: '다른 비밀번호를 선택해 주세요.' }
    if (updated.error) return { error: '비밀번호를 바꾸지 못했어요. 잠시 뒤 다시 시도해 주세요.' }
    return { reset: true, id }
  }

  const supabase = await sessionClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: error.status === 429 ? '잠시 쉬었다가 다시 시도해 주세요.' : authError }
  const visit = requestedVisit(form)
  redirect(visit ? '/?visit=' + visit : '/')
}

export async function createFarmAction(_previous, form) {
  const account = await farmAccount()
  if (!account) return { error: '다시 로그인해 주세요.' }
  try {
    await createNamedFarm(account, form.get('farmName'))
  } catch (error) {
    return { error: error instanceof FarmError ? error.message : '농장을 만들지 못했어요. 다시 시도해 주세요.' }
  }
  const visit = requestedVisit(form)
  redirect(visit ? '/visit/' + visit : '/')
}

export async function runFarmAction(command) {
  try {
    const account = await farmAccount()
    if (!account) return { error: '다시 로그인해 주세요.' }
    const farm = await runForAccount(account, command)
    return farm ? { farm } : { error: '먼저 내 농장을 만들어 주세요.' }
  } catch (error) {
    return { error: error instanceof FarmError ? error.message : '변경을 저장하지 못했어요. 다시 시도해 주세요.' }
  }
}

export async function runFieldActions(accountId, commands) {
  try {
    const account = await farmAccount()
    if (!account || account.id !== accountId) return { blocked: '농장 작업을 저장하려면 같은 계정으로 다시 로그인해 주세요.' }
    return await saveFieldBatch(account, commands)
  } catch {
    return { retry: true }
  }
}

export async function runFarmSocial(code, command) {
  if (!['message', 'gift', 'assist'].includes(command?.type)) return { error: '방문 작업을 다시 선택해 주세요.' }
  try {
    const account = await farmAccount()
    if (!account) return { error: '로그인한 방문자만 이용할 수 있어요.' }
    const farm = await visitFarm(code, account, command)
    return farm ? { farm } : { error: '방문 링크가 만료됐어요.' }
  } catch (error) {
    return { error: error instanceof FarmError ? error.message : '방문 작업을 저장하지 못했어요.' }
  }
}
export async function signOut() {
  if (gameConfigured()) {
    const supabase = await sessionClient()
    await supabase.auth.signOut({ scope: 'local' })
  }
  redirect('/')
}
