export const livestockTypes = {
  coop: { name: '닭', price: 25 },
  barn: { name: '소', price: 80 },
  pigpen: { name: '돼지', price: 95 },
  sheepfold: { name: '양', price: 110 },
  duckpond: { name: '오리', price: 55 },
}
export const isLivestock = object => Object.hasOwn(livestockTypes, object.kind)
export const livestockCount = object => isLivestock(object) ? object.animals ?? 1 : 0
export const livestockCapacity = object => isLivestock(object) ? (object.level ?? 1) * 2 : 0
// A cycle keeps its original herd size so buying before collection cannot inflate ready goods.
export const productionCount = object => isLivestock(object) ? object.cycleAnimals ?? livestockCount(object) : object.level ?? 1
export const feedCost = object => Math.max(1, Math.ceil(livestockCount(object) / 2))

export function livestockPositions(object) {
  const count = livestockCount(object)
  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / 5)
    const columns = Math.min(5, count - row * 5)
    return [(index % 5 - (columns - 1) / 2) * .18, count > 5 ? .19 + row * .28 : .36]
  })
}
