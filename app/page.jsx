import { redirect } from 'next/navigation'
import { cache } from 'react'
import { farmAccount, runForAccount } from '../lib/farm-storage'
import { FarmSetup, Login } from './login'
import { Farm } from './farm'
import { signOut } from './actions'

const accountFarm = cache(async () => {
  const account = await farmAccount()
  return account ? { farm: await runForAccount(account) } : null
})

export async function generateMetadata() {
  try {
    const view = await accountFarm()
    const farm = view?.farm
    return farm ? { title: farm.name ?? farm.handle + '의 농장' } : {}
  } catch {
    return {}
  }
}

export default async function Page({ searchParams }) {
  const { visit } = await searchParams
  const returnTo = typeof visit === 'string' && /^[a-f0-9]{24}$/.test(visit) ? '/visit/' + visit : undefined
  let view
  try {
    view = await accountFarm()
  } catch {
    return (
      <main id="main" className="error-page">
        <h1>농장을 불러오지 못했어요</h1>
        <p>잠시 뒤 새로고침하거나 다시 로그인해 주세요.</p>
        <form action={signOut}><button className="primary">다시 로그인하기</button></form>
      </main>
    )
  }
  if (!view) return <Login returnTo={returnTo} />
  if (!view.farm) return <FarmSetup returnTo={returnTo} />
  if (returnTo) redirect(returnTo)
  return <Farm initialFarm={view.farm} />
}
