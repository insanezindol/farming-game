'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { avatarColors, avatarItems, avatarLook, avatarSlots, defaultAvatar } from '../lib/farm-avatar.mjs'
import { FarmButton } from './farm-panels'

export function AvatarWardrobe({ farm, act, scene }) {
  const [slot, setSlot] = useState('outfit')
  const [selected, setSelected] = useState(avatarLook(farm.avatar).equipment.outfit)
  const [failed, setFailed] = useState(false)
  const root = useRef(null), preview = useRef(null), desired = useRef(null)
  const equipped = avatarLook(farm.avatar)
  const look = useMemo(() => ({ ...avatarLook(farm.avatar), equipment: { ...avatarLook(farm.avatar).equipment,
    [avatarItems[selected].slot]: selected } }), [farm.avatar, selected])
  desired.current = look
  const owned = new Set([...defaultAvatar().owned, ...(farm.avatar?.owned ?? [])])
  const item = avatarItems[selected]
  const wearing = equipped.equipment[item.slot] === selected
  useEffect(() => {
    let active = true
    import('../lib/farm-avatar-preview').then(({ createAvatarPreview }) => {
      if (!active) return
      try { preview.current = createAvatarPreview(root.current); preview.current.setLook(desired.current) }
      catch { setFailed(true) }
    }).catch(() => { if (active) setFailed(true) })
    return () => { active = false; preview.current?.dispose(); preview.current = null }
  }, [])
  useEffect(() => {
    preview.current?.setLook(look)
    scene?.previewAvatar(look)
  }, [look, scene])
  useEffect(() => () => scene?.previewAvatar(null), [scene])
  return <div className="farm-wardrobe">
    <p>나만의 농장주를 꾸며 보세요. 아이템을 누르면 미리 볼 수 있어요.</p>
    <div className="farm-avatar-preview" ref={root} role="img" aria-label={item.name + ' 착용 미리보기'}>
      {failed && <span>3D 미리보기를 표시할 수 없어요.</span>}
    </div>
    <div className="farm-avatar-choice">
      <strong>{item.name}</strong>
      <FarmButton disabled={owned.has(selected) ? wearing : farm.coins < item.price}
        onClick={() => act({ type: owned.has(selected) ? 'equipAvatar' : 'buyAvatar', item: selected }, item.name + ' 착용!')}>
        {owned.has(selected) ? wearing ? '입고 있어요' : '착용하기' : '구매하고 입기 · ✦ ' + item.price}
      </FarmButton>
    </div>
    <p><small>기본 아이템과 색 변경은 무료예요. 꾸미기 아이템은 외형만 바뀌어요.</small></p>
    {Object.entries(avatarColors).map(([part, colors]) => <fieldset key={part} className="farm-avatar-colors">
      <legend>{part === 'skin' ? '피부색' : '머리색'}</legend>
      {colors.map((color, index) => <button type="button" key={color} style={{ backgroundColor: color }}
        aria-label={(part === 'skin' ? '피부색 ' : '머리색 ') + (index + 1)} aria-pressed={equipped[part] === color}
        onClick={() => act({ type: 'styleAvatar', part, color }, '농장주 색을 바꿨어요.')} />)}
    </fieldset>)}
    <div className="farm-actions" role="group" aria-label="꾸미기 종류">
      {Object.entries(avatarSlots).map(([key, name]) => <FarmButton key={key} active={slot === key}
        onClick={() => { setSlot(key); setSelected(equipped.equipment[key]) }}>{name}</FarmButton>)}
    </div>
    <div className="farm-avatar-items">
      {Object.entries(avatarItems).filter(([, entry]) => entry.slot === slot).map(([id, entry]) => <button key={id} type="button"
        className="farm-item" aria-pressed={selected === id} onClick={() => setSelected(id)}>
        <strong>{entry.name}</strong><small>{owned.has(id) ? equipped.equipment[slot] === id ? '착용 중' : '보유 중' : '✦ ' + entry.price}</small>
      </button>)}
    </div>
  </div>
}
