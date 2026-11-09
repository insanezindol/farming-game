import {
  ACESFilmicToneMapping, AnimationMixer, Box3, BufferAttribute, BufferGeometry, CircleGeometry, Color, DirectionalLight, Fog,
  Group, HemisphereLight, InstancedMesh, LineBasicMaterial, LineSegments,
  Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, MOUSE, Object3D, OrthographicCamera, PCFShadowMap, Plane,
  PlaneGeometry, Points, PointsMaterial, Raycaster, Scene, Spherical, TOUCH, Vector2, Vector3,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import { buildings, crops } from './farm-catalog.mjs'
import { MAP_SIZE, PARCEL_SIZE, footprint, parcelAt, terrainAt, tileKey } from './farm-layout.mjs'
import { makePointerTap } from './farm-world.mjs'
import assetSources from '../public/models/sources.json' with { type: 'json' }

const half = MAP_SIZE / 2
const turn = Math.PI / 2
const defaultView = { x: 18, z: 18, zoom: 1, angle: .66, pitch: .96 }
const palette = {
  'farmhouse-charcoal-roof-and-glass': '#738c99',
  'farmhouse-warm-timber-trim': '#b87a50',
  'produce-stall-teal': '#bd7760',
  'produce-stall-galv': '#bd7760',
  'produce-stall-iron': '#ac634c',
  'chicken-coop-galvanized-roof': '#b26b4d',
  'field-soil-mat': '#9c603f',
  'field-berm-mat': '#ca8956',
  'dirt-path-compacted-earth': '#d9ad74',
  'dirt-path-loose-earth': '#cb9456',
  'dirt-path-grass-edge': '#8dae61',
  'pond-teal': '#61a8ac',
}
const terrainColors = {
  spring: { meadow: '#9ab66b', woods: '#789d5e', lakeside: '#a9b982' },
  summer: { meadow: '#95b166', woods: '#719552', lakeside: '#a7b982' },
  autumn: { meadow: '#baa36b', woods: '#978d57', lakeside: '#c2b37c' },
  winter: { meadow: '#cad3c0', woods: '#a9b9ab', lakeside: '#bfcebd' },
}
const flatModels = new Set(['soil', 'path', 'stonepath', 'pond', 'fence'])
const plantOffsets = [[-.23, -.23], [.24, -.17], [-.08, .24]]
const animalOffsets = [[.22, .36], [-.21, .35], [0, .38], [.33, .08], [-.32, .08]]
const animalHeights = { chicken: .5, cow: .95, duck: .43, pig: .63, sheep: .72 }
const groundPlane = new Plane(new Vector3(0, 1, 0), 0)
const clamp = (value, min, max) => Math.max(min, Math.min(value, max))
const worldAt = tile => tile + .5 - half
const noise = (x, z) => {
  const seed = Math.sin(x * 127.1 + z * 311.7) * 43758.5453
  return seed - Math.floor(seed)
}

export function paintSegment(from, to) {
  const width = Math.abs(to.x - from.x)
  const depth = Math.abs(to.z - from.z)
  const dx = Math.sign(to.x - from.x)
  const dz = Math.sign(to.z - from.z)
  const cells = []
  let x = 0
  let z = 0
  while (x < width || z < depth) {
    if ((1 + 2 * x) * depth <= (1 + 2 * z) * width) x++
    else z++
    cells.push({ x: from.x + x * dx, z: from.z + z * dz })
  }
  return cells
}

function disposeModels(models) {
  const resources = new Set()
  for (const model of models) {
    model.traverse(object => {
      if (!object.isMesh) return
      resources.add(object.geometry)
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials) {
        resources.add(material)
        for (const value of Object.values(material)) if (value?.isTexture) resources.add(value)
      }
    })
  }
  resources.forEach(resource => resource.dispose())
}

export async function createFarmScene(root, onPick, signal) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  const results = await Promise.allSettled(Object.entries(assetSources.models).map(async ([key, { file }]) => {
    const { scene, animations } = await loader.loadAsync('/models/' + file)
    return [key, { scene, animations }]
  }))
  const assets = Object.fromEntries(results.filter(result => result.status === 'fulfilled').map(result => result.value))
  const loaded = Object.fromEntries(Object.entries(assets).map(([key, { scene }]) => [key, scene]))
  const failed = results.find(result => result.status === 'rejected')
  if (signal.aborted || failed) {
    disposeModels(Object.values(loaded))
    if (failed && !signal.aborted) throw failed.reason
    return null
  }

  let renderer
  try {
    renderer = new WebGLRenderer({ antialias: true, powerPreference: 'default' })
  } catch (error) {
    disposeModels(Object.values(loaded))
    throw error
  }
  const canvas = renderer.domElement
  canvas.setAttribute('aria-hidden', 'true')
  root.prepend(canvas)
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 1
  renderer.shadowMap.type = PCFShadowMap
  renderer.shadowMap.autoUpdate = false

  const world = new Scene()
  world.background = new Color('#93ad71')
  world.fog = new Fog('#a6ba86', 59, 107)
  const sky = new HemisphereLight('#fff8df', '#849668', 2.25)
  const sun = new DirectionalLight('#fff1d6', 2.4)
  sun.position.set(-26, 46, 17)
  sun.castShadow = true
  sun.shadow.mapSize.set(1536, 1536)
  Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 104 })
  sun.shadow.normalBias = .065
  world.add(sky, sun)

  const camera = new OrthographicCamera(-10, 10, 10, -10, .1, 150)
  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = false
  controls.screenSpacePanning = false
  controls.minZoom = .38
  controls.maxZoom = 2.5
  controls.minPolarAngle = .38
  controls.maxPolarAngle = 1.28
  const cameraSpherical = new Spherical()
  const cameraVector = new Vector3()
  const projection = new Vector3()
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

  const bounds = {}
  const animals = new Set(Object.values(buildings).map(item => item.animalModel))
  for (const [key, model] of Object.entries(loaded)) {
    const box = new Box3().setFromObject(model)
    bounds[key] = { size: box.getSize(new Vector3()), center: box.getCenter(new Vector3()), floor: box.min.y }
    model.traverse(object => {
      if (!object.isMesh) return
      object.castShadow = !flatModels.has(key) && key !== 'meadow'
      object.receiveShadow = true
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        const color = palette[material.name]
        if (color) material.color.set(color)
        if (material.name === 'produce-stall-iron' || key === 'wheat-ripe') material.vertexColors = false
        if (key === 'wheat-ripe') material.color.set('#edbb56')
      }
    })
  }

  function sizeModel(anchor, key, width, depth, height) {
    const { size } = bounds[key]
    const ratio = Math.min(width / size.x, depth ? depth / size.z : Infinity)
    if (height) anchor.scale.setScalar(height / size.y)
    else if (flatModels.has(key) && depth) anchor.scale.set(width / size.x, ratio, depth / size.z)
    else anchor.scale.setScalar(ratio)
  }

  function place(parent, key, x, z, width, rotation = 0, { depth, height, y = 0, tint, opacity } = {}) {
    if (!loaded[key]) return null
    const { center, floor } = bounds[key]
    const model = animals.has(key) ? clone(loaded[key]) : loaded[key].clone()
    model.position.sub(new Vector3(center.x, floor, center.z))
    const anchor = new Group()
    const materials = new Map()
    if (tint || opacity) {
      model.traverse(object => {
        if (!object.isMesh) return
        const variant = material => {
          if (!materials.has(material)) {
            const copy = material.clone()
            if (tint && copy.color) copy.color.lerp(new Color(tint), .43)
            if (opacity) {
              copy.transparent = true
              copy.depthWrite = false
              copy.opacity = opacity
            }
            materials.set(material, copy)
          }
          return materials.get(material)
        }
        object.material = Array.isArray(object.material) ? object.material.map(variant) : variant(object.material)
        if (opacity) object.castShadow = false
      })
    }
    anchor.userData.materials = materials
    anchor.add(model)
    anchor.position.set(x, y, z)
    anchor.rotation.y = rotation + (key === 'stall' ? Math.PI : 0)
    sizeModel(anchor, key, width, depth, height)
    parent.add(anchor)
    return anchor
  }

  function remove(group) {
    group?.traverse(object => {
      object.userData.materials?.forEach(material => material.dispose())
      object.userData.mixer?.stopAllAction()
      if (object.isInstancedMesh) object.dispose()
      if (object.isSkinnedMesh) object.skeleton.dispose()
    })
    group?.removeFromParent()
  }

  const terrain = new Group()
  const forage = new Group()
  const structures = new Group()
  const ghosts = new Group()
  const selection = new Group()
  world.add(terrain, forage, structures, ghosts, selection)
  const sharedResources = []
  const share = resource => {
    sharedResources.push(resource)
    return resource
  }
  const footprintGeometry = share(new CircleGeometry(.045, 8).rotateX(-Math.PI / 2))
  const footprintMaterial = share(new MeshBasicMaterial({ color: '#55402b', opacity: .25, transparent: true, depthWrite: false }))
  const groundGeometry = share(new PlaneGeometry(1, 1).rotateX(-turn))
  const grassMaterial = share(new MeshStandardMaterial({ roughness: 1 }))
  const landscapeMaterial = share(new MeshStandardMaterial({ color: '#8ca568', roughness: 1 }))
  const waterMaterial = share(new MeshStandardMaterial({ color: '#65aeb0', roughness: .6 }))
  const waterTime = { value: 0 }
  for (const material of [grassMaterial, landscapeMaterial]) {
    material.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 grassPoint;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvec4 terrainPoint = vec4(position, 1.0);\n#ifdef USE_INSTANCING\nterrainPoint = instanceMatrix * terrainPoint;\n#endif\ngrassPoint = (modelMatrix * terrainPoint).xz;')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 grassPoint;')
        .replace('#include <color_fragment>', `
          #include <color_fragment>
          float meadow = sin(grassPoint.x * .44 + sin(grassPoint.y * .42)) * cos(grassPoint.y * .58);
          float grass = fract(sin(dot(floor(grassPoint * 36.), vec2(17.13, 53.17))) * 45337.13);
          diffuseColor.rgb *= .97 + meadow * .075 + grass * .045;
        `)
    }
  }
  waterMaterial.onBeforeCompile = shader => {
    shader.uniforms.waterTime = waterTime
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 lakePoint;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nlakePoint = (instanceMatrix * vec4(position, 1.0)).xz;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float waterTime;\nvarying vec2 lakePoint;')
      .replace('#include <color_fragment>', `
        #include <color_fragment>
        float ripple = sin(lakePoint.x * 8. + lakePoint.y * 4. + waterTime * 1.5 + sin(lakePoint.x * 3.));
        diffuseColor.rgb *= .93 + smoothstep(.3, .93, ripple) * .11;
      `)
  }
  const landscape = new Mesh(groundGeometry, landscapeMaterial)
  landscape.scale.set(140, 1, 140)
  landscape.position.y = -.075
  landscape.receiveShadow = true
  world.add(landscape)

  const parcelLines = share(new LineBasicMaterial({ color: '#f3e5bc', transparent: true, opacity: .48 }))
  const tileLines = share(new LineBasicMaterial({ color: '#334f36', transparent: true, opacity: .23 }))
  function grid(step, y, material) {
    const vertices = []
    for (let index = 0; index <= MAP_SIZE; index += step) {
      const offset = index - half
      vertices.push(offset, y, -half, offset, y, half, -half, y, offset, half, y, offset)
    }
    const geometry = share(new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3)))
    const lines = new LineSegments(geometry, material)
    world.add(lines)
    return lines
  }
  const boundary = grid(PARCEL_SIZE, .014, parcelLines)
  const tileGrid = grid(1, .01, tileLines)
  boundary.visible = false
  tileGrid.visible = false

  const validMaterial = share(new MeshStandardMaterial({ color: '#dded9a', transparent: true, opacity: .65, depthWrite: false }))
  const invalidMaterial = share(new MeshStandardMaterial({ color: '#da7058', transparent: true, opacity: .74, depthWrite: false }))
  const selectionMaterial = share(new LineBasicMaterial({ color: '#fff2b6', depthTest: false }))
  const selectedTileMaterial = share(new MeshBasicMaterial({ color: '#ffe08d', opacity: .66, transparent: true, depthWrite: false }))
  const selectionGeometry = share(new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array([
    -.5, 0, -.5, .5, 0, -.5, .5, 0, -.5, .5, 0, .5,
    .5, 0, .5, -.5, 0, .5, -.5, 0, .5, -.5, 0, -.5,
  ]), 3)))
  const transform = new Object3D()
  const color = new Color()
  const instanceMatrix = new Matrix4()

  function batchModel(parent, key, instances) {
    if (!loaded[key] || !instances.length) return
    const { center, floor } = bounds[key]
    const offset = new Matrix4().makeTranslation(-center.x, -floor, -center.z)
    loaded[key].traverse(source => {
      if (!source.isMesh || source.isSkinnedMesh) return
      const batch = new InstancedMesh(source.geometry, source.material, instances.length)
      batch.castShadow = source.castShadow
      batch.receiveShadow = source.receiveShadow
      const meshOffset = offset.clone().multiply(source.matrixWorld)
      instances.forEach(({ x, z, width, angle = 0, y = 0 }, index) => {
        transform.position.set(x, y, z)
        transform.rotation.y = angle
        sizeModel(transform, key, width)
        transform.updateMatrix()
        instanceMatrix.multiplyMatrices(transform.matrix, meshOffset)
        batch.setMatrixAt(index, instanceMatrix)
      })
      parent.add(batch)
    })
  }

  const exterior = new Group()
  world.add(exterior)
  const forestEdge = []
  for (let index = -31; index <= 31; index += 2) {
    for (const [x, z] of [[index, -26], [index, 26], [-26, index], [26, index]]) {
      const random = noise(x, z)
      if (random < .2) continue
      forestEdge.push({ x: x + random * 2, z: z + noise(z, x) * 3, width: 1.8 + random * 2.3, angle: random * 7 })
    }
  }
  function batchTrees(parent, instances) {
    const willow = loaded['forest-tree'] ? instances.filter(({ x, z }) => noise(z, x) < .14) : []
    const willowSet = new Set(willow)
    batchModel(parent, 'tree', instances.filter(tree => !willowSet.has(tree)))
    batchModel(parent, 'forest-tree', willow)
  }
  batchTrees(exterior, forestEdge)

  const terrainCells = Array.from({ length: MAP_SIZE ** 2 }, (_, index) => {
    const x = index % MAP_SIZE
    const z = Math.floor(index / MAP_SIZE)
    return { x, z, parcel: parcelAt(x, z), ...terrainAt(x, z) }
  })
  let landscapeKey
  let forageKey

  function updateTerrain(state, season) {
    const key = [season, ...state.parcels, '/', ...(state.cleared || [])].join('|')
    if (key === landscapeKey) return
    landscapeKey = key
    for (const group of [...terrain.children]) remove(group)
    const owned = new Set(state.parcels)
    const cleared = new Set(state.cleared)
    const trees = []
    const rocks = []
    const water = []
    const meadow = []
    const sand = new Color(season === 'winter' ? '#c1cbd1' : '#d4bf8b')
    const turf = new InstancedMesh(groundGeometry, grassMaterial, terrainCells.length)
    turf.receiveShadow = true
    terrainCells.forEach(({ x, z, parcel, biome, obstacle }, index) => {
      const at = { x: worldAt(x), z: worldAt(z) }
      const random = noise(x, z)
      const angle = random * Math.PI * 2
      const isOwned = owned.has(parcel)
      color.set(terrainColors[season][biome] || terrainColors[season].meadow)
      if (obstacle === 'water') color.copy(sand)
      color.multiplyScalar((isOwned ? 1.04 : .91) + random * .09)
      instanceMatrix.makeTranslation(at.x, 0, at.z)
      turf.setMatrixAt(index, instanceMatrix)
      turf.setColorAt(index, color)
      if (obstacle === 'water') {
        water.push(at)
      } else if (obstacle && !cleared.has(tileKey(x, z))) {
        if (obstacle === 'tree') trees.push({ ...at, width: 1.42 + random * .58, angle })
        if (obstacle === 'rock') rocks.push({ ...at, angle, width: .65 + random * .36 })
      } else if (!isOwned && random < .045) {
        meadow.push({ ...at, width: .62 + random * 7, angle })
      }
    })
    terrain.add(turf)
    batchTrees(terrain, trees)
    batchModel(terrain, 'meadow', meadow)
    batchModel(terrain, 'rock', rocks)
    if (water.length) {
      const lake = new InstancedMesh(groundGeometry, waterMaterial, water.length)
      water.forEach(({ x, z }, index) => {
        instanceMatrix.makeTranslation(x, .025, z)
        lake.setMatrixAt(index, instanceMatrix)
      })
      lake.receiveShadow = true
      terrain.add(lake)
    }
    landscapeMaterial.color.set(terrainColors[season].woods)
    renderer.shadowMap.needsUpdate = true
  }

  function updateForage(state) {
    const occupied = new Set(state.objects.filter(object => !object.stored)
      .flatMap(object => footprint(object.kind, object.x, object.z, object.rotation))
      .map(({ x, z }) => tileKey(x, z)))
    const owned = new Set(state.parcels)
    const cleared = new Set(state.cleared)
    const available = terrainCells.filter(cell => {
      if (!cell.forage || cell.forage === 'wood' || !owned.has(cell.parcel)) return false
      const key = tileKey(cell.x, cell.z)
      return !occupied.has(key) && !cleared.has(key) && !(state.cooldowns?.['forage:' + key] > state.now)
    })
    const key = available.map(({ x, z }) => tileKey(x, z)).join('|')
    if (key === forageKey) return
    forageKey = key
    for (const group of [...forage.children]) remove(group)
    for (const model of ['mushroom', 'wildberry']) {
      const instances = available.filter(cell => cell.forage === model).map(({ x, z }) => ({
        x: worldAt(x), z: worldAt(z), width: .52, angle: noise(x, z) * 6.28,
      }))
      batchModel(forage, model, instances)
    }
    renderer.shadowMap.needsUpdate = true
  }

  function structureLocation(kind, x, z, rotation) {
    const [width, depth] = buildings[kind].size
    const quarter = rotation || 0
    const [spanX, spanZ] = quarter % 2 ? [depth, width] : [width, depth]
    return {
      x: x - half + spanX / 2,
      z: z - half + spanZ / 2,
      spanX, spanZ, width, depth, angle: -quarter * turn,
    }
  }

  const entries = new Map()
  function makeStructure(object, stamp) {
    const item = buildings[object.kind]
    const { x, z, spanX, spanZ, width, depth, angle } = structureLocation(object.kind, object.x, object.z, object.rotation)
    const group = new Group()
    group.position.set(x, 0, z)
    group.rotation.y = angle
    structures.add(group)
    const model = place(group, item.model, 0, 0, width * .98, 0, { depth: depth * .98, tint: object.color })
    if (model) model.scale.y *= 1 + Math.max(0, (object.level || 1) - 1) * .1
    const livestock = []
    if (item.animalModel && loaded[item.animalModel]) {
      const count = clamp(object.level || 1, 1, animalOffsets.length)
      const idle = assets[item.animalModel].animations.find(clip => clip.name === 'idle')
      for (const [dx, dz] of animalOffsets.slice(0, count)) {
        const height = animalHeights[item.animalModel] || .53
        const anchor = place(group, item.animalModel, width * dx, depth * dz, .6, .65, { height: height * (count > 2 ? .84 : 1) })
        const mixer = idle && new AnimationMixer(anchor.children[0])
        mixer?.clipAction(idle).play()
        anchor.userData.mixer = mixer
        const prints = [0, 1].map(() => {
          const print = new Mesh(footprintGeometry, footprintMaterial)
          print.scale.x = .65
          print.visible = false
          group.add(print)
          return print
        })
        livestock.push({ anchor, mixer, dx, dz, prints })
      }
    }
    const rotor = item.model === 'windmill' && model?.getObjectByName('meadow_windmill_sails')
    const height = model ? bounds[item.model].size.y * model.scale.y : .2
    const box = new Box3(new Vector3(x - spanX / 2, 0, z - spanZ / 2), new Vector3(x + spanX / 2, Math.max(height, .18), z + spanZ / 2))
    return { group, box, x, z, height, stamp, livestock, rotor, width, depth, phase: noise(object.x, object.z) * 6.28 }
  }

  function updateStructures(state) {
    const active = new Set()
    for (const object of state.objects) {
      if (object.stored || !buildings[object.kind]) continue
      active.add(object.id)
      const stamp = [object.kind, object.x, object.z, object.rotation, object.level, object.color].join('/')
      let entry = entries.get(object.id)
      if (entry?.stamp !== stamp) {
        remove(entry?.group)
        entry = makeStructure(object, stamp)
        entries.set(object.id, entry)
        renderer.shadowMap.needsUpdate = true
      }

      const crop = object.crop && crops[object.crop.kind]
      const ripe = crop && state.now >= object.crop.readyAt
      const cropModel = crop && (ripe ? crop.ripeModel : crop.model)
      const previous = entry.cropModel
      entry.petAt = object.petAt
      if (previous !== cropModel) {
        const previousScale = entry.crop?.scale.y
        remove(entry.crop)
        entry.crop = null
        entry.cropModel = cropModel
        if (cropModel && loaded[cropModel]) {
          const plants = new Group()
          plants.position.y = .085
          const offsets = entry.width >= 2 && entry.depth >= 2
            ? [-.24, .24].flatMap(z => [-.28, 0, .28].map(x => [x, z]))
            : plantOffsets
          offsets.forEach(([dx, dz], index) => {
            const x = dx * entry.width
            const z = dz * entry.depth
            const angle = index * 1.35
            const height = ripe ? object.crop.kind === 'pumpkin' ? .35 : .58 : .44
            place(plants, cropModel, x, z, .2, angle, { height })
            if (cropModel.startsWith('wheat-')) place(plants, cropModel, x, z, .2, angle + turn, { height })
          })
          entry.group.add(plants)
          entry.crop = plants
          const fresh = state.now - object.crop.plantedAt < 1800
          entry.crop.scale.y = previousScale ? previousScale * .76 : fresh ? .12 : 1
        }
        renderer.shadowMap.needsUpdate = true
      }
      if (entry.crop) {
        const duration = Math.max(1, object.crop.readyAt - object.crop.plantedAt)
        const progress = clamp((state.now - object.crop.plantedAt) / duration, 0, 1)
        const growing = object.crop.kind === 'pumpkin' || object.crop.kind === 'berry' ? progress ** .7 : progress
        const scale = .34 + Math.floor(growing * 20) * .033
        entry.cropTarget = scale
        if (state.settings?.motion === false || state.settings?.quality === 'low' || reducedMotion.matches) {
          const spread = .8 + .2 * scale
          entry.crop.scale.set(spread, scale, spread)
          renderer.shadowMap.needsUpdate = true
        }
      }
    }
    for (const [id, entry] of entries) {
      if (active.has(id)) continue
      remove(entry.group)
      entries.delete(id)
      renderer.shadowMap.needsUpdate = true
    }
  }

  let previewKey
  function updatePreview(preview) {
    const key = JSON.stringify(preview)
    if (key === previewKey) return
    previewKey = key
    for (const group of [...ghosts.children]) remove(group)
    if (!preview) return
    const brush = (preview.path || []).map(({ x, z }) => ({ kind: preview.kind, x, z, rotation: preview.rotation }))
    const pieces = new Map()
    for (const piece of [preview, ...brush, ...(preview.pieces || [])]) {
      if (!buildings[piece.kind]) continue
      pieces.set([piece.kind, piece.x, piece.z, piece.rotation].join('/'), piece)
    }
    if (!pieces.size) return
    const marks = new InstancedMesh(groundGeometry, preview.valid ? validMaterial : invalidMaterial, pieces.size)
    marks.renderOrder = 3
    let index = 0
    for (const piece of pieces.values()) {
      const { x, z, spanX, spanZ, width, depth, angle } = structureLocation(piece.kind, piece.x, piece.z, piece.rotation)
      instanceMatrix.makeScale(spanX - .045, 1, spanZ - .045).setPosition(x, .031, z)
      marks.setMatrixAt(index, instanceMatrix)
      if (index === 0 || !brush.length) {
        place(ghosts, buildings[piece.kind].model, x, z, width * .98, angle, { depth: depth * .98, opacity: .55, y: .05 })
      }
      index++
    }
    ghosts.add(marks)
  }

  let selectionKey
  function updateSelection(ids, tile) {
    const selected = [...(ids || [])].map(id => entries.get(id)).filter(Boolean)
    const key = selected.map(entry => entry.stamp).join('|') + ':' + (tile ? tileKey(tile.x, tile.z) : '')
    if (key === selectionKey) return
    selectionKey = key
    selection.clear()
    const outlines = selected.map(({ box, x, z }) => ({ x, z, width: box.max.x - box.min.x, depth: box.max.z - box.min.z }))
    if (tile) {
      const x = worldAt(tile.x)
      const z = worldAt(tile.z)
      const fill = new Mesh(groundGeometry, selectedTileMaterial)
      fill.position.set(x, .037, z)
      fill.renderOrder = 3
      selection.add(fill)
      outlines.push({ x, z, width: .98, depth: .98 })
    }
    for (const { x, z, width, depth } of outlines) {
      const outline = new LineSegments(selectionGeometry, selectionMaterial)
      outline.position.set(x, .055, z)
      outline.scale.set(width + .02, 1, depth + .02)
      outline.renderOrder = 4
      selection.add(outline)
    }
  }

  const particles = 85
  const flecksGeometry = share(new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(particles * 3), 3)))
  const rainGeometry = share(new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(particles * 6), 3)))
  const flecksMaterial = share(new PointsMaterial({ color: '#fff8dd', opacity: .61, transparent: true, depthWrite: false }))
  const rainMaterial = share(new LineBasicMaterial({ color: '#b9e1df', opacity: .43, transparent: true, depthWrite: false }))
  const flecks = new Points(flecksGeometry, flecksMaterial)
  const rain = new LineSegments(rainGeometry, rainMaterial)
  flecks.frustumCulled = false
  rain.frustumCulled = false
  world.add(flecks, rain)

  let currentWeather = 'clear'
  let localTime = 0
  let startTime
  let time = 0
  let settings = {}
  let edit = {}
  let frame = 0
  let disposed = false
  let lastDraw = 0
  let quality
  const dayColor = new Color('#fff1d6')
  const nightColor = new Color('#9bb4e9')
  const daySky = new Color('#fff8df')
  const nightSky = new Color('#bdceef')

  function updateAtmosphere() {
    const phase = time / (26 * 60_000) * Math.PI * 2
    const daylight = .58 + Math.cos(phase) * .42
    const weatherLight = currentWeather === 'clear' || settings.weather === false ? 1 : .78
    sun.intensity = (0.45 + daylight * 1.95) * weatherLight
    sun.color.copy(nightColor).lerp(dayColor, daylight)
    sky.intensity = 1.45 + daylight * .8
    sky.color.copy(nightSky).lerp(daySky, daylight)
    const motion = settings.motion !== false && !reducedMotion.matches && quality !== 'low'
    flecks.visible = settings.weather !== false && motion && currentWeather !== 'rain'
    rain.visible = settings.weather !== false && motion && currentWeather === 'rain'
    for (const entry of entries.values()) {
      if (entry.crop && entry.cropTarget !== undefined && entry.crop.scale.y !== entry.cropTarget) {
        const height = entry.crop.scale.y
        const difference = entry.cropTarget - height
        const scale = motion && Math.abs(difference) > .003 ? height + difference * .32 : entry.cropTarget
        const spread = .8 + .2 * scale
        entry.crop.scale.set(spread, scale, spread)
        if (scale === entry.cropTarget) renderer.shadowMap.needsUpdate = true
      }
      if (!motion) {
        for (const animal of entry.livestock) for (const print of animal.prints) print.visible = false
        continue
      }
      if (entry.rotor) entry.rotor.rotation.z = localTime * .36 + entry.phase
      entry.livestock.forEach(({ anchor, mixer, dx, dz, prints }, index) => {
        const phase = localTime * .65 + entry.phase + index * 2.4
        anchor.position.x = entry.width * (dx + Math.sin(phase) * .04)
        anchor.position.z = entry.depth * (dz + Math.cos(phase * .8) * .035)
        const petted = clamp((time - (entry.petAt ?? 0)) / 550, 0, 1)
        anchor.position.y = Math.sin(Math.PI * petted) * .13
        anchor.rotation.y = .65 + Math.sin(phase * .55) * .4
        mixer?.setTime(localTime + entry.phase + index)
        prints.forEach((print, step) => {
          const trail = phase - .65 - step * .55
          print.visible = Math.cos(phase) > .15
          print.position.set(entry.width * (dx + Math.sin(trail) * .04) + (step ? .025 : -.025),
            .038, entry.depth * (dz + Math.cos(trail * .8) * .035) - .04)
          print.rotation.y = anchor.rotation.y
        })
      })
    }
    if (!motion) return
    waterTime.value = localTime
    if (!flecks.visible && !rain.visible) return
    const positions = (rain.visible ? rainGeometry : flecksGeometry).attributes.position
    const snow = currentWeather === 'snow'
    flecksMaterial.color.set(snow ? '#fff' : '#fff4c6')
    flecksMaterial.size = snow ? 3.2 : 1.7
    const radius = Math.min(31, 18 / camera.zoom)
    const height = rain.visible ? 13 : snow ? 10 : 4.5
    const speed = rain.visible ? 1.3 : snow ? .15 : .06
    const offset = localTime * speed
    const count = rain.visible || snow ? particles : 27
    flecksGeometry.setDrawRange(0, count)
    for (let index = 0; index < count; index++) {
      const x = controls.target.x + (noise(index, 1) - .5) * radius * 2 + Math.sin(localTime * .28 + index) * .65
      const z = controls.target.z + (noise(index, 2) - .5) * radius * 2
      const y = height * (1 - ((noise(index, 3) + offset) % 1))
      if (rain.visible) {
        positions.setXYZ(index * 2, x, y, z)
        positions.setXYZ(index * 2 + 1, x + .15, y + .69, z + .07)
      } else positions.setXYZ(index, x, y, z)
    }
    positions.needsUpdate = true
  }

  function render() {
    if (disposed) return
    const x = clamp(controls.target.x, -half + .5, half - .5)
    const z = clamp(controls.target.z, -half + .5, half - .5)
    camera.position.x += x - controls.target.x
    camera.position.z += z - controls.target.z
    controls.target.set(x, 0, z)
    camera.updateMatrixWorld()
    updateAtmosphere()
    renderer.render(world, camera)
    for (const element of root.querySelectorAll('[data-point]')) {
      const entry = entries.get(element.dataset.point)
      if (!entry) {
        element.hidden = true
        continue
      }
      projection.set(entry.x, Math.max(.42, entry.height + .22, entry.crop ? .62 : 0), entry.z).project(camera)
      element.style.left = (projection.x * 50 + 50) + '%'
      element.style.top = (50 - projection.y * 50) + '%'
      element.hidden = Math.abs(projection.x) > .98 || Math.abs(projection.y) > .97
    }
  }

  function animate(now) {
    frame = 0
    if (disposed || settings.motion === false || reducedMotion.matches || quality === 'low') return
    if (now - lastDraw > 83) {
      localTime = now / 1000
      lastDraw = now
      render()
    }
    frame = requestAnimationFrame(animate)
  }

  function syncMotion() {
    if (settings.motion === false || reducedMotion.matches || quality === 'low') {
      cancelAnimationFrame(frame)
      frame = 0
      localTime = 0
    } else if (!frame) frame = requestAnimationFrame(animate)
    render()
  }

  function resize() {
    const { clientWidth: width, clientHeight: height } = root
    if (!width || !height) return
    const aspect = width / height
    const vertical = Math.max(23, 14 / aspect)
    camera.left = -vertical * aspect / 2
    camera.right = vertical * aspect / 2
    camera.top = vertical / 2
    camera.bottom = -vertical / 2
    camera.updateProjectionMatrix()
    renderer.setSize(width, height, false)
    render()
  }

  function getView() {
    cameraSpherical.setFromVector3(cameraVector.copy(camera.position).sub(controls.target))
    return { x: controls.target.x + half - .5, z: controls.target.z + half - .5, zoom: camera.zoom, angle: cameraSpherical.theta, pitch: cameraSpherical.phi }
  }

  function setView(patch) {
    const { x, z, zoom, angle, pitch } = { ...getView(), ...patch }
    controls.target.set(worldAt(clamp(x, 0, MAP_SIZE - 1)), 0, worldAt(clamp(z, 0, MAP_SIZE - 1)))
    camera.position.setFromSpherical(cameraSpherical.set(55, clamp(pitch, controls.minPolarAngle, controls.maxPolarAngle), angle)).add(controls.target)
    camera.zoom = clamp(zoom, controls.minZoom, controls.maxZoom)
    camera.updateProjectionMatrix()
    if (!controls.update()) render()
  }

  const tap = makePointerTap()
  const raycaster = new Raycaster()
  const pointer = new Vector2()
  const pickPoint = new Vector3()
  let lastHover
  let stroke

  function pick(event, includeObject = true) {
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return null
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2)
    raycaster.setFromCamera(pointer, camera)
    let id
    let distance = Infinity
    if (includeObject) {
      for (const [key, entry] of entries) {
        if (!raycaster.ray.intersectBox(entry.box, pickPoint)) continue
        const next = pickPoint.distanceToSquared(raycaster.ray.origin)
        if (next < distance) {
          distance = next
          id = key
        }
      }
    }
    if (!raycaster.ray.intersectPlane(groundPlane, pickPoint)) return null
    const x = Math.floor(pickPoint.x + half)
    const z = Math.floor(pickPoint.z + half)
    if (x < 0 || z < 0 || x >= MAP_SIZE || z >= MAP_SIZE) {
      const hit = entries.get(id)
      return hit ? { x: Math.floor(hit.x + half), z: Math.floor(hit.z + half), id } : null
    }
    return id ? { x, z, id } : { x, z }
  }

  function hover(hit) {
    const key = hit && tileKey(hit.x, hit.z) + '/' + (hit.id || '')
    if (lastHover === key) return
    lastHover = key
    edit.onHover?.(hit)
  }

  function append(cell) {
    if (!cell) return
    const previous = stroke.last
    const cells = previous ? paintSegment(previous, cell) : [cell]
    for (const point of cells) stroke.cells.set(tileKey(point.x, point.z), point)
    stroke.last = cell
  }

  function down(event) {
    if (event.button !== 0) return
    tap.down(event.pointerId, event.clientX, event.clientY)
    if (stroke) {
      stroke = null
      return
    }
    if (!event.isPrimary || !edit.paint) return
    stroke = { id: event.pointerId, cells: new Map(), last: null }
    append(pick(event, false))
  }

  function move(event) {
    tap.move(event.pointerId, event.clientX, event.clientY)
    const painting = stroke?.id === event.pointerId
    if (!painting && !edit.onHover) return
    const hit = pick(event, !edit.paint)
    if (painting) append(hit)
    hover(hit)
  }

  function cancel(event) {
    tap.cancel(event.pointerId)
    if (stroke?.id === event.pointerId) stroke = null
  }

  function up(event) {
    const tapped = tap.up(event.pointerId, event.clientX, event.clientY)
    if (stroke?.id === event.pointerId) {
      append(pick(event, false))
      const path = [...stroke.cells.values()]
      const last = stroke.last
      stroke = null
      if (last && path.length) onPick({ ...last, path })
    } else if (tapped && !edit.paint) {
      const hit = pick(event)
      if (hit) onPick(hit)
    }
  }

  const leave = () => hover(null)
  canvas.addEventListener('pointerdown', down)
  canvas.addEventListener('pointermove', move)
  canvas.addEventListener('pointerup', up)
  canvas.addEventListener('pointercancel', cancel)
  canvas.addEventListener('lostpointercapture', cancel)
  canvas.addEventListener('pointerleave', leave)
  controls.addEventListener('change', render)
  reducedMotion.addEventListener('change', syncMotion)
  const observer = new ResizeObserver(resize)
  observer.observe(root)
  setView(defaultView)
  resize()

  return {
    setState(state, nextEdit = {}) {
      settings = state.settings || {}
      edit = nextEdit
      const nextQuality = settings.quality || 'high'
      if (quality !== nextQuality) {
        quality = nextQuality
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1 : 1.55))
        renderer.shadowMap.enabled = quality !== 'low'
        renderer.shadowMap.needsUpdate = true
      }

      const now = state.now || Date.now()
      startTime ??= now
      time = Math.max(0, now - startTime)
      const seasons = Object.keys(terrainColors)
      const season = terrainColors[state.season] ? state.season : seasons[Math.floor(time / 1_560_000) % seasons.length]
      currentWeather = typeof state.weather === 'string' ? state.weather : ['clear', 'rain', 'clear', 'snow'][Math.floor(time / 420_000) % 4]
      controls.mouseButtons = { LEFT: edit.paint ? -1 : MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: edit.paint ? MOUSE.PAN : MOUSE.ROTATE }
      controls.touches = { ONE: edit.paint ? -1 : TOUCH.PAN, TWO: TOUCH.DOLLY_PAN }
      tileGrid.visible = Boolean(edit.active)
      boundary.visible = Boolean(edit.active)
      updateTerrain(state, season)
      updateForage(state)
      updateStructures(state)
      updatePreview(edit.preview)
      updateSelection(edit.active ? edit.selected : null, edit.selectedTile)
      syncMotion()
    },
    resetView() {
      setView(defaultView)
    },
    getView,
    setView,
    capture() {
      render()
      return canvas.toDataURL('image/png')
    },
    dispose() {
      if (disposed) return
      disposed = true
      cancelAnimationFrame(frame)
      observer.disconnect()
      reducedMotion.removeEventListener('change', syncMotion)
      controls.dispose()
      for (const group of [terrain, forage, structures, ghosts, exterior, selection]) remove(group)
      disposeModels(Object.values(loaded))
      sharedResources.forEach(resource => resource.dispose())
      sun.shadow.dispose()
      renderer.dispose()
      canvas.remove()
    },
  }
}
