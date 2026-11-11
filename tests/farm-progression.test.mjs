import assert from 'node:assert/strict'
import test from 'node:test'
import { applyFarmCommand, applyFieldCommand, createFarm, levelProgress } from '../lib/farm-game.mjs'

const at = 1760000000000
const startXP = level => 10 * (level - 1) + 15 * (level - 1) * level / 2
const sell = farm => applyFarmCommand({ ...farm, inventory: { wheat: 1 } }, { type: 'sell' }, at)

test('level boundaries and progress remain exact through level one million', () => {
  for (const level of [2, 3, 15, 1000, 10000, 1000000]) {
    for (const offset of [-1, 0, 1]) {
      const total = startXP(level) + offset
      const farm = sell({ ...createFarm('leveltester', at), level: level - 1, xp: total - 2 })
      const expected = offset < 0 ? level - 1 : level
      assert.equal(farm.level, expected, `Lv.${level}, offset ${offset}`)
      assert.equal(farm.xp, total)
      assert.deepEqual(levelProgress(farm), { xp: total - startXP(expected), need: 10 + 15 * expected })
      assert.deepEqual(farm.levelGift, offset < 0 ? undefined : { level, coins: level * 10 })
    }
  }
})

test('early-game levels and multi-level gifts match the original progression', () => {
  let threshold = 0
  let reward = 0
  for (let level = 2; level <= 100; level++) {
    threshold += 10 + 15 * (level - 1)
    reward += level * 10
    const farm = sell({ ...createFarm('leveltester', at), xp: threshold - 2 })
    assert.equal(farm.level, level)
    assert.deepEqual(farm.levelGift, { level, coins: reward })
  }
})

test('a million-level jump grants the entire reward and does not impose a cap', () => {
  const farm = sell({ ...createFarm('leveltester', at), xp: startXP(1000000) - 2 })
  assert.deepEqual(farm.levelGift, { level: 1000000, coins: 5000004999990 })
  const next = sell({ ...farm, xp: startXP(1000001) - 2 })
  assert.deepEqual(next.levelGift, { level: 1000001, coins: 10000010 })
})

test('retired favorite requests are harmless and still acknowledged for old save queues', () => {
  const farm = createFarm('leveltester', at)
  assert.equal(Object.hasOwn(farm, 'favorites'), false)
  const old = { ...farm, favorites: ['carrot'], undo: { added: ['old'], cost: 1 } }
  const command = { type: 'favorite', crop: 'wheat', requestId: `${at}_old-favorite` }
  const saved = applyFieldCommand(old, command, at)
  assert.deepEqual(saved.favorites, ['carrot'])
  assert.deepEqual(saved.undo, old.undo)
  assert.ok(saved.fieldReceipts.includes(command.requestId))
  assert.equal(applyFieldCommand(saved, command, at + 1000), saved)
  assert.doesNotThrow(() => applyFieldCommand(farm, command, at))
})
