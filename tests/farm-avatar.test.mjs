import assert from 'node:assert/strict'
import test from 'node:test'
import { applyFarmCommand, applyFieldCommand, createFarm, publicFarm } from '../lib/farm-game.mjs'
import { AvatarDirector, avatarEvent, avatarItems, avatarLook, avatarNavigation, avatarRoute, defaultAvatar } from '../lib/farm-avatar.mjs'
import { createAvatarModel } from '../lib/farm-avatar-model.js'
import { tileKey } from '../lib/farm-layout.mjs'

const at = 1760000000000
const run = (farm, type, args = {}) => applyFarmCommand(farm, { type, ...args }, at)
const start = () => createFarm('avatarfarmer', at)
const event = (farm, id = 'work-test', type = 'plant') => avatarEvent(farm, { type, crop: 'wheat', requestId: id }, farm.objects.filter(o => o.kind === 'plot').map(o => o.id))

test('old saves get free appearance choices without losing their farm state', () => {
  const farm = start(); delete farm.avatar
  const original = structuredClone(farm)
  const styled = run(farm, 'styleAvatar', { part: 'skin', color: '#754b36' })
  assert.equal(styled.avatar.skin, '#754b36')
  assert.deepEqual(styled.objects, farm.objects)
  assert.equal(styled.coins, farm.coins)
  assert.deepEqual(farm, original)
  assert.equal(avatarLook(farm.avatar).equipment.hat, 'straw')
  assert.equal(run(farm, 'equipAvatar', { item: 'bob' }).avatar.equipment.hair, 'bob')
  assert.equal(run(farm, 'equipAvatar', { item: 'glasses' }).avatar.equipment.accessory, 'glasses')
})

test('cosmetics use server prices, reserve coins immediately and replay purchases only once', () => {
  const farm = { ...start(), coins: 500 }
  const command = { type: 'buyAvatar', item: 'apron', price: 0, requestId: `${at}_avatar-buy` }
  const preview = applyFieldCommand(farm, command, at, true)
  const saved = applyFieldCommand(farm, command, at)
  assert.equal(preview.coins, 500 - avatarItems.apron.price)
  assert.equal(saved.coins, preview.coins)
  assert.equal(saved.avatar.equipment.outfit, 'apron')
  assert.ok(saved.avatar.owned.includes('apron'))
  assert.equal(applyFieldCommand(saved, command, at + 1000), saved)
  assert.throws(() => run(saved, 'buyAvatar', { item: 'apron' }), /이미/)
  assert.throws(() => run({ ...farm, coins: 0 }, 'buyAvatar', { item: 'apron' }), /코인/)
  assert.equal(farm.coins, 500)
})

test('unowned and malformed clothing requests cannot bypass validation', () => {
  const farm = start()
  assert.throws(() => run(farm, 'equipAvatar', { item: 'ponytail' }), /구매/)
  for (const item of ['__proto__', 'missing', ['apron']]) assert.throws(() => run(farm, 'buyAvatar', { item }), /아이템/)
  assert.throws(() => run(farm, 'styleAvatar', { part: '__proto__', color: '#ffffff' }), /색/)
  assert.throws(() => run(farm, 'styleAvatar', { part: 'skin', color: '<script>' }), /색/)
})

test('visitor appearance contains no owned-item inventory or coin balance', () => {
  const farm = run({ ...start(), coins: 500 }, 'buyAvatar', { item: 'backpack' })
  const view = publicFarm(farm, at)
  assert.equal(view.avatar.equipment.accessory, 'backpack')
  assert.equal(view.avatar.owned, undefined)
  assert.equal(view.coins, undefined)
})

test('paths stay on open owned ground and end beside the selected field', () => {
  const farm = start()
  const target = farm.objects.filter(o => o.kind === 'plot').at(-1)
  const route = avatarRoute(farm, { x: 13, z: 18 }, target)
  const open = new Set(avatarNavigation(farm).map(cell => tileKey(cell.x, cell.z)))
  assert.ok(route && route.path.length)
  for (const cell of route.path) assert.ok(open.has(tileKey(cell.x, cell.z)))
  const end = route.path.at(-1)
  assert.equal(Math.abs(end.x - target.x) + Math.abs(end.z - target.z), 1)
  assert.equal(route.fade, false)
})

test('an enclosed destination uses a safe transition rather than endless pathfinding', () => {
  const farm = start()
  const target = { id: 'target', kind: 'plot', x: 21, z: 18, level: 1 }
  farm.objects = [target, ...Array.from({ length: 12 }, (_, index) => ({ id: 'fence-' + index, kind: 'fence', x: 18, z: 12 + index, level: 1 }))]
  const route = avatarRoute(farm, { x: 14, z: 18 }, target)
  assert.equal(route.fade, true)
  assert.ok(route.path.at(-1).x > 18)
  assert.equal(avatarRoute({ ...farm, parcels: [] }, { x: 14, z: 18 }, target), null)
})

test('a long burst keeps a single latest event and begins within the coalescing window', () => {
  const farm = start(), director = new AvatarDirector()
  director.sync(farm)
  for (let index = 0; index < 20; index++) {
    director.offer(event(farm, 'click-' + index), index * 20)
    director.tick(farm, index * 20)
  }
  assert.ok(director.active)
  assert.equal(director.pending.event.requestId, 'click-19')
  director.tick(farm, 800)
  assert.equal(director.active.event.requestId, 'click-19')
})

test('batch planting chooses the last field and harvest chooses the nearest one', () => {
  const farm = start(), director = new AvatarDirector()
  director.sync(farm)
  const plots = farm.objects.filter(o => o.kind === 'plot')
  director.position = { x: plots[0].x - 1, z: plots[0].z }
  assert.equal(director.target(farm, event(farm)).id, plots.at(-1).id)
  assert.equal(director.target(farm, event(farm, 'collect', 'collect')).id, plots[0].id)
  assert.match(event(farm).text, /6칸/)
})

test('work beats inspection, action has a short minimum, and failed requests cancel only themselves', () => {
  const farm = start(), director = new AvatarDirector()
  director.sync(farm)
  director.offer(event(farm, 'first'), 0)
  director.tick(farm, 300, false)
  assert.equal(director.phase, 'acting')
  director.offer(event(farm, 'inspect', 'inspect'), 310)
  assert.equal(director.pending, null)
  director.offer(event(farm, 'next'), 320)
  director.tick(farm, 650, false)
  assert.equal(director.active.event.requestId, 'first')
  director.tick(farm, 1001, false)
  assert.equal(director.active.event.requestId, 'next')
  director.cancel(['first'])
  assert.equal(director.phase, 'acting')
  director.cancel(['next'])
  assert.equal(director.phase, 'idle')
})

test('moving and storing the target replans safely; a hidden-tab gap drops stale work', () => {
  const farm = start(), director = new AvatarDirector()
  director.sync(farm)
  const work = event(farm)
  director.offer(work, 0); director.tick(farm, 301)
  const target = farm.objects.find(o => o.id === director.active.target.id)
  target.x += 2
  director.sync(farm); director.tick(farm, 601)
  assert.equal(director.active.target.x, target.x)
  for (const object of farm.objects) if (work.ids.includes(object.id)) object.stored = true
  director.sync(farm); director.tick(farm, 901)
  assert.equal(director.phase, 'idle')
  director.offer({ ...work, ids: [farm.objects[0].id], type: 'inspect' }, 1000)
  director.tick(farm, 1300)
  director.tick(farm, 20000)
  assert.equal(director.phase, 'idle')
  assert.equal(director.pending, null)
})

test('every clothing item builds and poses without external assets, then releases its resources', () => {
  for (const [id, item] of Object.entries(avatarItems)) {
    const look = defaultAvatar(); look.equipment[item.slot] = id
    const model = createAvatarModel(look)
    for (const type of ['idle', 'walk', 'plant', 'water', 'collect', 'enqueue', 'pet', 'fish']) model.pose(type, .4)
    const resources = new Set()
    model.root.traverse(object => {
      if (object.isMesh) { resources.add(object.geometry); resources.add(object.material) }
    })
    let released = 0
    resources.forEach(resource => resource.addEventListener('dispose', () => released++))
    model.dispose()
    assert.equal(released, resources.size, id)
  }
})
