'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { runFarmAction } from './actions'
import { useFarmFieldQueue } from './farm-field-queue'
import { Mark } from './art'
import { FarmSocial } from './farm-social'
import { batchKinds, buildings, crops, recipes } from '../lib/farm-catalog.mjs'
import { parcelAt, canPlace, footprint, inMap, objectsUnder, terrainAt, MAP_SIZE, PARCEL_SIZE } from '../lib/farm-layout.mjs'
import { goldenCheck } from '../lib/farm-luck.mjs'
import { cropIdentity } from '../lib/farm-game.mjs'
import {
  FarmButton, FarmMap, TileGrid, Shop, Seeds, Inventory, Orders, Progress, ObjectPanel, Peddler,
  Settings, ParcelPanel, TerrainPanel, Help, objectName, terrainTileLabel, isReady, remainingTime, productBook, josa, inSeason,
} from './farm-panels'
import './farm.css'

const panelTitles = {
  shop: '건설 상점', map: '농장 지도', bag: '창고', orders: '주문서', settings: '설정',
  progress: '농장 기록', seeds: '씨앗 주머니', collect: '생산물 모으기', help: '농장 안내', share: '농장 방문', peddler: '떠돌이 상인',
}
const terrainWords = { tree: '나무', rock: '바위', water: '물' }
const milestones = [['harvested', '첫 수확'], ['collected', '첫 가축 생산물'], ['expanded', '첫 확장']]
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

// 놓을 수 없는 이유를 잠긴 땅·겹침·장애물·코인 부족으로 구분해 짧게 알려 준다
function placementIssue(farm, placement, point, moving, path = [point]) {
  const ids = moving.map(object => object.id)
  const pieces = moving.length
    ? moving.map(object => ({ kind: object.kind, x: point.x + object.x - moving[0].x, z: point.z + object.z - moving[0].z,
      rotation: moving.length === 1 ? placement.rotation : object.rotation }))
    : path.map(tile => ({ kind: placement.kind, x: tile.x, z: tile.z, rotation: placement.rotation }))
  const others = farm.objects.filter(object => !object.stored && !ids.includes(object.id))
  for (const piece of pieces) {
    for (const cell of footprint(piece.kind, piece.x, piece.z, piece.rotation)) {
      if (!inMap(cell.x, cell.z)) return { tile: piece, text: '지도 밖이에요' }
      if (!farm.parcels.includes(parcelAt(cell.x, cell.z))) return { tile: cell, text: '잠긴 땅 · 지도에서 열 수 있어요' }
      const hit = others.find(object => footprint(object.kind, object.x, object.z, object.rotation).some(spot => spot.x === cell.x && spot.z === cell.z))
      if (hit) return { tile: cell, text: josa(objectName(hit), '과', '와') + ' 겹쳐요' }
      const obstacle = !farm.cleared?.includes(cell.x + ',' + cell.z) && terrainAt(cell.x, cell.z).obstacle
      if (obstacle && !(piece.kind === 'bridge' && obstacle === 'water')) return { tile: cell, text: josa(terrainWords[obstacle], '이', '가') + ' 있어요' }
    }
  }
  if (!moving.length && farm.coins < buildings[placement.kind].price * path.length) {
    return { tile: point, text: '코인이 부족해요 · ✦ ' + buildings[placement.kind].price * path.length }
  }
  return { tile: point, text: '여기에는 놓을 수 없어요' }
}

// 접속했을 때 지금 할 일을 한 줄로 알려 준다
const recipeProduct = key => recipes[key]?.product

function returnSummary(farm, now) {
  const ready = farm.objects.filter(object => isReady(object, now))
  const parts = []
  const fields = {}
  for (const object of ready) if (object.crop) fields[object.crop.kind] = (fields[object.crop.kind] ?? 0) + 1
  for (const [kind, count] of Object.entries(fields)) parts.push(`${crops[kind]?.name} ${count}칸이 익었고`)
  for (const object of ready) {
    const item = buildings[object.kind]
    if (item?.product) parts.push(`${objectName(object)}에 ${productBook[item.product]?.name} ${object.level || 1}개가 있고`)
    else if (!object.crop) parts.push(`${objectName(object)}에 가공품이 완성됐고`)
  }
  if (!parts.length) {
    const next = farm.objects.filter(object => object.crop && !object.stored).map(object => object.crop.readyAt - now).sort((a, b) => a - b)[0]
    return { text: next ? `천천히 둘러보세요. 다음 수확은 ${remainingTime(next)} 뒤예요.` : '빈 밭에 씨앗을 심어 볼까요?', target: null }
  }
  // '…익었고, …있고' 의 마지막 '고'를 '어요'로 맺는다
  return { text: parts.slice(0, 3).join(', ').replace(/고$/, '어요'), target: ready[0] }
}

// 곧 준비되는 것 3줄: 작물은 종류별로 묶고, 시설은 하나씩 보여 준다
function upcoming(objects, now) {
  const entries = []
  const fields = {}
  for (const object of objects) {
    if (object.crop) {
      const entry = fields[object.crop.kind] ??= { key: 'crop:' + object.crop.kind, icon: crops[object.crop.kind]?.icon,
        name: crops[object.crop.kind]?.name, count: 0, at: Infinity, target: object }
      entry.count++
      if (object.crop.readyAt < entry.at) Object.assign(entry, { at: object.crop.readyAt, target: object })
      continue
    }
    const product = buildings[object.kind]?.product
    const at = product ? object.readyAt : object.queue?.[0]?.readyAt
    if (!at) continue
    const item = productBook[product ?? recipeProduct(object.queue[0].recipe)]
    entries.push({ key: object.id, icon: item?.icon, name: item?.name, count: product ? object.level || 1 : object.queue.filter(job => job.readyAt <= Math.max(now, at)).length, at, target: object })
  }
  return [...Object.values(fields), ...entries].sort((a, b) => a.at - b.at).slice(0, 3)
}

// 코인이 바뀌면 숫자가 또르르 올라간다 (움직임을 끄면 바로 바뀐다)
function useTicker(value, motion) {
  const [shown, setShown] = useState(value)
  const current = useRef(value)
  useEffect(() => {
    const from = current.current
    if (from === value || !motion || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      current.current = value
      setShown(value)
      return
    }
    const start = performance.now()
    let frame
    const step = time => {
      const t = Math.min(1, (time - start) / 450)
      current.current = Math.round(from + (value - from) * (1 - (1 - t) ** 3))
      setShown(current.current)
      if (t < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [value, motion])
  return shown
}

// 성공한 명령에서 생긴 깜짝 보상을 한 줄로 덧붙인다
function bonusText(before, after, command) {
  const notes = []
  for (const [item, count] of Object.entries(after.inventory ?? {})) {
    if (item.startsWith('golden_') && count > (before.inventory?.[item] ?? 0)) notes.push('✨ ' + productBook[item]?.name + '!')
  }
  const harvested = (after.stats?.harvested ?? 0) - (before.stats?.harvested ?? 0)
  if (command.type === 'collect' && command.ids && harvested >= 10) notes.push('🔥 콤보 ×' + harvested + ' 보너스')
  if (after.lastFind && JSON.stringify(after.lastFind) !== JSON.stringify(before.lastFind)) notes.push('🍀 ' + productBook[after.lastFind.item]?.name + ' 발견!')
  if (command.type !== 'trade' && after.gifted?.length && JSON.stringify(after.gifted) !== JSON.stringify(before.gifted)) {
    notes.push('🎁 ' + buildings[after.gifted.at(-1)]?.name + ' 선물이 보관함에 왔어요')
  }
  return notes.length ? ' ' + notes.join(' ') : ''
}

function FishingGame({ onCatch, onMiss, onClose }) {
  const [phase, setPhase] = useState('wait')
  useEffect(() => {
    const bite = window.setTimeout(() => setPhase('bite'), 900 + Math.random() * 1600)
    return () => window.clearTimeout(bite)
  }, [])
  useEffect(() => {
    if (phase !== 'bite') return
    const away = window.setTimeout(onMiss, 1500)
    return () => window.clearTimeout(away)
  }, [phase])
  return <div className="farm-fishing" role="dialog" aria-modal="true" aria-label="낚시">
    <div className={'farm-bobber ' + phase} aria-hidden="true"><span>🎣</span><b>{phase === 'bite' ? '💦' : '〰'}</b></div>
    <p role="status">{phase === 'bite' ? '찌가 쑥 가라앉았어요! 지금!' : '찌를 지켜보세요…'}</p>
    <div className="farm-actions">
      <button type="button" className="primary" autoFocus onClick={() => phase === 'bite' ? onCatch() : onMiss()}>낚아채기</button>
      <FarmButton onClick={onClose}>그만두기</FarmButton>
    </div>
  </div>
}

function useFarmAudio(settings, weather) {
  const context = useRef(null)
  const audio = useRef(settings)
  const last = useRef({})
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
    // 연속 입력 때 소리가 겹쳐 커지지 않도록 같은 소리는 잠깐 쉬었다 낸다
    const stamp = performance.now()
    const key = type + ':' + kind
    if (stamp - (last.current[key] ?? 0) < 140) return
    last.current[key] = stamp
    if (type === 'pet' || type === 'feed') {
      const voice = { coop: 720, barn: 115, pigpen: 175, sheepfold: 220, duckpond: 290 }[kind] ?? 510
      note(voice, .036, 0, .28, 'triangle')
      note(voice * 1.16, .029, .12, .22, 'triangle')
      return
    }
    if (type === 'plant') return note(880, .05, 0, .07, 'triangle'), note(1175, .035, .05, .06, 'triangle')
    if (type === 'collect' && kind === 'plot') return note(1320, .04, 0, .09, 'sawtooth'), note(990, .035, .06, .1, 'sawtooth')
    if (type === 'collect' && ['barn', 'dairy'].includes(kind)) return note(330, .06, 0, .22), note(392, .05, .1, .25)
    if (type === 'place' && batchKinds.includes(kind) && kind !== 'plot') return note(196, .08, 0, .09, 'square'), note(165, .06, .07, .08, 'square')
    if (type === 'sell' || type === 'order') return note(1568, .05, 0, .12), note(2093, .045, .09, .16)
    const base = { place: 392, move: 392, collect: 587.33, fish: 440 }[type] ?? 523.25
    note(base, .08)
    note(base * 1.25, .07, .08)
  }
}

export function Farm({ initialFarm, accountId, visitor = false }) {
  const fields = useFarmFieldQueue(initialFarm, accountId)
  const { farm, confirmed, settled } = fields
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
  const [tool, setTool] = useState(null)
  const [summary, setSummary] = useState(() => visitor ? null : returnSummary(initialFarm, initialFarm.now))
  const [gift, setGift] = useState(null)
  const [fishing, setFishing] = useState(null)
  const [coinPop, setCoinPop] = useState(null)
  const toon = Boolean(farm.settings?.toon)
  const coins = useTicker(farm.coins, farm.settings?.motion !== false)
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
  const issue = placement && point && !valid ? placementIssue(farm, placement, point, moving, path || [point]) : null
  const batchCost = placement && !moving.length ? buildings[placement.kind].price * (path?.length || 1) : 0
  const worker = !visitor && ready.find(item => item.crop && visible.some(worker => worker.kind === 'worker' &&
    Math.abs(worker.x - item.x) + Math.abs(worker.z - item.z) <= 4))
  const workerKey = worker ? worker.id + ':' + worker.crop.readyAt : null

  useEffect(() => {
    const started = Date.now()
    setNow(confirmed.now)
    const timer = window.setInterval(() => setNow(confirmed.now + Date.now() - started), 500)
    return () => window.clearInterval(timer)
  }, [confirmed.now])

  useEffect(() => {
    if (!settled) return
    const { before, after, error } = settled
    if (after.level > before.level && after.levelGift) setGift(after.levelGift)
    if (after.coins > before.coins) setCoinPop({ value: after.coins - before.coins, key: Date.now() })
    const photo = milestone(before, after)
    const bonus = bonusText(before, after, { type: 'collect' }).trim()
    if (error) setToast({ text: error, error: true })
    else if (photo || bonus) setToast({ text: bonus || photo, photo })
  }, [settled])

  useEffect(() => {
    if (!toast) return
    // 버튼이 달린 알림은 읽고 누를 시간을 넉넉히 준다
    const timer = window.setTimeout(() => setToast(null), toast.retry || toast.reload || toast.photo ? 9000 : toast.error ? 6500 : 3400)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (!coinPop) return
    const timer = window.setTimeout(() => setCoinPop(null), 1300)
    return () => window.clearTimeout(timer)
  }, [coinPop])

  // 툰 셰이딩을 바꾸면 재질을 새로 만들어야 해서 장면을 다시 연다
  useEffect(() => {
    setCanFullscreen(Boolean(document.fullscreenEnabled))
    const abort = new AbortController()
    async function start() {
      try {
        const { createFarmScene } = await import('../lib/farm-scene')
        if (abort.signal.aborted) return
        const scene = await createFarmScene(worldRoot.current, hit => picker.current?.(hit), abort.signal, initialFarm, { toon })
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
      setStatus('loading')
    }
  }, [toon])

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
      paint: (batch && Boolean(placement) || Boolean(tool) && !edit) && !photo,
      selected: selectedGroup,
      selectedTile: !photo && !preview ? selectedTile : null,
      onHover: placement && !target ? setHover : undefined,
    })
  }, [worldState, status, edit, photo, placement, point, target, valid, path, batch, selectedGroup, selectedTile, moving, tool])

  async function act(command, success, complete, effectIds) {
    if (busy.current || visitor) return false
    const ids = command.ids ?? (command.id ? [command.id] : [])
    const selected = new Set(ids)
    const inScope = object => (selected.size === 0 || selected.has(object.id)) &&
      (!command.parcel || parcelAt(object.x, object.z) === command.parcel)
    const readyInScope = command.type === 'collect' ? ready.filter(inScope) : []
    const fieldCollect = command.type === 'collect' && (command.kind === 'plot' ||
      !command.kind && readyInScope.length > 0 && readyInScope.every(isBed))
    if (command.type === 'plant' || fieldCollect) {
      const result = fields.enqueue((shown, at) => {
        if (!fieldCollect) return { type: 'plant', ids, crop: command.crop }
        const targets = shown.objects.filter(object => isBed(object) && !object.stored && object.crop?.readyAt <= at && inScope(object))
        if (!targets.length) return null
        return { type: 'collect', ids: command.ids ? targets.map(object => object.id) : undefined,
          fieldTargets: Object.fromEntries(targets.map(object => [object.id, cropIdentity(object)])) }
      })
      if (result.error) {
        setToast({ text: result.error, error: true })
        return false
      }
      play(command.type, 'plot')
      controller.current?.react(command.type, fieldCollect ? Object.keys(result.command.fieldTargets) : ids)
      if (!result.local) setToast({ text: '동기화되기 전에 화면을 닫으면 밭 작업이 사라질 수 있어요.', error: true })
      else if (fieldCollect && result.command.ids?.length >= 10) setToast({ text: '🔥 콤보 ×' + result.command.ids.length })
      complete?.()
      return true
    }
    // 낚시는 찌가 가라앉을 때 낚아채는 짧은 연출 뒤에 보낸다 (놓쳐도 아무것도 쓰지 않는다)
    if (command.type === 'fish' && !command.hooked) {
      setFishing({ command: { ...command, hooked: true }, success })
      return false
    }
    busy.current = true
    setPending(true)
    setToast(null)
    // 같은 요청을 다시 보내도 서버가 한 번만 반영하도록 요청마다 고유 번호를 붙인다
    const request = command.type === 'view' || command.requestId ? command
      : { ...command, requestId: crypto.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2) }
    const before = farm
    try {
      if (!await fields.flush()) return false
      const result = await runFarmAction(request)
      if (result.farm) {
        fields.accept(result.farm)
      }
      if (result.error) {
        const conflict = /다른 화면|저장하지 못했/.test(result.error)
        setToast({ text: result.error, error: true, retry: conflict ? request : null, reload: conflict })
        return false
      }
      if (success) {
        const kind = command.kind ?? before.objects.find(object => object.id === command.id)?.kind ?? (command.ids && 'plot')
        const after = result.farm
        const caught = command.type === 'fish' && after.lastCatch
        const record = caught && caught.size > (before.records?.[caught.item] ?? 0) && before.records?.[caught.item]
        const text = caught ? '🎣 ' + productBook[caught.item]?.name + ' ' + caught.size + 'cm를 낚았어요' + (record ? ' · 새 기록!' : '') : success
        setToast({ text: text + bonusText(before, after, command) + ' · 저장됨', photo: milestone(before, after) })
        if (after.level > before.level && after.levelGift) setGift(after.levelGift)
        if (after.coins > before.coins) setCoinPop({ value: after.coins - before.coins, key: Date.now() })
        play(command.type, kind)
        controller.current?.react(command.type, effectIds ?? command.ids ?? (command.id ? [command.id] : []))
      }
      complete?.(result)
      return true
    } catch {
      setToast({ text: '연결이 끊겼어요. 저장됐는지 확인할 수 없어요.', error: true, retry: request, reload: true })
      return false
    } finally {
      busy.current = false
      setPending(false)
    }
  }

  function milestone(before, after) {
    const reached = milestones.find(([stat]) => !before.stats?.[stat] && after?.stats?.[stat])
    return reached?.[1] ?? null
  }

  function retry(command) {
    act(command, '다시 보낸 작업을 반영했어요')
  }

  useEffect(() => {
    if (pending || fields.hasQueued || !workerKey || checkedWorker.current === workerKey) return
    checkedWorker.current = workerKey
    act({ type: 'view' }, '일꾼이 익은 작물을 창고에 담았어요.')
  }, [pending, fields.hasQueued, workerKey])

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
    setTool(null)
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
    if (tool && !edit && !visitor) {
      sweep(hit.path?.length ? hit.path : [{ x, z }])
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
    // 평소에는 오브젝트를 바로 만진다: 익은 밭·생산 완료 시설은 수확, 빈 밭은 씨앗, 판매대·농가는 창고, 트럭은 주문
    if (!edit && !visitor && selected) {
      if (isReady(selected, now) && (selected.crop || buildings[selected.kind]?.product)) {
        act({ type: 'collect', id }, objectName(selected) + '에서 거뒀어요.')
        return
      }
      if (isBed(selected) && !selected.crop) return seed([id])
      if (selected.kind === 'truck') return open('orders')
      if (['market', 'house'].includes(selected.kind)) return open('bag')
    }
    if (id) open('object', { id })
    else open('terrain', { tile: { x, z } })
  }

  // 씨앗·낫을 고른 상태에서만 쓸고 지나간 밭을 한 번씩 처리한다
  function sweep(tiles) {
    const beds = objectsUnder(farm, tiles).filter(isBed)
    if (tool === 'harvest') {
      const ids = beds.filter(item => item.crop?.readyAt <= now).map(item => item.id)
      if (ids.length) act({ type: 'collect', ids }, '작물 ' + ids.length + '칸을 거뒀어요.')
      else setToast({ text: '지나간 밭에 익은 작물이 없어요.' })
      return
    }
    const crop = crops[tool.crop]
    const affordable = Math.floor(farm.coins / crop.seed)
    const ids = beds.filter(item => !item.crop).map(item => item.id).slice(0, affordable)
    if (ids.length) act({ type: 'plant', ids, crop: tool.crop }, crop.name + ' ' + ids.length + '칸을 심었어요.')
    else setToast({ text: affordable ? '지나간 곳에 빈 밭이 없어요.' : '씨앗을 살 코인이 부족해요.' })
  }

  function chooseTool(next) {
    setTool(current => JSON.stringify(current) === JSON.stringify(next) ? null : next)
    setPanel(null)
  }
  picker.current = pick

  function rotate() {
    if (!placement || moving.length > 1) return
    setPlacement({ ...placement, rotation: (placement.rotation + 1) % 4 })
  }

  useEffect(() => {
    function handleKey(event) {
      if (event.key === 'Escape') {
        if (fishing) setFishing(null)
        else if (gift) setGift(null)
        else if (photo) setPhoto(false)
        else if (tool) setTool(null)
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

  const goldenOf = goldenCheck(farm)
  const soon = upcoming(visible, now)
  const timerGroups = {}
  for (const item of visible) {
    if (item.crop) {
      const key = (isReady(item, now) ? 'ripe:' : '') + item.crop.kind + ':' + parcelAt(item.x, item.z)
      timerGroups[key] = (timerGroups[key] ?? 0) + 1
    }
  }
  const seedChoices = [...new Set([...(farm.favorites ?? []), 'wheat', 'carrot'])].filter(crop => crops[crop] && farm.level >= crops[crop].level).slice(0, 3)
  const guideStep = visitor || farm.settings?.guide === false ? null
    : !farm.stats?.planted ? 0 : !farm.stats?.harvested ? 1 : !(farm.stats?.sold || farm.stats?.orders) ? 2 : null
  const guideNotes = [
    ['씨앗을 심어 보세요', '아래 도구에서 밀을 고르고 빈 밭을 쓸어 보거나, 빈 밭을 눌러 씨앗을 고르세요.'],
    ['익으면 거둬요', '밭 위에 수확 표시가 뜨면 눌러서 바로 거두거나, 낫을 고르고 밭을 쓸어요.'],
    ['팔거나 주문에 보내요', '판매대를 눌러 팔거나, 트럭을 눌러 장터 소량 판매 주문을 채워 보세요.'],
  ]

  const night = status === 'ready' && controller.current?.isNight?.()
  const unlocks = gift ? [...Object.values(buildings), ...Object.values(crops)].filter(item => item.level === gift.level && !item.gift) : []
  const panelTitle = panel?.type === 'object' ? object && objectName(object) :
    selectedTile ? terrainTileLabel(farm, selectedTile) : panelTitles[panel?.type]

  return (
    <main id="main" className={'farm-stage' + (edit ? ' editing' : '') + (photo ? ' photo' : '') + (farm.settings?.motion === false ? ' calm' : '')} ref={stageRoot}>
      <div className={'farm-world ' + status} ref={worldRoot} aria-label="3D 농장 지도">
        {status === 'ready' && !photo && !grid && visible.map(item => {
          const ripe = isReady(item, now)
          const growing = item.crop && !ripe
          const selected = selectedGroup.includes(item.id) || object?.id === item.id
          // 가축 위 감정 말풍선: 쓰다듬으면 ♥, 밤에는 💤
          const mood = !ripe && !selected && !placement && buildings[item.kind]?.animalModel &&
            (now - (item.petAt ?? 0) < 4000 ? '♥' : night ? '💤' : null)
          if (mood) return <span key={item.id} data-point={item.id} className={'farm-mood' + (mood === '♥' ? ' love' : '')} aria-hidden="true">{mood}</span>
          const golden = ripe && goldenOf(item)
          const important = ['market', 'house', 'truck'].includes(item.kind) || !visitor && isBed(item) && item.id === empty[0]
          if (placement ? !growing && !ripe : !ripe && !growing && !selected && !important) return null
          const label = objectName(item)
          const time = growing ? remainingTime(item.crop.readyAt - now) : ''
          const group = item.crop ? (ripe ? 'ripe:' : '') + item.crop.kind + ':' + parcelAt(item.x, item.z) : undefined
          const icon = item.crop ? crops[item.crop.kind]?.icon : productBook[buildings[item.kind]?.product]?.icon
          const count = group && <b className="map-group-count">×{timerGroups[group]}</b>
          return <button type="button" key={item.id} data-point={item.id} data-group={group}
            className={'map-target' + (ripe ? ' ripe' : growing ? ' growing' : '') + (golden ? ' golden' : '') + (selected ? ' selected' : '') + (placement ? ' passive' : '')}
            aria-label={label + (golden ? ' 황금 작물' : '') + (ripe ? ' 생산 완료' : growing ? ' 수확까지 ' + time : '')} aria-pressed={selected} disabled={pending || Boolean(placement)}
            onClick={event => {
              // 멀리서 묶인 수확 표시는 묶음 전체를 한 번에 거둔다
              if (ripe && group && event.currentTarget.classList.contains('far') && !visitor && !edit) {
                const ids = visible.filter(other => other.crop && isReady(other, now) && 'ripe:' + other.crop.kind + ':' + parcelAt(other.x, other.z) === group).map(other => other.id)
                act({ type: 'collect', ids }, '작물 ' + ids.length + '칸을 거뒀어요.')
              } else pick({ x: item.x, z: item.z, id: item.id })
            }}>
            <span>{ripe ? <>{golden ? '✨' : icon ?? '✦'}<i className="ripe-word"> 수확</i>{count}</> : growing ? <>{icon} {time}{count}</> :
              isBed(item) && !visitor && !edit ? '씨앗 심기' : label}</span>
          </button>
        })}
        {issue && edit && <p className="placement-issue" data-tile={issue.tile.x + ',' + issue.tile.z} role="status">{issue.text}</p>}
        {status === 'ready' && !visitor && !photo && !edit && farm.peddlerOffer && !farm.peddlerOffer.done &&
          <button type="button" className="farm-peddler-tag" data-tile="16,17" onClick={() => open('peddler')}>🛒 떠돌이 상인</button>}
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
            {!visitor && <div className="coin-pouch" aria-label={farm.coins + ' 코인'}><span aria-hidden="true">✦</span>{coins.toLocaleString('ko-KR')}
              {coinPop && <b key={coinPop.key} className="coin-pop" aria-hidden="true">+{coinPop.value.toLocaleString('ko-KR')}</b>}</div>}
            {visitor && farm.charm && <span className="farm-visitor-level">🌸 {farm.charm.name}</span>}
            <FarmButton icon="share" className="farm-square" aria-label="농장 방문" onClick={() => open('share')} />
            <FarmButton icon="settings" className="farm-square" aria-label="설정" onClick={() => open('settings')} />
          </div>
        </header>

        {summary && <div className="farm-summary" role="status">
          <button type="button" className="farm-summary-text" disabled={!summary.target || status !== 'ready'} onClick={() => {
            controller.current?.setView({ x: summary.target.x + 1, z: summary.target.z + 1, zoom: 1.7 })
            setSummary(null)
          }}>{summary.text}{summary.target && <small> · 보러 가기</small>}</button>
          <FarmButton icon="close" className="farm-square" aria-label="요약 닫기" onClick={() => setSummary(null)} />
        </div>}

        {guideStep !== null && !summary && <aside className="farm-guide" aria-label="우편함 쪽지">
          <strong>📮 우편함 쪽지 {guideStep + 1}/3 · {guideNotes[guideStep][0]}</strong>
          <p>{guideNotes[guideStep][1]}</p>
          <button type="button" disabled={pending} onClick={() => act({ type: 'setSettings', settings: { guide: false } })}>쪽지 그만 보기</button>
        </aside>}

        {!visitor && !edit && !panel && !summary && guideStep === null && status === 'ready' && soon.length > 0 && <aside className="farm-soon" aria-label="곧 준비되는 것">
          {soon.map(entry => <button type="button" key={entry.key} className={entry.at <= now ? 'ready' : ''}
            onClick={() => controller.current?.setView({ x: entry.target.x + 1, z: entry.target.z + 1, zoom: 1.7 })}>
            {entry.icon} {entry.name} {entry.count}{entry.target.crop ? '칸' : '개'} · <b>{entry.at <= now ? '준비됨' : remainingTime(entry.at - now)}</b>
          </button>)}
        </aside>}

        <aside className="farm-map-hud" aria-label="농장 지도와 시점">
          <div className="farm-camera">
            <FarmButton icon="map" className="farm-square" aria-label="농장 지도" active={panel?.type === 'map'} onClick={() => open('map')} />
            <FarmButton icon="home" className="farm-square" aria-label="카메라 처음 위치" disabled={status !== 'ready'}
              onClick={() => controller.current?.resetView()} />
            <FarmButton icon="photo" className="farm-square" aria-label="사진 모드" disabled={status !== 'ready'}
              onClick={() => setPhoto(true)} />
            <FarmButton icon="help" className="farm-square" aria-label="농장 안내" onClick={() => open('help')} />
          </div>
        </aside>

        {!visitor && !edit && !panel && status === 'ready' && <div className="farm-quick" role="toolbar" aria-label="쓸어서 심기와 수확">
          <FarmButton active={tool === 'harvest'} onClick={() => chooseTool('harvest')}>🌾 낫</FarmButton>
          {seedChoices.map(crop => <FarmButton key={crop} active={tool?.crop === crop} disabled={farm.coins < crops[crop].seed}
            onClick={() => chooseTool({ crop })}>{crops[crop].icon} {crops[crop].name}{inSeason(farm, crop) ? ' · 제철' : ''}</FarmButton>)}
          {tool && <small>{tool === 'harvest' ? '익은 밭을 손가락으로 쓸어 거둬요' : '빈 밭을 쓸어 심어요 · 칸당 ✦ ' + crops[tool.crop].seed}</small>}
        </div>}

        {!visitor && <nav className="farm-tools" aria-label="농장 도구">
          <FarmButton icon="build" className="farm-tool" aria-label="농장 편집" active={edit} onClick={toggleEdit}>{edit ? '편집 끝' : '편집'}</FarmButton>
          <FarmButton icon="collect" className="farm-tool" active={panel?.type === 'collect'} onClick={() => open('collect')}>수확{ready.length ? ' · ' + ready.length : ''}</FarmButton>
          <FarmButton icon="bag" className="farm-tool" active={panel?.type === 'bag'} onClick={() => open('bag')}>창고</FarmButton>
          <FarmButton icon="orders" className="farm-tool" active={panel?.type === 'orders'} onClick={() => open('orders')}>주문서</FarmButton>
        </nav>}

        {edit && <div className="farm-edit" aria-label="배치 도구">
          {placement ? <>
            <div className="farm-edit-label">
              <strong>{moving.length > 1 ? moving.length + '개 시설 옮기기' : buildings[placement.kind]?.name} · 미리보기</strong>
              <small>{target ? (valid ? '배치 가능 · 배치를 눌러 확정' + (batchCost ? ' · ✦ ' + batchCost : '') : issue?.text) :
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
        <p>사진은 이 기기에만 저장돼요. 공유를 누를 때만 다른 사람이 볼 수 있어요.</p>
        {['1', '2', '3'].filter(slot => farm.views?.[slot]).map(slot => <FarmButton key={slot}
          onClick={() => controller.current?.setView(farm.views[slot])}>같은 자리 {slot}</FarmButton>)}
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
          {panel.type === 'bag' && <Inventory farm={farm} pending={pending} act={act} openObject={id => open('object', { id })} />}
          {panel.type === 'orders' && <Orders farm={farm} pending={pending} act={act} />}
          {panel.type === 'peddler' && <Peddler farm={farm} pending={pending} act={act} />}
          {panel.type === 'progress' && <Progress farm={farm} />}
          {panel.type === 'help' && <Help />}
          {panel.type === 'settings' && <Settings farm={farm} pending={pending} visitor={visitor} act={act} scene={controller.current} full={canFullscreen ? fullscreen : null} />}
          {panel.type === 'share' && <FarmSocial farm={farm} visitor={visitor} act={act} scene={controller.current} />}
          {panel.type === 'map' && <>
            <p>{farm.parcels.length} / {(MAP_SIZE / PARCEL_SIZE) ** 2} 구역{seasonNames[farm.season] ? ' · ' + seasonNames[farm.season] + ' · ' + weatherNames[farm.weather] : ''}</p>
            <FarmMap farm={worldState} parcel={parcel} choose={selectParcel} />
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
              onClick={() => act({ type: 'collect' }, '준비된 생산물을 모두 모았어요.', undefined, ready.map(item => item.id))}>모두 모으기</button>
            <div className="farm-actions">
              {Object.entries(collectedKinds).map(([kind, name]) => <FarmButton key={kind} disabled={pending || !ready.some(item => collectKind(item) === kind)}
                onClick={() => act({ type: 'collect', kind }, name + '을 모았어요.', undefined, ready.filter(item => collectKind(item) === kind).map(item => item.id))}>{name}</FarmButton>)}
              <FarmButton disabled={pending || !empty.length} onClick={() => seed(empty)}>빈 밭에 심기</FarmButton>
            </div>
            <h3>넓은 농장 돌보기</h3>
            <p>{visible.some(item => item.kind === 'worker') ? '일꾼 오두막 주변 4칸의 익은 작물은 접속할 때 자동으로 거둬요.' : '일꾼 오두막(Lv. 4)을 두면 주변 작물을 자동으로 거둬요.'}{' '}
              {visible.some(item => item.kind === 'sprinkler') ? '스프링클러 3칸 안의 밭은 20% 빨리 자라요.' : '스프링클러(Lv. 3)는 주변 밭을 20% 빨리 키워요.'}{' '}
              지도에서 구역을 골라 한 번에 거둘 수도 있어요.</p>
            <div className="farm-actions">
              <FarmButton onClick={() => open('map')}>구역별 수확</FarmButton>
              <FarmButton onClick={() => { setEdit(true); open('shop') }}>시설 보러 가기</FarmButton>
            </div>
          </>}
        </div>
      </section>}

      {gift && <div className="farm-gift" role="dialog" aria-modal="true" aria-labelledby="farm-gift-title">
        <div className={'farm-gift-card' + (gift.open ? ' open' : '')}>
          <span className="farm-gift-box" aria-hidden="true">{gift.open ? '🎉' : '🎁'}</span>
          <h2 id="farm-gift-title">Lv. {gift.level} 달성!</h2>
          {gift.open ? <>
            <p>선물 상자에서 ✦ {gift.coins.toLocaleString('ko-KR')}이 나왔어요.</p>
            {unlocks.length > 0 && <p>새로 열렸어요: {unlocks.map(item => item.icon + ' ' + item.name).join(', ')}</p>}
            <button type="button" className="primary" autoFocus onClick={() => setGift(null)}>좋아요</button>
          </> : <button type="button" className="primary" autoFocus onClick={() => setGift({ ...gift, open: true })}>선물 상자 열기</button>}
        </div>
      </div>}

      {fishing && <FishingGame onClose={() => setFishing(null)}
        onMiss={() => { setFishing(null); setToast({ text: '물고기가 도망갔어요. 다시 던져 보세요.' }) }}
        onCatch={() => { const { command, success } = fishing; setFishing(null); act(command, success) }} />}

      <div className={'farm-toast' + (toast?.error || fields.sync ? ' error' : '')} aria-live="polite">
        {toast?.text ?? fields.sync?.text}
        {!toast && fields.sync && <button type="button" onClick={fields.flush}>다시 시도</button>}
        {!pending && toast?.retry && <button type="button" onClick={() => retry(toast.retry)}>다시 시도</button>}
        {!pending && toast?.reload && <button type="button" onClick={() => act({ type: 'view' }, '최신 상태를 불러왔어요')}>최신 상태 불러오기</button>}
        {!pending && toast?.photo && <button type="button" onClick={() => { setToast(null); setPhoto(true) }}>{toast.photo} 사진 남기기</button>}
      </div>
    </main>
  )
}
