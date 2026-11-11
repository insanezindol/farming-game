import { FarmError } from './farm-game.mjs'

export function previewVisitCommand(state, command, now) {
  const farm = structuredClone(state)
  if (command.type === 'message') {
    if (typeof command.text !== 'string' || !command.text.trim()) throw new FarmError('남길 글을 입력해 주세요.')
    farm.social.messages = [{ from: '나', text: command.text, parcel: command.parcel, at: now }, ...(farm.social.messages ?? [])]
    return farm
  }
  const { item } = command
  if (!(farm.guestInventory?.[item] > 0)) throw new FarmError('보낼 물건이 부족해요.')
  if (command.type === 'assist') {
    const order = farm.orders.find(order => order.id === command.id && !order.done)
    if (!order || !(order.items[item] > (order.shared?.[item] ?? 0))) throw new FarmError('이미 채운 주문이에요.')
    order.shared = { ...order.shared, [item]: (order.shared?.[item] ?? 0) + 1 }
  } else if (command.type === 'gift') {
    farm.social.gifts = [{ from: '나', item, at: now }, ...(farm.social.gifts ?? [])]
  } else throw new FarmError('할 수 없는 방문 작업이에요.')
  farm.guestInventory[item]--
  return farm
}

export function projectVisitCommands(farm, tasks) {
  for (const { command, at } of tasks) {
    try { farm = previewVisitCommand(farm, command, at) } catch { /* the server reports rejected contributions */ }
  }
  return farm
}
