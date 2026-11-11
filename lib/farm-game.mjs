import { achievements, batchKinds, buildings, collectionSets, crops, products, recipes, seasonCrops } from './farm-catalog.mjs'
import { canExpand, canPlace, footprint, inMap, parcelAt, parcelPrice, START_PARCEL, terrainAt, tileKey } from './farm-layout.mjs'
import { isGolden, roll } from './farm-luck.mjs'
import { avatarColors, avatarItems, avatarLook, defaultAvatar } from './farm-avatar.mjs'

export { isGolden, roll }

const minute = 60000
const layoutCommands = new Set(['place', 'move', 'moveGroup', 'store', 'restore', 'undo'])
const collection = new Set(['plot', 'animal', 'artisan'])
const orderKinds = ['small', 'small', 'regular', 'long']
const neighbors = [
  { id: 'sundeok', name: '순덕 할머니', use: '아침 빵을 구웠어요', hello: '아침 장에 쓸 걸 조금 부탁해도 될까요?',
    close: '우리 농장 손주 같아서 든든해요.', best: '장독 열 때마다 생각나요, 고마워요.', gift: 'jangdok' },
  { id: 'minho', name: '민호 사장', use: '가게에 내놨더니 금방 팔렸어요', hello: '가게에 새로 들일 물건을 찾고 있어요.',
    close: '손님들이 이 농장 물건만 찾아요.', best: '평상에서 같이 수박 먹어요!', gift: 'pyeongsang' },
  { id: 'yuna', name: '유나 선생님', use: '아이들 간식을 만들었어요', hello: '아이들과 나눠 먹을 걸 부탁해요.',
    close: '아이들이 농장 그림을 그렸어요.', best: '반 아이들이 농장으로 소풍 가고 싶대요.', gift: 'yunapot' },
]
// 단골 납품 횟수에 따른 우정 단계 (아는 사이 · 친한 이웃 · 단짝)
const friendSteps = [3, 6, 10]
const friendTier = count => friendSteps.filter(step => (count ?? 0) >= step).length
const peddlerGoods = ['cloverpot', 'mushroomstool', 'bluelantern']
const charmTiers = [
  { score: 0, name: '새싹 농장' }, { score: 60, name: '꽃길 농장' }, { score: 180, name: '그림책 농장' },
  { score: 400, name: '동화 속 농장' }, { score: 800, name: '전설의 농장' },
]
const noteGoals = [
  { stat: 'harvested', n: 30, text: '작물 30번 수확하기' },
  { stat: 'collected', n: 10, text: '동물 생산물 10개 모으기' },
  { stat: 'sold', n: 40, text: '물건 40개 팔기' },
  { stat: 'orders', n: 4, text: '주문 4번 납품하기' },
  { stat: 'built', n: 5, text: '시설이나 장식 5개 놓기' },
  { stat: 'fished', n: 3, text: '물고기 3마리 낚기' },
  { stat: 'foraged', n: 5, text: '채집 5번 하기' },
  { stat: 'crafted', n: 3, text: '공방에서 3개 만들기' },
]
const seasonEvents = {
  spring: { name: '꽃 모종 교환대', items: { berry: 2, wheat: 4 } },
  summer: { name: '여름 옥수수 좌판', items: { corn: 3, carrot: 2 } },
  autumn: { name: '작은 호박 좌판', items: { pumpkin: 2, potato: 2 } },
  winter: { name: '겨울 따끈한 나눔', items: { carrot: 3, wheat: 4 } },
}
const day = 86400000

export class FarmError extends Error {}
const reject = message => { throw new FarmError(message) }
const lookup = (catalog, key) => typeof key === 'string' && Object.hasOwn(catalog, key) ? catalog[key] : undefined
const cropBed = object => object.kind === 'plot' || object.kind === 'greenhouse'
const itemName = key => (lookup(crops, key) ?? lookup(products, key))?.name ?? key
const itemPrice = key => (lookup(crops, key) ?? lookup(products, key)).price


export const inSeason = (item, now) => seasonCrops[seasonAt(now).season].includes(item)
// 제철 작물은 20% 더 받는다
export const itemValue = (key, now) => Math.round(itemPrice(key) * (inSeason(key, now) ? 1.2 : 1))
export const hearts = object => Math.floor((object.love ?? 0) / 10)
// 받침 있는 낱말 뒤에는 '으로', 받침이 없거나 ㄹ이면 '로'
export const withRo = word => {
  const code = word.at(-1).charCodeAt(0) - 0xac00
  const final = code >= 0 && code < 11172 ? code % 28 : 0
  return word + (final && final !== 8 ? '으로' : '로')
}

export function producible(farm) {
  const placed = new Set(farm.objects.filter(object => !object.stored).map(object => object.kind))
  const items = new Set(placed.has('plot') || placed.has('greenhouse')
    ? Object.keys(crops).filter(key => farm.level >= crops[key].level) : [])
  for (const kind of placed) if (buildings[kind]?.product) items.add(buildings[kind].product)
  for (let grew = true; grew;) {
    grew = false
    for (const recipe of Object.values(recipes)) {
      if (placed.has(recipe.building) && !items.has(recipe.product) && Object.keys(recipe.inputs).every(item => items.has(item))) {
        items.add(recipe.product)
        grew = true
      }
    }
  }
  return [...items]
}

function makeOrder(farm, slot) {
  const serial = farm.orderSerial ?? farm.stats.orders
  farm.orderSerial = serial + 1
  const kind = orderKinds[slot] ?? 'small'
  const pool = producible(farm)
  if (!pool.length) pool.push('wheat')
  const processed = pool.filter(item => lookup(recipes, item))
  const wanted = Math.min({ small: 1, regular: 2, long: 3 }[kind], pool.length)
  const picked = serial === 0 && slot === 0 ? ['wheat'] : kind === 'long' && processed.length ? [processed[serial % processed.length]] : []
  for (let step = 0; picked.length < wanted && step < 50; step++) {
    const item = pool[(serial * 7 + step * 5 + slot) % pool.length]
    if (!picked.includes(item)) picked.push(item)
  }
  const budget = { small: 36, regular: 55, long: 110 }[kind]
  const items = Object.fromEntries(picked.map(item =>
    [item, Math.max(1, Math.min(kind === 'long' ? 8 : 6, Math.round(budget / itemPrice(item))))]))
  const value = Object.entries(items).reduce((sum, [item, count]) => sum + itemValue(item, farm.now ?? 0) * count, 0)
  const reward = Math.ceil(value * { small: 1.3, regular: 1.5, long: 1.8 }[kind]) + 5
  const order = { id: kind + '-' + serial, kind, items, shared: {}, done: false, reward }
  if (kind === 'small') order.name = '장터 소량 판매 · ' + itemName(picked[0])
  if (kind === 'long') order.name = '마을 잔치 장기 주문'
  if (kind === 'regular') {
    const neighbor = neighbors[serial % neighbors.length]
    const last = farm.regulars?.[neighbor.id]
    order.from = neighbor.id
    order.name = neighbor.name + '의 부탁'
    const tier = friendTier(farm.friends?.[neighbor.id])
    order.line = (last ? '지난번 ' + withRo(itemName(last)) + ' ' + neighbor.use + '. 이번에도 부탁해요.' : neighbor.hello) +
      (tier >= 3 ? ' ' + neighbor.best : tier >= 2 ? ' ' + neighbor.close : '')
  }
  return order
}

export function seasonAt(now) {
  const index = Math.floor(now / day / 7)
  return { index, season: ['spring', 'summer', 'autumn', 'winter'][index % 4] }
}

export function seasonEvent(farm, now) {
  const { index, season } = seasonAt(now)
  const items = {}
  for (const [item, count] of Object.entries(seasonEvents[season].items)) {
    const key = farm.level >= crops[item].level ? item : 'wheat'
    items[key] = (items[key] ?? 0) + count
  }
  const value = Object.entries(items).reduce((sum, [item, count]) => sum + crops[item].price * count, 0)
  const id = 'season-' + index
  return { id, kind: 'season', name: seasonEvents[season].name, items, shared: {}, reward: Math.ceil(value * 1.4), done: (farm.events ?? []).includes(id) }
}

// 6시간마다 바뀌는 떠돌이 상인의 물물교환 (놓쳐도 다음 상인이 온다)
export function peddlerOffer(farm, now) {
  const index = Math.floor(now / (6 * 3600000))
  const pool = producible(farm)
  if (!pool.length) pool.push('wheat')
  const item = pool[index % pool.length]
  const id = 'peddler-' + index
  return {
    id, items: { [item]: Math.max(2, Math.min(8, Math.round(60 / itemPrice(item)))) }, coins: 20,
    give: peddlerGoods[index % peddlerGoods.length], done: (farm.peddler ?? []).includes(id),
  }
}

export function charm(farm) {
  const decor = farm.objects.filter(object => !object.stored && buildings[object.kind]?.category === 'decoration' && !batchKinds.includes(object.kind))
  const score = decor.reduce((sum, object) => sum + Math.min(40, Math.ceil((buildings[object.kind].price || 30) / 2)), 0) +
    new Set(decor.map(object => object.kind)).size * 10
  const tier = charmTiers.findLastIndex(entry => score >= entry.score)
  return { score, tier, name: charmTiers[tier].name, next: charmTiers[tier + 1]?.score ?? null }
}

// 주간 농장 노트: 못 끝낸 목표는 벌칙 없이 다음 주로 이어진다
export function weeklyNotes(farm, now) {
  const week = seasonAt(now).index
  if (farm.notes?.week === week) return farm.notes
  const goals = (farm.notes?.goals ?? []).filter(goal => !goal.claimed)
  for (let step = 0; goals.length < 3 && step < noteGoals.length; step++) {
    const goal = noteGoals[(week * 3 + step) % noteGoals.length]
    if (!goals.some(entry => entry.stat === goal.stat)) {
      goals.push({ id: week + '-' + goal.stat, ...goal, base: farm.stats[goal.stat] ?? 0, claimed: false })
    }
  }
  return { week, goals }
}

export function createFarm(handle, now, name) {
  const title = typeof name === 'string' ? name.trim().normalize('NFC') : ''
  if (name !== undefined && (!title || [...title].length > 24 || /[\p{Cc}\p{Zl}\p{Zp}]/u.test(title))) {
    reject('농장 이름을 한 줄로 1~24자 입력해 주세요.')
  }
  const objects = [
    { id: '1', kind: 'house', x: 14, z: 14, rotation: 0, level: 1 },
    { id: '2', kind: 'market', x: 20, z: 14, rotation: 0, level: 1 },
    { id: '9', kind: 'truck', x: 20, z: 17, rotation: 0, level: 1 },
    ...[18, 19].flatMap((z, row) => [15, 16, 17].map((x, column) => ({
      id: String(3 + row * 3 + column), kind: 'plot', x, z, rotation: 0, level: 1,
    }))),
    // 농가·밭·판매대·트럭을 잇는 흙길
    ...[[17, 15], [18, 15], [19, 15], [19, 16], [15, 17], [16, 17], [17, 17], [18, 17], [19, 17]]
      .map(([x, z], index) => ({ id: String(10 + index), kind: 'path', x, z, rotation: 0, level: 1 })),
  ]
  const farm = {
    handle, name: title || handle + '의 농장', coins: 150, level: 1, xp: 0, now, nextId: 19, timing: 2,
    inventory: {}, objects, parcels: [START_PARCEL], cleared: [], cooldowns: {},
    settings: { quality: 'high', motion: true, weather: true, audio: true, ambient: false, music: false, guide: true },
    orders: [], orderSerial: 0, regulars: {}, friends: {}, events: [], rewards: [], peddler: [], records: {}, stickers: 0,
    zoneNames: {}, views: {}, discovered: [], undo: null,
    stats: { planted: 0, harvested: 0, collected: 0, sold: 0, built: 0, expanded: 0, fished: 0, foraged: 0, crafted: 0, orders: 0, visits: 0 },
    share: { enabled: false, code: null }, social: { visits: [], messages: [], gifts: [] },
    avatar: defaultAvatar(),
  }
  farm.orders = orderKinds.map((_, slot) => makeOrder(farm, slot))
  farm.notes = weeklyNotes(farm, now)
  return farm
}

function addItem(farm, item, quantity) {
  const count = (farm.inventory[item] ?? 0) + quantity
  if (count > 0) farm.inventory[item] = count
  else delete farm.inventory[item]
  if (quantity > 0 && !farm.discovered.includes(item)) {
    farm.discovered.push(item)
    for (const [key, set] of Object.entries(collectionSets)) {
      if ((farm.rewards ??= []).includes(key) || !set.items.every(entry => farm.discovered.includes(entry))) continue
      farm.rewards.push(key)
      giftObject(farm, set.reward)
    }
  }
}

// 선물 장식은 보관함으로 들어온다
function giftObject(farm, kind) {
  farm.objects.push({ id: String(farm.nextId++), kind, x: 0, z: 0, rotation: 0, level: 1, stored: true })
  farm.gifted = [...(farm.gifted ?? []), kind].slice(-10)
}

// Lv.n에서 다음 레벨까지 필요한 XP는 10 + 15n (첫 레벨은 그대로 25)
const levelStep = level => 10 + 15 * level
const levelStart = level => 10 * (level - 1) + 15 * (level - 1) * level / 2
const levelFor = total => {
  // Invert levelStart; check adjacent boundaries to correct floating-point rounding.
  let level = Math.max(1, Math.floor((Math.sqrt(120 * total + 1225) - 5) / 30))
  if (level > 1 && total < levelStart(level)) level--
  else if (total >= levelStart(level + 1)) level++
  return level
}
export const levelProgress = farm => ({ xp: Math.max(0, farm.xp - levelStart(farm.level)), need: levelStep(farm.level) })

function xp(farm, value) {
  const before = farm.level
  farm.xp += value
  // 곡선이 바뀌기 전에 오른 레벨은 내려가지 않는다
  farm.level = Math.max(before, levelFor(farm.xp))
  if (farm.level <= before) return
  // 레벨업 선물 상자
  const coins = 5 * (farm.level - before) * (before + farm.level + 1)
  farm.coins += coins
  farm.levelGift = { level: farm.level, coins }
}

function befriend(object, now, points) {
  const today = Math.floor(now / day)
  if (object.loveDay !== today) Object.assign(object, { loveDay: today, loveToday: 0 })
  // 하루 상한이 있어 연타보다 꾸준히 돌보는 쪽이 하트를 얻는다
  const gain = Math.max(0, Math.min(points, 10 - object.loveToday))
  object.loveToday += gain
  object.love = Math.min(50, (object.love ?? 0) + gain)
}

// 축사는 5단계, 공방은 3단계까지 증축한다
export const maxLevel = object => ({ animal: 5, artisan: 3 })[buildings[object.kind]?.category] ?? 1

function spend(farm, coins) {
  if (farm.coins < coins) reject('코인이 부족해요.')
  farm.coins -= coins
}

function find(farm, id, allowStored = false) {
  const object = farm.objects.find(entry => entry.id === id)
  if (!object || (!allowStored && object.stored)) reject('농장에서 대상을 찾을 수 없어요.')
  return object
}

function checkedIds(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 2304 || input.some(id => typeof id !== 'string')) {
    reject('작업할 대상을 다시 선택해 주세요.')
  }
  return new Set(input)
}

function unlocked(farm, x, z) {
  return inMap(x, z) && farm.parcels.includes(parcelAt(x, z))
}

function checkPosition(farm, kind, x, z, rotation, ignore = []) {
  if (!canPlace(farm, kind, x, z, rotation, ignore)) reject('그 자리에는 놓을 수 없어요.')
}

function hasNearby(farm, kind, object, distance) {
  return farm.objects.some(entry => !entry.stored && entry.kind === kind &&
    Math.abs(entry.x - object.x) + Math.abs(entry.z - object.z) <= distance)
}

function getQuantity(value, limit = 99) {
  const amount = value ?? 1
  if (!Number.isInteger(amount) || amount < 1 || amount > limit) reject('수량을 다시 선택해 주세요.')
  return amount
}

function label(value, limit) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text || text.length > limit) reject('이름이나 내용을 다시 입력해 주세요.')
  return text
}

// 꽃밭 가까이 둔 벌통은 꿀이 빨리 찬다
const productSpeed = (farm, object) => object.kind === 'hive' && farm.objects.some(entry => !entry.stored &&
  buildings[entry.kind]?.model === 'flowers' && Math.abs(entry.x - object.x) + Math.abs(entry.z - object.z) <= 2) ? .75 : 1


// 온실·스프링클러는 20%, 비 오는 날은 처음부터 물을 준 것처럼 30% 빨리 자란다
function sow(farm, object, kind, now, plantRequest) {
  const crop = crops[kind]
  const rain = weatherAt(now) === 'rain'
  const speed = (object.kind === 'greenhouse' || hasNearby(farm, 'sprinkler', object, 3) ? .8 : 1) * (rain ? .7 : 1)
  object.crop = { kind, plantedAt: now, readyAt: now + crop.seconds * 1000 * speed }
  if (rain) object.crop.watered = true
  if (plantRequest) object.crop.plantRequest = plantRequest
  farm.stats.planted++
  xp(farm, 1)
}

function harvestCrop(farm, object, now, request) {
  if (!object.crop || object.crop.readyAt > now) return false
  const kind = object.crop.kind
  const golden = isGolden(farm, object)
  addItem(farm, (golden ? 'golden_' : '') + kind, 1)
  if (golden) farm.stats.golden = (farm.stats.golden ?? 0) + 1
  delete object.crop
  farm.stats.harvested++
  xp(farm, 2)
  // 자동 다시 심기: 코인이 모자라면 그 밭만 비워 둔다
  if (farm.settings?.replant && farm.level >= crops[kind].level && farm.coins >= crops[kind].seed) {
    farm.coins -= crops[kind].seed
    sow(farm, object, kind, now, request && request + ':' + object.id)
  }
  return true
}

// 퇴비를 주면 자라는 작물이나 생산 중인 축사가 바로 준비된다
function fertilize(farm, object, now) {
  if (!farm.inventory.compost) reject('퇴비가 없어요. 퇴비통에서 만들 수 있어요.')
  if (object.crop && object.crop.readyAt > now) object.crop.readyAt = now
  else if (buildings[object.kind]?.product && object.readyAt > now) object.readyAt = now
  else reject('퇴비를 줄 곳을 골라 주세요.')
  addItem(farm, 'compost', -1)
}

// 접속해 있는 동안 3분마다 들판에 손님이 1분쯤 머문다. 놓쳐도 손해는 없다.
const guestKinds = [
  { kind: 'butterfly', name: '나비', icon: '🦋', coins: 12 },
  { kind: 'hedgehog', name: '고슴도치', icon: '🦔', item: 'acorn', count: 2 },
  { kind: 'magpie', name: '까치', icon: '🐦', item: 'clover', count: 1 },
]
export function fieldGuest(farm, now) {
  const slot = Math.floor(now / (3 * minute))
  if (now - slot * 3 * minute > minute || roll('guest', farm.handle, slot) > .7) return null
  const spots = farm.objects.filter(object => !object.stored && ['plot', 'path', 'stonepath', 'trail'].includes(object.kind))
  if (!spots.length) return null
  const spot = spots[Math.floor(roll('guestspot', farm.handle, slot) * spots.length)]
  const id = 'guest-' + slot
  return { id, x: spot.x, z: spot.z, ...guestKinds[slot % guestKinds.length], done: (farm.guests ?? []).includes(id) }
}

function water(farm, ids, now) {
  let watered = 0
  for (const id of ids) {
    const object = find(farm, id)
    if (!object.crop || object.crop.watered || object.crop.readyAt <= now) continue
    object.crop.readyAt = now + Math.ceil((object.crop.readyAt - now) * .7)
    object.crop.watered = true
    watered++
  }
  if (!watered) reject('물을 줄 작물이 없어요.')
}

function collectObject(farm, object, now, request, played) {
  if (cropBed(object)) return harvestCrop(farm, object, now, request)
  const def = buildings[object.kind]
  if (def.product && object.readyAt <= now) {
    // 하트가 많을수록 가끔 하나 더 준다. 받기 놀이를 하면 서버 시드로 40% 확률로 하나 더.
    const twin = roll('twin', object.id, object.readyAt) < hearts(object) * .06 ? 1 : 0
    const bonus = played && roll('mini', object.id, object.readyAt) < .4 ? 1 : 0
    addItem(farm, def.product, object.level + twin + bonus)
    if (played) farm.lastMini = { id: object.id, bonus, at: now }
    object.readyAt = now + def.seconds * 1000 * productSpeed(farm, object)
    farm.stats.collected += object.level
    xp(farm, 3)
    return true
  }
  const complete = object.queue?.filter(job => job.readyAt <= now) ?? []
  if (!complete.length) return false
  for (const job of complete) {
    const recipe = recipes[job.recipe]
    const quantity = recipe.quantity ?? 1
    addItem(farm, recipe.product, quantity)
    farm.stats.crafted += quantity
  }
  object.queue = object.queue.filter(job => job.readyAt > now)
  xp(farm, complete.length * 3)
  return true
}

function reverseLayout(farm, history) {
  if (!history) reject('되돌릴 배치가 없어요.')
  if (history.added) {
    const removed = new Set(history.added)
    farm.objects = farm.objects.filter(object => !removed.has(object.id))
    farm.coins += history.cost
    farm.stats.built -= removed.size
    return
  }
  const moving = history.positions.map(old => ({ ...find(farm, old.id, true), ...old }))
  const other = { ...farm, objects: farm.objects.filter(object => !moving.some(entry => entry.id === object.id)) }
  for (const entry of moving) {
    if (!entry.stored) {
      checkPosition(other, entry.kind, entry.x, entry.z, entry.rotation)
      delete entry.stored
    }
    other.objects.push(entry)
  }
  farm.objects = other.objects
}

function remember(objects) {
  return { positions: objects.map(({ id, x, z, rotation, stored }) => ({ id, x, z, rotation, stored: Boolean(stored) })) }
}

function shiftObjects(farm, moves) {
  const ids = checkedIds(moves.map(move => move.id))
  if (ids.size !== moves.length || moves.length > 144) reject('옮길 대상을 다시 골라 주세요.')
  const moving = moves.map(move => ({ object: find(farm, move.id, true), move }))
  const history = remember(moving.map(entry => entry.object))
  const other = { ...farm, objects: farm.objects.filter(entry => !ids.has(entry.id)) }
  for (const { object, move } of moving) {
    const rotation = move.rotation ?? object.rotation
    checkPosition(other, object.kind, move.x, move.z, rotation)
    Object.assign(object, { x: move.x, z: move.z, rotation, stored: false })
    other.objects.push(object)
  }
  farm.undo = history
}

function place(farm, command, now) {
  const kind = command.kind
  const def = lookup(buildings, kind)
  if (!def || def.gift || farm.level < (def.level ?? 1)) reject('아직 열리지 않은 건물이에요.')
  const path = command.path ?? [command]
  if (!Array.isArray(path) || path.length < 1 || path.length > 144 ||
      (path.length > 1 && !batchKinds.includes(kind))) reject('배치할 자리를 다시 골라 주세요.')
  const cost = def.price * path.length
  spend(farm, cost)
  const rotation = command.rotation ?? 0
  const added = []
  for (const { x, z } of path) {
    checkPosition(farm, kind, x, z, rotation)
    const object = { id: String(farm.nextId++), kind, x, z, rotation, level: 1 }
    farm.objects.push(object)
    if (def.product) object.readyAt = now + def.seconds * 1000 * productSpeed(farm, object)
    added.push(object.id)
  }
  farm.stats.built += added.length
  farm.undo = { added, cost }
}

function plant(farm, command, now, fieldRequestId) {
  const crop = lookup(crops, command.crop)
  if (!crop || farm.level < (crop.level ?? 1)) reject('아직 열리지 않은 씨앗이에요.')
  const ids = checkedIds(command.ids ?? [command.id])
  for (const id of ids) {
    const object = find(farm, id)
    if (!cropBed(object) || object.crop) reject('빈 밭을 골라 주세요.')
    spend(farm, crop.seed)
    sow(farm, object, command.crop, now, fieldRequestId)
  }
}

function collect(farm, command, now, targets, request) {
  const ids = targets ? checkedIds(targets)
    : command.ids ? checkedIds(command.ids) : command.id ? new Set([command.id]) : null
  if (ids) for (const id of ids) find(farm, id)
  if (command.kind && !collection.has(command.kind)) reject('모을 종류를 다시 골라 주세요.')
  let picked = 0
  let beds = 0
  for (const object of farm.objects) {
    if (object.stored || (ids && !ids.has(object.id)) || (command.parcel && parcelAt(object.x, object.z) !== command.parcel)) continue
    const kind = cropBed(object) ? 'plot' : buildings[object.kind].product ? 'animal' : 'artisan'
    if (command.kind && kind !== command.kind) continue
    if (collectObject(farm, object, now, request, command.played === true && command.id === object.id)) {
      picked++
      if (kind === 'plot') beds++
    }
  }
  if (!picked) reject('아직 준비된 수확물이 없어요.')
  // 쓸어 수확 콤보: 실제로 거둔 칸 수로 보너스를 준다
  if (command.ids && beds >= 10) {
    xp(farm, Math.floor(beds / 5))
    farm.stats.bestCombo = Math.max(farm.stats.bestCombo ?? 0, beds)
  }
}

function enqueue(farm, command, now) {
  const object = find(farm, command.id)
  const recipe = lookup(recipes, command.recipe)
  if (!recipe || object.kind !== recipe.building || farm.level < (recipe.level ?? 1)) reject('여기서 만들 수 없는 물건이에요.')
  // 공방은 증축할 때마다 예약 칸 +2, 제작 시간 -10%
  const level = object.level ?? 1
  const slots = 6 + 2 * level
  const quantity = getQuantity(command.quantity, slots)
  const queue = object.queue ??= []
  if (queue.length + quantity > slots) reject('작업장 예약이 가득 찼어요.')
  for (const [item, needed] of Object.entries(recipe.inputs)) {
    if ((farm.inventory[item] ?? 0) < needed * quantity) reject('재료가 부족해요.')
    addItem(farm, item, -needed * quantity)
  }
  let readyAt = Math.max(now, queue.at(-1)?.readyAt ?? now)
  for (let i = 0; i < quantity; i++) {
    readyAt += Math.round(recipe.seconds * 1000 * (1.1 - .1 * level))
    queue.push({ recipe: command.recipe, readyAt })
  }
}

function sell(farm, command, now) {
  const items = command.item ? [command.item] : Object.keys(farm.inventory)
  let total = 0
  for (const item of items) {
    const product = lookup(products, item) ?? lookup(crops, item)
    if (!product) reject('판매할 수 없는 물건이에요.')
    const count = farm.inventory[item] ?? 0
    const amount = command.quantity === undefined || !command.item ? count : getQuantity(command.quantity, count)
    addItem(farm, item, -amount)
    total += amount * itemValue(item, now)
    farm.stats.sold += amount
  }
  if (!total) reject('판매할 물건이 없어요.')
  // 매력도 단계마다 판매대 손님이 팁을 2%씩 더 준다
  farm.coins += Math.round(total * (1 + charm(farm).tier * .02))
  xp(farm, 2)
}

function order(farm, id, now) {
  const event = seasonEvent(farm, now)
  const job = id === event.id ? event : farm.orders.find(entry => entry.id === id)
  if (!job || job.done) reject('이미 완료됐거나 없는 주문이에요.')
  for (const [item, quantity] of Object.entries(job.items)) {
    const due = Math.max(0, quantity - (job.shared?.[item] ?? 0))
    if ((farm.inventory[item] ?? 0) < due) reject('주문을 채울 물건이 부족해요.')
    if (due) addItem(farm, item, -due)
  }
  // 한 번 접속해 있는 동안 10분 안에 이어서 납품하면 5%씩, 최대 25% 더 받는다
  const streak = farm.streak && now - farm.streak.at < 10 * minute ? farm.streak.count + 1 : 1
  farm.streak = { count: streak, at: now }
  farm.coins += job.reward + Math.round(job.reward * Math.min(.25, .05 * (streak - 1)))
  farm.stats.orders++
  xp(farm, job.kind === 'long' ? 20 : 12)
  if (job === event) {
    farm.events = [...(farm.events ?? []), id].slice(-8)
    return
  }
  job.done = true
  if (job.from) {
    farm.regulars = { ...farm.regulars, [job.from]: Object.keys(job.items)[0] }
    const count = (farm.friends?.[job.from] ?? 0) + 1
    farm.friends = { ...farm.friends, [job.from]: count }
    if (count === friendSteps[0]) farm.coins += 50
    if (count === friendSteps[1]) giftObject(farm, neighbors.find(entry => entry.id === job.from).gift)
    if (count === friendSteps[2]) farm.coins += 150
  }
  // 완료한 칸만 새 주문으로 바뀌고, 진행 중인 주문과 공유 수량은 그대로 둔다
  farm.orders = farm.orders.map((entry, slot) => entry.done ? makeOrder(farm, slot) : entry)
}

// 넘긴 주문은 새 주문으로 바뀌고, 방문자가 보내 준 물건은 창고로 들어온다
function skipOrder(farm, id) {
  const slot = farm.orders.findIndex(entry => entry.id === id && !entry.done)
  if (slot < 0) reject('이미 완료됐거나 없는 주문이에요.')
  for (const [item, count] of Object.entries(farm.orders[slot].shared ?? {})) if (count > 0) addItem(farm, item, count)
  farm.orders[slot] = makeOrder(farm, slot)
}

function settings(farm, input) {
  if (!input || typeof input !== 'object') reject('설정 값을 다시 선택해 주세요.')
  for (const key of ['motion', 'weather', 'audio', 'ambient', 'music', 'guide', 'toon', 'replant', 'minigame']) {
    if (typeof input[key] === 'boolean') farm.settings[key] = input[key]
  }
  if (['low', 'high'].includes(input.quality)) farm.settings.quality = input.quality
}

// 수확 시간이 짧아지기 전에 시작한 작물·생산은 새 시간보다 오래 기다리지 않게 당긴다.
// plantedAt은 작물 식별과 황금 작물 시드라서 건드리지 않는다. 공방 예약은 이미 짧아서 그대로 둔다.
export function retimeFarm(state, now) {
  if (state.timing === 2) return state
  const farm = structuredClone(state)
  farm.timing = 2
  // 예전 곡선으로 오른 레벨은 새 곡선의 그 레벨 시작점부터 경험치 막대가 움직이게 한다
  farm.xp = Math.max(farm.xp, levelStart(farm.level))
  for (const object of farm.objects) {
    const crop = object.crop && lookup(crops, object.crop.kind)
    if (crop) object.crop.readyAt = Math.min(object.crop.readyAt, object.crop.plantedAt + crop.seconds * 1000)
    const def = buildings[object.kind]
    if (def?.product && object.readyAt) object.readyAt = Math.min(object.readyAt, now + def.seconds * 1000)
  }
  return farm
}

export function automateFarm(state, now, request) {
  const workers = state.objects.filter(object => object.kind === 'worker' && !object.stored)
  if (!workers.length) return state
  const ready = state.objects.filter(object => !object.stored && object.crop?.readyAt <= now &&
    workers.some(worker => Math.abs(worker.x - object.x) + Math.abs(worker.z - object.z) <= 4))
  if (!ready.length) return state
  const farm = structuredClone(state)
  for (const { id } of ready) harvestCrop(farm, find(farm, id), now, request)
  farm.undo = null
  return farm
}

export function applyFarmCommand(state, command, now, field) {
  if (!command || typeof command.type !== 'string') reject('작업을 다시 선택해 주세요.')
  const request = command.requestId
  if (request !== undefined && (typeof request !== 'string' || !/^[\w-]{8,64}$/.test(request))) reject('작업을 다시 선택해 주세요.')
  // 응답을 못 받고 다시 보낸 같은 요청은 한 번만 반영한다
  if (request && state.lastRequest === request) return state
  const farm = structuredClone(state)
  farm.now = now
  if (request) farm.lastRequest = request
  farm.notes = weeklyNotes(farm, now)
  const { type, id, x, z } = command
  if (!layoutCommands.has(type) && !['setSettings', 'camera', 'favorite', 'buyAvatar', 'equipAvatar', 'styleAvatar'].includes(type)) farm.undo = null
  switch (type) {
    case 'buyAvatar':
    case 'equipAvatar': {
      const item = typeof command.item === 'string' && Object.hasOwn(avatarItems, command.item) && avatarItems[command.item]
      if (!item) reject('꾸미기 아이템을 다시 골라 주세요.')
      const avatar = farm.avatar ??= defaultAvatar()
      const owned = new Set([...defaultAvatar().owned, ...(avatar.owned ?? [])])
      if (type === 'buyAvatar') {
        if (owned.has(command.item)) reject('이미 가진 아이템이에요.')
        spend(farm, item.price)
        owned.add(command.item)
      } else if (!owned.has(command.item)) reject('먼저 아이템을 구매해 주세요.')
      avatar.owned = [...owned]
      avatar.equipment = { ...avatarLook(avatar).equipment, [item.slot]: command.item }
      break
    }
    case 'styleAvatar': {
      if (typeof command.part !== 'string' || !Object.hasOwn(avatarColors, command.part) || !avatarColors[command.part].includes(command.color)) reject('꾸미기 색을 다시 골라 주세요.')
      const avatar = farm.avatar ??= defaultAvatar()
      avatar[command.part] = command.color
      break
    }
    case 'place':
      place(farm, command, now)
      break
    case 'move':
    case 'restore': {
      const object = find(farm, id, type === 'restore')
      if (type === 'restore' && !object.stored) reject('보관함에 없는 건물이에요.')
      shiftObjects(farm, [command])
      break
    }
    case 'moveGroup':
      if (!Array.isArray(command.moves)) reject('옮길 대상을 다시 골라 주세요.')
      shiftObjects(farm, command.moves)
      break
    case 'store': {
      const object = find(farm, id)
      farm.undo = remember([object])
      object.stored = true
      break
    }
    case 'undo':
      reverseLayout(farm, farm.undo)
      farm.undo = null
      break
    case 'expand':
      if (!canExpand(farm, command.parcel)) reject('열린 땅과 붙어 있는 구역을 골라 주세요.')
      spend(farm, parcelPrice(farm))
      farm.parcels.push(command.parcel)
      farm.stats.expanded++
      xp(farm, 6)
      break
    case 'plant':
      plant(farm, command, now, field?.requestId)
      break
    case 'collect':
      collect(farm, command, now, field?.targets, field?.requestId)
      break
    case 'fertilize':
      fertilize(farm, find(farm, id), now)
      break
    case 'greet': {
      // 떠나는 순간 누른 손님도 받을 수 있게 15초 여유를 둔다
      const guest = [fieldGuest(farm, now), fieldGuest(farm, now - 15000)].find(entry => entry?.id === id)
      if (!guest || guest.done) reject('손님이 벌써 떠났어요. 곧 또 찾아와요.')
      if (guest.coins) farm.coins += guest.coins
      if (guest.item) addItem(farm, guest.item, guest.count)
      farm.guests = [...(farm.guests ?? []), id].slice(-8)
      farm.stats.greeted = (farm.stats.greeted ?? 0) + 1
      xp(farm, 1)
      break
    }
    case 'title': {
      const entry = achievements.find(item => item.id === id)
      if (id === null) delete farm.title
      else if (!entry || (farm.stats[entry.stat] ?? 0) < entry.n) reject('아직 이루지 못한 업적이에요.')
      else farm.title = entry.name
      break
    }
    case 'water':
      water(farm, checkedIds(command.ids ?? [command.id]), now)
      break
    case 'sell':
      sell(farm, command, now)
      break
    case 'enqueue':
      enqueue(farm, command, now)
      break
    case 'upgrade': {
      const object = find(farm, id)
      const def = buildings[object.kind]
      if (object.level >= maxLevel(object)) reject('더 증축할 수 없는 건물이에요.')
      spend(farm, Math.max(12, def.price) * object.level)
      object.level++
      xp(farm, 5)
      break
    }
    case 'rename':
      find(farm, id).name = label(command.name, 24)
      break
    case 'renameAnimal': {
      const object = find(farm, id)
      if (!buildings[object.kind].animalModel) reject('이름을 붙일 수 있는 가축이 없어요.')
      const number = getQuantity(command.animal, object.level)
      const names = object.animalNames ??= {}
      names[number] = label(command.name, 20)
      break
    }
    case 'color':
      if (typeof command.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(command.color)) reject('색을 다시 골라 주세요.')
      find(farm, id).color = command.color
      break
    case 'pet':
    case 'feed': {
      const object = find(farm, id)
      if (buildings[object.kind].category !== 'animal') reject('축사를 골라 주세요.')
      if (type === 'feed') {
        const food = command.item ?? 'carrot'
        if (!['carrot', 'wheat'].includes(food) || !farm.inventory[food]) reject('간식으로 줄 당근이나 밀이 필요해요.')
        if (object.readyAt <= now || object.fedAt > now - minute) reject('간식은 잠시 뒤에 줄 수 있어요.')
        addItem(farm, food, -1)
        object.readyAt = now + Math.ceil((object.readyAt - now) * .8)
        object.fedAt = now
        befriend(object, now, 3)
      } else if (!(object.petAt > now - 10 * minute)) befriend(object, now, 1)
      object.petAt = now
      break
    }
    case 'tag': {
      const object = find(farm, id)
      if (hearts(object) < 3) reject('하트 3개부터 이름표를 꾸밀 수 있어요.')
      if (typeof command.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(command.color)) reject('색을 다시 골라 주세요.')
      object.tag = command.color
      break
    }
    case 'clear': {
      if (!unlocked(farm, x, z)) reject('열린 땅을 골라 주세요.')
      const key = tileKey(x, z)
      const obstacle = terrainAt(x, z).obstacle
      if (!['tree', 'rock'].includes(obstacle) || farm.cleared.includes(key)) reject('정리할 나무나 돌이 없어요.')
      farm.cleared.push(key)
      addItem(farm, obstacle === 'tree' ? 'wood' : 'stone', 1)
      // 나무에서는 새 둥지나 도토리, 바위 밑에서는 네잎클로버가 가끔 나온다
      const luck = roll('clear', key)
      const found = obstacle === 'tree' ? luck < .1 ? 'egg' : luck < .3 ? 'acorn' : null : luck < .1 ? 'clover' : null
      if (found) addItem(farm, found, found === 'egg' ? 2 : 1)
      farm.lastFind = found ? { item: found, at: now } : null
      xp(farm, 1)
      break
    }
    case 'fish': {
      const object = id ? find(farm, id) : null
      if (object ? !['pond', 'duckpond'].includes(object.kind) : !unlocked(farm, x, z) || terrainAt(x, z).obstacle !== 'water') {
        reject('낚시할 연못을 골라 주세요.')
      }
      const key = 'fish:' + (object ? object.id : tileKey(x, z))
      if (farm.cooldowns[key] > now) reject('물고기가 다시 모일 때까지 잠시 기다려 주세요.')
      const spot = object ? object.id : tileKey(x, z)
      const luck = roll('fish', spot, farm.stats.fished)
      const fish = luck < .1 ? 'trout' : luck < .4 ? 'carp' : 'fish'
      const [small, large] = { fish: [12, 30], carp: [25, 60], trout: [30, 70] }[fish]
      const size = Math.round(small + roll('size', spot, farm.stats.fished) * (large - small))
      addItem(farm, fish, 1)
      farm.records = { ...farm.records, [fish]: Math.max(farm.records?.[fish] ?? 0, size) }
      farm.lastCatch = { item: fish, size, at: now }
      farm.stats.fished++
      farm.cooldowns[key] = now + minute
      xp(farm, 2)
      break
    }
    case 'forage': {
      if (!unlocked(farm, x, z)) reject('열린 땅을 골라 주세요.')
      const item = terrainAt(x, z).forage
      const key = 'forage:' + tileKey(x, z)
      if (!item || farm.cooldowns[key] > now || farm.cleared.includes(tileKey(x, z))) reject('여기에는 채집할 것이 없어요.')
      addItem(farm, item, 1)
      const lucky = roll('forage', key, farm.stats.foraged) < .08
      if (lucky) addItem(farm, 'clover', 1)
      farm.lastFind = lucky ? { item: 'clover', at: now } : null
      farm.stats.foraged++
      farm.cooldowns[key] = now + 5 * minute
      xp(farm, 1)
      break
    }
    case 'setSettings':
      settings(farm, command.settings)
      break
    case 'favorite':
      if (!lookup(crops, command.crop)) reject('씨앗을 다시 골라 주세요.')
      // Retired action: acknowledge requests left in older clients' save queues without changing anything.
      break
    case 'zone':
      if (!farm.parcels.includes(command.parcel)) reject('열린 구역을 골라 주세요.')
      farm.zoneNames[command.parcel] = label(command.name, 20)
      break
    case 'camera': {
      if (!['1', '2', '3'].includes(String(command.slot)) || !command.view) reject('카메라 위치를 다시 선택해 주세요.')
      const view = Object.fromEntries(['x', 'z', 'zoom', 'angle', 'pitch']
        .filter(key => Number.isFinite(command.view[key])).map(key => [key, command.view[key]]))
      if (!inMap(Math.floor(view.x), Math.floor(view.z))) reject('농장 안의 위치를 저장해 주세요.')
      farm.views[String(command.slot)] = view
      break
    }
    case 'share':
      if (typeof command.enabled !== 'boolean') reject('공개 범위를 다시 선택해 주세요.')
      farm.share.enabled = command.enabled
      if (command.enabled && (!farm.share.code || command.rotate === true)) {
        farm.share.code = Array.from(crypto.getRandomValues(new Uint8Array(12)), byte => byte.toString(16).padStart(2, '0')).join('')
      }
      break
    case 'order':
      order(farm, id, now)
      break
    case 'skipOrder':
      skipOrder(farm, id)
      break
    case 'trade': {
      const offer = peddlerOffer(farm, now)
      if (id !== offer.id || offer.done) reject('상인이 벌써 떠났거나 이미 교환했어요.')
      for (const [item, count] of Object.entries(offer.items)) {
        if ((farm.inventory[item] ?? 0) < count) reject('교환할 물건이 부족해요.')
      }
      spend(farm, offer.coins)
      for (const [item, count] of Object.entries(offer.items)) addItem(farm, item, -count)
      giftObject(farm, offer.give)
      farm.peddler = [...(farm.peddler ?? []), offer.id].slice(-8)
      break
    }
    case 'claimNote': {
      const goal = farm.notes.goals.find(entry => entry.id === id)
      if (!goal || goal.claimed || (farm.stats[goal.stat] ?? 0) - goal.base < goal.n) reject('아직 노트를 채우지 못했어요.')
      goal.claimed = true
      farm.coins += 40
      farm.stickers = (farm.stickers ?? 0) + 1
      xp(farm, 5)
      break
    }
    case 'thank': {
      const helpers = farm.social.helpers ?? []
      if (!helpers.some(entry => entry.handle === command.handle)) reject('도와준 이웃을 다시 골라 주세요.')
      if ((farm.social.thanks ?? []).some(entry => entry.to === command.handle)) reject('이미 답례를 보냈어요. 이웃이 들르면 전해져요.')
      if (!(lookup(products, command.item) ?? lookup(crops, command.item)) || !farm.inventory[command.item]) reject('보낼 물건이 없어요.')
      addItem(farm, command.item, -1)
      farm.social.thanks = [...(farm.social.thanks ?? []), { to: command.handle, item: command.item, at: now }].slice(-20)
      break
    }
    default:
      reject('할 수 없는 작업이에요.')
  }
  return farm
}

export const FIELD_BATCH_SIZE = 8
const fieldReceiptLifetime = 7 * 24 * 60 * 60 * 1000

// Keep the existing receipt format so pending work from older clients can still be replayed.
export function acknowledgeFarmCommand(state, requestId, now, error) {
  if (typeof requestId !== 'string' || !/^\d{13}_[\w-]{8,48}$/.test(requestId)) return state
  const issued = Number(requestId.slice(0, 13))
  if (issued <= now - fieldReceiptLifetime || issued <= (state.fieldReceiptFloor ?? 0) || issued > now + 60000) return state
  const receipts = [...new Set([...(state.fieldReceipts ?? []), requestId])]
    .filter(id => Number(id.slice(0, 13)) > now - fieldReceiptLifetime).sort()
  const removed = receipts.splice(0, Math.max(0, receipts.length - 512))
  const errors = { ...state.fieldErrors, ...(error ? { [requestId]: error } : {}) }
  return { ...state, fieldReceipts: receipts, fieldErrors: Object.fromEntries(receipts.filter(id => errors[id]).map(id => [id, errors[id]])),
    fieldReceiptFloor: Math.max(state.fieldReceiptFloor ?? 0, Number(removed.at(-1)?.slice(0, 13)) || 0) }
}

export function projectFarmCommands(farm, commands) {
  for (const command of commands) {
    try {
      farm = applyFieldCommand(farm, command, Number(command.requestId.slice(0, 13)), true)
    } catch {
      // Conflicting pending work is omitted until the server reports its outcome.
    }
  }
  return farm
}

export function cropIdentity(object) {
  return object.crop?.plantRequest ?? String(object.crop?.plantedAt)
}

export function applyFieldCommand(state, command, now, preview = false) {
  const requestId = command?.requestId
  if (typeof requestId !== 'string' || !/^\d{13}_[\w-]{8,48}$/.test(requestId)) reject('밭 작업을 다시 선택해 주세요.')
  if (state.fieldReceipts?.includes(requestId)) {
    if (state.fieldErrors?.[requestId]) reject(state.fieldErrors[requestId])
    return state
  }
  const issued = Number(requestId.slice(0, 13))
  if (issued <= now - fieldReceiptLifetime || issued <= (state.fieldReceiptFloor ?? 0) || issued > now + 60000) {
    reject('이전 밭 작업의 저장 시간이 지났어요. 농장을 확인해 주세요.')
  }
  if (command.nextId !== undefined && command.nextId !== state.nextId) reject('다른 화면에서 시설이 바뀌어 이 작업을 취소했어요. 다시 선택해 주세요.')
  let farm
  if (command.type === 'plant') {
    farm = applyFarmCommand(state, { type: 'plant', ids: command.ids ?? [command.id], crop: command.crop }, now, { requestId })
  } else if (command.type === 'collect' && command.fieldTargets && typeof command.fieldTargets === 'object') {
    const ids = checkedIds(Object.keys(command.fieldTargets))
    const objects = new Map(state.objects.map(object => [object.id, object]))
    for (const id of ids) {
      const object = objects.get(id)
      if (!object || object.stored || !object.crop || cropIdentity(object) !== command.fieldTargets[id]) {
        reject('밭의 작물이 바뀌어서 수확하지 못했어요.')
      }
      if (object.crop.readyAt > now) reject('아직 준비된 수확물이 없어요.')
    }
    const targets = [...ids]
    farm = applyFarmCommand(state, { type: 'collect', ids: command.ids ? targets : undefined }, now, { targets, requestId })
  } else if (command.type === 'collect' && command.collectTargets && typeof command.collectTargets === 'object') {
    const ids = [...checkedIds(Object.keys(command.collectTargets))]
    for (const id of ids) {
      const object = find(state, id)
      const identity = command.collectTargets[id]
      if (identity !== null && (!object.crop || cropIdentity(object) !== identity)) reject('밭의 작물이 바뀌어서 수확하지 못했어요.')
    }
    farm = applyFarmCommand(state, command, now, { targets: ids, requestId })
  } else if (command.type === 'view') {
    farm = automateFarm(state, now, requestId)
  } else if (command.type === 'share' && preview) {
    // Invitation secrets are generated only on the server; never display a predicted link.
    if (typeof command.enabled !== 'boolean') reject('공개 범위를 다시 선택해 주세요.')
    farm = { ...state, share: { ...state.share, enabled: command.enabled } }
  } else {
    farm = applyFarmCommand(state, command, now)
  }
  if (preview) return displayFarm(farm, now)

  return acknowledgeFarmCommand(farm, requestId, now)
}

export const weatherAt = now => Math.floor(now / day) % 4 === 0 ? seasonAt(now).season === 'winter' ? 'snow' : 'rain' : 'clear'

export function displayFarm(state, now) {
  const { season } = seasonAt(now)
  const weather = weatherAt(now)
  const extra = state.stats ? { peddlerOffer: peddlerOffer(state, now), notes: weeklyNotes(state, now) } : {}
  return { ...state, now, season, weather, event: seasonEvent(state, now), charm: charm(state), ...extra }
}

export function publicFarm(state, now) {
  const { handle, name, objects, parcels, cleared, zoneNames, orders, level, views, title } = state
  return displayFarm({
    handle, name, title, avatar: avatarLook(state.avatar), objects: objects.filter(object => !object.stored),
    parcels, cleared, zoneNames, orders, level, views: views ?? {},
    settings: { quality: 'high', motion: true, weather: true },
    social: { messages: state.social.messages, helpers: state.social.helpers ?? [] },
  }, now)
}

const log = (list, event) => [event, ...list].slice(0, 20)

export function socialCommand(ownerState, guestState, command, now) {
  if (!ownerState.share.enabled) reject('이 농장은 방문이 닫혀 있어요.')
  const owner = structuredClone(ownerState)
  const guest = structuredClone(guestState)
  const event = { from: guest.handle, at: now }

  if (command.type === 'visit') {
    // 주인이 맡겨 둔 답례는 방문할 때 받는다
    const thanks = (owner.social.thanks ?? []).find(entry => entry.to === guest.handle)
    if (thanks) {
      owner.social.thanks = owner.social.thanks.filter(entry => entry !== thanks)
      addItem(guest, thanks.item, 1)
      guest.social.gifts = log(guest.social.gifts, { from: owner.handle, at: now, item: thanks.item, thanks: true })
    }
    const recent = owner.social.visits.some(entry => entry.from === guest.handle && entry.at > now - 30 * minute)
    if (recent && !thanks) return { owner: ownerState, guest: guestState }
    if (!recent) {
      owner.social.visits = log(owner.social.visits, event)
      owner.stats.visits++
    }
    return { owner, guest: thanks ? guest : guestState }
  }

  if (command.type === 'message') {
    if (owner.social.messages.some(entry => entry.from === guest.handle && entry.at > now - minute)) {
      reject('방명록은 잠시 뒤에 또 남길 수 있어요.')
    }
    const parcel = command.parcel
    if (parcel !== undefined && !owner.parcels.includes(parcel)) reject('감상을 남길 구역을 다시 골라 주세요.')
    owner.social.messages = log(owner.social.messages, { ...event, text: label(command.text, 120), ...(parcel && { parcel }) })
    return { owner, guest: guestState }
  }

  const item = command.item
  if (!(lookup(products, item) ?? lookup(crops, item)) || (guest.inventory[item] ?? 0) < 1) reject('보낼 물건이 없어요.')
  if (command.type === 'assist') {
    const order = owner.orders.find(entry => entry.id === command.id && !entry.done)
    if (!order || !Object.hasOwn(order.items, item) || order.items[item] <= (order.shared[item] ?? 0)) {
      reject('이 주문에는 더 보낼 수 없어요.')
    }
    order.shared[item] = (order.shared[item] ?? 0) + 1
    const helpers = owner.social.helpers ?? []
    const helper = helpers.find(entry => entry.handle === guest.handle)
    owner.social.helpers = [{ handle: guest.handle, count: (helper?.count ?? 0) + 1 },
      ...helpers.filter(entry => entry !== helper)].slice(0, 20)
  } else if (command.type === 'gift') {
    addItem(owner, item, 1)
    owner.social.gifts = log(owner.social.gifts, { ...event, item })
  } else {
    reject('할 수 없는 방문 작업이에요.')
  }
  addItem(guest, item, -1)
  owner.undo = null
  guest.undo = null
  return { owner, guest }
}
