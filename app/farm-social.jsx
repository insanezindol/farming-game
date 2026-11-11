'use client'

import { useRef, useState } from 'react'
import { crops, products } from '../lib/farm-catalog.mjs'
import { runFarmSocial } from './actions'
import { previewVisitCommand, projectVisitCommands } from '../lib/farm-visit-queue.mjs'
import { zoneCharm } from './farm-panels'

const productName = key => (products[key] ?? crops[key])?.name ?? key
const ago = at => new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' }).format(at)

function Records({ rows, render, empty }) {
  return rows?.length ? (
    <ul className="social-records">{rows.map((row, index) => <li key={row.at + '-' + index}>{render(row)} <small>{ago(row.at)}</small></li>)}</ul>
  ) : <p>{empty}</p>
}

const zoneLabel = (farm, parcel) => parcel ? ' · ' + (farm.zoneNames?.[parcel] || zoneCharm(parcel).name) : ''
const messageText = (farm, row) => <><strong>{row.from}</strong>{zoneLabel(farm, row.parcel)} {row.text}</>

function GuestSocial({ farm, scene }) {
  const [view, setView] = useState(farm)
  const confirmed = useRef(farm)
  const tasks = useRef([])
  const sending = useRef(false)
  const [queued, setQueued] = useState(0)
  const [result, setResult] = useState('')
  const giftItems = Object.keys(view.guestInventory ?? {}).filter(item => view.guestInventory[item] > 0)

  function send(command, success) {
    const at = Date.now()
    try { previewVisitCommand(projectVisitCommands(confirmed.current, tasks.current), command, at) }
    catch (error) { setResult(error.message); return }
    tasks.current.push({ command, success, at })
    refresh()
    void drain()
  }

  function refresh() {
    setView(projectVisitCommands(confirmed.current, tasks.current))
    setQueued(tasks.current.length)
  }

  async function drain() {
    if (sending.current) return
    sending.current = true
    try {
      while (tasks.current.length) {
        const { command, success } = tasks.current[0]
        try {
          const response = await runFarmSocial(farm.visitCode, command)
          if (response.farm) confirmed.current = response.farm
          setResult(response.error ?? success)
        } catch {
          // shortcut: visitor queues stay in memory; add pair-write receipts before replaying them after reload.
          try {
            const response = await runFarmSocial(farm.visitCode, { type: 'visit' })
            if (response.farm) confirmed.current = response.farm
          } catch { /* later submissions are still checked by the server */ }
          setResult('연결이 끊겨 결과를 확인하지 못했어요. 방문 기록을 확인해 주세요.')
        }
        tasks.current.shift()
        refresh()
      }
    } finally { sending.current = false }
  }

  return (
    <div className="farm-social">
      <p><a href="/">내 농장으로</a></p>
      {farm.charm && <p className="farm-charm-badge">🌸 {farm.charm.name} · 매력 {farm.charm.score}</p>}
      {farm.social?.helpers?.length > 0 && <p><small>품앗이 이웃: {farm.social.helpers.slice(0, 5).map(entry => entry.handle + ' ×' + entry.count).join(', ')}</small></p>}
      {Object.keys(farm.views ?? {}).length > 0 && <>
        <h3>추천 산책 지점</h3>
        <div className="farm-actions">{Object.entries(farm.views).map(([slot, spot]) =>
          <button type="button" key={slot} disabled={!scene} onClick={() => scene.setView(spot)}>지점 {slot} 둘러보기</button>)}</div>
      </>}
      <h3>방명록</h3>
      <Records rows={view.social?.messages} render={row => messageText(farm, row)} empty="아직 남겨진 글이 없어요." />
      {view.canInteract ? <>
        <form onSubmit={event => {
          event.preventDefault()
          const form = new FormData(event.currentTarget)
          const parcel = form.get('parcel') || undefined
          send({ type: 'message', text: form.get('message'), parcel }, parcel ? '구역에 감상을 남겼어요.' : '방명록에 남겼어요.')
        }}>
          <label>마음에 든 구역<select name="parcel" defaultValue="">
            <option value="">농장 전체</option>
            {farm.parcels.map(parcel => <option key={parcel} value={parcel}>{zoneLabel(farm, parcel).slice(3)}</option>)}
          </select></label>
          <label>짧은 감상 남기기<input name="message" maxLength={120} required /></label>
          <button type="submit">남기기</button>
        </form>
        <h3>선물 보내기</h3>
        {giftItems.length ? <form onSubmit={event => {
          event.preventDefault()
          send({ type: 'gift', item: new FormData(event.currentTarget).get('item') }, '선물을 보냈어요.')
        }}>
          <label htmlFor="visit-gift-item">선물</label>
          <select id="visit-gift-item" name="item">{giftItems.map(item => <option value={item} key={item}>{productName(item)} {view.guestInventory[item]}개</option>)}</select>
          <button type="submit">1개 보내기</button>
        </form> : <p>내 창고에 선물할 물건이 없어요.</p>}
        <h3>주문 돕기</h3>
        {view.orders.filter(order => !order.done).map(order => (
          <section key={order.id}>
            <strong>{order.name}</strong>
            {Object.entries(order.items).map(([item, quantity]) => (
              <button type="button" key={item} disabled={!giftItems.includes(item) || (order.shared?.[item] ?? 0) >= quantity}
                onClick={() => send({ type: 'assist', id: order.id, item }, productName(item) + ' 1개를 주문에 보냈어요.')}>
                {productName(item)} {order.shared?.[item] ?? 0}/{quantity} · 보내기
              </button>
            ))}
          </section>
        ))}
      </> : <p><a href={'/?visit=' + view.visitCode}>{view.needsFarm ? '내 농장 만들고 방문하기' : '로그인하고 방문하기'}</a> · 방명록과 선물을 이용할 수 있어요.</p>}
      <p role="status">{result}{queued > 0 && <small> · 저장 중 {queued}건</small>}</p>
    </div>
  )
}

// 주문을 도와준 이웃에게 답례를 맡겨 두면, 그 이웃이 다음에 들를 때 받는다
function Helpers({ farm, act }) {
  const helpers = farm.social?.helpers ?? []
  const items = Object.keys(farm.inventory ?? {}).filter(item => farm.inventory[item] > 0 && (products[item] ?? crops[item]))
  if (!helpers.length) return <p>주문을 도와준 이웃이 생기면 여기에서 답례를 보낼 수 있어요.</p>
  return <ul className="social-records">
    {helpers.map(({ handle, count }) => {
      const waiting = farm.social?.thanks?.find(entry => entry.to === handle)
      return <li key={handle}><strong>{handle}</strong> · 도움 {count}번
        {waiting ? <small> · {productName(waiting.item)} 답례가 기다리는 중</small> : items.length > 0 && <form className="farm-inline-form" onSubmit={event => {
          event.preventDefault()
          act({ type: 'thank', handle, item: new FormData(event.currentTarget).get('item') }, '답례를 맡겼어요. 이웃이 들르면 전해져요.')
        }}>
          <select name="item" aria-label={handle + '에게 보낼 답례'}>{items.map(item => <option key={item} value={item}>{productName(item)}</option>)}</select>
          <button type="submit">답례 보내기</button>
        </form>}
      </li>
    })}
  </ul>
}

export function FarmSocial({ farm, visitor, act, scene }) {
  const [copied, setCopied] = useState('')
  if (visitor) return <GuestSocial farm={farm} scene={scene} />
  const enabled = Boolean(farm.share?.enabled)
  const url = enabled && farm.share.code ? '/visit/' + farm.share.code : ''
  return (
    <div className="farm-social">
      <h3>방문 공개 범위</h3>
      <p>{url ? '초대 링크를 가진 사람이 농장을 볼 수 있어요.' : enabled ? '초대 링크를 준비하고 있어요.' : '현재 내 농장은 비공개예요.'}</p>
      <button type="button" onClick={() => act({ type: 'share', enabled: !enabled }, enabled ? '방문을 닫았어요.' : '초대 링크를 열었어요.')}>
        {enabled ? '방문 닫기' : '초대 링크 열기'}
      </button>
      {url && <div className="social-link">
        <a href={url} target="_blank" rel="noreferrer">방문 화면 보기</a>
        <button type="button" onClick={async () => {
          try {
            await navigator.clipboard.writeText(new URL(url, window.location.origin).href)
            setCopied('링크를 복사했어요.')
          } catch {
            setCopied('방문 화면 링크를 길게 눌러 복사해 주세요.')
          }
        }}>링크 복사</button>
        <button type="button" onClick={() => act({ type: 'share', enabled: true, rotate: true }, '새 초대 링크를 만들었어요.')}>링크 새로 만들기</button>
      </div>}
      <p role="status">{copied}</p>
      <h3>방문 기록</h3>
      <Records rows={farm.social?.visits} render={row => <strong>{row.from}</strong>} empty="아직 방문 기록이 없어요." />
      <p><small>설정에서 저장한 카메라 위치가 방문자에게 추천 산책 지점으로 보여요.</small></p>
      <h3>방명록과 구역 감상</h3>
      <Records rows={farm.social?.messages} render={row => messageText(farm, row)} empty="아직 남겨진 글이 없어요." />
      <h3>품앗이 이웃과 답례</h3>
      <Helpers farm={farm} act={act} />
      <h3>받은 선물</h3>
      <Records rows={farm.social?.gifts} render={row => <><strong>{row.from}</strong> · {productName(row.item)}{row.thanks ? ' · 답례' : ''}</>} empty="아직 선물이 없어요." />
    </div>
  )
}

export default FarmSocial
