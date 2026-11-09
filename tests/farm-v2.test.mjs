import assert from 'node:assert/strict'
import test from 'node:test'
import { createFarm, applyFarmCommand, automateFarm, publicFarm, socialCommand } from '../lib/farm-game.mjs'
import { canPlace } from '../lib/farm-layout.mjs'
import { buildings, recipes } from '../lib/farm-catalog.mjs'

const at = 1760000000000
const run = (farm, type, args = {}, now = at) => applyFarmCommand(farm, { type, ...args }, now)
const initial = () => createFarm('testfarmer', at)

test('placements respect occupancy, full footprints, unlocked parcels and the coin balance', () => {
  const start = initial()
  assert.equal(canPlace(start, 'plot', 0, 0, 0), false)
  const coop = run(start, 'place', { kind: 'coop', x: 13, z: 20, rotation: 1 })
  assert.equal(coop.coins, start.coins - buildings.coop.price)
  assert.throws(() => run(coop, 'place', { kind: 'plot', x: 14, z: 21, rotation: 0 }), /자리/)
  assert.throws(() => run(coop, 'place', { kind: 'coop', x: 23, z: 21, rotation: 0 }), /자리/)
  assert.equal(start.objects.some(object => object.kind === 'coop'), false)
})

test('moving and undoing a planted field keeps the same crop and timer', () => {
  const start = initial()
  const plot = start.objects.find(object => object.kind === 'plot')
  const planted = run(start, 'plant', { id: plot.id, crop: 'wheat' })
  const moving = run(planted, 'move', { id: plot.id, x: 13, z: 20, rotation: 1 })
  const undo = run(moving, 'undo')
  assert.deepEqual(undo.objects.find(object => object.id === plot.id), planted.objects.find(object => object.id === plot.id))
  assert.throws(() => run(undo, 'collect', { id: plot.id }), /준비/)
  const harvest = run(undo, 'collect', { id: plot.id }, at + 46000)
  assert.equal(harvest.inventory.wheat, 1)
  assert.throws(() => run(harvest, 'collect', { id: plot.id }, at + 46000), /준비/)
})

test('multiple coops produce independently and keep production while moving', () => {
  let farm = run(initial(), 'place', { kind: 'coop', x: 13, z: 20, rotation: 0 })
  farm = run(farm, 'place', { kind: 'coop', x: 16, z: 20, rotation: 0 }, at + 60000)
  const [first, second] = farm.objects.filter(object => object.kind === 'coop')
  assert.equal(second.readyAt - first.readyAt, 60000)
  farm = run(farm, 'move', { id: first.id, x: 20, z: 20, rotation: 2 })
  farm = run(farm, 'collect', { kind: 'animal' }, first.readyAt)
  assert.equal(farm.inventory.egg, 1)
  assert.equal(farm.objects.find(object => object.id === second.id).readyAt, second.readyAt)
  farm = run(farm, 'renameAnimal', { id: first.id, animal: 1, name: '뽀송' })
  assert.equal(farm.objects.find(object => object.id === first.id).animalNames[1], '뽀송')
  assert.throws(() => run(farm, 'renameAnimal', { id: first.id, animal: 2, name: '두번째' }), /수량/)
})

test('contributions consume only the guest inventory and a visit snapshot omits private state', () => {
  const owner = { ...initial(), share: { enabled: true, code: 'abcdef1234567890' } }
  const guest = { ...createFarm('guest', at), inventory: { wheat: 3 } }
  const order = owner.orders.find(item => item.items.wheat)
  const pair = socialCommand(owner, guest, { type: 'assist', id: order.id, item: 'wheat' }, at)
  assert.equal(pair.guest.inventory.wheat, 2)
  assert.equal(pair.owner.orders.find(item => item.id === order.id).shared.wheat, 1)
  assert.equal(publicFarm(pair.owner, at).share, undefined)
  assert.equal(publicFarm(pair.owner, at).inventory, undefined)
})

test('a failed multi-tile build never spends money or leaves a partial structure', () => {
  const farm = initial()
  const path = [{ x: 13, z: 20 }, { x: 13, z: 20 }]
  assert.throws(() => run(farm, 'place', { kind: 'plot', path }), /자리/)
  assert.equal(farm.coins, 150)
  assert.equal(farm.objects.length, initial().objects.length)
  const batch = run(farm, 'place', { kind: 'plot', path: [{ x: 13, z: 20 }, { x: 14, z: 20 }] })
  assert.equal(batch.objects.length, farm.objects.length + 2)
  assert.equal(run(batch, 'undo').coins, farm.coins)
})

test('adjacent parcels open as units and pond fishing has a saved cooldown', () => {
  let farm = initial()
  assert.throws(() => run(farm, 'expand', { parcel: '3,1' }), /붙어/)
  farm = run(farm, 'expand', { parcel: '2,1' })
  farm = run(farm, 'expand', { parcel: '3,1' })
  assert.equal(canPlace(farm, 'plot', 42, 18, 0), false)
  assert.equal(canPlace(farm, 'bridge', 42, 18, 0), true)
  farm = run(farm, 'fish', { x: 42, z: 18 })
  assert.equal(farm.inventory.fish, 1)
  assert.throws(() => run(farm, 'fish', { x: 42, z: 18 }), /잠시/)
})

test('jobs reserve materials, finish in order, and survive storing the workshop', () => {
  let farm = { ...initial(), level: 2, xp: 25, inventory: { wheat: 4 } }
  farm = run(farm, 'place', { kind: 'mill', x: 13, z: 20 })
  const mill = farm.objects.find(object => object.kind === 'mill')
  farm = run(farm, 'enqueue', { id: mill.id, recipe: 'flour', quantity: 2 })
  assert.equal(farm.inventory.wheat, undefined)
  const interval = recipes.flour.seconds * 1000
  assert.deepEqual(farm.objects.find(object => object.id === mill.id).queue.map(job => job.readyAt), [at + interval, at + 2 * interval])
  farm = run(farm, 'store', { id: mill.id })
  assert.throws(() => run(farm, 'collect', { id: mill.id }, at + interval), /찾을/)
  farm = run(farm, 'restore', { id: mill.id, x: 13, z: 21 })
  farm = run(farm, 'collect', { id: mill.id }, at + interval)
  assert.equal(farm.inventory.flour, 1)
  assert.equal(farm.objects.find(object => object.id === mill.id).queue.length, 1)
})

test('a worker collects only ready crops within its radius', () => {
  let farm = { ...initial(), level: 4, xp: 75, coins: 500 }
  farm = run(farm, 'place', { kind: 'worker', x: 13, z: 17 })
  const plot = farm.objects.find(object => object.kind === 'plot')
  farm = run(farm, 'plant', { id: plot.id, crop: 'wheat' })
  assert.equal(automateFarm(farm, at + 1), farm)
  const next = automateFarm(farm, at + 46000)
  assert.equal(next.inventory.wheat, 1)
  assert.equal(automateFarm(next, at + 46000), next)
})
test('a new farm saves its chosen name for the owner and visitors', () => {
  const farm = createFarm('testfarmer', at, '  바람꽃 농장  ')
  assert.equal(farm.name, '바람꽃 농장')
  assert.equal(farm.handle, 'testfarmer')
  assert.equal(publicFarm(farm, at).name, '바람꽃 농장')
  for (const name of ['   ', '가'.repeat(25), '두 줄\n이름', null]) {
    assert.throws(() => createFarm('testfarmer', at, name), /농장 이름/)
  }
})
