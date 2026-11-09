import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'
import { makePointerTap } from '../lib/farm-world.mjs'

test('dragging, cancellation and pinching cannot activate the clicked object', () => {
  const tap = makePointerTap()
  tap.down(1, 0, 0)
  assert.equal(tap.up(1, 4, 4), true)
  tap.down(1, 0, 0)
  tap.move(1, 30, 0)
  assert.equal(tap.up(1, 0, 0), false)
  tap.down(1, 0, 0)
  tap.down(2, 0, 0)
  assert.equal(tap.up(2, 0, 0), false)
  assert.equal(tap.up(1, 0, 0), false)
  tap.down(1, 0, 0)
  tap.cancel(1)
  assert.equal(tap.up(1, 0, 0), false)
})

test('every shipped 3D model matches its documented upstream bytes and MIT notice', () => {
  const root = new URL('../public/models/', import.meta.url)
  const { models } = JSON.parse(readFileSync(new URL('sources.json', root)))
  const files = readdirSync(root).filter(file => /\.(?:glb|gltf)$/.test(file))
  assert.deepEqual(files.sort(), Object.values(models).map(model => model.file).sort())
  for (const [key, model] of Object.entries(models)) {
    const bytes = readFileSync(new URL(model.file, root))
    if (model.file.endsWith('.glb')) assert.equal(bytes.subarray(0, 4).toString(), 'glTF', key)
    else assert.equal(JSON.parse(bytes).asset.version, '2.0', key)
    assert.equal(createHash('sha256').update(bytes).digest('hex'), model.sha256, key)
    assert.equal(model.license, 'MIT')
    assert.match(readFileSync(new URL(model.notice, root), 'utf8'), /MIT License/i, key)
    assert.match(model.source, /^https:\/\//)
  }
})


