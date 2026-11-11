import { Vector3 } from 'three'
import { AvatarDirector, avatarEvent, avatarLook } from './farm-avatar.mjs'
import { createAvatarModel } from './farm-avatar-model.js'
import { MAP_SIZE } from './farm-layout.mjs'

export function createFarmAvatar(world, root, camera, redraw) {
  const director = new AvatarDirector()
  const bubble = document.createElement('div')
  bubble.className = 'farm-avatar-bubble'
  bubble.setAttribute('role', 'status')
  bubble.setAttribute('aria-live', 'polite')
  bubble.hidden = true
  root.append(bubble)
  let farm, model, lookKey, preview, hidden = false, wake, disposed = false
  const point = new Vector3()
  function appearance() {
    const look = avatarLook(preview ?? farm?.avatar)
    const key = JSON.stringify(look)
    if (key === lookKey) return
    lookKey = key
    model?.dispose()
    model = createAvatarModel(look)
    world.add(model.root)
  }
  function sync(next, invisible = false) {
    farm = next
    hidden = invisible
    director.sync(farm)
    appearance()
  }
  function step(now, motion) {
    if (!farm || !model || disposed) return false
    if (document.hidden || hidden) { model.root.visible = !hidden; bubble.hidden = true; return false }
    const moving = director.phase !== 'idle'
    director.tick(farm, now, motion)
    const pos = director.position
    model.root.visible = Boolean(pos)
    if (!pos) { bubble.hidden = true; return false }
    model.root.position.set(pos.x + .5 - MAP_SIZE / 2, 0, pos.z + .5 - MAP_SIZE / 2)
    model.root.rotation.y = director.facing ?? .5
    model.root.scale.setScalar(director.phase === 'fade' ? Math.max(.01, Math.min(1, (now - director.active.started) / 350)) : 1)
    const type = director.phase === 'moving' ? 'walk' : director.phase === 'acting' ? director.active.event.type : 'idle'
    model.pose(type, now / 1000, motion)
    const message = director.active ? director.phase === 'acting' ? director.active.event.text : '작업하러 가는 중…' : ''
    if (bubble.textContent !== message) bubble.textContent = message
    point.copy(model.root.position); point.y += 1.9; point.project(camera)
    bubble.style.left = (point.x * 50 + 50) + '%'
    bubble.style.top = (50 - point.y * 50) + '%'
    bubble.hidden = !message || Math.abs(point.x) > .9 || Math.abs(point.y) > .9 || point.z > 1
    if (!motion && (director.active || director.pending) && !wake) {
      wake = setTimeout(() => { wake = null; if (!disposed) redraw() }, 300)
    }
    return moving || director.phase !== 'idle'
  }
  return {
    sync, step,
    busy: () => Boolean(director.active || director.pending),
    react(next, command, ids) {
      sync(next, hidden)
      director.offer(avatarEvent(next, command, ids), performance.now())
      redraw()
    },
    cancel(ids) { director.cancel(ids); redraw() },
    preview(look) { preview = look; appearance(); redraw() },
    dispose() { disposed = true; clearTimeout(wake); model?.dispose(); bubble.remove() },
  }
}
