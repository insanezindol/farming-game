// 서버와 화면이 함께 쓰는 확률 규칙 (node 전용 모듈 없이)

// 같은 입력이면 늘 같은 0~1 값: 재시도해도 확률 결과가 바뀌지 않는다
export function roll(...parts) {
  let hash = 2166136261
  for (const char of parts.join('|')) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  hash = Math.imul(hash ^ hash >>> 15, 0x2c1b3c6d)
  hash = Math.imul(hash ^ hash >>> 12, 0x297a2d39)
  return ((hash ^ hash >>> 15) >>> 0) / 4294967296
}

// 황금 허수아비 근처에서는 황금 작물이 두 배로 잘 나온다.
// 허수아비 목록은 한 번만 찾고, 칸마다 돌려 쓸 판정 함수를 돌려준다.
export function goldenCheck(farm) {
  const scarecrows = farm.objects.filter(entry => !entry.stored && entry.kind === 'goldscarecrow')
  return object => Boolean(object.crop) && roll('gold', object.id, object.crop.plantedAt) <
    (scarecrows.some(entry => Math.abs(entry.x - object.x) + Math.abs(entry.z - object.z) <= 3) ? .06 : .03)
}

export const isGolden = (farm, object) => goldenCheck(farm)(object)
