import assert from 'node:assert/strict'
import test from 'node:test'
import { applyFarmCommand, createFarm, levelProgress, retimeFarm } from '../lib/farm-game.mjs'
import { buildings, crops } from '../lib/farm-catalog.mjs'

const at = 1760000000000
const run = (farm, type, args = {}, now = at) => applyFarmCommand(farm, { type, ...args }, now)

test('every crop and animal finishes within 15 minutes', () => {
  for (const crop of Object.values(crops)) assert.ok(crop.seconds <= 900, crop.name)
  for (const item of Object.values(buildings)) if (item.seconds) assert.ok(item.seconds <= 900, item.name)
})

test('an old save is pulled forward to the new timers once without changing crop identity', () => {
  const old = createFarm('testfarmer', at)
  delete old.timing
  const plot = old.objects.find(object => object.kind === 'plot')
  plot.crop = { kind: 'berry', plantedAt: at, readyAt: at + 7200000 }
  old.objects.push({ id: '99', kind: 'coop', x: 13, z: 20, rotation: 0, level: 1, readyAt: at + 1800000 })
  const now = at + 60000
  const farm = retimeFarm(old, now)
  const bed = farm.objects.find(object => object.id === plot.id)
  assert.equal(bed.crop.readyAt, at + crops.berry.seconds * 1000)
  assert.equal(bed.crop.plantedAt, at)
  assert.equal(farm.objects.find(object => object.id === '99').readyAt, now + buildings.coop.seconds * 1000)
  assert.equal(retimeFarm(farm, now + 1), farm)
  assert.equal(retimeFarm(createFarm('testfarmer', at), at).timing, 2)
})

test('the level curve gets steeper but never lowers an existing level', () => {
  const sold = run({ ...createFarm('testfarmer', at), xp: 24, inventory: { wheat: 1 } }, 'sell')
  assert.equal(sold.level, 2)
  assert.deepEqual(levelProgress(sold), { xp: 1, need: 40 })
  // 예전 곡선(25마다 1레벨)으로 Lv.17이던 농장은 XP가 모자라도 Lv.17을 지킨다
  const veteran = run({ ...createFarm('testfarmer', at), level: 17, xp: 400, inventory: { wheat: 1 } }, 'sell')
  assert.equal(veteran.level, 17)
  assert.equal(levelProgress(veteran).xp, 0)
})

test('twenty minutes of steady wheat play lands around level 5', () => {
  let farm = createFarm('testfarmer', at)
  const attempt = (type, args, now) => { try { farm = run(farm, type, args, now) } catch {} }
  // 1분마다 들러 거두고, 다시 심고, 주문을 내고, 남은 것을 판다
  for (let second = 0; second <= 1200; second += 60) {
    const now = at + second * 1000
    attempt('collect', { kind: 'plot' }, now)
    const empty = farm.objects.filter(object => object.kind === 'plot' && !object.crop).map(object => object.id)
    if (empty.length) attempt('plant', { ids: empty, crop: farm.level >= 2 && second % 120 === 0 ? 'carrot' : 'wheat' }, now)
    for (const order of farm.orders) attempt('order', { id: order.id }, now)
    attempt('sell', {}, now)
  }
  assert.ok(farm.level >= 4 && farm.level <= 6, 'Lv.' + farm.level)
})
