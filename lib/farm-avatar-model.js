import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, TorusGeometry } from 'three'
import { avatarItems, avatarLook } from './farm-avatar.mjs'

export function createAvatarModel(appearance) {
  const look = avatarLook(appearance)
  const root = new Group()
  const body = new Group()
  root.add(body)
  const resources = new Set()
  const material = color => {
    const value = new MeshStandardMaterial({ color, roughness: .86 })
    resources.add(value)
    return value
  }
  const skin = material(look.skin), hair = material(look.hairColor)
  const clothes = avatarItems[look.equipment.outfit]
  const fabric = material(clothes.color), shirt = material(clothes.shirt)
  const boot = material('#675044'), eyes = material('#332d32'), white = material('#fff8e9')
  function shape(parent, geometry, mat, x, y, z, scale = [1, 1, 1]) {
    resources.add(geometry)
    const mesh = new Mesh(geometry, mat)
    mesh.position.set(x, y, z)
    mesh.scale.set(...scale)
    mesh.castShadow = true
    mesh.receiveShadow = true
    parent.add(mesh)
    return mesh
  }
  const ball = (parent, mat, x, y, z, scale) => shape(parent, new SphereGeometry(1, 12, 9), mat, x, y, z, scale)
  const box = (parent, mat, x, y, z, scale) => shape(parent, new BoxGeometry(1, 1, 1), mat, x, y, z, scale)
  ball(body, shirt, 0, .73, 0, [.24, .3, .17])
  ball(body, fabric, 0, .53, 0, [.25, .22, .18])
  box(body, fabric, 0, .8, .155, [.28, .28, .055])
  for (const x of [-.115, .115]) {
    box(body, fabric, x, .94, .13, [.065, .17, .06])
    ball(body, material('#e8c66b'), x, .85, .194, [.025, .025, .015])
  }
  if (look.equipment.outfit === 'apron') ball(body, fabric, 0, .56, .09, [.3, .28, .16])
  if (look.equipment.outfit === 'raincoat') for (const y of [.63, .75, .88]) ball(body, boot, 0, y, .19, [.02, .02, .015])

  const legs = [-.13, .13].map(x => {
    const pivot = new Group(); pivot.position.set(x, .51, 0); body.add(pivot)
    ball(pivot, fabric, 0, -.14, 0, [.1, .23, .11])
    ball(pivot, boot, 0, -.38, .055, [.12, .09, .17])
    return pivot
  })
  const arms = [-1, 1].map(side => {
    const pivot = new Group(); pivot.position.set(side * .24, .91, 0); body.add(pivot)
    ball(pivot, shirt, side * .025, -.095, 0, [.105, .16, .11])
    ball(pivot, skin, side * .04, -.24, .015, [.085, .14, .09])
    return pivot
  })
  const head = new Group(); head.position.y = 1.22; body.add(head)
  ball(head, skin, 0, 0, 0, [.29, .3, .26])
  for (const side of [-1, 1]) {
    ball(head, skin, side * .28, -.025, 0, [.065, .09, .06])
    ball(head, eyes, side * .102, .005, .242, [.027, .036, .019])
    ball(head, white, side * .099, .016, .257, [.008, .01, .005])
    ball(head, material('#eaa194'), side * .17, -.065, .215, [.05, .025, .018])
  }
  ball(head, skin, 0, -.04, .264, [.035, .04, .033])
  const smile = shape(head, new TorusGeometry(.046, .009, 5, 12, Math.PI), eyes, 0, -.09, .246)
  smile.rotation.z = Math.PI
  ball(head, hair, 0, .16, -.03, [.3, .19, .255])
  for (const x of [-.15, -.03, .1]) ball(head, hair, x, .19, .18, [.105, .13, .095])
  if (look.equipment.hair === 'bob') for (const x of [-.24, .24]) ball(head, hair, x, -.04, -.035, [.105, .25, .21])
  if (look.equipment.hair === 'ponytail') ball(head, hair, 0, .03, -.34, [.13, .27, .13])

  const hat = look.equipment.hat
  if (hat === 'straw' || hat === 'cap') {
    const color = material(hat === 'straw' ? '#e7c481' : '#8ca79d')
    shape(head, new CylinderGeometry(.25, .3, .17, 16), color, 0, .34, -.01)
    if (hat === 'straw') {
      shape(head, new CylinderGeometry(.45, .45, .035, 20), color, 0, .26, 0)
      shape(head, new CylinderGeometry(.303, .303, .045, 16), material('#a87a50'), 0, .29, -.01)
    } else ball(head, color, 0, .27, .22, [.28, .025, .24])
  } else if (hat === 'beret') {
    ball(head, material('#ce797a'), .025, .33, -.025, [.34, .105, .29])
    box(head, fabric, .025, .44, -.025, [.035, .06, .035])
  }
  if (look.equipment.accessory === 'glasses') {
    for (const x of [-.11, .11]) shape(head, new TorusGeometry(.081, .012, 5, 16), boot, x, .005, .263)
    box(head, boot, 0, .005, .275, [.06, .015, .015])
  } else if (look.equipment.accessory === 'scarf') {
    const scarf = material('#c96e61')
    ball(body, scarf, 0, 1.01, .02, [.22, .065, .18])
    box(body, scarf, .105, .86, .205, [.09, .25, .025])
  } else if (look.equipment.accessory === 'backpack') {
    ball(body, material('#bc8e59'), 0, .76, -.19, [.23, .25, .13])
  }

  const tool = new Group(); tool.position.set(.06, -.25, .1); arms[1].add(tool)
  const can = new Group(); tool.add(can)
  const metal = material('#79b7b4')
  shape(can, new CylinderGeometry(.1, .12, .17, 12), metal, 0, 0, 0)
  const spout = shape(can, new CylinderGeometry(.025, .035, .22, 8), metal, .14, .01, .04)
  spout.rotation.z = -1.05
  const drops = [0, 1, 2].map(index => ball(can, material('#8dd8ef'), .25 + index * .04, -.05 - index * .055, .05, [.018, .03, .018]))
  const basket = new Group(); tool.add(basket)
  shape(basket, new CylinderGeometry(.11, .08, .15, 12), material('#bb8c53'), 0, -.02, .02)
  shape(basket, new TorusGeometry(.1, .012, 5, 12, Math.PI), boot, 0, .06, .02)
  const dough = new Group(); tool.add(dough)
  box(dough, material('#c59762'), 0, -.08, .08, [.3, .035, .25])
  ball(dough, white, 0, -.025, .08, [.095, .055, .075])
  const seeds = [0, 1, 2].map(index => ball(tool, material('#e8c96c'), 0, 0, 0, [.016, .022, .014]))
  function pose(type = 'idle', time = 0, motion = true) {
    const wave = motion ? Math.sin(time * (type === 'walk' ? 11 : 8)) : 0
    body.position.y = type === 'walk' ? Math.abs(wave) * .035 : type === 'idle' && motion ? Math.sin(time * 2) * .012 : 0
    body.rotation.x = ['plant', 'collect', 'forage', 'fertilize'].includes(type) ? .22 + wave * .06 : 0
    legs.forEach((leg, i) => { leg.rotation.x = type === 'walk' ? wave * .5 * (i ? 1 : -1) : 0 })
    arms.forEach((arm, i) => { arm.rotation.x = type === 'walk' ? wave * .4 * (i ? -1 : 1) : type === 'idle' ? 0 : -.8 + wave * .3; arm.rotation.z = 0 })
    if (['pet', 'inspect', 'feed', 'addAnimal'].includes(type)) arms[1].rotation.z = -.4 + wave * .3
    can.visible = type === 'water'
    basket.visible = ['collect', 'sell', 'order', 'feed'].includes(type)
    dough.visible = type === 'enqueue'
    if (type === 'enqueue') arms.forEach((arm, i) => { arm.rotation.x = -.9 + wave * .18 * (i ? -1 : 1) })
    seeds.forEach((seed, i) => {
      seed.visible = ['plant', 'fertilize'].includes(type)
      const t = (time * 2 + i / 3) % 1
      seed.position.set(.04 + t * .3, -.4 * t, .1 + t * .2)
    })
    drops.forEach((drop, i) => { drop.position.y = -.05 - ((time * 2 + i / 3) % 1) * .3 })
  }
  pose()
  return { root, pose, dispose() { root.removeFromParent(); resources.forEach(resource => resource.dispose()) } }
}
