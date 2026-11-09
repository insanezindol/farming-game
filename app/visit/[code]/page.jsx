import { notFound } from 'next/navigation'
import { cache } from 'react'
import { farmAccount, visitFarm } from '../../../lib/farm-storage'
import { Farm } from '../../farm'

const sharedFarm = cache(async code => visitFarm(code, await farmAccount()))

export async function generateMetadata({ params }) {
  const { code } = await params
  const farm = await sharedFarm(code)
  const title = farm ? farm.name ?? farm.handle + '의 농장' : '농장 방문 · 무야호농장'
  return { title, robots: { index: false, follow: false } }
}

export default async function VisitPage({ params }) {
  const { code } = await params
  const farm = await sharedFarm(code)
  if (!farm) notFound()
  return <Farm initialFarm={farm} visitor />
}
