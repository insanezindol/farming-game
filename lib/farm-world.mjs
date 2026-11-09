export function makePointerTap() {
  const pointers = new Set()
  let origin
  return {
    down(id, x, y) {
      pointers.add(id)
      origin = pointers.size === 1 ? { id, x, y } : undefined
    },
    move(id, x, y) {
      if (origin?.id === id && Math.hypot(x - origin.x, y - origin.y) > 8) origin = undefined
    },
    up(id, x, y) {
      this.move(id, x, y)
      const tapped = origin?.id === id
      pointers.delete(id)
      origin = undefined
      return tapped
    },
    cancel(id) {
      pointers.delete(id)
      origin = undefined
    },
  }
}

