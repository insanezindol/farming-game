'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { runFarmAction } from './actions'
import { Mark } from './art'
import { FarmSocial } from './farm-social'
import { buildings } from '../lib/farm-catalog.mjs'
import { parcelAt, canPlace, footprint, MAP_SIZE, PARCEL_SIZE } from '../lib/farm-layout.mjs'
import {
  FarmButton, FarmMap, TileGrid, Shop, Seeds, Inventory, Orders, Progress, ObjectPanel,
  Settings, ParcelPanel, TerrainPanel, Help, objectName, terrainTileLabel, isReady, remainingTime,
} from './farm-panels'
import './farm.css'

const panelTitles = {
  shop: '건설 상점', map: '농장 지도', bag: '창고', orders: '주문서', settings: '설정',
  progress: '농장 기록', seeds: '씨앗 주머니', collect: '생산물 모으기', help: '농장 안내', share: '농장 방문',
}
const batchKinds = ['plot', 'path', 'stonepath', 'fence']
const collectedKinds = { plot: '작물', animal: '가축 생산물', artisan: '가공품' }
const arrows = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }
const seasonNames = { spring: '봄', summer: '여름', autumn: '가을', winter: '겨울' }
const weatherNames = { clear: '맑음', rain: '비', snow: '눈' }
const isBed = object => ['plot', 'greenhouse'].includes(object.kind)
const collectKind = object => isBed(object) ? 'plot' : buildings[object.kind]?.product ? 'animal' : 'artisan'

function placementValid(farm, placement, point, moving, path = [point]) {
  if (moving.length) {
    const anchor = moving[0]
    const ids = moving.map(object => object.id)
    const occupied = new Set()
    return moving.every(object => {
      const x = point.x + object.x - anchor.x
      const z = point.z + object.z - anchor.z
      const rotation = moving.length === 1 ? placement.rotation : object.rotation
      if (!canPlace(farm, object.kind, x, z, rotation, ids)) return false
      return footprint(object.kind, x, z, rotation).every(cell => {
        const key = cell.x + ',' + cell.z
        if (occupied.has(key)) return false
        occupied.add(key)
        return true
      })
    })
  }
  return path.length <= PARCEL_SIZE ** 2 && path.every(tile => canPlace(farm, placement.kind, tile.x, tile.z, placement.rotation)) &&
    farm.coins >= buildings[placement.kind].price * path.length
}

function useFarmAudio(settings, weather) {
  const context = useRef(null)
  const audio = useRef(settings)
  audio.current = settings

  function note(frequency, volume, delay = 0, length = .18, shape = 'sine') {
    const ctx = context.current
    if (!ctx || ctx.state !== 'running') return
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    const start = ctx.currentTime + delay
    oscillator.type = shape
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(.001, start)
    gain.gain.exponentialRampToValueAtTime(volume, start + .03)
    gain.gain.exponentialRampToValueAtTime(.001, start + length)
    oscillator.connect(gain).connect(ctx.destination)
    oscillator.start(start)
    oscillator.stop(start + length)
  }

  useEffect(() => {
    function startAudio() {
      if (!audio.current.audio && !audio.current.ambient && !audio.current.music) return
      const AudioContext = window.AudioContext || window.webkitAudioContext
      if (!AudioContext) return
      context.current ??= new AudioContext()
      if (context.current.state === 'suspended') context.current.resume().catch(() => {})
    }
    window.addEventListener('pointerdown', startAudio)
    window.addEventListener('keydown', startAudio)
    return () => {
      window.removeEventListener('pointerdown', startAudio)
      window.removeEventListener('keydown', startAudio)
      context.current?.close().catch(() => {})
      context.current = null
    }
  }, [])

  useEffect(() => {
    if (!settings.music) return
    const timer = window.setInterval(() => {
      if (document.hidden) return
      const melody = [261.63, 329.63, 392, 523.25]
      melody.forEach((frequency, index) => note(frequency, .015, index * .44, .75))
    }, 4400)
    return () => window.clearInterval(timer)
  }, [settings.music])

  useEffect(() => {
    if (!settings.ambient) return
    const timer = window.setInterval(() => {
      const ctx = context.current
      if (document.hidden || !ctx || ctx.state !== 'running') return
      if (weather !== 'rain') {
        note(1050, .013, 0, .19)
        note(1440, .011, .18, .16)
      }
      const samples = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
      const channel = samples.getChannelData(0)
      for (let i = 0; i < channel.length; i++) channel[i] = Math.random() * 2 - 1
      const source = ctx.createBufferSource()
      source.buffer = samples
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = weather === 'rain' ? 1500 : 360
      const gain = ctx.createGain()
      const start = ctx.currentTime
      gain.gain.setValueAtTime(.001, start)
      gain.gain.linearRampToValueAtTime(weather === 'rain' ? .10 : .045, start + .6)
      gain.gain.linearRampToValueAtTime(.001, start + 2)
      source.connect(filter).connect(gain).connect(ctx.destination)
      source.start()
    }, 3900)
    return () => window.clearInterval(timer)
  }, [settings.ambient, weather])

  return (type, kind) => {
    if (!audio.current.audio) return
    if (type === 'pet' || type === 'feed') {
      const voice = { coop: 720, barn: 115, pigpen: 175, sheepfold: 220, duckpond: 290 }[kind] ?? 510
      note(voice, .036, 0, .28, 'triangle')
      note(voice * 1.16, .029, .12, .22, 'triangle')
      return
    }
    const base = { place: 392, move: 392, collect: 587.33, sell: 659.25, fish: 440 }[type] ?? 523.25
    note(base, .08)
    note(base * 1.25, .07, .08)
  }
}

export function Farm({ initialFarm, visitor = false }) {
  const [farm, setFarm] = useState(initialFarm)
  const [now, setNow] = useState(initialFarm.now)
  const [status, setStatus] = useState('loading')
  const [panel, setPanel] = useState(null)
  const [parcel, setParcel] = useState(initialFarm.parcels[0] ?? '1,1')
  const [grid, setGrid] = useState(false)
  const [edit, setEdit] = useState(false)
  const [groupMode, setGroupMode] = useState(false)
  const [group, setGroup] = useState([])
  const [placement, setPlacement] = useState(null)
  const [target, setTarget] = useState(null)
  const [hover, setHover] = useState(null)
  const [batch, setBatch] = useState(false)
  const [photo, setPhoto] = useState(false)
  const [pending, setPending] = useState(false)
  const [toast, setToast] = useState(null)
  const [canFullscreen, setCanFullscreen] = useState(false)
  const busy = useRef(false)
  const worldRoot = useRef(null)
  const stageRoot = useRef(null)
  const controller = useRef(null)
  const picker = useRef(null)
  const checkedWorker = useRef(null)
  const play = useFarmAudio(farm.settings ?? {}, farm.weather)
  const worldState = useMemo(() => ({ ...farm, now }), [farm, now])

  const visible = useMemo(() => farm.objects.filter(object => !object.stored), [farm.objects])
  const selectedGroup = useMemo(() => group.filter(id => visible.some(object => object.id === id)), [group, visible])
  const object = panel?.id ? visible.find(item => item.id === panel.id) : null
  const empty = visible.filter(item => isBed(item) && !item.crop && parcelAt(item.x, item.z) === parcel).map(item => item.id)
  const ready = visible.filter(item => isReady(item, now))
  const moving = useMemo(() => placement?.ids ? placement.ids.map(id => farm.objects.find(item => item.id === id)).filter(Boolean) : [],
    [farm.objects, placement?.ids])
  const point = target ?? hover
  const selectedTile = panel?.type === 'terrain' ? panel.tile : null
  const path = target?.path?.length ? target.path : null
  const valid = placement && point ? placementValid(farm, placement, point, moving, path || [point]) : false
  const batchCost = placement && !moving.length ? buildings[placement.kind].price * (path?.length || 1) : 0
  const worker = !visitor && ready.find(item => item.crop && visible.some(worker => worker.kind === 'worker' &&
    Math.abs(worker.x - item.x) + Math.abs(worker.z - item.z) <= 4))
  const workerKey = worker ? worker.id + ':' + worker.crop.readyAt : null

  useEffect(() => {
    const started = Date.now()
    const timer = window.setInterval(() => setNow(farm.now + Date.now() - started), 500)
    return () => window.clearInterval(timer)
  }, [farm.now])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), toast.error ? 6500 : 3400)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    setCanFullscreen(Boolean(document.fullscreenEnabled))
    const abort = new AbortController()
    async function start() {
      try {
        const { createFarmScene } = await import('../lib/farm-scene')
        if (abort.signal.aborted) return
        const scene = await createFarmScene(worldRoot.current, hit => picker.current?.(hit), abort.signal)
        if (abort.signal.aborted) {
          scene?.dispose()
          return
        }
        if (!scene) {
          setStatus('failed')
          setGrid(true)
          return
        }
        controller.current = scene
        setStatus('ready')
      } catch (error) {
        if (abort.signal.aborted) return
        console.error('Could not load 3D farm:', error)
        setStatus('failed')
        setGrid(true)
      }
    }
    start()
    return () => {
      abort.abort()
      controller.current?.dispose()
      controller.current = null
    }
  }, [])

  useEffect(() => {
    if (status !== 'ready') return
    const preview = placement && point ? { kind: placement.kind, x: point.x, z: point.z, rotation: placement.rotation, valid, path } : null
    if (preview && moving.length > 1) {
      preview.pieces = moving.map(item => ({
        kind: item.kind, x: point.x + item.x - moving[0].x, z: point.z + item.z - moving[0].z, rotation: item.rotation,
      }))
    }
    controller.current?.setState(worldState, {
      active: edit && !photo,
      preview,
      paint: batch && Boolean(placement) && !photo,
      selected: selectedGroup,
      selectedTile: !photo && !preview ? selectedTile : null,
      onHover: placement && !target ? setHover : undefined,
    })
  }, [worldState, status, edit, photo, placement, point, target, valid, path, batch, selectedGroup, selectedTile, moving])

  async function act(command, success, complete) {
    if (busy.current || visitor) return false
    busy.current = true
    setPending(true)
    setToast(null)
    try {
      const result = await runFarmAction(command)
      if (result.farm) {
        setFarm(result.farm)
        setNow(result.farm.now)
      }
      if (result.error) {
        setToast({ text: result.error, error: true })
        return false
      }
      if (success) {
        setToast({ text: success })
        play(command.type, farm.objects.find(object => object.id === command.id)?.kind)
      }
      complete?.(result)
      return true
    } catch {
      setToast({ text: '연결이 끊겼어요. 저장 상태를 새로고침해서 확인해 주세요.', error: true })
      return false
    } finally {
      busy.current = false
      setPending(false)
    }
  }

  useEffect(() => {
    if (pending || !workerKey || checkedWorker.current === workerKey) return
    checkedWorker.current = workerKey
    act({ type: 'view' }, '일꾼이 익은 작물을 창고에 담았어요.')
  }, [pending, workerKey])

  function open(type, values = {}) {
    setPanel({ type, ...values })
  }

  function selectParcel(key) {
    setParcel(key)
    const [x, z] = key.split(',').map(Number)
    controller.current?.setView({ x: x * PARCEL_SIZE + PARCEL_SIZE / 2, z: z * PARCEL_SIZE + PARCEL_SIZE / 2 })
    if (!placement) open('map')
  }

  function toggleEdit() {
    if (visitor) return
    setEdit(!edit)
    setPlacement(null)
    setTarget(null)
    setHover(null)
    setGroupMode(false)
    setGroup([])
    setBatch(false)
    setPanel(edit ? null : { type: 'shop' })
  }

  function beginPlacement(kind, ids) {
    const object = ids?.length === 1 ? farm.objects.find(item => item.id === ids[0]) : null
    setPlacement({ kind, ids, rotation: object?.rotation || 0 })
    setTarget(null)
    setHover(null)
    setBatch(false)
    setPanel(null)
  }

  function cancelPlacement() {
    setPlacement(null)
    setTarget(null)
    setHover(null)
    setBatch(false)
  }

  function confirmPlacement() {
    if (!placement || !target || !valid) return
    const { x, z } = target
    const { kind, rotation } = placement
    let command = { type: 'place', kind, x, z, rotation }
    if (path) command.path = path
    if (moving.length === 1) command = { type: moving[0].stored ? 'restore' : 'move', id: moving[0].id, x, z, rotation }
    if (moving.length > 1) {
      const [anchor] = moving
      command = {
        type: 'moveGroup',
        moves: moving.map(object => ({ id: object.id, x: x + object.x - anchor.x, z: z + object.z - anchor.z, rotation: object.rotation })),
      }
    }
    act(command, '농장에 배치했어요.', () => {
      setTarget(null)
      setHover(null)
      if (moving.length) {
        cancelPlacement()
        setGroup([])
        setGroupMode(false)
      }
    })
  }

  function pick(hit) {
    if (!hit || busy.current || photo) return
    const { x, z, id } = hit
    if (placement) {
      let path
      if (batch) {
        const points = [...(target?.path ?? []), ...(hit.path?.length ? hit.path : [{ x, z }])]
        path = Array.from(new Map(points.map(tile => [tile.x + ',' + tile.z, tile])).values())
      }
      const anchor = path?.[0] ?? hit
      setTarget({ x: anchor.x, z: anchor.z, path })
      return
    }
    const selected = id && visible.find(item => item.id === id)
    const tileParcel = selected ? parcelAt(selected.x, selected.z) : parcelAt(x, z)
    if (tileParcel) setParcel(tileParcel)
    if (tileParcel && !farm.parcels.includes(tileParcel)) {
      open('map')
      return
    }
    if (id && groupMode) {
      setGroup(current => current.includes(id) ? current.filter(value => value !== id) : current.length < 144 ? [...current, id] : current)
      return
    }
    if (!edit && !visitor && selected?.kind === 'truck') open('orders')
    else if (id) open('object', { id })
    else open('terrain', { tile: { x, z } })
  }
  picker.current = pick

  function rotate() {
    if (!placement || moving.length > 1) return
    setPlacement({ ...placement, rotation: (placement.rotation + 1) % 4 })
  }

  useEffect(() => {
    function handleKey(event) {
      if (event.key === 'Escape') {
        if (photo) setPhoto(false)
        else if (panel) setPanel(null)
        else if (placement) cancelPlacement()
        else if (edit) toggleEdit()
        return
      }
      if (event.target instanceof HTMLElement && (event.target.matches('input,select,textarea,[contenteditable]') || event.key === 'Enter' && event.target.matches('button,a'))) return
      const key = event.key.toLowerCase()
      const scene = controller.current
      const view = scene?.getView()
      if (!visitor && key === 'z' && (event.ctrlKey || event.metaKey) && edit && farm.undo) {
        event.preventDefault()
        act({ type: 'undo' }, '마지막 변경을 되돌렸어요.')
      } else if (event.ctrlKey || event.metaKey || event.altKey) {
        return
      } else if (key === 'b' && !visitor && !photo) {
        toggleEdit()
      } else if (key === 'r' && placement) {
        rotate()
      } else if (key === 'enter' && placement) {
        event.preventDefault()
        confirmPlacement()
      } else if (view && arrows[event.key]) {
        event.preventDefault()
        const [x, z] = arrows[event.key]
        scene.setView({ x: view.x + x * 2, z: view.z + z * 2 })
      } else if (view && ['q', 'e'].includes(key)) {
        scene.setView({ angle: view.angle + (key === 'q' ? -.22 : .22) })
      } else if (view && ['+', '=', '-'].includes(key)) {
        scene.setView({ zoom: view.zoom * (key === '-' ? .87 : 1.15) })
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  })

  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await stageRoot.current?.requestFullscreen()
    } catch {
      setToast({ text: '이 브라우저에서는 전체 화면을 열 수 없어요.', error: true })
    }
  }

  async function capture(share = false) {
    try {
      const url = controller.current?.capture()
      if (!url) throw new Error('Scene capture unavailable')
      if (share && navigator.share && navigator.canShare) {
        const bytes = Uint8Array.from(atob(url.split(',')[1]), byte => byte.charCodeAt(0))
        const files = [new File([bytes], 'muyaho-farm.png', { type: 'image/png' })]
        if (navigator.canShare({ files })) {
          await navigator.share({ title: '무야호농장', files })
          return
        }
      }
      const link = document.createElement('a')
      link.href = url
      link.download = 'muyaho-farm.png'
      link.click()
      setToast({ text: '농장 사진을 저장했어요.' })
    } catch (error) {
      if (error.name === 'AbortError') return
      setToast({ text: '사진을 만들 수 없어요.', error: true })
    }
  }

  function chooseGrid() {
    if (status === 'failed') return
    setGrid(!grid)
    setPanel(null)
  }

  function seed(ids) {
    open('seeds', { ids })
  }

  const panelTitle = panel?.type === 'object' ? object && objectName(object) :
    selectedTile ? terrainTileLabel(farm, selectedTile) : panelTitles[panel?.type]

  return (
    <main id="main" className={'farm-stage' + (edit ? ' editing' : '') + (photo ? ' photo' : '')} ref={stageRoot}>
      <div className={'farm-world ' + status} ref={worldRoot} aria-label="3D 농장 지도">
        {status === 'ready' && !photo && !grid && visible.map(item => {
          const ripe = isReady(item, now)
          const growing = item.crop && !ripe
          const selected = selectedGroup.includes(item.id) || object?.id === item.id
          const important = ['market', 'house', 'truck'].includes(item.kind) || !visitor && isBed(item) && item.id === empty[0]
          if (placement ? !growing && !ripe : !ripe && !growing && !selected && !important) return null
          const label = objectName(item)
          const time = growing ? remainingTime(item.crop.readyAt - now) : ''
          return <button type="button" key={item.id} data-point={item.id}
            className={'map-target' + (ripe ? ' ripe' : growing ? ' growing' : '') + (selected ? ' selected' : '') + (placement ? ' passive' : '')}
            aria-label={label + (ripe ? ' 생산 완료' : growing ? ' 수확까지 ' + time : '')} aria-pressed={selected} disabled={pending || Boolean(placement)}
            onClick={() => pick({ x: item.x, z: item.z, id: item.id })}>
            <span>{ripe ? '✦' : growing ? time : isBed(item) && !visitor && !edit ? '씨앗 심기' : label}</span>
          </button>
        })}
      </div>

      {grid && !photo && <div className="farm-grid-fallback">
        <TileGrid key={parcel} farm={farm} parcel={parcel} target={target ?? selectedTile} onPick={pick} />
        {status === 'failed' && <p>3D 화면을 열 수 없어 타일로 농장을 보여 드려요.</p>}
      </div>}
      {status === 'loading' && <div className="farm-loading" role="status">농장에 들어가는 중…</div>}

      {!photo && <>
        <header className="farm-hud">
          <div className="farm-identity">
            <span className="farm-emblem"><Mark /></span>
            <div className="farm-owner"><span>{visitor ? '무야호농장 · 방문 중' : '무야호농장'}</span><h1>{farm.name ?? farm.handle + '의 농장'}</h1></div>
            {visitor ? <span className="farm-visitor-level">Lv. {farm.level}</span> :
              <FarmButton className="farm-level" aria-label={'농장 기록, 레벨 ' + farm.level} onClick={() => open('progress')}>Lv. {farm.level}</FarmButton>}
          </div>
          <div className="farm-hud-right">
            {!visitor && <div className="coin-pouch" aria-label={farm.coins + ' 코인'}><span aria-hidden="true">✦</span>{farm.coins.toLocaleString('ko-KR')}</div>}
            <FarmButton icon="share" className="farm-square" aria-label="농장 방문" onClick={() => open('share')} />
            <FarmButton icon="settings" className="farm-square" aria-label="설정" onClick={() => open('settings')} />
          </div>
        </header>

        <aside className="farm-map-hud" aria-label="농장 지도와 시점">
          <div className="farm-map-preview">
            <div className="farm-map-title"><strong>농장 지도</strong><span>{farm.parcels.length} / {(MAP_SIZE / PARCEL_SIZE) ** 2}</span></div>
            <FarmMap farm={farm} parcel={parcel} choose={selectParcel} />
            {seasonNames[farm.season] && <div className="farm-map-weather">{seasonNames[farm.season]} · {weatherNames[farm.weather]}</div>}
          </div>
          <div className="farm-camera">
            <FarmButton icon="map" className="farm-square" aria-label="농장 지도" active={panel?.type === 'map'} onClick={() => open('map')} />
            <FarmButton icon="home" className="farm-square" aria-label="카메라 처음 위치" disabled={status !== 'ready'}
              onClick={() => controller.current?.resetView()} />
            <FarmButton icon="photo" className="farm-square" aria-label="사진 모드" disabled={status !== 'ready'}
              onClick={() => setPhoto(true)} />
            <FarmButton icon="help" className="farm-square" aria-label="농장 안내" onClick={() => open('help')} />
          </div>
        </aside>

        {!visitor && <nav className="farm-tools" aria-label="농장 도구">
          <FarmButton icon="build" className="farm-tool" aria-label="농장 편집" active={edit} onClick={toggleEdit}>{edit ? '편집 끝' : '편집'}</FarmButton>
          <FarmButton icon="collect" className="farm-tool" active={panel?.type === 'collect'} onClick={() => open('collect')}>수확{ready.length ? ' · ' + ready.length : ''}</FarmButton>
          <FarmButton icon="bag" className="farm-tool" active={panel?.type === 'bag'} onClick={() => open('bag')}>창고</FarmButton>
          <FarmButton icon="orders" className="farm-tool" active={panel?.type === 'orders'} onClick={() => open('orders')}>주문서</FarmButton>
        </nav>}

        {edit && <div className="farm-edit" aria-label="배치 도구">
          {placement ? <>
            <div className="farm-edit-label">
              <strong>{moving.length > 1 ? moving.length + '개 시설 옮기기' : buildings[placement.kind]?.name}</strong>
              <small>{target ? (valid ? '배치 가능' + (batchCost ? ' · ✦ ' + batchCost : '') : '배치할 수 없는 위치예요.') :
                batch ? '놓을 타일을 누르거나 길게 드래그하세요.' : '놓을 위치를 선택하세요.'}</small>
            </div>
            <div className="farm-actions">
              <FarmButton icon="rotate" disabled={moving.length > 1} onClick={rotate}>회전</FarmButton>
              {!moving.length && batchKinds.includes(placement.kind) && <FarmButton active={batch} onClick={() => {
                setBatch(!batch)
                setTarget(null)
              }}>여러 칸</FarmButton>}
              <button className="primary" type="button" disabled={!target || !valid || pending} onClick={confirmPlacement}>배치</button>
              <FarmButton aria-label="배치 취소" icon="close" onClick={cancelPlacement} />
            </div>
          </> : <div className="farm-actions">
            <FarmButton icon="build" active={panel?.type === 'shop'} onClick={() => open('shop')}>상점</FarmButton>
            <FarmButton active={groupMode} onClick={() => { setGroupMode(!groupMode); setGroup([]); setPanel(null) }}>여러 시설</FarmButton>
            {groupMode && <FarmButton disabled={!selectedGroup.length} onClick={() => beginPlacement(visible.find(item => item.id === selectedGroup[0]).kind, selectedGroup)}>옮기기 {selectedGroup.length}</FarmButton>}
            <FarmButton icon="undo" disabled={pending || !farm.undo} onClick={() => act({ type: 'undo' }, '마지막 변경을 되돌렸어요.')}>되돌리기</FarmButton>
          </div>}
        </div>}
      </>}

      {photo && <div className="farm-photo">
        <FarmButton icon="photo" onClick={() => capture()}>사진 저장</FarmButton>
        <FarmButton icon="share" onClick={() => capture(true)}>사진 공유</FarmButton>
        <FarmButton icon="close" onClick={() => setPhoto(false)}>사진 모드 닫기</FarmButton>
      </div>}

      {!photo && panel && panelTitle && <section className="farm-sheet" aria-labelledby="farm-sheet-title">
        <div className="farm-sheet-head">
          <h2 id="farm-sheet-title">{panelTitle}</h2>
          <FarmButton icon="close" className="farm-square" aria-label="닫기" onClick={() => setPanel(null)} />
        </div>
        <div className="farm-sheet-body">
          {panel.type === 'shop' && <Shop farm={farm} pending={pending} choose={beginPlacement} restore={item => beginPlacement(item.kind, [item.id])} />}
          {panel.type === 'bag' && <Inventory farm={farm} pending={pending} act={act} />}
          {panel.type === 'orders' && <Orders farm={farm} pending={pending} act={act} />}
          {panel.type === 'progress' && <Progress farm={farm} />}
          {panel.type === 'help' && <Help />}
          {panel.type === 'settings' && <Settings farm={farm} pending={pending} visitor={visitor} act={act} scene={controller.current} full={canFullscreen ? fullscreen : null} />}
          {panel.type === 'share' && <FarmSocial farm={farm} visitor={visitor} act={act} />}
          {panel.type === 'map' && <>
            <FarmMap farm={farm} parcel={parcel} choose={selectParcel} />
            <ParcelPanel key={parcel} farm={worldState} parcel={parcel} pending={pending} visitor={visitor} act={act} empty={empty} seed={seed} grid={grid}
              toggleGrid={status === 'ready' ? chooseGrid : undefined} />
          </>}
          {panel.type === 'seeds' && <Seeds farm={farm} pending={pending} ids={panel.ids}
            act={(command, success) => act(command, success, command.type === 'plant' ? () => setPanel(null) : undefined)} />}
          {panel.type === 'terrain' && <TerrainPanel farm={worldState} tile={panel.tile} pending={pending} act={act} visitor={visitor} />}
          {panel.type === 'object' && object && <ObjectPanel key={object.id} object={object} farm={farm} now={now} pending={pending} visitor={visitor} edit={edit}
            act={act} move={() => beginPlacement(object.kind, [object.id])}
            store={() => act({ type: 'store', id: object.id }, '시설을 보관했어요.', () => setPanel(null))} />}
          {panel.type === 'collect' && <>
            <p>{ready.length ? '생산이 끝난 시설 ' + ready.length + '개' : '아직 모을 생산물이 없어요.'}</p>
            <button type="button" className="primary" disabled={pending || !ready.length}
              onClick={() => act({ type: 'collect' }, '준비된 생산물을 모두 모았어요.')}>모두 모으기</button>
            <div className="farm-actions">
              {Object.entries(collectedKinds).map(([kind, name]) => <FarmButton key={kind} disabled={pending || !ready.some(item => collectKind(item) === kind)}
                onClick={() => act({ type: 'collect', kind }, name + '을 모았어요.')}>{name}</FarmButton>)}
              <FarmButton disabled={pending || !empty.length} onClick={() => seed(empty)}>빈 밭에 심기</FarmButton>
            </div>
          </>}
        </div>
      </section>}

      <p className={'farm-toast' + (toast?.error ? ' error' : '')} aria-live="polite">{pending ? '저장 중…' : toast?.text}</p>
    </main>
  )
}
