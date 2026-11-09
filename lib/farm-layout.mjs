import { buildings } from './farm-catalog.mjs'

export const MAP_SIZE = 48
export const PARCEL_SIZE = 12
export const START_PARCEL = '1,1'
export const tileKey = (x, z) => x + ',' + z

export function parcelAt(x, z) {
  return tileKey(Math.floor(x / PARCEL_SIZE), Math.floor(z / PARCEL_SIZE))
}

export function inMap(x, z) {
  return Number.isInteger(x) && Number.isInteger(z) && x >= 0 && x < MAP_SIZE && z >= 0 && z < MAP_SIZE
}

export function terrainAt(x, z) {
  const px = Math.floor(x / PARCEL_SIZE)
  const pz = Math.floor(z / PARCEL_SIZE)
  const biome = px === 3 || (pz === 3 && px > 0) ? 'lakeside' : px === 0 || pz === 0 ? 'woods' : 'meadow'
  const seed = ((x * 41 + z * 61 + x * z * 13) % 113 + 113) % 113
  const localX = x % PARCEL_SIZE
  const localZ = z % PARCEL_SIZE
  const pond = biome === 'lakeside' && (localX - 6) ** 2 + (localZ - 6) ** 2 < 8
  const obstacle = pond ? 'water' : biome === 'woods' && seed < 14 ? 'tree'
    : (biome === 'woods' || biome === 'lakeside') && seed > 102 ? 'rock' : null
  const forage = biome === 'woods' && seed < 15 ? (obstacle === 'tree' ? 'wood' : 'mushroom')
    : !obstacle && seed % 17 === 0 ? 'wildberry'
    : !obstacle && biome === 'woods' && seed % 11 === 0 ? 'mushroom' : null
  return { biome, obstacle, forage }
}

export function footprint(kind, x, z, rotation = 0) {
  const size = Object.hasOwn(buildings, kind) && buildings[kind].size
  if (!size) return []
  const [width, depth] = rotation % 2 ? [size[1], size[0]] : size
  return Array.from({ length: width * depth }, (_, index) => ({
    x: x + index % width,
    z: z + Math.floor(index / width),
  }))
}

export function canPlace(state, kind, x, z, rotation = 0, ignoredIds = []) {
  if (!inMap(x, z) || !Number.isInteger(rotation) || rotation < 0 || rotation > 3) return false
  const cells = footprint(kind, x, z, rotation)
  if (!cells.length) return false
  const cleared = new Set(state.cleared ?? [])
  const parcels = new Set(state.parcels)
  const occupied = new Set(state.objects
    .filter(object => !object.stored && !ignoredIds.includes(object.id))
    .flatMap(object => footprint(object.kind, object.x, object.z, object.rotation))
    .map(cell => tileKey(cell.x, cell.z)))

  return cells.every(cell => {
    if (!inMap(cell.x, cell.z) || !parcels.has(parcelAt(cell.x, cell.z))) return false
    const key = tileKey(cell.x, cell.z)
    const { obstacle } = terrainAt(cell.x, cell.z)
    return !occupied.has(key) && (!obstacle || cleared.has(key) || (kind === 'bridge' && obstacle === 'water'))
  })
}

export function parcelPrice(state) {
  return 40 + Math.max(0, state.parcels.length - 1) * 22
}

export function canExpand(state, parcel) {
  if (typeof parcel !== 'string' || !/^[0-3],[0-3]$/.test(parcel) || state.parcels.includes(parcel)) return false
  const [x, z] = parcel.split(',').map(Number)
  return state.parcels.some(key => {
    const [px, pz] = key.split(',').map(Number)
    return Math.abs(x - px) + Math.abs(z - pz) === 1
  })
}
