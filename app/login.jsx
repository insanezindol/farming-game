'use client'

import { useActionState, useState } from 'react'
import { accountAction, createFarmAction } from './actions'
import { Mark } from './art'

const titles = { login: '농장에 들어가기', signup: '새 계정 만들기', recover: '농장 되찾기' }
const verbs = { login: '로그인', signup: '계정 만들기', recover: '비밀번호 변경' }

function AccountForm({ mode, changeMode, lastId, rememberId, returnTo }) {
  const [result, action, pending] = useActionState(accountAction, {})
  const [id, setId] = useState(lastId)

  if (result.code || result.reset) {
    return (
      <div className="account-form" aria-live="polite">
        <h2>{result.code ? '계정을 만들었어요' : '비밀번호를 바꿨어요'}</h2>
        {result.code && <>
          <p>이 코드는 한 번만 보여 드려요. 비밀번호를 잊었을 때 사용할 수 있도록 안전한 곳에 보관해 주세요.</p>
          <label htmlFor="recovery-result">내 복구 코드</label>
          <input id="recovery-result" className="code" readOnly value={result.code} onFocus={event => event.target.select()} />
        </>}
        <button className="primary" type="button" onClick={() => { rememberId(result.id); changeMode('login') }}>로그인 화면으로</button>
      </div>
    )
  }

  const fieldError = field => result.field === field ? <p id={field + '-error'} className="error" role="alert">{result.error}</p> : null
  return (
    <form className="account-form" action={action}>
      <h2>{titles[mode]}</h2>
      <p>{mode === 'login' ? '내가 돌보던 밭이 기다리고 있어요.' : mode === 'signup' ? 'ID와 비밀번호만 정하면 시작할 수 있어요.' : '가입할 때 받은 복구 코드를 준비해 주세요.'}</p>
      <input type="hidden" name="mode" value={mode} />
      {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
      <label htmlFor="id">아이디</label>
      <input id="id" name="id" value={id} onChange={event => setId(event.target.value)} autoComplete="username" maxLength={24} required aria-invalid={result.field === 'id'} aria-describedby={result.field === 'id' ? 'id-error' : undefined} placeholder="예) slowfarmer" />
      {fieldError('id')}
      {mode === 'recover' && <>
        <label htmlFor="code">복구 코드</label>
        <input id="code" name="code" autoComplete="off" maxLength={40} required aria-invalid={result.field === 'code'} aria-describedby={result.field === 'code' ? 'code-error' : undefined} />
        {fieldError('code')}
      </>}
      <label htmlFor="password">{mode === 'recover' ? '새 비밀번호' : '비밀번호'}</label>
      <input id="password" name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required aria-invalid={result.field === 'password'} aria-describedby={result.field === 'password' ? 'password-error' : undefined} placeholder={mode === 'login' ? '비밀번호를 입력하세요' : '8자 이상'} />
      {fieldError('password')}
      {result.error && !result.field && <p className="error" role="alert">{result.error}</p>}
      <button className="primary" disabled={pending}>{pending ? '잠시만요…' : verbs[mode]}</button>
      <div className="account-links">
        {mode === 'login' ? <>
          <button type="button" onClick={() => changeMode('signup')}>새 계정 만들기</button>
          <button type="button" onClick={() => changeMode('recover')}>비밀번호 찾기</button>
        </> : <button type="button" onClick={() => changeMode('login')}>로그인으로 돌아가기</button>}
      </div>
    </form>
  )
}

function Entry({ children }) {
  return (
    <main className="entry" id="main" data-enter>
      <section className="entry-world" aria-labelledby="title">
        <div className="entry-title">
          <span className="eyebrow"><Mark /> 나의 작은 농장</span>
          <h1 id="title">무야호농장</h1>
          <p>씨앗을 심어 두세요.<br />돌아올 때쯤 밭이 익어 있을 거예요.</p>
        </div>
      </section>
      <section className="entry-account" aria-label="농장 계정">
        {children}
      </section>
    </main>
  )
}

export function Login({ returnTo } = {}) {
  const [mode, setMode] = useState('login')
  const [lastId, setLastId] = useState('')
  return (
    <Entry>
      <AccountForm key={mode} mode={mode} changeMode={setMode} lastId={lastId} rememberId={setLastId} returnTo={returnTo} />
    </Entry>
  )
}

export function FarmSetup({ returnTo }) {
  const [result, action, pending] = useActionState(createFarmAction, {})
  const [name, setName] = useState('')
  return (
    <Entry>
      <form className="account-form" action={action}>
        <h2>내 농장 이름 짓기</h2>
        <p>앞으로 키울 농장에 이름을 붙여 주세요.</p>
        {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
        <label htmlFor="farm-name">농장 이름</label>
        <input id="farm-name" name="farmName" required value={name} onChange={event => setName(event.target.value)}
          placeholder="예) 바람꽃 농장" autoComplete="off" aria-invalid={Boolean(result.error)}
          aria-describedby={result.error ? 'farm-name-error' : undefined} />
        {result.error && <p id="farm-name-error" className="error" role="alert">{result.error}</p>}
        <button className="primary" disabled={pending}>{pending ? '농장을 만드는 중…' : '농장 만들기'}</button>
      </form>
    </Entry>
  )
}

