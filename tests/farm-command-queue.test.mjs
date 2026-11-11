import assert from 'node:assert/strict'
import test from 'node:test'
import { acknowledgeFarmCommand, applyFarmCommand, applyFieldCommand, createFarm, cropIdentity, projectFarmCommands } from '../lib/farm-game.mjs'
import { previewVisitCommand, projectVisitCommands } from '../lib/farm-visit-queue.mjs'

const at = 1760000000000
const request = (index, type, args = {}) => ({ ...args, type, requestId: `${at + index}_queue-test` })
function start() {
  const farm = createFarm('queuefarmer', at)
  farm.inventory = { wheat: 40, flour: 20, egg: 10 }
  farm.objects.push(
    { id: 'mill-test', kind: 'mill', level: 1, x: 0, z: 0 },
    { id: 'bakery-test', kind: 'bakery', level: 1, x: 0, z: 0 },
  )
  return farm
}

test('rapid crafting at two workshops reserves materials before any server response', () => {
  const farm = start()
  const commands = Array.from({ length: 12 }, (_, index) => request(index, 'enqueue', index % 2
    ? { id: 'bakery-test', recipe: 'bread', quantity: 1 }
    : { id: 'mill-test', recipe: 'flour', quantity: 1 }))
  const shown = projectFarmCommands(farm, commands)
  assert.equal(shown.objects.find(object => object.id === 'mill-test').queue.length, 6)
  assert.equal(shown.objects.find(object => object.id === 'bakery-test').queue.length, 6)
  assert.deepEqual(shown.inventory, { wheat: 28, flour: 14, egg: 4 })
  assert.deepEqual(farm.inventory, { wheat: 40, flour: 20, egg: 10 })

  // A response for the first batch must preserve clicks made while it was in flight.
  const confirmed = commands.slice(0, 8).reduce((state, command) => applyFieldCommand(state, command, at + 5000), farm)
  const rebased = projectFarmCommands(confirmed, commands)
  assert.deepEqual(rebased.inventory, shown.inventory)
  assert.equal(rebased.objects.find(object => object.id === 'bakery-test').queue.length, 6)
  const saved = commands.slice(8).reduce((state, command) => applyFieldCommand(state, command, at + 6000), confirmed)
  const retried = commands.reduce((state, command) => applyFieldCommand(state, command, at + 7000), saved)
  assert.deepEqual(retried, saved)
})

test('only actual material and slot limits reject the next crafting click', () => {
  const farm = start()
  const full = projectFarmCommands(farm, [request(0, 'enqueue', { id: 'mill-test', recipe: 'flour', quantity: 8 })])
  assert.throws(() => applyFieldCommand(full, request(1, 'enqueue', { id: 'mill-test', recipe: 'flour', quantity: 1 }), at + 1, true), /가득/)
  assert.doesNotThrow(() => applyFieldCommand(full, request(2, 'enqueue', { id: 'bakery-test', recipe: 'bread', quantity: 1 }), at + 2, true))
  const poor = { ...farm, inventory: { wheat: 2 } }
  const one = projectFarmCommands(poor, [request(0, 'enqueue', { id: 'mill-test', recipe: 'flour', quantity: 1 })])
  assert.throws(() => applyFieldCommand(one, request(1, 'enqueue', { id: 'mill-test', recipe: 'flour', quantity: 1 }), at + 1, true), /재료/)
})

test('crafting, harvest, sale and settings execute in click order and replay once', () => {
  let farm = start()
  const plot = farm.objects.find(object => object.kind === 'plot')
  farm = applyFarmCommand(farm, { type: 'plant', id: plot.id, crop: 'wheat' }, at - 60000)
  const commands = [
    request(0, 'enqueue', { id: 'mill-test', recipe: 'flour', quantity: 1 }),
    request(1, 'collect', { collectTargets: { [plot.id]: cropIdentity(farm.objects.find(object => object.id === plot.id)) } }),
    request(2, 'sell', { item: 'wheat', quantity: 1 }),
    request(3, 'setSettings', { settings: { replant: true } }),
  ]
  const shown = projectFarmCommands(farm, commands)
  const saved = commands.reduce((state, command) => applyFieldCommand(state, command, at + 1000), farm)
  assert.deepEqual(saved.inventory, shown.inventory)
  assert.equal(saved.coins, shown.coins)
  assert.equal(saved.settings.replant, true)
  assert.equal(saved.objects.find(object => object.id === plot.id).crop, undefined)
  assert.deepEqual(projectFarmCommands(saved, commands).inventory, saved.inventory)
})

test('a rejected request stays rejected after a lost response and a later inventory refill', () => {
  let farm = { ...start(), inventory: { wheat: 0 } }
  const command = request(0, 'enqueue', { id: 'mill-test', recipe: 'flour', quantity: 1 })
  let reason
  try { applyFieldCommand(farm, command, at) } catch (error) { reason = error.message }
  assert.ok(reason)
  farm = acknowledgeFarmCommand(farm, command.requestId, at, reason)
  farm.inventory.wheat = 20
  assert.throws(() => applyFieldCommand(farm, command, at + 1000), { message: reason })
  assert.equal(farm.inventory.wheat, 20)
})

test('rebasing drops conflicting requests and still applies independent later clicks', () => {
  const farm = start()
  const commands = [request(0, 'enqueue', { id: 'mill-test', recipe: 'flour', quantity: 1 }), request(1, 'setSettings', { settings: { audio: false } })]
  const changed = { ...farm, inventory: { wheat: 0 } }
  const shown = projectFarmCommands(changed, commands)
  assert.equal(shown.settings.audio, false)
  assert.equal(shown.objects.find(object => object.id === 'mill-test').queue, undefined)
  assert.deepEqual(changed.inventory, { wheat: 0 })
})

test('a structure ID conflict cannot redirect a queued action to another newly created structure', () => {
  const farm = start()
  const command = request(0, 'enqueue', { id: 'mill-test', recipe: 'flour', quantity: 1, nextId: farm.nextId })
  assert.throws(() => applyFieldCommand({ ...farm, nextId: farm.nextId + 1 }, command, at), /시설/)
})

test('invitation projection never generates a client-side secret', () => {
  const farm = start()
  const projected = projectFarmCommands(farm, [request(0, 'share', { enabled: true })])
  assert.equal(projected.share.enabled, true)
  assert.equal(projected.share.code, farm.share.code)
  const saved = applyFieldCommand(farm, request(0, 'share', { enabled: true }), at)
  assert.match(saved.share.code, /^[a-f0-9]{24}$/)
})

test('visitor gifts and contributions reserve stock together without waiting for a response', () => {
  const farm = { ...start(), guestInventory: { wheat: 3 }, orders: [{ id: 'help', items: { wheat: 2 }, shared: {} }] }
  const tasks = [
    { command: { type: 'gift', item: 'wheat' }, at },
    { command: { type: 'assist', id: 'help', item: 'wheat' }, at: at + 1 },
    { command: { type: 'assist', id: 'help', item: 'wheat' }, at: at + 2 },
  ]
  const shown = projectVisitCommands(farm, tasks)
  assert.equal(shown.guestInventory.wheat, 0)
  assert.equal(shown.orders[0].shared.wheat, 2)
  assert.equal(farm.guestInventory.wheat, 3)
  assert.throws(() => previewVisitCommand(shown, tasks[0].command, at + 3), /부족/)
  const confirmed = previewVisitCommand(farm, tasks[0].command, at)
  assert.deepEqual(projectVisitCommands(confirmed, tasks.slice(1)), shown)
})

test('worker replant identities survive the delay between optimistic view and saving', () => {
  const farm = start()
  const plot = farm.objects.find(object => object.kind === 'plot')
  farm.objects.push({ id: 'worker-test', kind: 'worker', x: plot.x, z: plot.z, level: 1 })
  farm.settings.replant = true
  plot.crop = { kind: 'wheat', plantedAt: at - 60000, readyAt: at - 1000 }
  const command = request(0, 'view')
  const shown = applyFieldCommand(farm, command, at, true)
  const saved = applyFieldCommand(farm, command, at + 5000)
  assert.equal(cropIdentity(shown.objects.find(object => object.id === plot.id)), cropIdentity(saved.objects.find(object => object.id === plot.id)))
})

test('bulk collection cannot harvest a different crop after another screen replants it', () => {
  const farm = start()
  const plot = farm.objects.find(object => object.kind === 'plot')
  plot.crop = { kind: 'wheat', plantedAt: at - 60000, readyAt: at - 1000 }
  const command = request(0, 'collect', { collectTargets: { [plot.id]: cropIdentity(plot) } })
  const changed = structuredClone(farm)
  changed.objects.find(object => object.id === plot.id).crop.plantedAt++
  assert.throws(() => applyFieldCommand(changed, command, at), /작물이 바뀌/)
})

test('evicted receipts cannot turn old retries into new actions', () => {
  let farm = start()
  const first = request(0, 'setSettings', { settings: { audio: false } })
  farm = applyFieldCommand(farm, first, at)
  for (let index = 1; index <= 512; index++) farm = acknowledgeFarmCommand(farm, request(index, 'view').requestId, at + 1000)
  assert.equal(farm.fieldReceipts.length, 512)
  assert.throws(() => applyFieldCommand(farm, first, at + 2000), /저장 시간이 지났/)
})
