export const buildings = {
  plot: { name: '밭', icon: '🌱', size: [1, 1], price: 5, level: 1, model: 'soil', category: 'farm' },
  house: { name: '농가', icon: '🏡', size: [3, 3], price: 120, level: 1, model: 'house', category: 'farm', color: '#b86e43' },
  market: { name: '농산물 판매대', icon: '🧺', size: [2, 2], price: 45, level: 1, model: 'stall', category: 'farm', color: '#c98345' },
  truck: { name: '배달 트럭', icon: '🚚', size: [2, 1], price: 90, level: 1, model: 'truck', category: 'farm', color: '#c66d46' },
  orchard: { name: '사과나무', icon: '🍎', size: [2, 2], price: 50, level: 2, model: 'tree', category: 'farm', product: 'apple', seconds: 360 },
  peachorchard: { name: '복숭아나무', icon: '🍑', size: [2, 2], price: 75, level: 3, model: 'peach-tree', category: 'farm', product: 'peach', seconds: 480 },
  greenhouse: { name: '온실', icon: '🪴', size: [3, 2], price: 180, level: 5, model: 'greenhouse', category: 'farm', color: '#8aaa79' },
  coop: { name: '닭장', icon: '🐔', size: [2, 2], price: 30, level: 1, model: 'coop', category: 'animal', animalModel: 'chicken', product: 'egg', seconds: 300, color: '#b56f4d' },
  barn: { name: '외양간', icon: '🐄', size: [3, 3], price: 90, level: 3, model: 'barn', category: 'animal', animalModel: 'cow', product: 'milk', seconds: 480, color: '#ad5943' },
  pigpen: { name: '돼지우리', icon: '🐖', size: [2, 2], price: 105, level: 4, model: 'pigpen', category: 'animal', animalModel: 'pig', product: 'truffle', seconds: 600, color: '#bc876e' },
  sheepfold: { name: '양 우리', icon: '🐑', size: [2, 2], price: 120, level: 4, model: 'sheepfold', category: 'animal', animalModel: 'sheep', product: 'wool', seconds: 540, color: '#c59b76' },
  duckpond: { name: '오리 연못', icon: '🦆', size: [2, 2], price: 65, level: 2, model: 'duckpond', category: 'animal', animalModel: 'duck', product: 'duckegg', seconds: 360, color: '#79a59b' },
  hive: { name: '벌통', icon: '🐝', size: [1, 1], price: 55, level: 2, model: 'hive', category: 'animal', product: 'honey', seconds: 420, color: '#c28f43' },
  mill: { name: '제분소', icon: '🌾', size: [2, 2], price: 70, level: 2, model: 'mill', category: 'artisan', color: '#c68e61' },
  bakery: { name: '빵집', icon: '🥖', size: [3, 2], price: 115, level: 3, model: 'bakery', category: 'artisan', color: '#ce8d63' },
  dairy: { name: '치즈 공방', icon: '🧀', size: [2, 2], price: 145, level: 4, model: 'dairy', category: 'artisan', color: '#c79c77' },
  jamshop: { name: '잼 공방', icon: '🍓', size: [2, 2], price: 145, level: 4, model: 'jamshop', category: 'artisan', color: '#b87578' },
  loom: { name: '직조 공방', icon: '🧵', size: [2, 2], price: 170, level: 5, model: 'loom', category: 'artisan', color: '#a38171' },
  path: { name: '오솔길', icon: '▫️', size: [1, 1], price: 2, level: 1, model: 'path', category: 'decoration', color: '#bf9c6d' },
  stonepath: { name: '돌길', icon: '🪨', size: [1, 1], price: 4, level: 1, model: 'stonepath', category: 'decoration', color: '#a8a99d' },
  fence: { name: '나무 울타리', icon: '🪵', size: [1, 1], price: 4, level: 1, model: 'fence', category: 'decoration', color: '#a57c54' },
  trail: { name: '좁은 길', icon: '┆', size: [1, 1], price: 1, level: 1, model: 'path', category: 'decoration', tint: '#c9a877', inset: .5 },
  hedge: { name: '생울타리', icon: '🌿', size: [1, 1], price: 6, level: 1, model: 'meadow', category: 'decoration', tint: '#3f7a35' },
  stonewall: { name: '돌담', icon: '🧱', size: [1, 1], price: 7, level: 2, model: 'rock', category: 'decoration', tint: '#a3a194' },
  flowerbed: { name: '화단', icon: '🌷', size: [1, 1], price: 8, level: 1, model: 'flowers', category: 'decoration' },
  pond: { name: '낚시 연못', icon: '🎣', size: [3, 2], price: 50, level: 2, model: 'pond', category: 'decoration' },
  lamp: { name: '가로등', icon: '🏮', size: [1, 1], price: 10, level: 1, model: 'lamp', category: 'decoration', color: '#bd9157' },
  bench: { name: '나무 벤치', icon: '🪑', size: [1, 1], price: 12, level: 1, model: 'bench', category: 'decoration', color: '#ba9167' },
  fountain: { name: '분수', icon: '⛲', size: [2, 2], price: 65, level: 3, model: 'fountain', category: 'decoration', color: '#9da79b' },
  windmill: { name: '풍차', icon: '🌬️', size: [2, 2], price: 95, level: 3, model: 'windmill', category: 'decoration', color: '#b4845d' },
  scarecrow: { name: '허수아비', icon: '👒', size: [1, 1], price: 16, level: 2, model: 'scarecrow', category: 'decoration' },
  bridge: { name: '나무다리', icon: '🌉', size: [2, 1], price: 35, level: 2, model: 'bridge', category: 'decoration', color: '#ad8052' },
  seasonal: { name: '계절 장식', icon: '🍂', size: [1, 1], price: 22, level: 2, model: 'seasonal', category: 'decoration' },
  sprinkler: { name: '스프링클러', icon: '💧', size: [1, 1], price: 55, level: 3, model: 'sprinkler', category: 'utility' },
  worker: { name: '일꾼 오두막', icon: '🧑‍🌾', size: [2, 2], price: 110, level: 4, model: 'worker', category: 'utility', color: '#b57e4e' },
  // Lv.6~15 해금 장식 (기존 모델 색 변형)
  rosebed: { name: '장미 화단', icon: '🌹', size: [1, 1], price: 14, level: 6, model: 'flowers', category: 'decoration', tint: '#ec7c8c' },
  mintbench: { name: '민트 벤치', icon: '🪑', size: [1, 1], price: 20, level: 7, model: 'bench', category: 'decoration', tint: '#7fd8bd' },
  lilyfountain: { name: '연꽃 분수', icon: '🪷', size: [2, 2], price: 90, level: 8, model: 'fountain', category: 'decoration', tint: '#f5a8c9' },
  goldscarecrow: { name: '황금 허수아비', icon: '✨', size: [1, 1], price: 60, level: 9, model: 'scarecrow', category: 'decoration', tint: '#f5c84c' },
  blossommill: { name: '벚꽃 풍차', icon: '🌸', size: [2, 2], price: 130, level: 10, model: 'windmill', category: 'decoration', tint: '#f7b9cb' },
  starlamp: { name: '별빛 가로등', icon: '⭐', size: [1, 1], price: 24, level: 11, model: 'lamp', category: 'decoration', tint: '#ffe27a' },
  mosswall: { name: '이끼 돌담', icon: '🪨', size: [1, 1], price: 9, level: 12, model: 'rock', category: 'decoration', tint: '#86bd6c' },
  tulipbed: { name: '튤립 화단', icon: '🌷', size: [1, 1], price: 16, level: 13, model: 'flowers', category: 'decoration', tint: '#ffd166' },
  topiary: { name: '동글 덤불', icon: '🌳', size: [1, 1], price: 40, level: 14, model: 'meadow', category: 'decoration', tint: '#57b65f' },
  goldfountain: { name: '황금 분수', icon: '⛲', size: [2, 2], price: 200, level: 15, model: 'fountain', category: 'decoration', tint: '#f5c84c' },
  // 선물로만 받는 장식 (보관함으로 들어온다)
  harvestscarecrow: { name: '풍년 허수아비', icon: '🌾', size: [1, 1], price: 0, level: 1, model: 'scarecrow', category: 'decoration', tint: '#f3a85a', gift: true },
  artisanlamp: { name: '장인의 등불', icon: '🏮', size: [1, 1], price: 0, level: 1, model: 'lamp', category: 'decoration', tint: '#ff9f7a', gift: true },
  fishfountain: { name: '물고기 분수', icon: '🐟', size: [2, 2], price: 0, level: 1, model: 'fountain', category: 'decoration', tint: '#7cc8ea', gift: true },
  forestbench: { name: '도토리 벤치', icon: '🌰', size: [1, 1], price: 0, level: 1, model: 'bench', category: 'decoration', tint: '#c98b52', gift: true },
  jangdok: { name: '순덕 할머니의 장독', icon: '🏺', size: [1, 1], price: 0, level: 1, model: 'rock', category: 'decoration', tint: '#8a4f35', gift: true },
  pyeongsang: { name: '민호네 평상', icon: '🪑', size: [1, 1], price: 0, level: 1, model: 'bench', category: 'decoration', tint: '#e0b067', gift: true },
  yunapot: { name: '유나 선생님의 꽃 화분', icon: '💐', size: [1, 1], price: 0, level: 1, model: 'flowers', category: 'decoration', tint: '#c59bf0', gift: true },
  cloverpot: { name: '클로버 정원', icon: '🍀', size: [1, 1], price: 0, level: 1, model: 'meadow', category: 'decoration', tint: '#5fd36b', gift: true },
  mushroomstool: { name: '버섯 의자', icon: '🍄', size: [1, 1], price: 0, level: 1, model: 'bench', category: 'decoration', tint: '#ef6f5e', gift: true },
  bluelantern: { name: '하늘빛 랜턴', icon: '🔷', size: [1, 1], price: 0, level: 1, model: 'lamp', category: 'decoration', tint: '#8cc8ff', gift: true },
}

// 드래그로 여러 칸에 한 번에 놓을 수 있는 시설
export const batchKinds = ['plot', 'path', 'stonepath', 'fence', 'trail', 'hedge', 'stonewall', 'mosswall']

export const crops = {
  wheat: { name: '밀', icon: '🌾', seed: 2, price: 7, seconds: 30, model: 'wheat-young', ripeModel: 'wheat-ripe', level: 1 },
  carrot: { name: '당근', icon: '🥕', seed: 4, price: 13, seconds: 120, model: 'carrot-young', ripeModel: 'carrot-ripe', level: 1 },
  berry: { name: '딸기', icon: '🍓', seed: 7, price: 25, seconds: 480, model: 'berry-young', ripeModel: 'berry-ripe', level: 1 },
  potato: { name: '감자', icon: '🥔', seed: 5, price: 16, seconds: 180, model: 'potato-young', ripeModel: 'potato-ripe', level: 2 },
  corn: { name: '옥수수', icon: '🌽', seed: 6, price: 20, seconds: 300, model: 'corn-young', ripeModel: 'corn-ripe', level: 2 },
  pumpkin: { name: '호박', icon: '🎃', seed: 9, price: 34, seconds: 600, model: 'pumpkin-young', ripeModel: 'pumpkin-ripe', level: 3 },
  tomato: { name: '토마토', icon: '🍅', seed: 8, price: 29, seconds: 420, model: 'tomato-young', ripeModel: 'tomato-ripe', level: 3 },
  grape: { name: '포도', icon: '🍇', seed: 12, price: 48, seconds: 900, model: 'grape-young', ripeModel: 'grape-ripe', level: 4 },
}

export const products = {
  egg: { name: '달걀', icon: '🥚', price: 12 },
  milk: { name: '우유', icon: '🥛', price: 24 },
  truffle: { name: '송로버섯', icon: '🍄', price: 42 },
  wool: { name: '양털', icon: '🧶', price: 34 },
  duckegg: { name: '오리알', icon: '🥚', price: 18 },
  honey: { name: '꿀', icon: '🍯', price: 23 },
  apple: { name: '사과', icon: '🍎', price: 21 },
  peach: { name: '복숭아', icon: '🍑', price: 29 },
  fish: { name: '민물고기', icon: '🐟', price: 10 },
  carp: { name: '잉어', icon: '🐟', price: 18 },
  trout: { name: '송어', icon: '🐟', price: 28 },
  mushroom: { name: '야생 버섯', icon: '🍄', price: 9 },
  wildberry: { name: '산딸기', icon: '🫐', price: 7 },
  wood: { name: '나뭇가지', icon: '🪵', price: 5 },
  stone: { name: '돌', icon: '🪨', price: 6 },
  flour: { name: '밀가루', icon: '🌾', price: 19 },
  bread: { name: '빵', icon: '🥖', price: 42 },
  cake: { name: '딸기 케이크', icon: '🍰', price: 115 },
  cheese: { name: '치즈', icon: '🧀', price: 65 },
  trufflecheese: { name: '송로버섯 치즈', icon: '🧀', price: 136 },
  jam: { name: '딸기잼', icon: '🍓', price: 66 },
  wildjam: { name: '산딸기잼', icon: '🫐', price: 37 },
  applejam: { name: '사과잼', icon: '🍎', price: 88 },
  grapejam: { name: '포도잼', icon: '🍇', price: 120 },
  cloth: { name: '양모 천', icon: '🧵', price: 87 },
  clover: { name: '네잎클로버', icon: '🍀', price: 30 },
  acorn: { name: '도토리', icon: '🌰', price: 8 },
}
// 가끔 나오는 황금 작물 (판매가 5배)
for (const [key, crop] of Object.entries(crops)) {
  products['golden_' + key] = { name: '황금 ' + crop.name, icon: crop.icon, price: crop.price * 5, golden: true }
}

// 계절마다 값을 더 쳐 주는 작물
export const seasonCrops = { spring: ['berry', 'carrot'], summer: ['corn', 'tomato'], autumn: ['pumpkin', 'potato'], winter: ['wheat', 'grape'] }

export const recipes = {
  flour: { name: '밀가루 빻기', building: 'mill', inputs: { wheat: 2 }, product: 'flour', seconds: 30, quantity: 1 },
  bread: { name: '빵 굽기', building: 'bakery', inputs: { flour: 1, egg: 1 }, product: 'bread', seconds: 90, quantity: 1 },
  cake: { name: '딸기 케이크 굽기', building: 'bakery', inputs: { flour: 1, egg: 1, milk: 1, berry: 1 }, product: 'cake', seconds: 240, quantity: 1 },
  cheese: { name: '치즈 만들기', building: 'dairy', inputs: { milk: 2 }, product: 'cheese', seconds: 150, quantity: 1 },
  trufflecheese: { name: '송로버섯 치즈 만들기', building: 'dairy', inputs: { cheese: 1, truffle: 1 }, product: 'trufflecheese', seconds: 300, quantity: 1 },
  jam: { name: '딸기잼 끓이기', building: 'jamshop', inputs: { berry: 2 }, product: 'jam', seconds: 120, quantity: 1 },
  wildjam: { name: '산딸기잼 끓이기', building: 'jamshop', inputs: { wildberry: 3 }, product: 'wildjam', seconds: 90, quantity: 1 },
  applejam: { name: '사과잼 끓이기', building: 'jamshop', inputs: { apple: 2, honey: 1 }, product: 'applejam', seconds: 180, quantity: 1 },
  grapejam: { name: '포도잼 끓이기', building: 'jamshop', inputs: { grape: 2 }, product: 'grapejam', seconds: 240, quantity: 1 },
  cloth: { name: '양모 천 짜기', building: 'loom', inputs: { wool: 2 }, product: 'cloth', seconds: 210, quantity: 1 },
}

// 모두 발견하면 장식을 주는 도감 세트
export const collectionSets = {
  crops: { name: '밭 작물', items: Object.keys(crops), reward: 'harvestscarecrow' },
  workshop: { name: '공방', items: Object.keys(recipes), reward: 'artisanlamp' },
  fish: { name: '물고기', items: ['fish', 'carp', 'trout'], reward: 'fishfountain' },
  forest: { name: '숲', items: ['mushroom', 'wildberry', 'wood', 'stone', 'clover', 'acorn'], reward: 'forestbench' },
}
