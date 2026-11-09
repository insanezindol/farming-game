'use client'

import { useState, useTransition } from 'react'
import { crops, products } from '../lib/farm-catalog.mjs'
import { runFarmSocial } from './actions'

const productName = key => (products[key] ?? crops[key])?.name ?? key
const ago = at => new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' }).format(at)

function Records({ rows, render, empty }) {
  return rows?.length ? (
    <ul className="social-records">{rows.map((row, index) => <li key={row.at + '-' + index}>{render(row)} <small>{ago(row.at)}</small></li>)}</ul>
  ) : <p>{empty}</p>
}

function GuestSocial({ farm }) {
  const [view, setView] = useState(farm)
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState('')
  const giftItems = Object.keys(view.guestInventory ?? {}).filter(item => view.guestInventory[item] > 0)

  function send(command, success) {
    startTransition(async () => {
      try {
        const response = await runFarmSocial(view.visitCode, command)
        if (response.farm) setView(response.farm)
        setResult(response.error ?? success)
      } catch {
        setResult('연결을 확인한 뒤 다시 시도해 주세요.')
      }
    })
  }

  return (
    <div className="farm-social">
      <p><a href="/">내 농장으로</a></p>
      <h3>방명록</h3>
      <Records rows={view.social?.messages} render={row => <><strong>{row.from}</strong> {row.text}</>} empty="아직 남겨진 글이 없어요." />
      {view.canInteract ? <>
        <form onSubmit={event => {
          event.preventDefault()
          const form = new FormData(event.currentTarget)
          send({ type: 'message', text: form.get('message') }, '방명록에 남겼어요.')
        }}>
          <label>인사 남기기<input name="message" maxLength={120} required /></label>
          <button type="submit" disabled={pending}>남기기</button>
        </form>
        <h3>선물 보내기</h3>
        {giftItems.length ? <form onSubmit={event => {
          event.preventDefault()
          send({ type: 'gift', item: new FormData(event.currentTarget).get('item') }, '선물을 보냈어요.')
        }}>
          <label htmlFor="visit-gift-item">선물</label>
          <select id="visit-gift-item" name="item">{giftItems.map(item => <option value={item} key={item}>{productName(item)} {view.guestInventory[item]}개</option>)}</select>
          <button type="submit" disabled={pending}>1개 보내기</button>
        </form> : <p>내 창고에 선물할 물건이 없어요.</p>}
        <h3>주문 돕기</h3>
        {view.orders.filter(order => !order.done).map(order => (
          <section key={order.id}>
            <strong>{order.name}</strong>
            {Object.entries(order.items).map(([item, quantity]) => (
              <button type="button" key={item} disabled={pending || !giftItems.includes(item) || (order.shared?.[item] ?? 0) >= quantity}
                onClick={() => send({ type: 'assist', id: order.id, item }, productName(item) + ' 1개를 주문에 보냈어요.')}>
                {productName(item)} {order.shared?.[item] ?? 0}/{quantity} · 보내기
              </button>
            ))}
          </section>
        ))}
      </> : <p><a href={'/?visit=' + view.visitCode}>{view.needsFarm ? '내 농장 만들고 방문하기' : '로그인하고 방문하기'}</a> · 방명록과 선물을 이용할 수 있어요.</p>}
      <p role="status">{pending ? '저장 중…' : result}</p>
    </div>
  )
}

export function FarmSocial({ farm, visitor, act }) {
  const [copied, setCopied] = useState('')
  if (visitor) return <GuestSocial farm={farm} />
  const url = farm.share?.enabled ? '/visit/' + farm.share.code : ''
  return (
    <div className="farm-social">
      <h3>방문 공개 범위</h3>
      <p>{url ? '초대 링크를 가진 사람이 농장을 볼 수 있어요.' : '현재 내 농장은 비공개예요.'}</p>
      <button type="button" onClick={() => act({ type: 'share', enabled: !url }, url ? '방문을 닫았어요.' : '초대 링크를 열었어요.')}>
        {url ? '방문 닫기' : '초대 링크 열기'}
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
      <h3>방명록</h3>
      <Records rows={farm.social?.messages} render={row => <><strong>{row.from}</strong> {row.text}</>} empty="아직 남겨진 글이 없어요." />
      <h3>받은 선물</h3>
      <Records rows={farm.social?.gifts} render={row => <><strong>{row.from}</strong> · {productName(row.item)}</>} empty="아직 선물이 없어요." />
    </div>
  )
}

export default FarmSocial
