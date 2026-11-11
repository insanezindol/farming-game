import { crops, recipes } from './farm-catalog.mjs'
import { MAP_SIZE, footprint, inMap, parcelAt, terrainAt, tileKey } from './farm-layout.mjs'

export const avatarColors = {
  skin: ['#f6d0ae', '#e8b387', '#cb9067', '#a86e49', '#754b36'],
  hairColor: ['#493227', '#211f25', '#a76736', '#e4bd70', '#b6bdc6', '#d992a4'],
}
export const avatarSlots = { hair: '머리', outfit: '옷', hat: '모자', accessory: '장신구' }
export const avatarItems = {
  short: { slot: 'hair', name: '짧은 머리', price: 0 },
  bob: { slot: 'hair', name: '단발머리', price: 0 },
  ponytail: { slot: 'hair', name: '묶은 머리', price: 100 },
  overalls: { slot: 'outfit', name: '하늘색 멜빵바지', price: 0, color: '#78a9cc', shirt: '#fff1d1' },
  green: { slot: 'outfit', name: '초록 멜빵바지', price: 0, color: '#7b9f72', shirt: '#fff1d1' },
  apron: { slot: 'outfit', name: '딸기 앞치마', price: 180, color: '#e68c91', shirt: '#fff6e1' },
  raincoat: { slot: 'outfit', name: '노란 비옷', price: 250, color: '#efc658', shirt: '#efc658' },
  nohat: { slot: 'hat', name: '모자 벗기', price: 0 },
  straw: { slot: 'hat', name: '밀짚모자', price: 0 },
  beret: { slot: 'hat', name: '코랄 베레모', price: 150 },
  cap: { slot: 'hat', name: '산책 모자', price: 200 },
  none: { slot: 'accessory', name: '장신구 빼기', price: 0 },
  glasses: { slot: 'accessory', name: '동그란 안경', price: 0 },
  scarf: { slot: 'accessory', name: '빨간 스카프', price: 160 },
  backpack: { slot: 'accessory', name: '소풍 가방', price: 220 },
}
export const defaultAvatar = () => ({ skin: avatarColors.skin[0], hairColor: avatarColors.hairColor[0],
  equipment: { hair: 'short', outfit: 'overalls', hat: 'straw', accessory: 'none' },
  owned: Object.keys(avatarItems).filter(id => avatarItems[id].price === 0) })

export function avatarLook(avatar) {
  const defaults = defaultAvatar()
  return { skin: avatarColors.skin.includes(avatar?.skin) ? avatar.skin : defaults.skin,
    hairColor: avatarColors.hairColor.includes(avatar?.hairColor) ? avatar.hairColor : defaults.hairColor,
    equipment: Object.fromEntries(Object.keys(avatarSlots).map(slot => {
      const id = avatar?.equipment?.[slot]
      return [slot, Object.hasOwn(avatarItems, id) && avatarItems[id].slot === slot ? id : defaults.equipment[slot]]
    })) }
}

export function avatarEvent(farm, command, ids = []) {
  const type = command.type
  const words = {
    plant: `${crops[command.crop]?.name ?? '작물'}을 심고 있어요!`, water: '쑥쑥 자라라!', collect: '수확물을 모았어요!',
    enqueue: `${recipes[command.recipe]?.name ?? '제작'} 시작!`, sell: '상품을 팔았어요!', order: '주문한 물건을 보냈어요!',
    pet: '오늘도 반가워!', feed: '간식 먹자!', fertilize: '영양을 듬뿍!', fish: '물고기를 낚았어요!',
    forage: '선물을 찾았어요!', clear: '깨끗하게 정리해요!', upgrade: '더 멋진 농장으로!', inspect: '어디 한번 볼까요?',
  }
  if (!words[type]) return null
  let targets = ids.length ? ids : command.id ? [command.id] : []
  if (type === 'sell' || type === 'order') targets = farm.objects.filter(o => !o.stored && o.kind === (type === 'sell' ? 'market' : 'truck')).map(o => o.id)
  const tile = Number.isInteger(command.x) && Number.isInteger(command.z) ? { x: command.x, z: command.z } : null
  if (!targets.length && !tile) return null
  const batchText = { collect: `${ids.length}곳에서 수확물을 모았어요!`, plant: `${crops[command.crop]?.name ?? '작물'} ${ids.length}칸을 심었어요!`, water: `밭 ${ids.length}칸에 물을 줬어요!` }
  return { type, ids: targets, tile, requestId: command.requestId, text: ids.length > 1 ? batchText[type] ?? words[type] : words[type] }
}

const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z)
export function avatarNavigation(farm) {
  const owned = new Set(farm.parcels)
  const cleared = new Set(farm.cleared ?? [])
  const blocked = new Set()
  const bridges = new Set()
  for (const object of farm.objects) {
    if (object.stored) continue
    const cells = footprint(object.kind, object.x, object.z, object.rotation)
    if (object.kind === 'bridge') cells.forEach(cell => bridges.add(tileKey(cell.x, cell.z)))
    else if (!['path', 'stonepath'].includes(object.kind)) cells.forEach(cell => blocked.add(tileKey(cell.x, cell.z)))
  }
  const cells = []
  for (let z = 0; z < MAP_SIZE; z++) for (let x = 0; x < MAP_SIZE; x++) {
    const key = tileKey(x, z)
    const obstacle = terrainAt(x, z).obstacle
    if (owned.has(parcelAt(x, z)) && !blocked.has(key) && (!obstacle || cleared.has(key) || bridges.has(key))) cells.push({ x, z })
  }
  return cells
}

export function avatarRoute(farm, from, target) {
  const cells = avatarNavigation(farm)
  if (!cells.length) return null
  const occupied = target.kind ? footprint(target.kind, target.x, target.z, target.rotation) : [target]
  if (!occupied.length) return null
  const toTarget = cell => Math.min(...occupied.map(tile => distance(cell, tile)))
  const nearest = (list, score) => list.reduce((best, cell) => !best || score(cell) < score(best) ? cell : best, null)
  const start = nearest(cells, cell => distance(cell, from))
  const nearestDistance = Math.min(...cells.map(toTarget))
  const destinations = new Set(cells.filter(cell => toTarget(cell) === nearestDistance).map(cell => tileKey(cell.x, cell.z)))
  const walkable = new Set(cells.map(cell => tileKey(cell.x, cell.z)))
  const queue = [start]
  const parents = new Map([[tileKey(start.x, start.z), null]])
  for (let index = 0; index < queue.length; index++) {
    const cell = queue[index]
    const key = tileKey(cell.x, cell.z)
    if (destinations.has(key)) {
      const path = []
      for (let step = cell; step; step = parents.get(tileKey(step.x, step.z))) path.push(step)
      return { path: path.reverse(), fade: distance(from, start) > .8 }
    }
    for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const next = { x: cell.x + dx, z: cell.z + dz }
      const nextKey = tileKey(next.x, next.z)
      if (inMap(next.x, next.z) && walkable.has(nextKey) && !parents.has(nextKey)) {
        parents.set(nextKey, cell)
        queue.push(next)
      }
    }
  }
  return { path: [nearest(cells.filter(cell => destinations.has(tileKey(cell.x, cell.z))), cell => distance(cell, from))], fade: true }
}

// A single replaceable next event keeps visual work bounded even during long click bursts.
export class AvatarDirector {
  constructor() { this.position = null; this.active = null; this.pending = null; this.phase = 'idle'; this.lastTick = 0 }
  offer(event, now) {
    const working = this.active && this.active.event.type !== 'inspect' || this.pending && this.pending.event.type !== 'inspect'
    if (!event || event.type === 'inspect' && working) return
    this.pending = { event, due: this.pending?.due ?? now + 300 }
  }
  cancel(ids) {
    if (ids.includes(this.pending?.event.requestId)) this.pending = null
    if (ids.includes(this.active?.event.requestId)) { this.active = null; this.phase = 'idle' }
  }
  target(farm, event) {
    const byId = new Map(farm.objects.filter(object => !object.stored).map(object => [object.id, object]))
    const objects = event.ids.map(id => byId.get(id)).filter(Boolean)
    if (event.type === 'plant') return objects.at(-1)
    return objects.reduce((best, object) => !best || distance(object, this.position) < distance(best, this.position) ? object : best, null) ?? event.tile
  }
  begin(farm, event, now, motion) {
    const target = this.target(farm, event)
    if (!target) return
    const route = avatarRoute(farm, this.position, target)
    if (!route) return
    this.active = { event, target: { ...target }, path: route.path, speed: Math.max(3, route.path.length / 4), started: now }
    this.phase = route.fade ? 'fade' : 'moving'
    if (!motion || route.fade) this.position = { ...route.path.at(-1) }
    if (!motion) this.arrive(now)
  }
  arrive(now) { this.phase = 'acting'; this.actionAt = now; this.actionUntil = now + 1300 }
  sync(farm) {
    const key = JSON.stringify([farm.parcels, farm.cleared, farm.objects.map(o => [o.id, o.kind, o.x, o.z, o.rotation, o.stored])])
    if (key === this.layout) return
    this.layout = key
    const home = farm.objects.find(o => o.kind === 'house' && !o.stored) ?? { x: 16, z: 16 }
    const route = avatarRoute(farm, this.position ?? home, this.position ?? home)
    this.position = route ? { ...route.path[0] } : null
    if (this.active) {
      const event = this.active.event
      this.active = null; this.phase = 'idle'
      this.pending ??= { event, due: 0 }
    }
  }
  tick(farm, now, motion = true) {
    if (!this.position) return
    if (this.lastTick && now - this.lastTick > 10000) { this.active = null; this.pending = null; this.phase = 'idle' }
    const delta = Math.min(.1, Math.max(0, (now - (this.lastTick || now)) / 1000))
    this.lastTick = now
    if (this.pending && now >= this.pending.due && (this.phase !== 'acting' || now - this.actionAt >= 700)) {
      const event = this.pending.event
      this.pending = null
      this.begin(farm, event, now, motion)
    }
    if (!this.active) return
    const target = this.active.target
    if (!motion && this.phase !== 'acting') { this.position = { ...this.active.path.at(-1) }; this.arrive(now) }
    if (this.phase === 'fade' && now - this.active.started >= 350) this.arrive(now)
    if (this.phase === 'moving') {
      let remaining = delta * this.active.speed
      while (remaining > 0 && this.active.path.length) {
        const next = this.active.path[0]
        const length = Math.hypot(next.x - this.position.x, next.z - this.position.z)
        this.facing = Math.atan2(next.x - this.position.x, next.z - this.position.z)
        if (length <= remaining) { this.position = { ...next }; this.active.path.shift(); remaining -= length }
        else { this.position.x += (next.x - this.position.x) / length * remaining; this.position.z += (next.z - this.position.z) / length * remaining; remaining = 0 }
      }
      if (!this.active.path.length) this.arrive(now)
    }
    if (this.phase === 'acting') {
      this.facing = Math.atan2(target.x - this.position.x, target.z - this.position.z)
      if (now >= this.actionUntil) { this.active = null; this.phase = 'idle' }
    }
  }
}
