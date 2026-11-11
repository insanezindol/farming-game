import { DirectionalLight, HemisphereLight, OrthographicCamera, Scene, WebGLRenderer } from 'three'
import { createAvatarModel } from './farm-avatar-model.js'

export function createAvatarPreview(root) {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
  renderer.domElement.setAttribute('aria-hidden', 'true')
  root.append(renderer.domElement)
  const scene = new Scene()
  scene.add(new HemisphereLight('#fff6e5', '#97aa91', 2.5))
  const light = new DirectionalLight('#fff8ee', 3)
  light.position.set(-3, 5, 5); scene.add(light)
  const camera = new OrthographicCamera(-1.1, 1.1, 1, -1, .1, 20)
  camera.position.set(2, 1.8, 5); camera.lookAt(0, .85, 0)
  let model
  function render() {
    const width = root.clientWidth || 240, height = root.clientHeight || 220
    camera.left = -width / height; camera.right = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height, false)
    renderer.render(scene, camera)
  }
  const observer = new ResizeObserver(render)
  observer.observe(root)
  return {
    setLook(look) { model?.dispose(); model = createAvatarModel(look); scene.add(model.root); render() },
    dispose() { observer.disconnect(); model?.dispose(); renderer.dispose(); renderer.domElement.remove() },
  }
}
