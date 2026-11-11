import { useState } from 'react'
import { signOut } from './actions'
import { achievements, buildings, collectionSets, crops, products, recipes, seasonCrops } from '../lib/farm-catalog.mjs'
import { levelProgress, maxLevel } from '../lib/farm-game.mjs'
import { canExpand, parcelAt, parcelPrice, terrainAt, footprint, PARCEL_SIZE, MAP_SIZE } from '../lib/farm-layout.mjs'

export const productBook = { ...crops, ...products }
const categories = { farm: '농사', animal: '가축', artisan: '가공', decoration: '장식', utility: '시설' }
const terrainNames = { tree: '나무', rock: '바위', water: '물', mushroom: '버섯', wildberry: '산딸기', wood: '나뭇가지' }
const colorChoices = ['#c77b54', '#d7aa55', '#789461', '#678f9d', '#a77590', '#ede0b5']
const tagColors = ['#ff8fab', '#ffd166', '#8bd3c7', '#a0c4ff', '#cdb4f6']
const friendNames = ['처음 만난 이웃', '아는 사이', '친한 이웃', '단짝']
const friendSteps = [3, 6, 10]
const neighborNames = { sundeok: '순덕 할머니', minho: '민호 사장', yuna: '유나 선생님' }
const neighborGifts = { sundeok: 'jangdok', minho: 'pyeongsang', yuna: 'yunapot' }
export const inSeason = (farm, item) => Boolean(seasonCrops[farm.season]?.includes(item))
export const hearts = object => Math.floor((object.love ?? 0) / 10)
const icons = {
  bag: 'M5 9h14l-1 12H6L5 9Zm3 0V7a4 4 0 0 1 8 0v2m-7 4v2m6-2v2',
  home: 'm3 11 9-7 9 7m-15-1v10h12V10m-8 10v-5h4v5',
  settings: 'M10 3h4l.5 2.7 2 .9 2.4-.9 2 3.5-2 1.8v2l2 1.8-2 3.5-2.4-.9-2 .9-.5 2.7h-4l-.5-2.7-2-.9-2.4.9-2-3.5 2-1.8v-2l-2-1.8 2-3.5 2.4.9 2-.9L10 3Z',
  close: 'm6 6 12 12M18 6 6 18',
  full: 'M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5',
  build: 'm4 20 5-5m3-3 3-3m-8-3 4-3 4 1 5 5-4 4-2-2-3 1L7 8V6Z',
  collect: 'M5 15h14l-2 6H7l-2-6Zm2 0 3-5m7 5-3-5M12 3v5M4 6l2 3m14-3-2 3',
  map: 'm3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2V6Zm6-2v14m6-12v14',
  orders: 'M6 4h12v17H6V4Zm3 5h6m-6 4h6m-6 4h4',
  photo: 'M3 7h4l2-3h6l2 3h4v13H3V7Z',
  share: 'M12 14V3m-4 4 4-4 4 4m-9 4H4v10h16V11h-3',
  help: 'M9 9a3 3 0 1 1 5 2.2c-1.4.8-2 1.7-2 2.8m0 3h.01',
  undo: 'M5 9h9a5 5 0 0 1 0 10h-2M9 5 5 9l4 4',
  rotate: 'M20 8v5h-5m5 0a8 8 0 1 0-2 5',
}
const statsLabels = {
  planted: '심은 씨앗', harvested: '수확한 작물', collected: '모은 생산물', sold: '판매한 상품',
  built: '배치한 시설', expanded: '개간한 구역', fished: '잡은 물고기', foraged: '채집한 재료',
  crafted: '만든 가공품', orders: '완료한 주문', visits: '방문 기록', bestCombo: '최고 콤보', golden: '황금 작물', greeted: '만난 들판 손님',
}

export function Icon({ name }) {
  return (
    <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={icons[name]} />
      {name === 'settings' && <circle cx="12" cy="12" r="3" />}
      {name === 'photo' && <circle cx="12" cy="13" r="3.4" />}
      {name === 'help' && <circle cx="12" cy="12" r="9" />}
    </svg>
  )
}

export function FarmButton({ icon, children, active, className = '', ...props }) {
  return <button type="button" className={'farm-button ' + className} aria-pressed={active} {...props}>
    {icon && <Icon name={icon} />}{children && <span>{children}</span>}
  </button>
}

// 받침이 있으면 앞 조사, 없으면 뒤 조사. '으로'는 ㄹ 받침 뒤에서 '로'가 된다.
export function josa(word, withFinal, without) {
  const code = word.at(-1).charCodeAt(0) - 0xac00
  const final = code >= 0 && code < 11172 ? code % 28 : 0
  return word + (final && !(withFinal === '으로' && final === 8) ? withFinal : without)
}

export function remainingTime(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000))
  if (seconds >= 3600) return Math.floor(seconds / 3600) + '시간 ' + Math.floor(seconds % 3600 / 60) + '분'
  if (seconds >= 60) return Math.floor(seconds / 60) + '분 ' + seconds % 60 + '초'
  return seconds + '초'
}

export function objectName(object) {
  return object.name || buildings[object.kind]?.name || object.kind
}

export function terrainTileLabel(farm, { x, z }) {
  const obstacle = !farm.cleared?.includes(x + ',' + z) && terrainAt(x, z).obstacle
  return terrainNames[obstacle] || '빈 타일'
}

export function isReady(object, now) {
  if (object.stored) return false
  return Boolean(object.crop?.readyAt <= now ||
    buildings[object.kind]?.product && object.readyAt <= now ||
    object.queue?.some(job => job.readyAt <= now))
}

// 구역마다 기억에 남는 이름과 매력 (지형 규칙은 그대로, 설명만 다르다)
export function zoneCharm(key) {
  const [x, z] = key.split(',').map(Number)
  const { biome } = terrainAt(x * PARCEL_SIZE + 6, z * PARCEL_SIZE + 6)
  if (key === '1,1') return { name: '첫 농터', text: '농가와 판매대가 있는 시작 구역이에요.' }
  if (biome === 'lakeside') return { name: z === 3 ? '아랫마을 연못가' : '동쪽 연못 옆 빈터', text: '연못에서 낚시를 하고, 나무다리를 놓아 건널 수 있어요. 오리 연못과 잘 어울려요.' }
  if (biome === 'woods' && x === 0 && z === 0) return { name: '돌담 언덕', text: '바위와 나무가 많아 정리하면 돌과 나뭇가지가 나와요. 돌담을 쌓기 좋아요.' }
  if (biome === 'woods') return { name: '숲 가장자리', text: '버섯과 산딸기를 채집할 수 있어요. 오래된 팻말이 숲길을 가리켜요.' }
  if (key === '2,1') return { name: '해 뜨는 동쪽 들판', text: '장애물이 거의 없어 밭을 넓게 펼치기 좋아요. 아침 해가 먼저 닿아요.' }
  if (key === '1,2') return { name: '남쪽 목초지', text: '평평한 풀밭이라 외양간과 양 우리를 길로 이어 목장을 꾸미기 좋아요.' }
  return { name: '바람 언덕 꽃밭 터', text: '화단과 벌통을 가까이 두면 꿀이 빨리 차요. 풍차를 세우기 좋은 언덕이에요.' }
}

export function FarmMap({ farm, parcel, choose, label = '농장 지도' }) {
  return <div className="farm-minimap" aria-label={label}>
    {Array.from({ length: (MAP_SIZE / PARCEL_SIZE) ** 2 }, (_, index) => {
      const width = MAP_SIZE / PARCEL_SIZE
      const x = index % width
      const z = Math.floor(index / width)
      const key = x + ',' + z
      const owned = farm.parcels.includes(key)
      const terrain = terrainAt(x * PARCEL_SIZE + 6, z * PARCEL_SIZE + 6)
      const name = farm.zoneNames?.[key] || zoneCharm(key).name
      const ready = owned && farm.now ? farm.objects.filter(object => parcelAt(object.x, object.z) === key && isReady(object, farm.now)).length : 0
      return <button type="button" key={key} className={'farm-parcel ' + (owned ? 'owned ' : '') + (ready ? 'has-ready ' : '') + terrain.biome}
        aria-label={name + (owned ? ' 농지' + (ready ? ', 수확 가능 ' + ready + '곳' : '') : canExpand(farm, key) ? ' 열 수 있는 미개간지' : ' 미개간지')}
        aria-pressed={parcel === key} title={name}
        onClick={() => choose(key)}>{owned ? ready ? '✦' + ready : '▪' : '＋'}</button>
    })}
  </div>
}

export function TileGrid({ farm, parcel, onPick, target }) {
  const [focus, setFocus] = useState(0)
  const keys = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -PARCEL_SIZE, ArrowDown: PARCEL_SIZE }
  const [px, pz] = parcel.split(',').map(Number)
  const cells = new Map()
  const selected = new Set((target?.path ?? (target ? [target] : [])).map(tile => tile.x + ',' + tile.z))
  for (const object of farm.objects) {
    if (object.stored) continue
    for (const cell of footprint(object.kind, object.x, object.z, object.rotation)) {
      cells.set(cell.x + ',' + cell.z, object)
    }
  }
  return <div className="farm-cell-scroll"><div className="farm-cell-grid" aria-label="농지 타일 선택" style={{ '--grid-size': PARCEL_SIZE }}>
    {Array.from({ length: PARCEL_SIZE ** 2 }, (_, index) => {
      const x = px * PARCEL_SIZE + index % PARCEL_SIZE
      const z = pz * PARCEL_SIZE + Math.floor(index / PARCEL_SIZE)
      const key = x + ',' + z
      const terrain = terrainAt(x, z)
      const cleared = farm.cleared?.includes(key)
      const obstacle = !cleared && terrain.obstacle
      const forage = !cleared && terrain.forage
      const object = cells.get(key)
      const label = object ? objectName(object) : terrainNames[obstacle || forage] || '빈 타일'
      return <button type="button" key={key} className={'farm-cell ' + (object ? 'occupied' : obstacle || terrain.biome)}
        aria-label={label} title={label}
        tabIndex={focus === index ? 0 : -1}
        onFocus={() => setFocus(index)}
        aria-pressed={selected.has(key)}
        onClick={() => onPick({ x, z, id: object?.id })}
        onKeyDown={event => {
          if (!keys[event.key]) return
          event.preventDefault()
          event.stopPropagation()
          const next = index + keys[event.key]
          event.currentTarget.parentElement.children[next]?.focus()
        }}>
        {object && object.x === x && object.z === z ? buildings[object.kind]?.icon || '▪' :
          obstacle === 'tree' ? '♠' : obstacle === 'rock' ? '◆' : obstacle === 'water' ? '≈' : forage && products[forage]?.icon || ''}
      </button>
    })}
  </div></div>
}

export function Shop({ farm, choose, restore }) {
  const [category, setCategory] = useState('farm')
  return <>
    <div className="farm-categories" aria-label="시설 종류">
      {Object.entries({ ...categories, stored: '보관함' }).map(([id, name]) =>
        <FarmButton key={id} active={id === category} onClick={() => setCategory(id)}>{name}</FarmButton>)}
    </div>
    {category === 'stored' ?
      <div className="farm-catalog">
        {farm.objects.filter(object => object.stored).map(object => <button className="farm-item" type="button" key={object.id}
          onClick={() => restore(object)}><span aria-hidden="true">{buildings[object.kind]?.icon || '📦'}</span><strong>{objectName(object)}</strong><small>다시 배치</small></button>)}
        {!farm.objects.some(object => object.stored) && <p>농장에서 보관한 시설을 여기에 보관해요.</p>}
      </div> :
      <div className="farm-catalog">
        {Object.entries(buildings).filter(([, item]) => item.category === category && item.price > 0).map(([id, item]) => {
          const locked = farm.level < item.level
          return <button className="farm-item" type="button" key={id} disabled={locked || farm.coins < item.price}
            onClick={() => choose(id)}>
            <span aria-hidden="true">{item.icon || '▪'}</span><strong>{item.name}</strong>
            <small>{locked ? 'Lv. ' + item.level : '✦ ' + item.price.toLocaleString('ko-KR')} · {item.size.join('×')}</small>
          </button>
        })}
      </div>}
  </>
}

export function Seeds({ farm, ids = [], act, choose }) {
  const favorites = farm.favorites ?? []
  const count = choose ? 1 : ids.length
  const seeds = Object.entries(crops).sort(([a], [b]) => Number(favorites.includes(b)) - Number(favorites.includes(a)))
  return <>
    <p>{choose ? '작물을 고르면 원하는 빈 밭에 계속 심을 수 있어요. 다른 작물을 고르거나 파종을 종료할 때까지 유지돼요.' : ids.length === 1 ? '심을 씨앗을 고르세요.' : '빈 밭 ' + ids.length + '칸에 같은 씨앗을 심어요.'}</p>
    <div className="farm-catalog farm-seeds">
      {seeds.map(([id, crop]) => {
        const locked = farm.level < crop.level
        return <div className="farm-seed" key={id}>
          <button className="farm-item" type="button" disabled={locked || !choose && farm.coins < crop.seed * count}
            onClick={() => choose ? choose(id) : act({ type: 'plant', ids, crop: id }, crop.name + ' 씨앗을 심었어요.')}>
            <span aria-hidden="true">{crop.icon || '🌱'}</span><strong>{crop.name}</strong>
            {inSeason(farm, id) && <small className="farm-season-badge">제철 +20%</small>}
            <small>{locked ? 'Lv. ' + crop.level : (choose ? '칸당 ' : '') + '✦ ' + (crop.seed * count).toLocaleString('ko-KR')}</small>
            <small>{remainingTime(crop.seconds * 1000)}</small>
          </button>
          <button className="farm-favorite" type="button" aria-label={crop.name + ' 즐겨찾기'} aria-pressed={favorites.includes(id)}
            onClick={() => act({ type: 'favorite', crop: id })}>{favorites.includes(id) ? '★' : '☆'}</button>
        </div>
      })}
    </div>
  </>
}

// 수확물을 바로 팔지, 가공할지, 가축 간식으로 쓸지 고를 수 있게 쓰임새를 보여 준다
function ItemUses({ id, farm, openObject }) {
  const uses = Object.entries(recipes).filter(([, recipe]) => recipe.inputs[id])
  const feed = ['carrot', 'wheat'].includes(id)
  if (!uses.length && !feed) return null
  return <ul className="farm-uses">
    {uses.map(([key, recipe]) => {
      const workshop = farm.objects.find(object => !object.stored && object.kind === recipe.building)
      return <li key={key}>
        <span>{recipe.name}: {Object.entries(recipe.inputs).map(([item, amount]) => (productBook[item]?.name || item) + ' ' + amount).join(' + ')}
          {' → '}{productBook[recipe.product]?.name} (✦ {productBook[recipe.product]?.price}) · {remainingTime(recipe.seconds * 1000)}</span>
        {workshop ? <button type="button" onClick={() => openObject(workshop.id)}>{josa(buildings[recipe.building].name, '으로', '로')} 가기</button>
          : <small>{buildings[recipe.building].name} 필요 · Lv. {buildings[recipe.building].level}</small>}
      </li>
    })}
    {feed && <li><span>가축 간식: 1개로 남은 생산 시간 20% 단축</span><small>축사를 눌러 주기</small></li>}
  </ul>
}

export function Inventory({ farm, act, openObject = () => {} }) {
  const items = Object.entries(farm.inventory).filter(([id, count]) => count > 0 && productBook[id])
  const sale = items.reduce((sum, [id, count]) => sum + count * Math.round(productBook[id].price * (inSeason(farm, id) ? 1.2 : 1)), 0)
  if (!items.length) return <p>수확하거나 만든 상품이 여기에 담겨요.</p>
  return <>
    <ul className="farm-list">
      {items.map(([id, count]) => {
        const item = productBook[id]
        return <li key={id}>
          <span aria-hidden="true">{item.icon || '•'}</span>
          <span><strong>{item.name} ×{count}</strong><small>바로 팔면 개당 ✦ {inSeason(farm, id) ? Math.round(item.price * 1.2) + ' · 제철' : item.price}</small>
            <ItemUses id={id} farm={farm} openObject={openObject} /></span>
          <div className="farm-item-actions">
            <FarmButton onClick={() => act({ type: 'sell', item: id, quantity: 1 }, item.name + ' 1개를 팔았어요.')}>1개</FarmButton>
            {count > 1 && <FarmButton onClick={() => act({ type: 'sell', item: id, quantity: count }, item.name + ' 전부 팔았어요.')}>전부</FarmButton>}
          </div>
        </li>
      })}
    </ul>
    <button type="button" className="primary" disabled={!sale} onClick={() => act({ type: 'sell' }, '창고의 상품을 팔았어요.')}>모두 팔기 · ✦ {sale.toLocaleString('ko-KR')}</button>
    {farm.charm?.tier > 0 && <p><small>{farm.charm.name} 손님들이 판매 금액의 {farm.charm.tier * 2}%를 팁으로 더 줘요.</small></p>}
  </>
}

const orderLabels = { small: '소량 판매', regular: '단골 요청', long: '장기 주문', season: '계절 좌판 · 선택' }

// 당장 살 것과 다음에 열 땅을 실제 가격 규칙 그대로 보여 준다
function Goals({ farm }) {
  const fence = buildings.fence.price
  const land = parcelPrice(farm)
  const next = [...Object.values(buildings), ...Object.values(crops)].filter(item => item.level === farm.level + 1 && !item.gift)
  return <div className="farm-goals">
    <h3>다음 목표</h3>
    <p>입구 울타리 10칸 ✦ {fence * 10} {farm.coins >= fence * 10 ? '· 지금 살 수 있어요' : '· ✦ ' + (fence * 10 - farm.coins) + ' 남음'}</p>
    <p>새 구역 열기 ✦ {land} {farm.coins >= land ? '· 지금 열 수 있어요' : '· ✦ ' + (land - farm.coins) + ' 남음'}</p>
    {next.length > 0 && <p>Lv. {farm.level + 1}에 열려요: {next.map(item => item.icon + ' ' + item.name).join(', ')}</p>}
  </div>
}

function friendship(count = 0) {
  const tier = friendSteps.filter(step => count >= step).length
  return { tier, name: friendNames[tier], next: friendSteps[tier] }
}

function OrderRow({ order, farm, act, canSkip }) {
  const missing = Object.entries(order.items).some(([id, amount]) => (farm.inventory[id] || 0) + (order.shared?.[id] || 0) < amount)
  const friend = order.from && friendship(farm.friends?.[order.from])
  return <li>
    <div><strong>{order.name}</strong>
      {order.kind && <small className="farm-order-kind">{orderLabels[order.kind]}</small>}
      {friend && <small className="farm-friend">♥ {friend.name}{friend.next ? ` · 납품 ${farm.friends?.[order.from] ?? 0}/${friend.next}` : ''}</small>}
      {order.line && <small>“{order.line}”</small>}
      <small>{Object.entries(order.items).map(([id, count]) => {
        const current = (farm.inventory[id] || 0) + (order.shared?.[id] || 0)
        return `${productBook[id]?.name || id}${inSeason(farm, id) ? '(제철)' : ''} ${Math.min(current, count)}/${count}`
      }).join(' · ')}</small></div>
    <div className="farm-item-actions">
      <FarmButton disabled={missing || order.done}
        onClick={() => act({ type: 'order', id: order.id }, '주문을 전달했어요. 트럭이 출발해요!')}>{order.done ? '완료' : '납품 · ✦ ' + order.reward}</FarmButton>
      {canSkip && !order.done && <FarmButton onClick={() => act({ type: 'skipOrder', id: order.id }, '다른 주문으로 바꿨어요.')}>다른 주문</FarmButton>}
    </div>
  </li>
}

// 주간 농장 노트: 기한을 놓쳐도 벌칙 없이 다음 주로 이어진다
function Notes({ farm, act }) {
  const goals = farm.notes?.goals ?? []
  if (!goals.length) return null
  return <div className="farm-notes">
    <h3>📒 이번 주 농장 노트 <small>스티커 {farm.stickers ?? 0}장</small></h3>
    <ul className="farm-list">
      {goals.map(goal => {
        const progress = Math.max(0, Math.min(goal.n, (farm.stats?.[goal.stat] ?? 0) - goal.base))
        return <li key={goal.id}>
          <div><strong>{goal.text}</strong><progress max={goal.n} value={progress} aria-label={goal.text + ' 진행도'} /><small>{progress} / {goal.n}</small></div>
          <FarmButton disabled={goal.claimed || progress < goal.n}
            onClick={() => act({ type: 'claimNote', id: goal.id }, '스티커를 붙였어요! ✦ 40')}>{goal.claimed ? '완료 ⭐' : '스티커 받기'}</FarmButton>
        </li>
      })}
    </ul>
    <p><small>못 채운 목표는 다음 주 노트로 그대로 넘어가요.</small></p>
  </div>
}

// 떠돌이 상인: 6시간마다 바뀌고, 놓쳐도 다음 상인이 와요
export function Peddler({ farm, act }) {
  const offer = farm.peddlerOffer
  if (!offer) return null
  const gift = buildings[offer.give]
  const missing = farm.coins < offer.coins || Object.entries(offer.items).some(([id, count]) => (farm.inventory[id] ?? 0) < count)
  return <div className="farm-peddler">
    <h3>🛒 떠돌이 상인</h3>
    <p>“{gift.icon} {gift.name}, 이 동네엔 처음 가져와 봤어요. {Object.entries(offer.items).map(([id, count]) => productBook[id].name + ' ' + count + '개').join(', ')}에 ✦ {offer.coins}만 더 주시면 바꿔 드릴게요.”</p>
    <FarmButton disabled={offer.done || missing}
      onClick={() => act({ type: 'trade', id: offer.id }, josa(gift.name, '을', '를') + ' 받았어요. 상점 보관함에 있어요.')}>
      {offer.done ? '교환 완료 · 다음 상인을 기다려요' : missing ? '물건이 부족해요' : '교환하기'}</FarmButton>
  </div>
}

export function Orders({ farm, act }) {
  return <>
    {farm.orders?.length ? <ul className="farm-list farm-orders">
      {farm.orders.map(order => <OrderRow key={order.id} order={order} farm={farm} act={act} canSkip />)}
      {farm.event && <OrderRow order={farm.event} farm={farm} act={act} />}
    </ul> : <p>준비된 주문이 없어요.</p>}
    <p><small>주문은 지금 농장에서 만들 수 있는 것으로만 들어와요. 제철 작물은 판매가와 주문 보상이 20% 더 높아요. 단골에게 자주 납품하면 우정이 깊어져 선물을 받아요.</small></p>
    <Notes farm={farm} act={act} />
    <Peddler farm={farm} act={act} />
    <Goals farm={farm} />
  </>
}

export function Progress({ farm, act }) {
  const discovery = farm.discovered ?? []
  const stats = Object.entries(farm.stats ?? {}).filter(([key, value]) => statsLabels[key] && typeof value === 'number')
  const livestock = Object.entries(buildings).filter(([, item]) => item.category === 'animal')
  const step = levelProgress(farm)
  return <>
    <div className="farm-progress"><strong>Lv. {farm.level}</strong><progress max={step.need} value={step.xp} aria-label="다음 레벨까지 경험치" /><span>{step.xp} / {step.need} XP</span></div>
    {farm.charm && <div className="farm-charm">
      <strong>🌸 {farm.charm.name}</strong><span>매력 {farm.charm.score}{farm.charm.next ? ' / ' + farm.charm.next : ''}</span>
      <small>장식의 종류가 많을수록 매력이 올라요. 단계마다 판매 팁이 2%씩 늘고 방문 화면에 배지가 보여요.</small>
    </div>}
    {stats.length > 0 && <dl className="farm-stats">{stats.map(([key, value]) => <div key={key}><dt>{statsLabels[key]}</dt><dd>{value.toLocaleString('ko-KR')}</dd></div>)}</dl>}
    <h3>이웃과의 우정</h3>
    <ul className="farm-discovery">
      {Object.entries(neighborNames).map(([id, name]) => {
        const friend = friendship(farm.friends?.[id])
        return <li key={id} className={friend.tier ? 'found' : ''}>♥ {name} · {friend.name}
          {friend.tier < 2 ? ` · ${friendSteps[1]}번 납품하면 ${buildings[neighborGifts[id]].name}` : ''}</li>
      })}
    </ul>
    <h3>도감 세트</h3>
    <ul className="farm-sets">
      {Object.entries(collectionSets).map(([key, set]) => {
        const found = set.items.filter(item => discovery.includes(item)).length
        const done = farm.rewards?.includes(key)
        return <li key={key} className={done ? 'found' : ''}>
          <span>{set.name} 세트 · {found}/{set.items.length}</span>
          <progress max={set.items.length} value={found} aria-label={set.name + ' 세트 진행도'} />
          <small>{done ? '받음: ' : '보상: '}{buildings[set.reward].icon} {buildings[set.reward].name}</small>
        </li>
      })}
    </ul>
    {Object.keys(farm.records ?? {}).length > 0 && <>
      <h3>🎣 어종 기록</h3>
      <ul className="farm-discovery">
        {Object.entries(farm.records).map(([id, size]) => <li key={id} className="found">{productBook[id]?.icon} {productBook[id]?.name} · 최대 {size}cm</li>)}
      </ul>
    </>}
    <h3>농장 업적 <small>이룬 업적은 칭호로 달 수 있어요</small></h3>
    <ul className="farm-discovery">
      {achievements.map(({ id, name, stat, n }) => {
        const progress = Math.min(farm.stats?.[stat] ?? 0, n)
        const wearing = farm.title === name
        return <li key={id} className={progress === n ? 'found' : ''}>{name} · {progress}/{n}
          {progress === n && act && <button type="button" className="farm-title-pick" aria-pressed={wearing}
            onClick={() => act({ type: 'title', id: wearing ? null : id }, wearing ? '칭호를 뗐어요.' : '🏅 ' + name + ' 칭호를 달았어요.')}>{wearing ? '달고 있음' : '칭호 달기'}</button>}
        </li>
      })}
    </ul>
    <h3>가축 도감</h3>
    <ul className="farm-discovery">
      {livestock.map(([kind, item]) => {
        const seen = discovery.includes(item.product) || farm.objects.some(object => object.kind === kind)
        return <li key={kind} className={seen ? 'found' : ''}>{item.icon} {item.name} · {seen ? '발견' : '미발견'}</li>
      })}
    </ul>
    <h3>발견 도감 <small>{discovery.length} / {Object.keys(productBook).length}</small></h3>
    <ul className="farm-discovery">
      {Object.entries(productBook).map(([id, item]) => <li key={id} className={discovery.includes(id) ? 'found' : ''}>
        <span aria-hidden="true">{discovery.includes(id) ? item.icon || '✦' : '·'}</span>{discovery.includes(id) ? item.name : '미발견'}
      </li>)}
    </ul>
  </>
}

function ObjectRecipes({ object, farm, now, act }) {
  const available = Object.entries(recipes).filter(([, recipe]) => recipe.building === object.kind)
  if (!available.length) return null
  const queue = object.queue ?? []
  const level = object.level ?? 1
  const slots = 6 + 2 * level
  return <>
    <p>{queue.length ? '작업 대기열 · ' + queue.length + ' / ' + slots : '만들 상품을 고르세요.'}{level > 1 ? ' · 증축 ' + level + '단계' : ''}</p>
    {queue.length > 0 && <ul className="farm-list">
      {queue.map((job, index) => <li key={index}><strong>{recipes[job.recipe]?.name || job.recipe}</strong>
        <small>{job.readyAt <= now ? '완료' : remainingTime(job.readyAt - now)}</small></li>)}
    </ul>}
    <ul className="farm-list">
      {available.map(([id, recipe]) => {
        const limit = Math.min(slots - queue.length, ...Object.entries(recipe.inputs).map(([item, amount]) => Math.floor((farm.inventory[item] || 0) / amount)))
        return <li key={id}><div><strong>{recipe.name}</strong>
          <small>{Object.entries(recipe.inputs).map(([item, amount]) => (productBook[item]?.name || item) + ' ×' + amount).join(' · ')} · {remainingTime(Math.round(recipe.seconds * 1000 * (1.1 - .1 * level)))}</small>
        </div><form className="farm-quantity" onSubmit={event => {
          event.preventDefault()
          const quantity = Number(new FormData(event.currentTarget).get('quantity')) || 1
          act({ type: 'enqueue', id: object.id, recipe: id, quantity }, '가공을 시작했어요.')
        }}>
          {limit > 1 && <input key={limit} type="number" name="quantity" aria-label={recipe.name + ' 작업 수량'} min="1" max={limit} defaultValue="1" required />}
          <button className="farm-button" disabled={limit < 1}>만들기</button>
        </form></li>
      })}
    </ul>
  </>
}

export function ObjectPanel({ object, farm, now, visitor, act, edit, move, store }) {
  const [customize, setCustomize] = useState(false)
  const [animalNumber, setAnimalNumber] = useState(1)
  const item = buildings[object.kind]
  const ready = isReady(object, now)
  if (!item) return null
  const animal = item.category === 'animal'
  const fishAt = farm.cooldowns?.['fish:' + object.id] ?? 0
  const upgradePrice = Math.max(12, item.price) * object.level
  if (visitor) return <p>{item.icon} {item.name} · Lv. {object.level || 1}</p>
  if (object.kind === 'market' && !edit) return <Inventory farm={farm} act={act} />
  return <>
    {['plot', 'greenhouse'].includes(object.kind) && !object.crop && !edit &&
      <Seeds farm={farm} ids={[object.id]} act={act} />}
    {object.crop && <p><strong>{crops[object.crop.kind]?.name}</strong> · {ready ? '수확할 수 있어요.' : remainingTime(object.crop.readyAt - now) + ' 뒤에 수확할 수 있어요.'}{object.crop.watered ? ' 💧' : ''}</p>}
    {!ready && !edit && farm.inventory.compost > 0 && (object.crop || item.product) && <FarmButton
      onClick={() => act({ type: 'fertilize', id: object.id }, '퇴비를 줬어요. 바로 거둘 수 있어요!')}>🟫 퇴비 주기 · {farm.inventory.compost}개</FarmButton>}
    {object.crop && !ready && !object.crop.watered && !edit && <FarmButton
      onClick={() => act({ type: 'water', ids: [object.id] }, '물을 줬어요. 30% 빨리 자라요.')}>💧 물 주기</FarmButton>}
    {item.product && <p>{productBook[item.product]?.name} · {ready ? '모을 수 있어요.' : object.readyAt ? remainingTime(object.readyAt - now) + ' 남았어요.' : '준비 중'}</p>}
    {ready && <button type="button" className="primary"
      onClick={() => act({ type: 'collect', id: object.id }, '창고에 담았어요.')}>{object.crop ? '수확하기' : '생산물 받기'}</button>}
    {!edit && <ObjectRecipes object={object} farm={farm} now={now} act={act} />}
    {!edit && animal && <div className="farm-hearts" aria-label={'애정도 하트 ' + hearts(object) + '개'}>
      <span aria-hidden="true">{'♥'.repeat(hearts(object))}{'♡'.repeat(5 - hearts(object))}</span>
      <small>{hearts(object) >= 5 ? '최고의 단짝이에요!' : `쓰다듬기와 간식으로 하트가 쌓여요 (${(object.love ?? 0) % 10}/10) · 하트가 많을수록 가끔 하나 더 줘요`}</small>
    </div>}
    {!edit && animal && hearts(object) >= 3 && <div className="farm-colors" aria-label="이름표 색">
      {tagColors.map((color, index) => <button key={color} type="button" aria-label={`이름표 색 ${index + 1}`}
        aria-pressed={object.tag === color} style={{ backgroundColor: color }} onClick={() => act({ type: 'tag', id: object.id, color }, '이름표를 꾸몄어요.')} />)}
    </div>}
    {!edit && (animal || object.kind === 'pond') && <div className="farm-actions">
      {animal && <>
        <FarmButton onClick={() => act({ type: 'pet', id: object.id }, '가축과 인사했어요.')}>쓰다듬기</FarmButton>
        {['carrot', 'wheat'].map(food => <FarmButton key={food} disabled={!farm.inventory[food] || ready || object.fedAt > now - 60000}
          onClick={() => act({ type: 'feed', id: object.id, item: food }, '먹이를 줬어요.')}>먹이 · {productBook[food].name} 1개</FarmButton>)}
      </>}
      {['pond', 'duckpond'].includes(object.kind) && <FarmButton disabled={fishAt > now}
        onClick={() => act({ type: 'fish', id: object.id }, '물고기를 잡았어요.')}>{fishAt > now ? '낚시까지 ' + remainingTime(fishAt - now) : '낚시'}</FarmButton>}
    </div>}
    {!edit && item.animalModel && <form className="farm-inline-form" onSubmit={event => {
      event.preventDefault()
      act({ type: 'renameAnimal', id: object.id, animal: animalNumber,
        name: new FormData(event.currentTarget).get('name') }, '가축 이름을 저장했어요.')
    }}>
      <label><span>가축 선택</span><select value={animalNumber} onChange={event => setAnimalNumber(Number(event.target.value))}
        style={object.tag ? { borderColor: object.tag, boxShadow: '0 0 0 2px ' + object.tag } : undefined}>
        {Array.from({ length: object.level }, (_, index) => index + 1).map(number =>
          <option key={number} value={number}>{object.animalNames?.[number] || number + '번 가축'}</option>)}
      </select></label>
      <label><span>가축 이름</span><input key={animalNumber} name="name" maxLength="20" defaultValue={object.animalNames?.[animalNumber] || ''} required /></label>
      <button className="primary">이름 저장</button>
    </form>}
    {edit && <div className="farm-actions">
      <FarmButton onClick={move}>옮기기</FarmButton>
      <FarmButton onClick={store}>보관</FarmButton>
      <FarmButton active={customize} onClick={() => setCustomize(!customize)}>꾸미기</FarmButton>
      {maxLevel(object) > 1 && <FarmButton disabled={object.level >= maxLevel(object) || farm.coins < upgradePrice}
        onClick={() => act({ type: 'upgrade', id: object.id }, animal ? '축사를 증축했어요. 한 번에 하나 더 생산해요.' : '공방을 증축했어요. 예약 +2칸, 제작 10% 빨라요.')}>
        {object.level >= maxLevel(object) ? '최대 레벨' : '증축 · ✦ ' + upgradePrice}</FarmButton>}
    </div>}
    {edit && customize && <>
      <form className="farm-inline-form" onSubmit={event => {
        event.preventDefault()
        const name = new FormData(event.currentTarget).get('name')
        act({ type: 'rename', id: object.id, name }, '이름을 저장했어요.')
      }}><label><span>시설 이름</span><input name="name" maxLength="24" defaultValue={object.name || ''} placeholder={item.name} required /></label>
        <button className="primary">저장</button>
      </form>
      <div className="farm-colors" aria-label="시설 색상">
        {colorChoices.map((color, index) => <button key={color} type="button" aria-label={`색상 ${index + 1}`}
          aria-pressed={object.color === color} style={{ backgroundColor: color }} onClick={() => act({ type: 'color', id: object.id, color }, '색상을 바꿨어요.')} />)}
      </div>
    </>}
  </>
}

export function Settings({ farm, visitor, act, scene, full }) {
  const settings = farm.settings ?? {}
  const set = (key, value) => act({ type: 'setSettings', settings: { [key]: value } }, '설정을 저장했어요.')
  return <div className="farm-settings">
    {!visitor && <>
      <label className="farm-setting"><span>화면 품질</span><select value={settings.quality ?? 'high'} onChange={event => set('quality', event.target.value)}>
        <option value="high">높음</option><option value="low">낮음</option>
      </select></label>
      {Object.entries({ motion: '움직임 효과', weather: '날씨 효과', audio: '효과음', ambient: '농장 환경음', music: '배경 음악', toon: '만화 같은 명암 (툰 셰이딩)', replant: '수확하면 같은 씨앗 자동으로 다시 심기', minigame: '생산물 받을 때 받기 놀이' }).map(([key, name]) =>
        <label key={key} className="farm-setting"><span>{name}</span><input type="checkbox"
          checked={key === 'minigame' ? settings[key] !== false : Boolean(settings[key])} onChange={event => set(key, event.target.checked)} /></label>)}
      <h3>카메라 위치 · 추천 산책 지점</h3>
      <p><small>저장한 위치는 사진 모드에서 같은 자리를 다시 찍을 때 쓰고, 방문 링크가 열려 있으면 방문자에게 추천 산책 지점으로 보여요.</small></p>
      {['1', '2', '3'].map(slot => <div className="farm-setting" key={slot}>
        <strong>위치 {slot}</strong>
        <div className="farm-item-actions">
          <FarmButton disabled={!scene} onClick={() => act({ type: 'camera', slot, view: scene.getView() }, '카메라 위치를 저장했어요.')}>저장</FarmButton>
          <FarmButton disabled={!scene || !farm.views?.[slot]} onClick={() => scene.setView(farm.views[slot])}>이동</FarmButton>
        </div>
      </div>)}
    </>}
    {full && <FarmButton icon="full" onClick={full}>전체 화면 전환</FarmButton>}
    <a href="/models/sources.json" target="_blank" rel="noreferrer">3D 모델 출처와 라이선스 ↗</a>
    {!visitor && <form action={signOut}><button type="submit" className="primary">로그아웃</button></form>}
  </div>
}

export function ParcelPanel({ farm, parcel, visitor, act, empty, seed, grid, toggleGrid }) {
  const owned = farm.parcels.includes(parcel)
  const [x, z] = parcel.split(',').map(Number)
  const adjacent = canExpand(farm, parcel)
  const price = parcelPrice(farm)
  const biome = terrainAt(x * PARCEL_SIZE + 6, z * PARCEL_SIZE + 6).biome
  const ready = farm.objects.filter(object => !object.stored && parcelAt(object.x, object.z) === parcel && isReady(object, farm.now))
  return <>
    <p>{({ meadow: '초지', woods: '숲', lakeside: '물가' })[biome]} · {PARCEL_SIZE} × {PARCEL_SIZE} 타일 · {zoneCharm(parcel).name}</p>
    <p><small>{zoneCharm(parcel).text}</small></p>
    {owned && <p>{ready.length ? '수확할 수 있는 곳 ' + ready.length + '곳' : '지금 거둘 것은 없어요.'}</p>}
    {!visitor && owned && <>
      <form className="farm-inline-form" onSubmit={event => {
        event.preventDefault()
        const name = new FormData(event.currentTarget).get('name')
        act({ type: 'zone', parcel, name }, '구역 이름을 저장했어요.')
      }}>
        <label><span>구역 이름</span><input name="name" defaultValue={farm.zoneNames?.[parcel] ?? ''} maxLength="20" placeholder="구역 이름" required /></label>
        <button className="primary">저장</button>
      </form>
      <div className="farm-actions">
        <FarmButton disabled={!empty.length} onClick={() => seed(empty)}>빈 밭에 심기</FarmButton>
        <FarmButton disabled={!ready.length}
          onClick={() => act({ type: 'collect', parcel }, '이 구역의 생산물을 모았어요.')}>이 구역 수확</FarmButton>
      </div>
    </>}
    {!visitor && !owned && <>
      <p>{adjacent ? '농지를 넓혀 새 시설을 놓을 수 있어요.' : '보유한 농지와 맞닿은 구역부터 열 수 있어요.'}</p>
      <button className="primary" type="button" disabled={!adjacent || farm.coins < price}
        onClick={() => act({ type: 'expand', parcel }, '새 구역을 열었어요.')}>구역 열기 · ✦ {price}</button>
    </>}
    {toggleGrid && <FarmButton icon="map" active={grid} onClick={toggleGrid}>{grid ? '3D 화면' : '타일로 보기'}</FarmButton>}
  </>
}

export function TerrainPanel({ farm, tile, act, visitor }) {
  const terrain = terrainAt(tile.x, tile.z)
  const key = tile.x + ',' + tile.z
  const cleared = farm.cleared?.includes(key)
  const forageAt = farm.cooldowns?.['forage:' + key] ?? 0
  const fishAt = farm.cooldowns?.['fish:' + key] ?? 0
  if (cleared || !terrain.obstacle && !terrain.forage) return <p>시설을 놓을 수 있는 빈 타일이에요.</p>
  return <>
    <p>{terrainNames[terrain.obstacle] || terrainNames[terrain.forage]}</p>
    {!visitor && <div className="farm-actions">
      {terrain.forage && <FarmButton disabled={forageAt > farm.now}
        onClick={() => act({ type: 'forage', x: tile.x, z: tile.z }, '채집물을 창고에 담았어요.')}>{forageAt > farm.now ? '채집까지 ' + remainingTime(forageAt - farm.now) : '채집하기'}</FarmButton>}
      {terrain.obstacle === 'water' && <FarmButton disabled={fishAt > farm.now}
        onClick={() => act({ type: 'fish', x: tile.x, z: tile.z }, '물고기를 잡았어요.')}>{fishAt > farm.now ? '낚시까지 ' + remainingTime(fishAt - farm.now) : '낚시'}</FarmButton>}
      {['tree', 'rock'].includes(terrain.obstacle) && <FarmButton
        onClick={() => act({ type: 'clear', x: tile.x, z: tile.z }, '장애물을 정리했어요.')}>정리하기</FarmButton>}
    </div>}
  </>
}

export function Help() {
  return <div className="farm-help">
    <p>빈 밭에 씨앗을 심고, 시간이 지나면 수확하세요. 창고에서 팔거나 주문을 채워 시설을 늘릴 수 있어요.</p>
    <p>익은 밭과 생산이 끝난 축사는 누르면 바로 거둬요. 아래 도구에서 낫이나 씨앗을 고르면 밭을 손가락으로 쓸어 한 번에 처리해요.</p>
    <p>기다리는 동안: 💧 물뿌리개로 자라는 밭을 쓸면 30% 빨리 자라고(비 오는 날은 심을 때 자동), 퇴비통에서 만든 퇴비를 주면 바로 거둘 수 있어요. 들판에 나타난 손님을 누르면 작은 선물을 줘요. 10분 안에 주문을 이어서 납품하면 보상이 조금씩 늘어요.</p>
    <p>비 온 날 길 위의 달팽이, 벌통 주변 나비, 새 구역의 오래된 팻말처럼 둘러보면 보이는 것들도 있어요.</p>
    <dl>
      <div><dt>시점 이동</dt><dd>드래그 · 방향키 · 두 손가락</dd></div>
      <div><dt>시점 회전</dt><dd>우클릭 드래그 · Q / E</dd></div>
      <div><dt>확대 / 축소</dt><dd>휠 · 두 손가락 오므리기</dd></div>
      <div><dt>농장 편집</dt><dd>B · 배치 회전 R · 확정 Enter</dd></div>
      <div><dt>이전 배치 복구</dt><dd>Ctrl / ⌘ + Z</dd></div>
      <div><dt>창 닫기</dt><dd>Esc</dd></div>
    </dl>
  </div>
}
