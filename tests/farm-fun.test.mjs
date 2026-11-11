import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyFarmCommand, charm, createFarm, displayFarm, hearts, isGolden, peddlerOffer, publicFarm, roll, socialCommand,
} from '../lib/farm-game.mjs'
import { buildings, collectionSets, crops } from '../lib/farm-catalog.mjs'

const at = 1760000000000
const run = (farm, type, args = {}, now = at) => applyFarmCommand(farm, { type, ...args }, now)

test('every level up to 15 unlocks something and a level up opens a gift', () => {
  for (let level = 2; level <= 15; level++) {
    assert.ok(Object.values(buildings).some(item => item.level === level && !item.gift) ||
      Object.values(crops).some(item => item.level === level), 'Lv.' + level)
  }
  const farm = { ...createFarm('testfarmer', at), xp: 24, inventory: { wheat: 1 } }
  const sold = run(farm, 'sell', { item: 'wheat' })
  assert.equal(sold.level, 2)
  assert.deepEqual(sold.levelGift, { level: 2, coins: 20 })
  assert.throws(() => run({ ...farm, level: 20, xp: 500 }, 'place', { kind: 'jangdok', x: 13, z: 20 }), /열리지/)
})

test('golden crops are decided by the server seed and a sweep combo pays bonus xp once per bed', () => {
  let farm = { ...createFarm('testfarmer', at), coins: 5000, level: 2, xp: 25 }
  farm = run(farm, 'place', { kind: 'plot', path: Array.from({ length: 10 }, (_, i) => ({ x: 13 + i % 5, z: 21 + Math.floor(i / 5) })) })
  const beds = farm.objects.filter(object => object.kind === 'plot')
  farm = run(farm, 'plant', { ids: beds.map(bed => bed.id), crop: 'wheat' })
  const golden = farm.objects.filter(object => isGolden(farm, object)).length
  const later = at + 46000
  const ids = beds.map(bed => bed.id)
  const harvested = run(farm, 'collect', { ids: [...ids, ...ids] }, later)
  assert.equal((harvested.inventory.wheat ?? 0) + (harvested.inventory.golden_wheat ?? 0), beds.length)
  assert.equal(harvested.inventory.golden_wheat ?? 0, golden)
  assert.equal(harvested.stats.bestCombo, beds.length)
  assert.equal(harvested.xp - farm.xp, beds.length * 2 + Math.floor(beds.length / 5))
  assert.equal(roll('a', 1), roll('a', 1))
})

test('petting and treats build shared hearts with a daily cap', () => {
  let farm = { ...createFarm('testfarmer', at), inventory: { carrot: 20 } }
  farm = run(farm, 'place', { kind: 'coop', x: 13, z: 20 })
  const coop = farm.objects.find(object => object.kind === 'coop')
  farm = run(farm, 'pet', { id: coop.id })
  farm = run(farm, 'pet', { id: coop.id }, at + 1000)
  assert.equal(farm.objects.find(object => object.id === coop.id).love, 1)
  // 닭장이 5분이면 차서, 간식을 여러 번 줄 수 있게 생산을 길게 잡아 둔다
  farm.objects.find(object => object.id === coop.id).readyAt = at + 3600000
  for (let i = 0; i < 6; i++) farm = run(farm, 'feed', { id: coop.id }, at + (i + 1) * 61000)
  assert.equal(farm.objects.find(object => object.id === coop.id).love, 10)
  assert.equal(hearts(farm.objects.find(object => object.id === coop.id)), 1)
})

test('fishing records the species size and forage luck is repeatable', () => {
  let farm = createFarm('testfarmer', at)
  farm = run(farm, 'expand', { parcel: '2,1' })
  farm = run(farm, 'expand', { parcel: '3,1' })
  const caught = run(farm, 'fish', { x: 42, z: 18 })
  const { item, size } = caught.lastCatch
  assert.equal(caught.records[item], size)
  assert.deepEqual(run(farm, 'fish', { x: 42, z: 18 }).lastCatch, caught.lastCatch)
})

test('completing a collection set and a neighbour friendship put gifts in storage', () => {
  let farm = { ...createFarm('testfarmer', at), inventory: { fish: 1, carp: 1 } }
  farm.discovered = ['fish', 'carp']
  farm = run(farm, 'expand', { parcel: '2,1' })
  farm = run(farm, 'expand', { parcel: '3,1' })
  for (let i = 0; i < 40 && !farm.rewards.includes('fish'); i++) farm = run(farm, 'fish', { x: 42, z: 18 }, at + i * 200000)
  assert.ok(farm.rewards.includes('fish'))
  const gift = farm.objects.find(object => object.kind === collectionSets.fish.reward)
  assert.equal(gift.stored, true)
  const placed = run(farm, 'restore', { id: gift.id, x: 13, z: 20 })
  assert.equal(placed.objects.find(object => object.id === gift.id).stored, false)

  let friend = { ...createFarm('testfarmer', at), inventory: Object.fromEntries(Object.keys(crops).map(crop => [crop, 999])) }
  for (let i = 0; i < 30 && Object.values(friend.friends).every(count => count < 6); i++) friend = run(friend, 'order', { id: friend.orders[2].id })
  assert.ok(friend.objects.some(object => ['jangdok', 'pyeongsang', 'yunapot'].includes(object.kind) && object.stored))
})

test('the peddler trades once per visit and seasonal crops sell for more', () => {
  const farm = { ...createFarm('testfarmer', at), inventory: { wheat: 50, carrot: 50, berry: 50 } }
  const offer = peddlerOffer(farm, at)
  const traded = run(farm, 'trade', { id: offer.id })
  assert.equal(traded.coins, farm.coins - offer.coins)
  assert.ok(traded.objects.some(object => object.kind === offer.give && object.stored))
  assert.throws(() => run(traded, 'trade', { id: offer.id }), /이미/)
  assert.equal(displayFarm(traded, at).peddlerOffer.done, true)

  const spring = Date.UTC(2025, 0, 2) - (Math.floor(Date.UTC(2025, 0, 2) / 86400000 / 7) % 4) * 7 * 86400000
  const berry = run({ ...farm, inventory: { berry: 1 } }, 'sell', { item: 'berry' }, spring)
  const wheat = run({ ...farm, inventory: { wheat: 1 } }, 'sell', { item: 'wheat' }, spring)
  assert.equal(berry.coins - farm.coins, Math.round(crops.berry.price * 1.2))
  assert.equal(wheat.coins - farm.coins, crops.wheat.price)
})

test('decorations raise charm and weekly notes carry over without a penalty', () => {
  let farm = { ...createFarm('testfarmer', at), coins: 5000, level: 3, xp: 50 }
  const before = charm(farm).score
  farm = run(farm, 'place', { kind: 'fountain', x: 13, z: 20 })
  farm = run(farm, 'place', { kind: 'bench', x: 16, z: 21 })
  assert.ok(charm(farm).score > before)
  assert.equal(publicFarm(farm, at).charm.score, charm(farm).score)

  const notes = farm.notes
  assert.equal(notes.goals.length, 3)
  const goal = notes.goals[0]
  assert.throws(() => run(farm, 'claimNote', { id: goal.id }), /아직/)
  const done = structuredClone(farm)
  done.stats[goal.stat] = goal.base + goal.n
  const claimed = run(done, 'claimNote', { id: goal.id })
  assert.equal(claimed.stickers, 1)
  const nextWeek = run(farm, 'setSettings', { settings: { audio: false } }, at + 7 * 86400000)
  assert.ok(nextWeek.notes.goals.some(entry => entry.id === goal.id))
})

test('an owner thanks a helper and the gift arrives on the next visit', () => {
  let owner = { ...createFarm('owner', at), share: { enabled: true, code: 'abcdef1234567890abcdef12' }, inventory: { egg: 2 } }
  const guest = { ...createFarm('guest', at), inventory: { wheat: 3 } }
  const order = owner.orders.find(entry => entry.items.wheat)
  owner = socialCommand(owner, guest, { type: 'assist', id: order.id, item: 'wheat' }, at).owner
  assert.deepEqual(publicFarm(owner, at).social.helpers, [{ handle: 'guest', count: 1 }])
  assert.throws(() => run(owner, 'thank', { handle: 'nobody', item: 'egg' }), /이웃/)
  owner = run(owner, 'thank', { handle: 'guest', item: 'egg' })
  assert.throws(() => run(owner, 'thank', { handle: 'guest', item: 'egg' }), /이미/)
  const visit = socialCommand(owner, guest, { type: 'visit' }, at + 60000)
  assert.equal(visit.guest.inventory.egg, 1)
  assert.equal(visit.owner.social.thanks.length, 0)
})
