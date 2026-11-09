import assert from 'node:assert/strict'
import test from 'node:test'
import { applyFarmCommand, createFarm, displayFarm, producible, publicFarm, seasonEvent, socialCommand, withRo } from '../lib/farm-game.mjs'
import { canPlace, objectsUnder } from '../lib/farm-layout.mjs'
import { crops } from '../lib/farm-catalog.mjs'

const at = 1760000000000
const run = (farm, type, args = {}, now = at) => applyFarmCommand(farm, { type, ...args }, now)

test('a new farm starts with a wheat sale, mixed order kinds and a connected dirt path', () => {
  const farm = createFarm('testfarmer', at)
  assert.deepEqual(farm.orders.map(order => order.kind), ['small', 'small', 'regular', 'long'])
  assert.deepEqual(Object.keys(farm.orders[0].items), ['wheat'])
  const pool = new Set(producible(farm))
  for (const order of farm.orders) for (const item of Object.keys(order.items)) assert.ok(pool.has(item), item)
  assert.ok(farm.objects.some(object => object.kind === 'path'))
  assert.equal(canPlace(farm, 'plot', 13, 20, 0), true)
})

test('orders only ask for what the farm can make and refill just the delivered slot', () => {
  let farm = { ...createFarm('testfarmer', at), inventory: { wheat: 50, carrot: 50, berry: 50 } }
  const [first, , regular] = farm.orders
  const shared = structuredClone(farm)
  shared.orders[2].shared = { [Object.keys(regular.items)[0]]: 1 }
  const next = run(shared, 'order', { id: first.id })
  assert.notEqual(next.orders[0].id, first.id)
  assert.deepEqual(next.orders[2], shared.orders[2])
  assert.ok(Object.keys(next.orders[0].items).every(item => ['wheat', 'carrot', 'berry'].includes(item)))
  const thanked = run(next, 'order', { id: regular.id })
  assert.equal(thanked.regulars[regular.from], Object.keys(regular.items)[0])
})

test('a regular neighbour remembers the last delivery in a later request', () => {
  let farm = { ...createFarm('testfarmer', at), inventory: Object.fromEntries(Object.keys(crops).map(crop => [crop, 999])) }
  for (let round = 0; round < 10 && !farm.orders[2].line.startsWith('지난번'); round++) farm = run(farm, 'order', { id: farm.orders[2].id })
  assert.match(farm.orders[2].line, /^지난번 .+(으로|로) /)
  assert.equal(withRo('밀'), '밀로')
  assert.equal(withRo('당근'), '당근으로')
  assert.equal(withRo('딸기'), '딸기로')
})

test('skipping an order returns visitor contributions and legacy orders still deliver', () => {
  const farm = createFarm('testfarmer', at)
  farm.orders[1].shared = { [Object.keys(farm.orders[1].items)[0]]: 1 }
  const skipped = run(farm, 'skipOrder', { id: farm.orders[1].id })
  assert.equal(skipped.inventory[Object.keys(farm.orders[1].items)[0]], 1)
  assert.notEqual(skipped.orders[1].id, farm.orders[1].id)

  const legacy = { ...createFarm('old', at), inventory: { milk: 2, egg: 3 } }
  delete legacy.orderSerial
  legacy.orders = [{ id: 'milk-truck', name: '아침 우유 배달', items: { milk: 2, egg: 3 }, reward: 115, shared: {}, done: false }]
  const delivered = run(legacy, 'order', { id: 'milk-truck' })
  assert.equal(delivered.coins, legacy.coins + 115)
  assert.notEqual(delivered.orders[0].id, 'milk-truck')
})

test('a seasonal stall is optional, uses unlocked crops and pays once', () => {
  const farm = { ...createFarm('testfarmer', at), inventory: { wheat: 20, carrot: 20, berry: 20 } }
  const event = seasonEvent(farm, at)
  assert.ok(Object.keys(event.items).every(item => ['wheat', 'carrot', 'berry'].includes(item)))
  assert.equal(displayFarm(farm, at).event.id, event.id)
  const done = run(farm, 'order', { id: event.id })
  assert.equal(done.coins, farm.coins + event.reward)
  assert.throws(() => run(done, 'order', { id: event.id }), /이미/)
})

test('a retried request id is applied once', () => {
  const farm = { ...createFarm('testfarmer', at), inventory: { wheat: 3 } }
  const sold = run(farm, 'sell', { item: 'wheat', requestId: 'sale-0001' })
  assert.equal(run(sold, 'sell', { item: 'wheat', requestId: 'sale-0001' }), sold)
  assert.throws(() => run(farm, 'sell', { item: 'wheat', requestId: 'bad id!' }), /다시/)
})

test('a sweep touches each bed once and hives near flowers fill faster', () => {
  let farm = { ...createFarm('testfarmer', at), level: 2, xp: 25, coins: 500 }
  const beds = objectsUnder(farm, [{ x: 15, z: 18 }, { x: 15, z: 18 }, { x: 16, z: 18 }, { x: 30, z: 30 }])
  assert.deepEqual(beds.map(object => object.kind), ['plot', 'plot'])
  farm = run(farm, 'place', { kind: 'flowerbed', x: 13, z: 20 })
  farm = run(farm, 'place', { kind: 'hive', x: 14, z: 20 })
  farm = run(farm, 'place', { kind: 'hive', x: 22, z: 21 })
  const [near, far] = farm.objects.filter(object => object.kind === 'hive')
  assert.ok(near.readyAt - at < far.readyAt - at)
})

test('visitors can leave a note on an owned zone and see recommended spots', () => {
  const owner = { ...createFarm('owner', at), share: { enabled: true, code: 'abcdef1234567890abcdef12' }, views: { 1: { x: 18, z: 18, zoom: 1 } } }
  const guest = createFarm('guest', at)
  const { owner: next } = socialCommand(owner, guest, { type: 'message', text: '연못가가 좋아요', parcel: '1,1' }, at)
  assert.equal(next.social.messages[0].parcel, '1,1')
  assert.deepEqual(publicFarm(next, at).views, owner.views)
  assert.throws(() => socialCommand(owner, guest, { type: 'message', text: '안녕', parcel: '3,3' }, at), /구역/)
})
