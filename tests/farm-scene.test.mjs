import assert from 'node:assert/strict'
import test from 'node:test'
import * as scene from '../lib/farm-scene.js'

test('a fast diagonal paint stroke covers the skipped tiles in edge-connected order', () => {
  assert.equal(typeof scene.paintSegment, 'function')
  assert.deepEqual(scene.paintSegment({ x: 4, z: 5 }, { x: 7, z: 7 }), [
    { x: 5, z: 5 }, { x: 5, z: 6 }, { x: 6, z: 6 }, { x: 6, z: 7 }, { x: 7, z: 7 },
  ])
  assert.deepEqual(scene.paintSegment({ x: 7, z: 7 }, { x: 7, z: 7 }), [])
})
