import assert from 'node:assert/strict'
import test from 'node:test'
import { applyFarmCommand, applyFieldCommand, createFarm, projectFarmCommands, publicFarm } from '../lib/farm-game.mjs'
import { livestockCapacity, livestockCount, livestockPositions, livestockTypes, productionCount, feedCost } from '../lib/farm-livestock.mjs'
import { buildings } from '../lib/farm-catalog.mjs'
import { avatarEvent } from '../lib/farm-avatar.mjs'

const at = 1760000000000
const run = (farm, type, args = {}, now = at) => applyFarmCommand(farm, { type, ...args }, now)
function setup(kind = 'coop') {
  const farm = run({ ...createFarm('herdfarmer', at), coins: 10000, level: 5, xp: 200, inventory: { carrot: 100, wheat: 100 } }, 'place', { kind, x: 13, z: 20 })
  return { farm, id: farm.objects.at(-1).id }
}
const object = (farm, id) => farm.objects.find(object => object.id === id)
const request = (index, type, args) => ({ ...args, type, requestId: `${at + index}_herd-test` })

test('all livestock buildings start with one animal and two spaces', () => {
  for (const kind of Object.keys(livestockTypes)) {
    const { farm, id } = setup(kind)
    const pen = object(farm, id)
    assert.equal(pen.animals, 1)
    assert.equal(pen.cycleAnimals, 1)
    assert.equal(livestockCapacity(pen), 2)
    assert.equal(pen.readyAt, at + buildings[kind].seconds * 1000)
  }
})

test('upgrades add capacity without adding animals, production or changing timers', () => {
  let { farm, id } = setup()
  const readyAt = object(farm, id).readyAt
  for (let level = 1; level <= 5; level++) {
    const pen = object(farm, id)
    assert.equal(livestockCapacity(pen), level * 2)
    assert.equal(livestockCount(pen), 1)
    assert.equal(productionCount(pen), 1)
    assert.equal(pen.readyAt, readyAt)
    if (level < 5) farm = run(farm, 'upgrade', { id })
  }
  assert.throws(() => run(farm, 'upgrade', { id }), /증축할 수 없는/)
})

test('buying during a cycle or at harvest time participates only in the next cycle', () => {
  for (const kind of Object.keys(livestockTypes)) {
    for (const ready of [false, true]) {
      let { farm, id } = setup(kind)
      const readyAt = object(farm, id).readyAt
      const before = farm.coins
      farm = run(farm, 'addAnimal', { id, price: 0 }, ready ? readyAt : at + 1000)
      assert.equal(farm.coins, before - livestockTypes[kind].price)
      assert.equal(livestockCount(object(farm, id)), 2)
      assert.equal(productionCount(object(farm, id)), 1)
      assert.equal(object(farm, id).readyAt, readyAt)
      farm = run(farm, 'collect', { id }, readyAt)
      assert.equal(farm.inventory[buildings[kind].product], 1)
      assert.equal(productionCount(object(farm, id)), 2)
      farm = run(farm, 'collect', { id }, object(farm, id).readyAt)
      assert.equal(farm.inventory[buildings[kind].product], 3)
      assert.equal(farm.stats.collected, 3)
    }
  }
})

test('rapid add requests honor space, server prices, stock limits and retry receipts', () => {
  const { farm, id } = setup()
  const command = request(0, 'addAnimal', { id })
  const shown = applyFieldCommand(farm, command, at, true)
  const saved = applyFieldCommand(farm, command, at)
  assert.equal(livestockCount(object(shown, id)), 2)
  assert.equal(saved.coins, shown.coins)
  assert.equal(applyFieldCommand(saved, command, at + 1000), saved)
  assert.throws(() => run(saved, 'addAnimal', { id }), /가득/)
  assert.throws(() => run({ ...farm, coins: 0 }, 'addAnimal', { id }), /코인/)
  assert.throws(() => run(farm, 'addAnimal', { id: '1' }), /축사/)
  assert.equal(livestockCount(object(farm, id)), 1)
})

test('a full upgraded pen produces ten per cycle, never the number of empty slots', () => {
  let { farm, id } = setup()
  for (let i = 0; i < 4; i++) farm = run(farm, 'upgrade', { id })
  for (let i = 0; i < 9; i++) farm = run(farm, 'addAnimal', { id })
  assert.equal(livestockCount(object(farm, id)), 10)
  assert.equal(productionCount(object(farm, id)), 1)
  farm = run(farm, 'collect', { id }, object(farm, id).readyAt)
  assert.equal(farm.inventory.egg, 1)
  farm = run(farm, 'collect', { id }, object(farm, id).readyAt)
  assert.equal(farm.inventory.egg, 11)
  assert.throws(() => run(farm, 'addAnimal', { id }), /가득/)
})

test('feed cost covers the whole herd and never creates production for pending animals', () => {
  let { farm, id } = setup()
  farm = run(farm, 'upgrade', { id })
  farm = run(farm, 'addAnimal', { id })
  farm = run(farm, 'addAnimal', { id })
  const pen = object(farm, id)
  const amount = feedCost(pen)
  assert.equal(amount, 2)
  assert.throws(() => run({ ...farm, inventory: { carrot: 1 } }, 'feed', { id }), /2개/)
  const fed = run(farm, 'feed', { id }, at + 1000)
  assert.equal(fed.inventory.carrot, farm.inventory.carrot - 2)
  assert.ok(object(fed, id).readyAt < pen.readyAt)
  assert.equal(productionCount(object(fed, id)), 1)
  assert.throws(() => run(fed, 'feed', { id }, at + 2000), /잠시 뒤/)
})

test('adding, upgrading and adding again can all be queued without a server response', () => {
  const { farm, id } = setup()
  const commands = [request(0, 'addAnimal', { id }), request(1, 'upgrade', { id }), request(2, 'addAnimal', { id }), request(3, 'addAnimal', { id })]
  const shown = projectFarmCommands(farm, commands)
  const saved = commands.reduce((state, command) => applyFieldCommand(state, command, at + 1000), farm)
  assert.equal(livestockCount(object(shown, id)), 4)
  assert.equal(productionCount(object(shown, id)), 1)
  assert.equal(saved.coins, shown.coins)
  assert.deepEqual(object(saved, id), object(shown, id))
  assert.ok(avatarEvent(shown, commands[3], [id]).text.includes('맞이'))
})

test('moving, storing and restoring a herd preserves animals, production and timer', () => {
  let { farm, id } = setup()
  farm = run(farm, 'addAnimal', { id })
  const pen = object(farm, id)
  farm = run(farm, 'store', { id })
  farm = run(farm, 'restore', { id, x: 20, z: 20, rotation: 1 })
  assert.equal(object(farm, id).animals, pen.animals)
  assert.equal(object(farm, id).cycleAnimals, pen.cycleAnimals)
  assert.equal(object(farm, id).readyAt, pen.readyAt)
  assert.equal(publicFarm(farm, at).objects.find(o => o.id === id).animals, 2)
})

test('the visible herd has exactly one automatic position per animal up to ten', () => {
  for (let count = 1; count <= 10; count++) {
    const positions = livestockPositions({ kind: 'barn', level: 5, animals: count })
    assert.equal(positions.length, count)
    assert.equal(new Set(positions.map(([x, z]) => `${x},${z}`)).size, count)
    assert.ok(positions.every(([x, z]) => Math.abs(x) < .5 && z < .5))
  }
})

test('hives and orchards keep their existing production rules', () => {
  assert.equal(productionCount({ kind: 'hive', level: 5 }), 5)
  assert.equal(productionCount({ kind: 'orchard', level: 1 }), 1)
  assert.equal(livestockCapacity({ kind: 'hive', level: 3 }), 0)
})
