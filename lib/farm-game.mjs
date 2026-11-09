import { randomBytes } from 'node:crypto'
import { batchKinds, buildings, crops, products, recipes } from './farm-catalog.mjs'
import { canExpand, canPlace, footprint, inMap, parcelAt, parcelPrice, START_PARCEL, terrainAt, tileKey } from './farm-layout.mjs'

const minute = 60000
const layoutCommands = new Set(['place', 'move', 'moveGroup', 'store', 'restore', 'undo'])
const collection = new Set(['plot', 'animal', 'artisan'])
const orderKinds = ['small', 'small', 'regular', 'long']
const neighbors = [
  { id: 'sundeok', name: '순덕 할머니', use: '아침 빵을 구웠어요', hello: '아침 장에 쓸 걸 조금 부탁해도 될까요?' },
  { id: 'minho', name: '민호 사장', use: '가게에 내놨더니 금방 팔렸어요', hello: '가게에 새로 들일 물건을 찾고 있어요.' },
  { id: 'yuna', name: '유나 선생님', use: '아이들 간식을 만들었어요', hello: '아이들과 나눠 먹을 걸 부탁해요.' },
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
  const value = Object.entries(items).reduce((sum, [item, count]) => sum + itemPrice(item) * count, 0)
  const reward = Math.ceil(value * { small: 1.3, regular: 1.5, long: 1.8 }[kind]) + 5
  const order = { id: kind + '-' + serial, kind, items, shared: {}, done: false, reward }
  if (kind === 'small') order.name = '장터 소량 판매 · ' + itemName(picked[0])
  if (kind === 'long') order.name = '마을 잔치 장기 주문'
  if (kind === 'regular') {
    const neighbor = neighbors[serial % neighbors.length]
    const last = farm.regulars?.[neighbor.id]
    order.from = neighbor.id
    order.name = neighbor.name + '의 부탁'
    order.line = last ? '지난번 ' + withRo(itemName(last)) + ' ' + neighbor.use + '. 이번에도 부탁해요.' : neighbor.hello
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
    handle, name: title || handle + '의 농장', coins: 150, level: 1, xp: 0, now, nextId: 19,
    inventory: {}, objects, parcels: [START_PARCEL], cleared: [], cooldowns: {},
    settings: { quality: 'high', motion: true, weather: true, audio: true, ambient: false, music: false, guide: true },
    orders: [], orderSerial: 0, regulars: {}, events: [], favorites: [],
    zoneNames: {}, views: {}, discovered: [], undo: null,
    stats: { planted: 0, harvested: 0, collected: 0, sold: 0, built: 0, expanded: 0, fished: 0, foraged: 0, crafted: 0, orders: 0, visits: 0 },
    share: { enabled: false, code: null }, social: { visits: [], messages: [], gifts: [] },
  }
  farm.orders = orderKinds.map((_, slot) => makeOrder(farm, slot))
  return farm
}

function addItem(farm, item, quantity) {
  const count = (farm.inventory[item] ?? 0) + quantity
  if (count > 0) farm.inventory[item] = count
  else delete farm.inventory[item]
  if (quantity > 0 && !farm.discovered.includes(item)) farm.discovered.push(item)
}

function xp(farm, value) {
  farm.xp += value
  farm.level = 1 + Math.floor(farm.xp / 25)
}

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
const productSpeed = (farm, object) => object.kind === 'hive' && hasNearby(farm, 'flowerbed', object, 2) ? .75 : 1

function harvestCrop(farm, object, now) {
  if (!object.crop || object.crop.readyAt > now) return false
  addItem(farm, object.crop.kind, 1)
  delete object.crop
  farm.stats.harvested++
  xp(farm, 2)
  return true
}

function collectObject(farm, object, now) {
  if (cropBed(object)) return harvestCrop(farm, object, now)
  const def = buildings[object.kind]
  if (def.product && object.readyAt <= now) {
    addItem(farm, def.product, object.level)
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
  if (!def || farm.level < (def.level ?? 1)) reject('아직 열리지 않은 건물이에요.')
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

function plant(farm, command, now) {
  const crop = lookup(crops, command.crop)
  if (!crop || farm.level < (crop.level ?? 1)) reject('아직 열리지 않은 씨앗이에요.')
  const ids = checkedIds(command.ids ?? [command.id])
  for (const id of ids) {
    const object = find(farm, id)
    if (!cropBed(object) || object.crop) reject('빈 밭을 골라 주세요.')
    spend(farm, crop.seed)
    const speed = object.kind === 'greenhouse' || hasNearby(farm, 'sprinkler', object, 3) ? .8 : 1
    object.crop = { kind: command.crop, plantedAt: now, readyAt: now + crop.seconds * 1000 * speed }
    farm.stats.planted++
    xp(farm, 1)
  }
}

function collect(farm, command, now) {
  const ids = command.ids ? checkedIds(command.ids) : command.id ? new Set([command.id]) : null
  if (ids) for (const id of ids) find(farm, id)
  if (command.kind && !collection.has(command.kind)) reject('모을 종류를 다시 골라 주세요.')
  let picked = 0
  for (const object of farm.objects) {
    if (object.stored || (ids && !ids.has(object.id)) || (command.parcel && parcelAt(object.x, object.z) !== command.parcel)) continue
    const kind = cropBed(object) ? 'plot' : buildings[object.kind].product ? 'animal' : 'artisan'
    if (command.kind && kind !== command.kind) continue
    if (collectObject(farm, object, now)) picked++
  }
  if (!picked) reject('아직 준비된 수확물이 없어요.')
}

function enqueue(farm, command, now) {
  const object = find(farm, command.id)
  const recipe = lookup(recipes, command.recipe)
  if (!recipe || object.kind !== recipe.building || farm.level < (recipe.level ?? 1)) reject('여기서 만들 수 없는 물건이에요.')
  const quantity = getQuantity(command.quantity, 8)
  const queue = object.queue ??= []
  if (queue.length + quantity > 8) reject('작업장 예약이 가득 찼어요.')
  for (const [item, needed] of Object.entries(recipe.inputs)) {
    if ((farm.inventory[item] ?? 0) < needed * quantity) reject('재료가 부족해요.')
    addItem(farm, item, -needed * quantity)
  }
  let readyAt = Math.max(now, queue.at(-1)?.readyAt ?? now)
  for (let i = 0; i < quantity; i++) {
    readyAt += recipe.seconds * 1000
    queue.push({ recipe: command.recipe, readyAt })
  }
}

function sell(farm, command) {
  const items = command.item ? [command.item] : Object.keys(farm.inventory)
  let total = 0
  for (const item of items) {
    const product = lookup(products, item) ?? lookup(crops, item)
    if (!product) reject('판매할 수 없는 물건이에요.')
    const count = farm.inventory[item] ?? 0
    const amount = command.quantity === undefined || !command.item ? count : getQuantity(command.quantity, count)
    addItem(farm, item, -amount)
    total += amount * product.price
    farm.stats.sold += amount
  }
  if (!total) reject('판매할 물건이 없어요.')
  farm.coins += total
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
  farm.coins += job.reward
  farm.stats.orders++
  xp(farm, job.kind === 'long' ? 20 : 12)
  if (job === event) {
    farm.events = [...(farm.events ?? []), id].slice(-8)
    return
  }
  job.done = true
  if (job.from) farm.regulars = { ...farm.regulars, [job.from]: Object.keys(job.items)[0] }
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
  for (const key of ['motion', 'weather', 'audio', 'ambient', 'music', 'guide']) {
    if (typeof input[key] === 'boolean') farm.settings[key] = input[key]
  }
  if (['low', 'high'].includes(input.quality)) farm.settings.quality = input.quality
}

export function automateFarm(state, now) {
  const workers = state.objects.filter(object => object.kind === 'worker' && !object.stored)
  if (!workers.length) return state
  const ready = state.objects.filter(object => !object.stored && object.crop?.readyAt <= now &&
    workers.some(worker => Math.abs(worker.x - object.x) + Math.abs(worker.z - object.z) <= 4))
  if (!ready.length) return state
  const farm = structuredClone(state)
  for (const { id } of ready) harvestCrop(farm, find(farm, id), now)
  farm.undo = null
  return farm
}

export function applyFarmCommand(state, command, now) {
  if (!command || typeof command.type !== 'string') reject('작업을 다시 선택해 주세요.')
  const request = command.requestId
  if (request !== undefined && (typeof request !== 'string' || !/^[\w-]{8,64}$/.test(request))) reject('작업을 다시 선택해 주세요.')
  // 응답을 못 받고 다시 보낸 같은 요청은 한 번만 반영한다
  if (request && state.lastRequest === request) return state
  const farm = structuredClone(state)
  farm.now = now
  if (request) farm.lastRequest = request
  const { type, id, x, z } = command
  if (!layoutCommands.has(type) && !['setSettings', 'camera', 'favorite'].includes(type)) farm.undo = null
  switch (type) {
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
      plant(farm, command, now)
      break
    case 'collect':
      collect(farm, command, now)
      break
    case 'sell':
      sell(farm, command)
      break
    case 'enqueue':
      enqueue(farm, command, now)
      break
    case 'upgrade': {
      const object = find(farm, id)
      const def = buildings[object.kind]
      if (def.category !== 'animal' || object.level >= 5) reject('더 증축할 수 없는 건물이에요.')
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
      }
      object.petAt = now
      break
    }
    case 'clear': {
      if (!unlocked(farm, x, z)) reject('열린 땅을 골라 주세요.')
      const key = tileKey(x, z)
      const obstacle = terrainAt(x, z).obstacle
      if (!['tree', 'rock'].includes(obstacle) || farm.cleared.includes(key)) reject('정리할 나무나 돌이 없어요.')
      farm.cleared.push(key)
      addItem(farm, obstacle === 'tree' ? 'wood' : 'stone', 1)
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
      const fish = ['fish', 'carp', 'trout'].filter(item => lookup(products, item))
      addItem(farm, fish[farm.stats.fished % fish.length], 1)
      farm.stats.fished++
      farm.cooldowns[key] = now + 3 * minute
      xp(farm, 2)
      break
    }
    case 'forage': {
      if (!unlocked(farm, x, z)) reject('열린 땅을 골라 주세요.')
      const item = terrainAt(x, z).forage
      const key = 'forage:' + tileKey(x, z)
      if (!item || farm.cooldowns[key] > now || farm.cleared.includes(tileKey(x, z))) reject('여기에는 채집할 것이 없어요.')
      addItem(farm, item, 1)
      farm.stats.foraged++
      farm.cooldowns[key] = now + 10 * minute
      xp(farm, 1)
      break
    }
    case 'setSettings':
      settings(farm, command.settings)
      break
    case 'favorite':
      if (!lookup(crops, command.crop)) reject('씨앗을 다시 골라 주세요.')
      farm.favorites = farm.favorites.includes(command.crop) ? farm.favorites.filter(crop => crop !== command.crop)
        : [...farm.favorites, command.crop]
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
      if (command.enabled && (!farm.share.code || command.rotate === true)) farm.share.code = randomBytes(12).toString('hex')
      break
    case 'order':
      order(farm, id, now)
      break
    case 'skipOrder':
      skipOrder(farm, id)
      break
    default:
      reject('할 수 없는 작업이에요.')
  }
  return farm
}

export function displayFarm(state, now) {
  const { season } = seasonAt(now)
  const weather = Math.floor(now / day) % 4 === 0 ? season === 'winter' ? 'snow' : 'rain' : 'clear'
  return { ...state, now, season, weather, event: seasonEvent(state, now) }
}

export function publicFarm(state, now) {
  const { handle, name, objects, parcels, cleared, zoneNames, orders, level, views } = state
  return displayFarm({
    handle, name, objects: objects.filter(object => !object.stored),
    parcels, cleared, zoneNames, orders, level, views: views ?? {},
    settings: { quality: 'high', motion: true, weather: true },
    social: { messages: state.social.messages },
  }, now)
}

const log = (list, event) => [event, ...list].slice(0, 20)

export function socialCommand(ownerState, guestState, command, now) {
  if (!ownerState.share.enabled) reject('이 농장은 방문이 닫혀 있어요.')
  const owner = structuredClone(ownerState)
  const guest = structuredClone(guestState)
  const event = { from: guest.handle, at: now }

  if (command.type === 'visit') {
    if (owner.social.visits.some(entry => entry.from === guest.handle && entry.at > now - 30 * minute)) {
      return { owner: ownerState, guest: guestState }
    }
    owner.social.visits = log(owner.social.visits, event)
    owner.stats.visits++
    return { owner, guest: guestState }
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
