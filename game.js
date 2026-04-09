(function(){
'use strict';
if (typeof THREE === 'undefined') {
  alert('Three.js の読み込みに失敗しました。通信状態を確認して再読み込みしてください。');
  return;
}

const SAVE_PREFIX = 'yoiyado_b1_smartphone_slot_';
const TAU = Math.PI * 2;

const canvas = document.getElementById('game-canvas');
const hud = document.getElementById('hud');
const promptEl = document.getElementById('prompt');
const areaLabelEl = document.getElementById('area-label');
const phaseLabelEl = document.getElementById('phase-label');
const dayLabelEl = document.getElementById('day-label');
const distanceLabelEl = document.getElementById('distance-label');
const minimap = document.getElementById('minimap');
const minimapCtx = minimap.getContext('2d');
const menuBtn = document.getElementById('menu-btn');
const menuOverlay = document.getElementById('menu');
const dialogueOverlay = document.getElementById('dialogue');
const portraitEl = document.getElementById('portrait');
const dialogueNameEl = document.getElementById('dialogue-name');
const dialogueTextEl = document.getElementById('dialogue-text');
const gameOverEl = document.getElementById('gameover');
const endingEl = document.getElementById('ending');
const endingTitleEl = endingEl ? endingEl.querySelector('h2') : null;
const endingTextEl = endingEl ? endingEl.querySelector('p') : null;
const slotOverlay = document.getElementById('slot-overlay');
const slotTitleEl = document.getElementById('slot-title');
const slotNoteEl = document.getElementById('slot-note');
const slotListEl = document.getElementById('slot-list');
const returnHomeEl = document.getElementById('return-home');
const actBtn = document.getElementById('act-btn');
const runBtn = document.getElementById('run-btn');
const lookZone = document.getElementById('look-zone');
const joystickBase = document.getElementById('joystick-base');
const joystickKnob = document.getElementById('joystick-knob');
const joystickZone = document.getElementById('joystick-zone');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x06080d);
scene.fog = new THREE.Fog(0x080a10, 16, 42);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 90);
const player = { x: 0, z: 0, yaw: 0, pitch: 0, height: 1.62, radius: 0.33, speed: 3.12, run: 1.28 };

const rootGroup = new THREE.Group();
scene.add(rootGroup);
const areaGroup = new THREE.Group();
const dynamicGroup = new THREE.Group();
rootGroup.add(areaGroup);
rootGroup.add(dynamicGroup);

const hemi = new THREE.HemisphereLight(0xbdd2ff, 0x2f2419, 0.7);
scene.add(hemi);
const dirLight = new THREE.DirectionalLight(0xfff0da, 0.9);
dirLight.position.set(6, 10, 5);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 1024;
dirLight.shadow.mapSize.height = 1024;
dirLight.shadow.camera.left = -18;
dirLight.shadow.camera.right = 18;
dirLight.shadow.camera.top = 18;
dirLight.shadow.camera.bottom = -18;
scene.add(dirLight);

const state = {
  area: 'lobby',
  day: 1,
  phaseLabel: '昼勤務',
  step: 'talk_okami',
  hudHidden: false,
  menuOpen: false,
  dialogueQueue: [],
  checkpoint: null,
  chase: null,
  slotMode: null,
  guide: null,
  lastDoorId: null,
  doorCooldownUntil: 0,
  inputLockUntil: 0,
  questFlags: {},
  ended: false,
  cutscene: null,
  previewGuide: null
};

const input = {
  keys: Object.create(null),
  lookDragging: false,
  lookId: null,
  joyId: null,
  joyX: 0,
  joyY: 0,
  pointerX: 0,
  pointerY: 0,
  mouseDrag: false,
  interactQueued: false,
  runHeld: false,
  runToggle: false
};


function ensureQuestFlagDefaults(flags){
  const q = flags || {};
  q.okamiArrivalSceneDone ??= false;
  q.guideGlimpsed ??= false;
  q.toiletStallOpened ??= false;
  q.sawMissingPosterShift ??= false;
  q.heardAbout203 ??= false;
  q.talkedToToiletGuestDay3 ??= false;
  q.checkedBathNoticeDay3 ??= false;
  q.checkedFireMap ??= false;
  q.readBlueNote2 ??= false;
  q.sawGuideTease2 ??= false;
  q.entered203Phantom ??= false;
  q.endingType ??= '';
  return q;
}

const colliders = [];
const doors = [];
const npcs = [];
const items = [];
const areaAnchors = {};
const graph = {
  home: { town: 12 },
  town: { home: 12, lobby: 18 },
  lobby: { town: 18, corridor: 12, kitchen: 8, archive: 9 },
  kitchen: { lobby: 8 },
  corridor: { lobby: 12, room201: 6, room202: 7, bath: 12, north: 13 },
  room201: { corridor: 6 },
  room202: { corridor: 7 },
  bath: { corridor: 12 },
  archive: { lobby: 9, detached: 14 },
  north: { corridor: 13, detached: 8 },
  detached: { north: 8, archive: 14 }
};

const areaLabels = {
  home: '自宅', town: '田舎町', lobby: '帳場', kitchen: '厨房', corridor: '客室廊下', room201: '201号室', room202: '202号室', bath: '浴場前', archive: '宿帳庫', north: '北廊下', detached: '離れ通路'
};

const stepDefs = {
  start_note: { day: 1, phase: '出勤前', text: '机の読み物で今日の予定を確認する', sub: '机へ', targetArea: 'home', targetPos: { x: -1.7, z: -1.8 }, trigger: { type: 'item', id: 'scheduleNote' } },
  leave_home: { day: 1, phase: '出勤前', text: '玄関から外へ出る', sub: '玄関へ', targetArea: 'home', targetPos: { x: 4.4, z: 1.1 }, trigger: { type: 'door', id: 'homeToTown' } },
  walk_to_ryokan: { day: 1, phase: '出勤前', text: '田舎町を歩いて旅館へ向かう', sub: '旅館入口へ', targetArea: 'town', targetPos: { x: 9.2, z: 0.0 }, trigger: { type: 'door', id: 'townToLobby' } },
  talk_okami: { day: 1, phase: '昼勤務', text: '女将に話しかける', sub: '帳場へ', targetArea: 'lobby', targetPos: { x: 0, z: -2 }, trigger: { type: 'npc', id: 'okami' } },
  get_tray: { day: 1, phase: '昼勤務', text: '厨房でお茶の盆を受け取る', sub: '厨房へ', targetArea: 'kitchen', targetPos: { x: 0, z: -1 }, trigger: { type: 'item', id: 'tray' } },
  deliver_201: { day: 1, phase: '昼勤務', text: '201号室の客にお茶を届ける', sub: '201号室へ', targetArea: 'room201', targetPos: { x: 0, z: -1.8 }, trigger: { type: 'npc', id: 'guest201' } },
  report_okami: { day: 1, phase: '昼勤務', text: '帳場へ戻って女将に報告する', sub: '帳場へ', targetArea: 'lobby', targetPos: { x: 0, z: -2 }, trigger: { type: 'npc', id: 'okami' } },
  stock_amenities: { day: 1, phase: '昼勤務', text: '帳場横の戸棚から客用備品袋を受け取る', sub: '帳場の戸棚へ', targetArea: 'lobby', targetPos: { x: -5.6, z: 4.2 }, trigger: { type: 'item', id: 'amenityBag' } },
  place_amenities: { day: 1, phase: '昼勤務', text: '客室廊下の備品箱へ客用備品を補充する', sub: '客室廊下へ', targetArea: 'corridor', targetPos: { x: -6.3, z: 2.4 }, trigger: { type: 'item', id: 'amenityBox' } },
  arrange_slippers: { day: 1, phase: '昼勤務', text: '客室廊下入口の下駄箱前でスリッパを揃える', sub: '客室廊下へ', targetArea: 'corridor', targetPos: { x: -9.4, z: -3.2 }, trigger: { type: 'item', id: 'slipperRack' } },
  restock_towels: { day: 1, phase: '昼勤務', text: '浴場前の棚に替えタオルを補充する', sub: '浴場前へ', targetArea: 'bath', targetPos: { x: 2.5, z: 2.6 }, trigger: { type: 'item', id: 'towelShelf' } },
  answer_phone: { day: 1, phase: '夕方', text: '浴場前の黒電話に出る', sub: '浴場前へ', targetArea: 'bath', targetPos: { x: 2.5, z: -2.5 }, trigger: { type: 'item', id: 'phone' } },
  inspect_archive: { day: 1, phase: '深夜調査', text: '宿帳庫で青い宿帳を探す', sub: '宿帳庫へ', targetArea: 'archive', targetPos: { x: 0, z: -3 }, trigger: { type: 'item', id: 'blueLedger' } },
  escape_archive: { day: 1, phase: '深夜追跡', text: '誘導員から逃げて帳場へ戻る', sub: '帳場へ', targetArea: 'lobby', targetPos: { x: 0, z: -2 }, trigger: { type: 'npc', id: 'okami' } },
  sleep_day1: { day: 1, phase: '帰宅', text: '布団で眠って体を休める', sub: '布団へ', targetArea: 'home', targetPos: { x: -0.2, z: -0.9 }, trigger: { type: 'item', id: 'futonBed' } },
  leave_home_day2: { day: 2, phase: '出勤前', text: '玄関から外へ出る', sub: '玄関へ', targetArea: 'home', targetPos: { x: 4.4, z: 1.1 }, trigger: { type: 'door', id: 'homeToTown' } },
  commute_day2: { day: 2, phase: '出勤前', text: '田舎町を歩いて旅館へ向かう', sub: '旅館入口へ', targetArea: 'town', targetPos: { x: 9.2, z: 0.0 }, trigger: { type: 'door', id: 'townToLobby' } },
  talk_maid: { day: 2, phase: '昼勤務', text: '廊下で仲居に昨夜のことを聞く', sub: '客室廊下へ', targetArea: 'corridor', targetPos: { x: 0, z: 0 }, trigger: { type: 'npc', id: 'maid' } },
  get_breakfast202: { day: 2, phase: '昼勤務', text: '厨房で202号室の朝食膳を受け取る', sub: '厨房へ', targetArea: 'kitchen', targetPos: { x: 0, z: -1 }, trigger: { type: 'item', id: 'breakfastTray' } },
  deliver_202: { day: 2, phase: '昼勤務', text: '202号室へ朝食を運ぶ', sub: '202号室へ', targetArea: 'room202', targetPos: { x: 0, z: -1.8 }, trigger: { type: 'npc', id: 'guest202' } },
  collect_lost_item: { day: 2, phase: '昼勤務', text: '廊下に落ちた鍵束を回収する', sub: '客室廊下へ', targetArea: 'corridor', targetPos: { x: 3.1, z: 1.2 }, trigger: { type: 'item', id: 'lostKey' } },
  inspect_register: { day: 2, phase: '夕方', text: '帳場で宿帳を照合する', sub: '帳場へ', targetArea: 'lobby', targetPos: { x: 1.2, z: -4.2 }, trigger: { type: 'item', id: 'registerBook' } },
  inspect_north: { day: 2, phase: '夕方', text: '北廊下の閉ざされた札を調べる', sub: '北廊下へ', targetArea: 'north', targetPos: { x: 0, z: -2.5 }, trigger: { type: 'item', id: 'sealTag' } },
  inspect_detached: { day: 2, phase: '深夜調査', text: '離れ通路の祠を調べる', sub: '離れ通路へ', targetArea: 'detached', targetPos: { x: 0, z: -3 }, trigger: { type: 'item', id: 'altar' } },
  escape_detached: { day: 2, phase: '深夜追跡', text: '誘導員から逃げて帳場へ戻る', sub: '帳場へ', targetArea: 'lobby', targetPos: { x: 0, z: -2 }, trigger: { type: 'npc', id: 'okami' } },
  finale: { day: 2, phase: '終幕', text: '女将に宿帳のことを問いただす', sub: '帳場へ', targetArea: 'lobby', targetPos: { x: 0, z: -2 }, trigger: { type: 'npc', id: 'okami' } },
  sleep_day2: { day: 2, phase: '帰宅', text: '布団で眠って体を休める', sub: '布団へ', targetArea: 'home', targetPos: { x: 0.8, z: 0.9 }, trigger: { type: 'item', id: 'futonBed' } },
  leave_home_day3: { day: 3, phase: '朝', text: '玄関から外へ出る', sub: '玄関へ', targetArea: 'home', targetPos: { x: 4.4, z: 1.1 }, trigger: { type: 'door', id: 'homeToTown' } },
  inspect_poster_day3: { day: 3, phase: '朝', text: '町の掲示板の貼り紙を確かめる', sub: '掲示板へ', targetArea: 'town', targetPos: { x: -0.5, z: 2.8 }, trigger: { type: 'item', id: 'posterBoard' } },
  commute_day3: { day: 3, phase: '朝', text: '旅館へ向かう', sub: '旅館入口へ', targetArea: 'town', targetPos: { x: 9.2, z: 0.0 }, trigger: { type: 'door', id: 'townToLobby' } },
  talk_okami_day3: { day: 3, phase: '昼勤務', text: '帳場で女将の指示を聞く', sub: '帳場へ', targetArea: 'lobby', targetPos: { x: 0, z: -2.8 }, trigger: { type: 'npc', id: 'okami' } },
  inspect_guestbook_203: { day: 3, phase: '昼勤務', text: '帳場で203号室の記録を確かめる', sub: '宿帳へ', targetArea: 'lobby', targetPos: { x: 1.1, z: -4.25 }, trigger: { type: 'item', id: 'registerBook' } },
  talk_toilet_guest_day3: { day: 3, phase: '夕方', text: '浴場の個室の客にもう一度話しかける', sub: '浴場前へ', targetArea: 'bath', targetPos: { x: 6.15, z: 1.42 }, trigger: { type: 'npc', id: 'toiletGuest' } },
  inspect_bath_notice: { day: 3, phase: '夕方', text: '女湯前の清掃案内を調べる', sub: '女湯前へ', targetArea: 'bath', targetPos: { x: -3.45, z: 2.85 }, trigger: { type: 'item', id: 'bathNotice' } },
  inspect_fire_map: { day: 3, phase: '夜', text: '北廊下で古い避難図を探す', sub: '北廊下へ', targetArea: 'north', targetPos: { x: 1.9, z: -1.2 }, trigger: { type: 'item', id: 'fireMap' } },
  read_blue_note_2: { day: 3, phase: '夜', text: '宿帳庫で青いノートの続きを読む', sub: '宿帳庫へ', targetArea: 'archive', targetPos: { x: -1.6, z: -2.1 }, trigger: { type: 'item', id: 'blueLedger2' } },
  guide_tease_day3: { day: 3, phase: '夜', text: '客室廊下へ戻って気配の正体を追う', sub: '客室廊下へ', targetArea: 'corridor', targetPos: { x: 7.2, z: -2.8 }, trigger: { type: 'item', id: 'phantom203' } },
  enter_203_phantom: { day: 3, phase: '夜', text: '壁に現れた203号室の痕跡を調べる', sub: '203の痕跡へ', targetArea: 'corridor', targetPos: { x: 8.7, z: -4.25 }, trigger: { type: 'item', id: 'phantom203' } },
  final_choice: { day: 3, phase: '終幕', text: '帳場へ戻り、番台の上の答えを選ぶ', sub: '帳場へ', targetArea: 'lobby', targetPos: { x: 0.0, z: -2.8 }, trigger: { type: 'npc', id: 'okami' } },
  choose_fate: { day: 3, phase: '終幕', text: '番台に置かれた三つの品から答えを選ぶ', sub: '番台へ', targetArea: 'lobby', targetPos: { x: 0.0, z: -4.25 }, trigger: { type: 'item', id: 'endingBurn' } },
  ending_return: { day: 3, phase: '結末', text: '帰還エンド', sub: '帰還', targetArea: 'lobby', targetPos: { x: 0.0, z: -4.25 }, trigger: { type: 'item', id: 'endingBurn' } },
  ending_guest: { day: 3, phase: '結末', text: '宿泊エンド', sub: '宿泊', targetArea: 'lobby', targetPos: { x: 0.0, z: -4.25 }, trigger: { type: 'item', id: 'endingSign' } },
  ending_replace: { day: 3, phase: '結末', text: '交代エンド', sub: '交代', targetArea: 'lobby', targetPos: { x: 0.0, z: -4.25 }, trigger: { type: 'item', id: 'endingFollow' } }
};

const storyNodes = {
  home_note: [
    ['主人公', `今日から、山あいの古い旅館で住み込みの仕事が始まる。
寮ではなく、自宅から数日通うことになった。`, 'hero'],
    ['主人公', `女将からの手紙。
「昼前までに帳場へ。北廊下には夜まで近づかないこと」`, 'hero']
  ],
  okami_intro: [
    ['女将', `よう来たね。ここは人手が足りていない。
今夜から帳場の手伝いをしてもらう。`, 'okami'],
    ['女将', `まずは厨房へ行って、201号室へお茶の盆を届けておくれ。
戻ったら備品袋、下駄箱、浴場前の替えタオルまでまとめて頼むよ。`, 'okami']
  ],
  tray: [
    ['料理番', `女将さんから聞いてるよ。
盆を持ったら、こぼさないようにまっすぐ201へ。`, 'chef']
  ],
  guest201: [
    ['201号室の客', `……遅かったな。
今朝からこの宿、変な音がする。壁の向こうを誰か歩いてる。`, 'guest'],
    ['201号室の客', `さっきも、赤と白の旗を持った男が廊下の先に立っていた。
宿の人間なら妙な格好だ。`, 'guest']
  ],
  report_okami: [
    ['女将', `客の話は気にしなくていい。
古い建物だから、音はいろいろ響くものさ。`, 'okami'],
    ['女将', `その前に、帳場横の戸棚から客用備品を持って廊下の備品箱へ。
入口のスリッパも揃えておくれ。最後に浴場前の棚へ替えタオルだ。`, 'okami']
  ],
  amenityBag: [
    ['主人公', `歯ブラシ、髭剃り、巾着入りの茶葉。
客用備品袋を戸棚から受け取った。`, 'hero']
  ],
  amenityBox: [
    ['主人公', `廊下の備品箱へ客用備品を補充した。
一番下の段に、見覚えのない古い札が一枚混ざっている。`, 'hero']
  ],
  slippers: [
    ['主人公', `乱れていたスリッパを番号順に並べ直した。
一足だけ、濡れた足跡がついたまま乾いていない。`, 'hero']
  ],
  towel: [
    ['主人公', `替えタオルを棚へ積み直した。
湿った匂いの中で、遠くから黒電話のベルが一度だけ鳴った。`, 'hero']
  ],
  phone: [
    ['黒電話', `――……カタン。
受話器の向こうから、誰かの息だけが聞こえる。`, 'phone'],
    ['低い声', `宿帳を、見るな。……いや、見ろ。
北の札より先に、帳場の奥を確かめろ。`, 'phone']
  ],
  villager: [
    ['町の住民', `あの旅館に行くのかい。朝は静かでいい宿に見えるだろう。
でも夜になると、北側の窓だけ誰もいないのに明かりが点くんだ。`, 'villager'],
    ['町の住民', `赤と白の旗を振る誘導員の噂、聞いたことはないか。
火事の夜からずっと、道を間違えた人を連れていくって話さ。`, 'villager']
  ],
  blueLedger: [
    ['主人公', `青い宿帳だ。
同じ名前が、年を跨いで何度も記されている。`, 'hero'],
    ['主人公', `ページの端に、赤いインクで「誘導員に従うな」とある。`, 'hero']
  ],
  escape_archive: [
    ['女将', `見たのかい。
それなら、今夜のうちに家へ戻って休みな。`, 'okami'],
    ['女将', `明日になったら、廊下の仲居にだけ話を聞いておくれ。
他の客には悟られないように。`, 'okami']
  ],
  sleep_day1: [
    ['主人公', `布団へ倒れこむ。
提灯の残像と、赤白の旗が瞼の裏に焼きついている。`, 'hero'],
    ['主人公', `……翌朝。
またあの旅館へ向かわなければならない。`, 'hero']
  ],
  maid: [
    ['仲居', `昨夜、帳場の灯りが消えたあと……北廊下の奥で、旗が擦れる音がしました。`, 'maid'],
    ['仲居', `昔の火事で死んだ誘導員の噂、聞いたことありますか。
道を誤らせる男です。`, 'maid']
  ],
  breakfast202: [
    ['料理番', `202の客は朝にうるさい。粥と焼き魚、味噌汁をこぼさず運んでくれ。`, 'chef']
  ],
  guest202: [
    ['202号室の客', `昨夜の二時過ぎ、誰かが廊下を走っていた。
だが足音は一人分じゃなかった。`, 'guest'],
    ['202号室の客', `朝になっても、部屋の外に濡れた旗の繊維が落ちていた。`, 'guest']
  ],
  lostKey: [
    ['主人公', `廊下で小さな鍵束を拾った。
裏に「離れ 予備」と刻まれている。`, 'hero']
  ],
  registerCheck: [
    ['主人公', `宿帳の宿泊数を数え直す。201と202しか使っていないはずなのに、203の朝食数まで記されている。`, 'hero'],
    ['主人公', `今朝チェックインした記録の末尾に、自分の名前がもう一度書かれていた。`, 'hero']
  ],
  sealTag: [
    ['主人公', `閉ざされた札の裏に、細い鍵が隠されている。
札そのものは焦げた匂いがする。`, 'hero']
  ],
  altar: [
    ['主人公', `離れの祠の下に、宿帳の切れ端と写真がある。
女将と、見覚えのない誘導員の写真だ。`, 'hero'],
    ['主人公', `足音。……また来る。`, 'hero']
  ],
  finale: [
    ['女将', `あれは追う者ではなく、連れていく者だよ。
昔この宿で、客を避難させるはずだった男さ。`, 'okami'],
    ['女将', `火事の夜、誰も救えなかった。
だから今も、間違った道へ客を導こうとする。`, 'okami'],
    ['女将', `……宿帳は預かっておく。
続きは、明日の夜に。あなたが、まだ自分の名前を覚えているならね。`, 'okami']
  ],
  sleep_day2: [
    ['主人公', `戸を閉めたはずなのに、家の中まで湯気の匂いが残っている。`, 'hero'],
    ['主人公', `目を閉じるたび、帳場の宿帳が一枚ずつ勝手にめくられていく。`, 'hero'],
    ['主人公', `……翌朝。続きを確かめに行かなければならない。`, 'hero']
  ],
  posterShift: [
    ['主人公', `昨日より、失踪者の貼り紙が増えている。`, 'hero'],
    ['主人公', `見覚えのある筆跡で、「宿泊中」と書き足された紙が一枚だけ混ざっていた。`, 'hero']
  ],
  okami_day3: [
    ['女将', `おはよう。今日は203の支度もお願いね。`, 'okami'],
    ['主人公', `203なんて部屋、ありませんよね。`, 'hero'],
    ['女将', `帳面に書いてあるものは、部屋より先に客を決める。
……そういう夜もあるのさ。`, 'okami']
  ],
  register203: [
    ['主人公', `宿帳の端に、203号室の欄がある。
この旅館にないはずの部屋番だ。`, 'hero'],
    ['主人公', `しかも、備考欄の癖のある払いは、自分の字に少し似ている。`, 'hero']
  ],
  toiletGuestDay3: [
    ['しゃがみ客', `……昨日より近い顔になったな。`, 'guest'],
    ['しゃがみ客', `名前を書くな。203は部屋じゃない。
空いた席に、客の形を流し込むための番号だ。`, 'guest']
  ],
  bathNotice: [
    ['主人公', `清掃中の札の裏に、小さく書き足された文がある。`, 'hero'],
    ['主人公', `「203号室ご宿泊のお客様は、女湯へ立ち入らないこと」。
客室と浴場の案内が混ざっている。`, 'hero']
  ],
  fireMap: [
    ['主人公', `古い避難図だ。火事の夜の導線に、赤い印が残っている。`, 'hero'],
    ['主人公', `誘導員は、客を連れ去るためじゃなく……
本当は誰かを外へ出すために立っていたのかもしれない。`, 'hero']
  ],
  blueLedger2: [
    ['主人公', `青いノートの続き。
「宿帳に書かれた名は、空いた部屋へ流し込まれる」`, 'hero'],
    ['主人公', `「203は、焼け落ちた客室の代わりに作られた記録上の部屋。
記録に残った客は、そこへ案内される」`, 'hero'],
    ['主人公', `最後の一文だけ、墨が滲んでいる。
「誘導員は、まだ避難を終えていない」`, 'hero']
  ],
  guideTeaseDay3: [
    ['主人公', `廊下の奥に、旗を持った影が立っている。`, 'hero'],
    ['主人公', `……今度は逃げない。
壁の前で止まり、そのまま姿を薄くしていった。`, 'hero']
  ],
  phantom203: [
    ['主人公', `壁に札が浮かんでいる。203。`, 'hero'],
    ['主人公', `焦げた湯のみ、半分だけ燃えた宿帳の紙、そして見覚えのある名前の欠片。`, 'hero'],
    ['主人公', `この宿は、客を泊めているんじゃない。
記録した人間を、部屋の形に閉じ込めている。`, 'hero']
  ],
  finalChoiceIntro: [
    ['女将', `ここで終わらせるなら、番台の上から一つ選びな。`, 'okami'],
    ['女将', `燃やすか、書くか、従うか。
どれを選んでも、この宿は忘れない。`, 'okami']
  ],
  ending_return: [
    ['主人公', `宿帳の角に火を移す。
紙は静かに黒く縮れ、帳場の灯りだけが妙に白く見えた。`, 'hero'],
    ['女将', `それでも、記録は完全には消えないよ。`, 'okami']
  ],
  ending_guest: [
    ['主人公', `番台の宿帳へ、自分の名前を書く。
書き終えた瞬間、墨が乾く前から筆跡が何年分も続いて見えた。`, 'hero'],
    ['女将', `ようこそ。これで、ようやく部屋が埋まる。`, 'okami']
  ],
  ending_replace: [
    ['主人公', `笛を握ると、濡れた廊下の匂いが肺に流れ込む。`, 'hero'],
    ['誘導員', `……今度は、間違えるな。`, 'guide']
  ]
};

const faceTextures = {
  okami: makeFaceTexture('#f0d7c6', '#201515', '#7b2932', 'okami'),
  maid: makeFaceTexture('#efd5c2', '#1e2228', '#63543f', 'maid'),
  guest: makeFaceTexture('#e8d0bc', '#16191d', '#4d4d4d', 'guest'),
  guide: makeFaceTexture('#d5dce5', '#4b0d0d', '#98a4b4', 'guide'),
  chef: makeFaceTexture('#ebdccb', '#1a1a1a', '#ffffff', 'chef'),
  villager: makeFaceTexture('#e4ccb6', '#1d1f22', '#6c7d52', 'villager'),
  hero: makeFaceTexture('#e7d0bc', '#1d1d1d', '#303030', 'hero'),
  phone: makeFaceTexture('#0f1216', '#d7d7d7', '#0f1216', 'phone')
};

function makeFaceTexture(skin, eye, accent, type) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = skin;
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = eye;
  if (type === 'guide') {
    g.fillRect(84, 110, 20, 12);
    g.fillRect(152, 110, 20, 12);
    g.fillStyle = '#7a0e12';
    g.fillRect(96, 156, 64, 8);
  } else {
    g.fillRect(86, 100, 18, 10);
    g.fillRect(152, 100, 18, 10);
    g.fillStyle = '#8b544d';
    g.fillRect(106, 152, 44, 6);
  }
  g.fillStyle = accent;
  if (type === 'okami') {
    g.fillRect(44, 42, 168, 34);
  } else if (type === 'maid') {
    g.fillRect(36, 28, 184, 42);
  } else if (type === 'guest') {
    g.fillRect(28, 30, 200, 36);
  } else if (type === 'guide') {
    g.fillRect(54, 10, 148, 44);
    g.fillStyle = '#ffffff';
    g.fillRect(112, 58, 32, 22);
  } else if (type === 'chef') {
    g.fillRect(58, 18, 140, 30);
    g.fillStyle = '#ffffff';
    g.fillRect(74, 0, 108, 34);
  } else if (type === 'villager') {
    g.fillRect(30, 28, 196, 40);
    g.fillStyle = '#d7c2a4';
    g.fillRect(96, 176, 64, 12);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const materials = {
  wood: new THREE.MeshStandardMaterial({ map: makeWoodTexture(512, 512), roughness: 0.88 }),
  darkWood: new THREE.MeshStandardMaterial({ map: makeWoodTexture(512, 512, true), roughness: 0.92 }),
  shoji: new THREE.MeshStandardMaterial({ map: makeShojiTexture(512, 512), roughness: 0.98 }),
  tatami: new THREE.MeshStandardMaterial({ map: makeTatamiTexture(512, 512), roughness: 1 }),
  tile: new THREE.MeshStandardMaterial({ map: makeTileTexture(512, 512), roughness: 0.95 }),
  carpet: new THREE.MeshStandardMaterial({ map: makeCarpetTexture(512, 512), roughness: 1 }),
  grass: new THREE.MeshStandardMaterial({ color: 0x6e9660, roughness: 1 }),
  bark: new THREE.MeshStandardMaterial({ color: 0x5a402f, roughness: 1 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x3f6b40, roughness: 1 }),
  wallWarm: new THREE.MeshStandardMaterial({ color: 0xdac7a2, roughness: 1 }),
  wallRose: new THREE.MeshStandardMaterial({ color: 0xb78587, roughness: 1 }),
  wallDark: new THREE.MeshStandardMaterial({ color: 0x3a2d23, roughness: 1 }),
  black: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xc9a96e, roughness: 0.45, metalness: 0.4 }),
  paper: new THREE.MeshStandardMaterial({ color: 0xf6f0df, roughness: 1 })
};

const textureLoader = new THREE.TextureLoader();
function loadAssetTexture(path, rx=1, ry=1){
  const tex = textureLoader.load(path);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(rx, ry);
  return tex;
}
const realismAssets = {
  corridor: loadAssetTexture('assets/corridor_day.jpg'),
  roomA: loadAssetTexture('assets/guest_room_sunset.jpg'),
  roomB: loadAssetTexture('assets/guest_room_lux.jpg'),
  forbidden: loadAssetTexture('assets/forbidden_room.jpg'),
  exterior: loadAssetTexture('assets/ryokan_exterior_night.jpg')
};
const posterAssets = {
  missing: loadAssetTexture('assets/posters/missing.jpg'),
  wanted: loadAssetTexture('assets/posters/wanted.jpg')
};

const characterAssets = {
  hero: {
    front: loadAssetTexture('assets/characters/casual_front.png'),
    side: loadAssetTexture('assets/characters/casual_side.png'),
    portrait: loadAssetTexture('assets/characters/portrait_smile.png')
  },
  okami: {
    front: loadAssetTexture('assets/characters/suit_front.png'),
    side: loadAssetTexture('assets/characters/suit_side.png'),
    portrait: loadAssetTexture('assets/characters/portrait_smile.png')
  },
  maid: {
    front: loadAssetTexture('assets/characters/yukata_front.png'),
    side: loadAssetTexture('assets/characters/yukata_side.png'),
    portrait: loadAssetTexture('assets/characters/portrait_smile.png')
  },
  guest: {
    front: loadAssetTexture('assets/characters/casual_front.png'),
    side: loadAssetTexture('assets/characters/casual_side.png'),
    portrait: loadAssetTexture('assets/characters/portrait_serious.png')
  },
  chef: {
    front: loadAssetTexture('assets/characters/tracksuit_front.png'),
    side: loadAssetTexture('assets/characters/tracksuit_side.png'),
    portrait: loadAssetTexture('assets/characters/portrait_serious.png')
  },
  villager: {
    front: loadAssetTexture('assets/characters/coat_front.png'),
    side: loadAssetTexture('assets/characters/coat_side.png'),
    portrait: loadAssetTexture('assets/characters/portrait_smile.png')
  },
  guide: {
    front: loadAssetTexture('assets/characters/guide_scary_front.png'),
    side: loadAssetTexture('assets/characters/guide_scary_side.png'),
    portrait: loadAssetTexture('assets/characters/portrait_serious.png')
  },
  suit: {
    front: loadAssetTexture('assets/characters/suit_front.png'),
    side: loadAssetTexture('assets/characters/suit_side.png'),
    portrait: loadAssetTexture('assets/characters/portrait_smile.png')
  },
  casual: {
    front: loadAssetTexture('assets/characters/casual_front.png'),
    side: loadAssetTexture('assets/characters/casual_side.png'),
    portrait: loadAssetTexture('assets/characters/portrait_smile.png')
  },
  tracksuit: {
    front: loadAssetTexture('assets/characters/tracksuit_front.png'),
    side: loadAssetTexture('assets/characters/tracksuit_side.png'),
    portrait: loadAssetTexture('assets/characters/portrait_serious.png')
  },
  yukata: {
    front: loadAssetTexture('assets/characters/yukata_front.png'),
    side: loadAssetTexture('assets/characters/yukata_side.png'),
    portrait: loadAssetTexture('assets/characters/portrait_smile.png')
  },
  coat: {
    front: loadAssetTexture('assets/characters/coat_front.png'),
    side: loadAssetTexture('assets/characters/coat_side.png'),
    portrait: loadAssetTexture('assets/characters/portrait_serious.png')
  },
  crouch: {
    front: loadAssetTexture('assets/characters/crouch_pose.png'),
    side: loadAssetTexture('assets/characters/crouch_pose.png'),
    portrait: loadAssetTexture('assets/characters/portrait_serious.png'),
    squat: 0.58
  }
};
const portraitPaths = {
  hero: 'assets/characters/portrait_smile.png',
  okami: 'assets/characters/portrait_smile.png',
  maid: 'assets/characters/portrait_smile.png',
  guest: 'assets/characters/portrait_serious.png',
  chef: 'assets/characters/portrait_serious.png',
  villager: 'assets/characters/portrait_smile.png',
  guide: 'assets/characters/portrait_serious.png'
};
function createBillboardCharacter(faceType, options={}){
  const profile = characterAssets[faceType] || characterAssets.hero;
  const height = options.height || 1.92;
  const width = options.width || 0.88;
  const squat = options.squat ?? profile.squat ?? 1;
  const g = new THREE.Group();
  g.userData.spriteType = faceType;
  const spriteMat = new THREE.MeshStandardMaterial({
    map: profile.front,
    transparent: true,
    alphaTest: 0.18,
    side: THREE.DoubleSide,
    roughness: 1,
    metalness: 0,
    depthWrite: false
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, height * squat), spriteMat);
  plane.position.y = (height * squat) * 0.5;
  plane.castShadow = true;
  g.add(plane);
  const rim = new THREE.Mesh(
    new THREE.PlaneGeometry(width * 0.94, height * squat * 0.98),
    new THREE.MeshBasicMaterial({ color: 0x0d0f13, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false })
  );
  rim.position.set(0, plane.position.y, -0.03);
  g.add(rim);
  const footShadow = new THREE.Mesh(
    new THREE.CircleGeometry(width * 0.34, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false })
  );
  footShadow.rotation.x = -Math.PI / 2;
  footShadow.position.y = 0.02;
  footShadow.scale.set(1.15, squat < 0.8 ? 0.78 : 1, 1);
  g.add(footShadow);
  if (squat < 0.8) {
    plane.position.y = 0.66;
    footShadow.position.z = 0.08;
  }
  g.userData.spritePlane = plane;
  g.userData.spriteRim = rim;
  g.userData.profile = profile;
  return g;
}
function normalizeAngle(rad){
  while (rad > Math.PI) rad -= Math.PI * 2;
  while (rad < -Math.PI) rad += Math.PI * 2;
  return rad;
}
function updateCharacterBillboard(entity){
  if (!entity || !entity.group || !entity.group.userData || !entity.group.userData.spritePlane) return;
  const profile = entity.group.userData.profile || characterAssets.hero;
  const plane = entity.group.userData.spritePlane;
  const rim = entity.group.userData.spriteRim;
  const dx = camera.position.x - entity.group.position.x;
  const dz = camera.position.z - entity.group.position.z;
  const toCamera = Math.atan2(dx, dz);
  const facing = entity.rot ?? entity.yaw ?? entity.group.rotation.y ?? 0;
  const delta = normalizeAngle(toCamera - facing);
  const absDelta = Math.abs(delta);
  const useSide = absDelta > Math.PI * 0.25 && absDelta < Math.PI * 0.75 && !!profile.side;
  plane.material.map = useSide ? profile.side : profile.front;
  plane.material.needsUpdate = true;
  const flip = delta >= 0 ? 1 : -1;
  if (useSide) {
    plane.scale.x = Math.abs(plane.scale.x) * flip;
    if (rim) rim.scale.x = Math.abs(rim.scale.x) * flip;
  } else {
    plane.scale.x = Math.abs(plane.scale.x);
    if (rim) rim.scale.x = Math.abs(rim.scale.x);
  }
  plane.rotation.y = toCamera;
  if (rim) rim.rotation.y = toCamera;
}


function lerp(a,b,t){ return a + (b - a) * t; }
function easeInOut(t){ return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
function lerpAngle(a,b,t){ return a + normalizeAngle(b - a) * t; }
function startCutscene(steps, done){
  if (state.cutscene) return;
  resetInput();
  state.menuOpen = true;
  menuOverlay.classList.add('hidden');
  state.cutscene = { steps: steps || [], index: 0, time: 0, started: false, done: done || null };
}
function finishCutscene(){
  const done = state.cutscene && state.cutscene.done;
  state.cutscene = null;
  state.menuOpen = false;
  state.inputLockUntil = performance.now() + 320;
  resetInput();
  if (done) done();
}
function updateCutscene(dt){
  const cs = state.cutscene;
  if (!cs) return;
  if (cs.index >= cs.steps.length) {
    finishCutscene();
    return;
  }
  const step = cs.steps[cs.index];
  if (!cs.started) {
    cs.started = true;
    cs.time = 0;
    if (step.onStart) step.onStart();
  }
  cs.time += dt;
  const dur = Math.max(0.001, step.duration || 0.001);
  const t = Math.min(1, cs.time / dur);
  if (step.onUpdate) step.onUpdate(t, dt);
  if (cs.time >= dur) {
    if (step.onEnd) step.onEnd();
    cs.index += 1;
    cs.started = false;
  }
}
function clearPreviewGuide(){
  if (state.previewGuide && state.previewGuide.group) dynamicGroup.remove(state.previewGuide.group);
  state.previewGuide = null;
}
function spawnPreviewGuide(x, z, yaw){
  clearPreviewGuide();
  const group = makeCharacter('guide');
  group.position.set(x, 0, z);
  dynamicGroup.add(group);
  state.previewGuide = { group, x, z, rot: yaw || 0 };
  updateCharacterBillboard(state.previewGuide);
  return state.previewGuide;
}
function maybeStartLobbyArrivalCutscene(entryDoorId){
  if (entryDoorId && entryDoorId !== 'townToLobby') return;
  if (state.area !== 'lobby') return;
  if (state.questFlags.okamiArrivalSceneDone) return;
  if (!(state.step === 'talk_okami' || state.step === 'walk_to_ryokan')) return;
  const okami = npcs.find(n => n.id === 'okami');
  if (!okami) return;
  const sx = -6.1, sz = 2.55, ex = 0, ez = -3.0;
  okami.group.position.set(sx, 0, sz); okami.x = sx; okami.z = sz; okami.rot = -0.35;
  const yawSideDoor = 0.92;
  const yawDesk = Math.PI;
  startCutscene([
    {
      duration: 0.45,
      onStart(){ player.pitch = -0.06; },
      onUpdate(t){ player.yaw = lerpAngle(player.yaw, yawSideDoor, easeInOut(t)); }
    },
    {
      duration: 2.5,
      onUpdate(t){
        const e = easeInOut(t);
        okami.group.position.x = lerp(sx, ex, e);
        okami.group.position.z = lerp(sz, ez, e);
        okami.x = okami.group.position.x;
        okami.z = okami.group.position.z;
        const lookX = okami.group.position.x - player.x;
        const lookZ = okami.group.position.z - player.z;
        player.yaw = lerpAngle(player.yaw, Math.atan2(-lookX, -lookZ), 0.06);
        okami.rot = Math.atan2(ex - okami.group.position.x, ez - okami.group.position.z);
      },
      onEnd(){ okami.rot = Math.PI; }
    },
    {
      duration: 0.55,
      onUpdate(t){ player.yaw = lerpAngle(player.yaw, yawDesk, easeInOut(t)); player.pitch = lerp(player.pitch, -0.02, t); },
      onEnd(){ state.questFlags.okamiArrivalSceneDone = true; saveToSlot(1, true); }
    }
  ]);
}
function maybeStartArchiveGuideGlimpse(){
  if (state.cutscene || state.chase || state.menuOpen) return;
  if (state.area !== 'archive' || state.step !== 'inspect_archive') return;
  if (state.questFlags.guideGlimpsed || state.questFlags.hasLedger) return;
  const targetX = 0, targetZ = 1.8;
  if (Math.hypot(player.x - targetX, player.z - targetZ) > 3.35) return;
  state.questFlags.guideGlimpsed = true;
  const actor = spawnPreviewGuide(-3.35, -1.05, 0.45);
  actor.group.visible = false;
  const startYaw = player.yaw;
  const lookYaw = Math.atan2(player.x - actor.group.position.x, player.z - actor.group.position.z);
  startCutscene([
    {
      duration: 0.38,
      onUpdate(t){ player.yaw = lerpAngle(startYaw, lookYaw, easeInOut(t)); player.pitch = lerp(player.pitch, -0.03, t); }
    },
    {
      duration: 0.62,
      onStart(){ actor.group.visible = true; },
      onUpdate(t){
        const e = easeInOut(t);
        actor.group.position.x = lerp(-3.55, -3.0, e);
        actor.x = actor.group.position.x;
        actor.z = actor.group.position.z;
        actor.rot = 0.55;
      }
    },
    {
      duration: 0.45,
      onUpdate(t){
        actor.group.position.x = lerp(-3.0, -3.75, easeInOut(t));
        actor.group.position.y = lerp(0, 0.08, t);
        actor.x = actor.group.position.x;
      },
      onEnd(){ clearPreviewGuide(); saveToSlot(1, true); }
    }
  ]);
}

function addBackdropPlane(tex, x, y, z, w, h, ry=0, opacity=0.92){
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: opacity < 1, opacity });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  plane.position.set(x, y, z);
  plane.rotation.y = ry;
  areaGroup.add(plane);
  return plane;
}
function addFramedPoster(tex, x, y, z, w, h, ry=0){
  const g = new THREE.Group();
  const backing = new THREE.Mesh(new THREE.BoxGeometry(w + 0.18, h + 0.18, 0.06), materials.darkWood);
  backing.position.z = -0.02;
  backing.castShadow = true;
  backing.receiveShadow = true;
  const poster = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
  poster.position.z = 0.02;
  g.add(backing, poster);
  g.position.set(x, y, z);
  g.rotation.y = ry;
  areaGroup.add(g);
  return g;
}
function addDecorPanel(tex, x, y, z, w, h, ry=0){
  const g = new THREE.Group();
  const backing = new THREE.Mesh(new THREE.BoxGeometry(w + 0.24, h + 0.24, 0.07), new THREE.MeshStandardMaterial({ color: 0x261912, roughness: 0.96 }));
  backing.position.z = -0.03;
  backing.castShadow = true;
  backing.receiveShadow = true;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, h + 0.08, 0.03), new THREE.MeshStandardMaterial({ color: 0x9b7836, roughness: 0.5, metalness: 0.12 }));
  frame.position.z = -0.01;
  frame.castShadow = true;
  frame.receiveShadow = true;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
  panel.position.z = 0.02;
  g.add(backing, frame, panel);
  g.position.set(x, y, z);
  g.rotation.y = ry;
  areaGroup.add(g);
  return g;
}
function addAndonLamp(x, z, scale=1){
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.14*scale, 0.82*scale, 0.14*scale), materials.darkWood);
  post.position.y = 0.41*scale;
  const shade = new THREE.Mesh(new THREE.BoxGeometry(0.46*scale, 0.48*scale, 0.46*scale), new THREE.MeshStandardMaterial({ color: 0xf7ecd2, emissive: 0x8d6420, emissiveIntensity: 0.2, roughness: 1 }));
  shade.position.y = 0.98*scale;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.58*scale, 0.08*scale, 0.58*scale), materials.darkWood);
  cap.position.y = 1.26*scale;
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.52*scale, 0.08*scale, 0.52*scale), materials.darkWood);
  base.position.y = 0.04*scale;
  g.add(post, shade, cap, base);
  g.position.set(x, 0, z);
  g.traverse(m => { if (m.isMesh){ m.castShadow = true; m.receiveShadow = true; } });
  areaGroup.add(g);
  return g;
}
function addIkebana(x, z, scale=1){
  const g = new THREE.Group();
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.24*scale, 0.29*scale, 0.18*scale, 18), new THREE.MeshStandardMaterial({ color: 0x4f6576, roughness: 0.72 }));
  bowl.position.y = 0.09*scale;
  const water = new THREE.Mesh(new THREE.CylinderGeometry(0.2*scale, 0.2*scale, 0.05*scale, 18), new THREE.MeshStandardMaterial({ color: 0x6ea5b8, roughness: 0.15, metalness: 0.05, transparent: true, opacity: 0.65 }));
  water.position.y = 0.14*scale;
  g.add(bowl, water);
  const stems = [[-0.05,0.56,0.02,0.15],[0.07,0.68,-0.02,-0.12],[0.12,0.48,0.04,0.08],[-0.11,0.44,-0.03,-0.05]];
  for (const [sx,sy,sz,rz] of stems){
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.014*scale,0.02*scale,sy*scale,8), new THREE.MeshStandardMaterial({ color: 0x3d6f45, roughness: 1 }));
    stem.position.set(sx*scale, (0.18 + sy*0.5)*scale, sz*scale);
    stem.rotation.z = rz;
    g.add(stem);
  }
  for (const [fx,fy,fz,col] of [[-0.09,0.78,0.03,0xe8d7b5],[0.1,0.92,-0.02,0xd7c96a],[0.16,0.66,0.04,0xb36a7d]]){
    const flower = new THREE.Mesh(new THREE.SphereGeometry(0.08*scale, 10, 10), new THREE.MeshStandardMaterial({ color: col, roughness: 0.9 }));
    flower.position.set(fx*scale, fy*scale, fz*scale);
    g.add(flower);
  }
  g.position.set(x,0,z);
  g.traverse(m => { if (m.isMesh){ m.castShadow = true; m.receiveShadow = true; } });
  areaGroup.add(g);
  return g;
}
function addUmbrellaStand(x, z, scale=1, ry=0){
  const g = new THREE.Group();
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.18*scale, 0.22*scale, 0.62*scale, 12), new THREE.MeshStandardMaterial({ color: 0x5c4738, roughness: 0.92 }));
  stand.position.y = 0.31*scale;
  g.add(stand);
  const colors = [0x24394b, 0x6a3428, 0x8d7a5f];
  [-0.1,0,0.1].forEach((dx, i) => {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018*scale, 0.018*scale, 0.84*scale, 8), materials.darkWood);
    shaft.position.set(dx*scale, 0.76*scale, (-0.03 + i*0.03)*scale);
    shaft.rotation.z = (-0.14 + i*0.14);
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.14*scale, 0.28*scale, 10), new THREE.MeshStandardMaterial({ color: colors[i], roughness: 0.88 }));
    canopy.position.set(dx*scale + 0.08*scale, 1.14*scale, (-0.02 + i*0.03)*scale);
    canopy.rotation.z = Math.PI * 0.54;
    g.add(shaft, canopy);
  });
  g.position.set(x,0,z);
  g.rotation.y = ry;
  g.traverse(m => { if (m.isMesh){ m.castShadow = true; m.receiveShadow = true; } });
  areaGroup.add(g);
  return g;
}
function addTeaSet(x, z, scale=1){
  const g = new THREE.Group();
  const tray = new THREE.Mesh(new THREE.BoxGeometry(0.54*scale, 0.04*scale, 0.34*scale), new THREE.MeshStandardMaterial({ color: 0x72462b, roughness: 0.88 }));
  tray.position.y = 0.03*scale;
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.07*scale, 0.1*scale, 0.12*scale, 16), new THREE.MeshStandardMaterial({ color: 0xe0ded8, roughness: 0.62 }));
  pot.position.set(0.1*scale, 0.1*scale, 0);
  const cup1 = new THREE.Mesh(new THREE.CylinderGeometry(0.034*scale, 0.034*scale, 0.05*scale, 14), materials.paper);
  cup1.position.set(-0.12*scale, 0.07*scale, -0.05*scale);
  const cup2 = cup1.clone();
  cup2.position.z = 0.05*scale;
  g.add(tray, pot, cup1, cup2);
  g.position.set(x, 0, z);
  g.traverse(m => { if (m.isMesh){ m.castShadow = true; m.receiveShadow = true; } });
  areaGroup.add(g);
  return g;
}


function addPebbleStrip(x, z, w, d, color=0xaea38f){
  const strip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), new THREE.MeshStandardMaterial({ color, roughness: 1 }));
  strip.position.set(x, -0.08, z);
  strip.receiveShadow = true;
  areaGroup.add(strip);
  return strip;
}
function makeTextPlane(text, scaleX, scaleY, opts={}){
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  const bg = opts.bg ?? 'rgba(0,0,0,0)';
  g.fillStyle = bg;
  g.fillRect(0,0,512,256);
  g.fillStyle = opts.fg || '#f5efe4';
  g.font = `bold ${opts.fontSize || 106}px sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(scaleX, scaleY), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  return mesh;
}
function addBambooPlant(x, z, scale=1){
  const g = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.18*scale, 0.22*scale, 0.34*scale, 14), new THREE.MeshStandardMaterial({ color: 0x58473a, roughness: 0.94 }));
  pot.position.y = 0.17*scale;
  g.add(pot);
  for (const dx of [-0.08, 0.02, 0.11]) {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.022*scale, 0.028*scale, 0.92*scale, 8), new THREE.MeshStandardMaterial({ color: 0x6b8b46, roughness: 1 }));
    stem.position.set(dx*scale, 0.62*scale, 0);
    g.add(stem);
    for (const [ly,lz,rz] of [[0.54,0.04,-0.8],[0.72,-0.02,0.7],[0.86,0.03,-0.45]]) {
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.18*scale, 0.03*scale, 0.08*scale), new THREE.MeshStandardMaterial({ color: 0x56733b, roughness: 1 }));
      leaf.position.set(dx*scale + 0.07*scale*Math.sign(rz), ly*scale, lz*scale);
      leaf.rotation.z = rz;
      g.add(leaf);
    }
  }
  g.position.set(x,0,z);
  g.traverse(m => { if (m.isMesh){ m.castShadow = true; m.receiveShadow = true; } });
  areaGroup.add(g);
  return g;
}
function addCeilingBeam(x, z, w, d, ry=0){
  const beam = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), materials.darkWood);
  beam.position.set(x, 3.18, z);
  beam.rotation.y = ry;
  beam.castShadow = true;
  beam.receiveShadow = true;
  areaGroup.add(beam);
  return beam;
}
function addShojiWallSpan(x, z, w, opts={}){
  const g = new THREE.Group();
  const height = opts.height || 2.28;
  const side = opts.side || 'north';
  const bg = new THREE.Mesh(new THREE.BoxGeometry(w, height, 0.06), new THREE.MeshStandardMaterial({ color: opts.baseColor || 0xeadfcb, roughness: 1 }));
  bg.position.y = height * 0.5;
  g.add(bg);
  const postCount = Math.max(3, Math.round(w / 1.0));
  for (let i = 0; i <= postCount; i++) {
    const px = -w/2 + i * (w/postCount);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, height + 0.16, 0.1), materials.darkWood);
    post.position.set(px, height*0.5, 0.02);
    g.add(post);
  }
  for (let r = 0; r < 3; r++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w - 0.08, 0.06, 0.08), materials.darkWood);
    bar.position.set(0, 0.46 + r * 0.62, 0.03);
    g.add(bar);
  }
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.24, height - 0.28), new THREE.MeshStandardMaterial({ color: opts.paperColor || 0xf7f0df, emissive: opts.emissive || 0x7a5b26, emissiveIntensity: opts.glow ? 0.12 : 0.03, roughness: 1, transparent: true, opacity: 0.94 }));
  paper.position.set(0, height * 0.52, 0.04);
  g.add(paper);
  g.position.set(x, 0, z);
  g.rotation.y = side === 'south' ? Math.PI : (side === 'east' ? -Math.PI/2 : side === 'west' ? Math.PI/2 : 0);
  g.traverse(m => { if (m.isMesh){ m.castShadow = true; m.receiveShadow = true; } });
  areaGroup.add(g);
  return g;
}
function fusumaDoorModel(x, z, axis, label){
  const g = new THREE.Group();
  const frameW = 1.66;
  const frameH = 2.34;
  const postL = new THREE.Mesh(new THREE.BoxGeometry(0.1, frameH, 0.18), materials.darkWood);
  const postR = postL.clone();
  postL.position.set(-frameW/2, frameH/2, 0); postR.position.set(frameW/2, frameH/2, 0);
  const top = new THREE.Mesh(new THREE.BoxGeometry(frameW + 0.1, 0.12, 0.18), materials.darkWood);
  top.position.set(0, frameH - 0.06, 0);
  const sill = new THREE.Mesh(new THREE.BoxGeometry(frameW + 0.04, 0.08, 0.18), materials.darkWood);
  sill.position.set(0, 0.04, 0);
  g.add(postL, postR, top, sill);
  const panelMat = new THREE.MeshStandardMaterial({ color: 0xf0e6d6, roughness: 1 });
  const left = new THREE.Mesh(new THREE.BoxGeometry(0.72, 2.02, 0.06), panelMat);
  const right = left.clone();
  left.position.set(-0.35, 1.05, 0.01); right.position.set(0.35, 1.05, -0.01);
  g.add(left, right);
  for (const panel of [left, right]) {
    const bars = new THREE.Group();
    for (let i = -1; i <= 1; i++) {
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.82, 0.025), materials.darkWood);
      v.position.set(i*0.18, 1.05, 0.04);
      bars.add(v);
    }
    for (let y of [0.42, 0.96, 1.48]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.04, 0.025), materials.darkWood);
      h.position.set(0, y, 0.04);
      bars.add(h);
    }
    bars.position.x = panel.position.x;
    g.add(bars);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.14, 10), materials.brass);
    handle.rotation.z = Math.PI / 2;
    handle.position.set(panel.position.x > 0 ? 0.08 : -0.08, 1.02, 0.05);
    g.add(handle);
  }
  const sign = makeTextPlane(label || '客室', 0.7, 0.18, { fg: '#f5efe4', bg: 'rgba(0,0,0,.35)', fontSize: 76 });
  sign.position.set(0, 2.62, 0.03);
  g.add(sign);
  if (axis === 'x') g.rotation.y = Math.PI/2;
  g.position.set(x,0,z);
  g.traverse(m => { if (m.isMesh){ m.castShadow = true; m.receiveShadow = true; } });
  areaGroup.add(g);
  return g;
}
function norenDoorModel(x, z, axis, label, opts={}){
  const g = new THREE.Group();
  const width = opts.width || 1.72;
  const height = opts.height || 2.18;
  const clothColor = opts.clothColor || 0x203d5a;
  const postL = new THREE.Mesh(new THREE.BoxGeometry(0.1, height + 0.12, 0.16), materials.darkWood);
  const postR = postL.clone();
  postL.position.set(-width/2, (height+0.12)/2, 0);
  postR.position.set(width/2, (height+0.12)/2, 0);
  const top = new THREE.Mesh(new THREE.BoxGeometry(width + 0.1, 0.12, 0.16), materials.darkWood);
  top.position.set(0, height + 0.06, 0);
  g.add(postL, postR, top);
  const clothMat = new THREE.MeshStandardMaterial({ color: clothColor, roughness: 1, side: THREE.DoubleSide });
  for (let i = 0; i < 2; i++) {
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(width*0.46, 1.55), clothMat);
    cloth.position.set(i === 0 ? -width*0.24 : width*0.24, 1.5, 0.04);
    g.add(cloth);
  }
  const text = makeTextPlane(label || '暖簾', 0.9, 0.28, { fg: '#f8f4ea', fontSize: 110 });
  text.position.set(0, 1.55, 0.05);
  g.add(text);
  if (opts.subLabel) {
    const sub = makeTextPlane(opts.subLabel, 0.85, 0.16, { fg: '#f1ebdc', fontSize: 56 });
    sub.position.set(0, 0.56, 0.05);
    g.add(sub);
  }
  if (opts.blocked) {
    const stand = makeCleaningSign(0.8, 0.54, opts.cleanText || '清掃中');
    stand.position.set(0,0,0.52);
    g.add(stand);
  }
  if (axis === 'x') g.rotation.y = Math.PI/2;
  g.position.set(x,0,z);
  g.traverse(m => { if (m.isMesh){ m.castShadow = true; m.receiveShadow = true; } });
  areaGroup.add(g);
  return g;
}
function makeCleaningSign(w=0.8, h=0.5, text='清掃中'){
  const g = new THREE.Group();
  const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), new THREE.MeshStandardMaterial({ color: 0xf6f0df, roughness: 1 }));
  board.position.y = 0.72;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w+0.06, h+0.06, 0.03), materials.darkWood);
  frame.position.set(0,0.72,-0.03);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.72, 0.05), materials.darkWood);
  const legR = legL.clone();
  legL.position.set(-0.18,0.34,0.1); legL.rotation.z = 0.15;
  legR.position.set(0.18,0.34,0.1); legR.rotation.z = -0.15;
  const txt = makeTextPlane(text, w*0.82, h*0.48, { fg: '#1a120d', fontSize: 82 });
  txt.position.set(0,0.72,0.04);
  g.add(frame, board, legL, legR, txt);
  g.traverse(m => { if (m.isMesh){ m.castShadow = true; m.receiveShadow = true; } });
  return g;
}


function makeWoodTexture(w, h, dark){
  const c=document.createElement('canvas'); c.width=w; c.height=h; const g=c.getContext('2d');
  const base=dark? '#4a3729':'#7a5b42';
  const hi=dark? '#5c4837':'#946f52';
  const lo=dark? '#37271d':'#654c39';
  g.fillStyle=base; g.fillRect(0,0,w,h);
  for(let i=0;i<260;i++){
    g.fillStyle = i%3===0? hi: lo;
    const y = Math.random()*h;
    g.fillRect(0,y,w,Math.random()*2+1);
  }
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(2,2); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}
function makeShojiTexture(w,h){
  const c=document.createElement('canvas'); c.width=w; c.height=h; const g=c.getContext('2d');
  g.fillStyle='#f1ebdc'; g.fillRect(0,0,w,h);
  g.strokeStyle='#5c3d23'; g.lineWidth=10;
  for(let x=0;x<=w;x+=w/4){ g.beginPath(); g.moveTo(x,0); g.lineTo(x,h); g.stroke(); }
  for(let y=0;y<=h;y+=h/4){ g.beginPath(); g.moveTo(0,y); g.lineTo(w,y); g.stroke(); }
  const tex=new THREE.CanvasTexture(c); tex.colorSpace=THREE.SRGBColorSpace; return tex;
}
function makeTatamiTexture(w,h){
  const c=document.createElement('canvas'); c.width=w; c.height=h; const g=c.getContext('2d');
  g.fillStyle='#8a8c6a'; g.fillRect(0,0,w,h);
  for(let i=0;i<600;i++){
    g.strokeStyle = i%2? 'rgba(85,92,62,.5)' : 'rgba(137,144,106,.38)';
    g.beginPath(); const x=Math.random()*w; g.moveTo(x,0); g.lineTo(x+Math.random()*20-10,h); g.stroke();
  }
  const tex=new THREE.CanvasTexture(c); tex.wrapS=tex.wrapT=THREE.RepeatWrapping; tex.repeat.set(2,2); tex.colorSpace=THREE.SRGBColorSpace; return tex;
}
function makeTileTexture(w,h){
  const c=document.createElement('canvas'); c.width=w; c.height=h; const g=c.getContext('2d');
  g.fillStyle='#6e6f72'; g.fillRect(0,0,w,h); g.strokeStyle='rgba(255,255,255,.08)';
  for(let x=0;x<=w;x+=64){g.beginPath();g.moveTo(x,0);g.lineTo(x,h);g.stroke();}
  for(let y=0;y<=h;y+=64){g.beginPath();g.moveTo(0,y);g.lineTo(w,y);g.stroke();}
  const tex=new THREE.CanvasTexture(c); tex.wrapS=tex.wrapT=THREE.RepeatWrapping; tex.repeat.set(4,4); tex.colorSpace=THREE.SRGBColorSpace; return tex;
}
function makeCarpetTexture(w,h){
  const c=document.createElement('canvas'); c.width=w; c.height=h; const g=c.getContext('2d');
  g.fillStyle='#3b1c1c'; g.fillRect(0,0,w,h);
  for(let i=0;i<1000;i++){ g.fillStyle = i%2?'rgba(120,40,40,.18)':'rgba(50,12,12,.18)'; g.fillRect(Math.random()*w, Math.random()*h, 2, 2);}  
  const tex=new THREE.CanvasTexture(c); tex.wrapS=tex.wrapT=THREE.RepeatWrapping; tex.repeat.set(3,3); tex.colorSpace=THREE.SRGBColorSpace; return tex;
}

function clearArray(arr){ arr.length = 0; }
function disposeHierarchy(obj){ obj.traverse(child => { if (child.geometry) child.geometry.dispose?.(); }); }

function addCollider(x1,z1,x2,z2){ colliders.push({ x1: Math.min(x1,x2), z1: Math.min(z1,z2), x2: Math.max(x1,x2), z2: Math.max(z1,z2) }); }
function addBoxCollider(x,z,w,d){ addCollider(x - w/2, z - d/2, x + w/2, z + d/2); }

function createFloor(width, depth, material, y){
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 0.2, depth), material);
  mesh.position.set(0, y || -0.1, 0);
  mesh.receiveShadow = true;
  areaGroup.add(mesh);
  return mesh;
}
function createCeiling(width, depth, color){
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 0.16, depth), new THREE.MeshStandardMaterial({ color: color || 0xf3eee4, roughness: 1 }));
  mesh.position.set(0, 3.58, 0);
  mesh.receiveShadow = true;
  areaGroup.add(mesh);
  return mesh;
}
function wallSegment(x, z, w, h, d, mat){
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || materials.wallWarm);
  mesh.position.set(x, h / 2, z);
  mesh.castShadow = true; mesh.receiveShadow = true;
  areaGroup.add(mesh);
  addBoxCollider(x, z, w, d);
  return mesh;
}
function addLamp(x,z,intensity,color){
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), new THREE.MeshBasicMaterial({ color: color || 0xffdda6 }));
  bulb.position.set(x, 2.65, z); areaGroup.add(bulb);
  const p = new THREE.PointLight(color || 0xffd69a, intensity || 0.9, 11, 2.1);
  p.position.set(x, 2.5, z); p.castShadow = false; areaGroup.add(p);
}
function doorModel(x,z,axis,label,color,opts={}){
  if (opts.style === 'fusuma') return fusumaDoorModel(x, z, axis, label);
  if (opts.style === 'noren') return norenDoorModel(x, z, axis, opts.signText || label, opts);
  const g = new THREE.Group();
  const frameMat = materials.darkWood;
  const panelMat = new THREE.MeshStandardMaterial({ color: color || 0xe8dcc2, roughness: 0.95 });
  const signMat = new THREE.MeshStandardMaterial({ color: 0x1a100d, roughness: 1 });
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.9, 0.05), signMat);
  const signText = makeLabelPlane(label || '扉', 1.0, 0.3);
  signText.position.set(0, 0, 0.03);
  sign.add(signText);
  const left = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.3, 0.18), frameMat);
  const right = left.clone();
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.12, 0.18), frameMat);
  left.position.set(-0.73, 1.15, 0); right.position.set(0.73, 1.15, 0); top.position.set(0, 2.24, 0);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(1.34, 2.08, 0.12), panelMat);
  panel.position.set(0, 1.04, 0);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), materials.brass);
  knob.position.set(0.52, 1.08, 0.09);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.34, 0.04), new THREE.MeshStandardMaterial({ color: 0x2d2d31, roughness: 0.5 }));
  plate.position.set(0.52, 1.08, 0.06);
  sign.position.set(0, 2.8, 0.03);
  g.add(left,right,top,panel,plate,knob,sign);
  if (axis === 'x') g.rotation.y = Math.PI / 2;
  g.position.set(x,0,z);
  g.traverse(m => { if (m.isMesh){ m.castShadow = true; m.receiveShadow = true; } });
  areaGroup.add(g);
  return g;
}
function makeLabelPlane(text, scaleX, scaleY){
  const c=document.createElement('canvas'); c.width=512; c.height=256; const g=c.getContext('2d');
  g.fillStyle='#f4f0e2'; g.fillRect(0,0,512,256);
  g.fillStyle='#140d0c'; g.font='bold 92px sans-serif'; g.textAlign='center'; g.textBaseline='middle'; g.fillText(text,256,128);
  const tex=new THREE.CanvasTexture(c); tex.colorSpace=THREE.SRGBColorSpace;
  const mat=new THREE.MeshBasicMaterial({ map:tex, transparent:false });
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(scaleX, scaleY), mat);
  return mesh;
}

function receptionDesk(){
  const g=new THREE.Group();
  const warmPaperMat = new THREE.MeshStandardMaterial({ color: 0xf3eee0, emissive: 0x9f7d41, emissiveIntensity: 0.18, roughness: 1 });
  const frontFrame = new THREE.Mesh(new THREE.BoxGeometry(4.95, 1.3, 0.24), materials.darkWood);
  frontFrame.position.set(0,0.65,0); frontFrame.castShadow = true; frontFrame.receiveShadow = true; g.add(frontFrame);
  const lowerGlow = new THREE.Mesh(new THREE.BoxGeometry(4.55, 0.72, 0.08), warmPaperMat);
  lowerGlow.position.set(0,0.38,0.11); g.add(lowerGlow);
  for (let i = -8; i <= 8; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.04, 0.08), materials.wood);
    slat.position.set(i * 0.25, 0.67, 0.14); slat.castShadow = slat.receiveShadow = true; g.add(slat);
  }
  for (let y of [0.18, 0.38, 0.58]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.04, 0.09), materials.wood);
    rail.position.set(0, y, 0.16); rail.castShadow = rail.receiveShadow = true; g.add(rail);
  }
  const upperWood = new THREE.Mesh(new THREE.BoxGeometry(4.35, 0.42, 0.76), new THREE.MeshStandardMaterial({ color: 0x6f533a, roughness: 0.92 }));
  upperWood.position.set(0,1.02,-0.05); upperWood.castShadow = upperWood.receiveShadow = true; g.add(upperWood);
  for (let i = -13; i <= 13; i++) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.34, 0.74), materials.darkWood);
    rib.position.set(i * 0.16, 1.03, -0.03); rib.castShadow = rib.receiveShadow = true; g.add(rib);
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(5.2,0.14,1.18), materials.wood);
  top.position.set(0,1.39,-0.02); top.castShadow = true; top.receiveShadow = true; g.add(top);
  const topLip = new THREE.Mesh(new THREE.BoxGeometry(5.04,0.08,0.18), materials.darkWood);
  topLip.position.set(0,1.27,0.46); topLip.castShadow = topLip.receiveShadow = true; g.add(topLip);
  const backPanel = new THREE.Mesh(new THREE.BoxGeometry(4.6,2.3,0.28), new THREE.MeshStandardMaterial({ color: 0x7b6146, roughness: 0.98 }));
  backPanel.position.set(0,1.15,-1.25); backPanel.castShadow = backPanel.receiveShadow = true; g.add(backPanel);
  for (let i=-10;i<=10;i++) {
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.15, 0.08), materials.darkWood);
    v.position.set(i*0.2, 1.65, -1.08); v.castShadow = v.receiveShadow = true; g.add(v);
  }
  const plaqueL = new THREE.Mesh(new THREE.BoxGeometry(1.05,1.05,0.07), new THREE.MeshStandardMaterial({ color: 0xe7dece, roughness: 1 }));
  plaqueL.position.set(-1.55,1.85,-1.06); g.add(plaqueL);
  const plaqueR = plaqueL.clone(); plaqueR.position.set(1.6,1.28,-1.06); g.add(plaqueR);
  const kanjiL = makeTextPlane('帳', 0.72, 0.72, { fg:'#5d4327', bg:'rgba(0,0,0,0)', fontSize:160 });
  kanjiL.position.set(-1.55,1.85,-1.01); g.add(kanjiL);
  const kanjiR = makeTextPlane('場', 0.72, 0.72, { fg:'#5d4327', bg:'rgba(0,0,0,0)', fontSize:160 });
  kanjiR.position.set(1.6,1.28,-1.01); g.add(kanjiR);
  const lanternOffsets = [-1.45, -0.55, 0.35];
  lanternOffsets.forEach((lx, idx) => {
    const lantern = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17,0.22,0.34,12), warmPaperMat);
    body.position.y = 0.18; lantern.add(body);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.12,0.04,12), materials.wood); cap.position.y = 0.37; lantern.add(cap);
    const base = cap.clone(); base.position.y = -0.01; lantern.add(base);
    lantern.position.set(lx,1.44,0.05 + idx*0.03); lantern.traverse(m=>{ if(m.isMesh){ m.castShadow = true; m.receiveShadow = true; }}); g.add(lantern);
  });
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.11,0.11,0.07,18), materials.brass);
  bell.position.set(1.55,1.48,0.04); g.add(bell);
  const ledger = new THREE.Mesh(new THREE.BoxGeometry(0.92,0.08,0.62), new THREE.MeshStandardMaterial({ color: 0x27495d, roughness: 0.8 }));
  ledger.position.set(0.88,1.45,0.05); g.add(ledger);
  const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.26,0.32,0.34,18), new THREE.MeshStandardMaterial({ color: 0x7f5f40, roughness: 0.96 }));
  stool.position.set(2.9,0.18,0.75); stool.castShadow = stool.receiveShadow = true; g.add(stool);
  const deskRug = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.03, 1.9), new THREE.MeshStandardMaterial({ color: 0x6d2a1f, roughness: 1 }));
  deskRug.position.set(0, 0.02, 1.15); deskRug.receiveShadow = true; g.add(deskRug);
  const keyRack = new THREE.Group();
  const rackBack = new THREE.Mesh(new THREE.BoxGeometry(2.7, 1.15, 0.08), new THREE.MeshStandardMaterial({ color: 0x60422e, roughness: 1 }));
  rackBack.position.set(0, 1.95, -1.03); keyRack.add(rackBack);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const hook = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.08, 8), materials.brass);
      hook.rotation.z = Math.PI * 0.5;
      hook.position.set(-0.9 + col * 0.6, 2.28 - row * 0.32, -0.97);
      keyRack.add(hook);
      const tag = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.03), new THREE.MeshStandardMaterial({ color: 0xe8d7af, roughness: 0.95 }));
      tag.position.set(-0.84 + col * 0.6, 2.16 - row * 0.32, -0.92);
      keyRack.add(tag);
    }
  }
  g.add(keyRack);
  const wallLampL = new THREE.Mesh(new THREE.BoxGeometry(0.26,0.46,0.14), warmPaperMat);
  wallLampL.position.set(-2.2, 1.9, -0.98); g.add(wallLampL);
  const wallLampR = wallLampL.clone(); wallLampR.position.x = 2.2; g.add(wallLampR);
  const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.11,0.28,14), new THREE.MeshStandardMaterial({ color: 0xd6d5d1, roughness: 0.62 }));
  vase.position.set(-1.85,1.48,0.1); g.add(vase);
  const stemA = new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.016,0.46,8), new THREE.MeshStandardMaterial({ color: 0x607a48, roughness: 1 }));
  stemA.position.set(-1.87,1.72,0.08); stemA.rotation.z = 0.24; g.add(stemA);
  const flowerA = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 10), new THREE.MeshStandardMaterial({ color: 0xe8d8d0, roughness: 0.9 }));
  flowerA.position.set(-1.8,1.96,0.1); g.add(flowerA);
  g.position.set(0,0,-4.3); areaGroup.add(g);
  addBoxCollider(0,-3.35,5.3,1.65);
}
function bathCurtain(){
  const g = new THREE.Group();
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,3,12), materials.brass);
  rod.rotation.z = Math.PI / 2; rod.position.set(0,2.4,0); g.add(rod);
  for(let i=0;i<6;i++){
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.42,1.9,0.06), new THREE.MeshStandardMaterial({ color: i%2?0x1e4c8f:0xf4f5f7, roughness: 1 }));
    cloth.position.set(-1.1 + i*0.44,1.42,0); cloth.castShadow = true; cloth.receiveShadow = true; g.add(cloth);
  }
  g.position.set(0,0,-2.7); areaGroup.add(g);
}

function makeToiletStallDoorMesh(){
  const door = new THREE.Mesh(new THREE.BoxGeometry(2.1,1.85,0.06), new THREE.MeshStandardMaterial({ color: 0xf0efe9, roughness: 1 }));
  door.castShadow = true;
  door.receiveShadow = true;
  return door;
}
function addOpenedToiletStallDoor(x, z){
  const openDoor = makeToiletStallDoorMesh();
  openDoor.position.set(x, 0.95, z);
  openDoor.rotation.y = -Math.PI * 0.58;
  dynamicGroup.add(openDoor);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 10), materials.brass);
  knob.position.set(x - 0.56, 1.02, z + 0.22);
  dynamicGroup.add(knob);
  return openDoor;
}
function archiveShelves(){
  for(let row=0; row<2; row++){
    const shelf = new THREE.Group();
    const side1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.3, 2.8), materials.darkWood);
    const side2 = side1.clone();
    const boards=[];
    for(let i=0;i<4;i++){
      const board = new THREE.Mesh(new THREE.BoxGeometry(2.2,0.08,2.8), materials.darkWood);
      board.position.set(0,0.34 + i*0.56,0); boards.push(board); shelf.add(board);
    }
    side1.position.set(-1.04,1.15,0); side2.position.set(1.04,1.15,0); shelf.add(side1, side2);
    for(let i=0;i<18;i++){
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.16 + Math.random()*0.08, 0.34 + Math.random()*0.2, 0.28), new THREE.MeshStandardMaterial({ color: [0x2f4b62,0x755544,0x63613d,0x473a57][i%4], roughness: 0.9 }));
      b.position.set(-0.82 + (i%9)*0.2, 0.54 + Math.floor(i/9)*0.56, -1 + (i%3)*0.95); shelf.add(b);
    }
    shelf.position.set(row===0?-2.6:2.6,0,-0.5); shelf.rotation.y = row===0? 0 : 0; areaGroup.add(shelf);
    addBoxCollider(shelf.position.x, shelf.position.z, 2.25, 3.0);
  }
}


function makeCharacter(type, costume){
  const spriteType = typeof costume === 'string' ? costume : type;
  return createBillboardCharacter(spriteType);
}
function addNPC(id, name, faceType, costume, x, z, rot, onInteract){
  const spriteType = typeof costume === 'string' ? costume : faceType;
  const npc = { id, name, x, z, rot: rot || 0, onInteract, faceType, spriteType };
  npc.group = createBillboardCharacter(spriteType, { baseYaw: rot || 0 });
  npc.group.position.set(x, 0, z);
  dynamicGroup.add(npc.group);
  npcs.push(npc);
  return npc;
}
function addItem(id, label, x, z, mesh, onInteract){
  mesh.position.set(x, mesh.position.y, z);
  dynamicGroup.add(mesh);
  items.push({ id, label, x, z, mesh, onInteract });
}
function addDoor(id, label, x, z, radius, toArea, toSpawn, axis, color, opts){
  doorModel(x, z, axis, label, color, opts || {});
  doors.push({ id, label, x, z, radius: radius || 1.18, toArea, toSpawn });
}

function addTree(x, z, scale){
  const s = scale || 1;
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14*s, 0.18*s, 1.4*s, 10), materials.bark);
  trunk.position.y = 0.7*s; trunk.castShadow = true; trunk.receiveShadow = true; g.add(trunk);
  const crown1 = new THREE.Mesh(new THREE.SphereGeometry(0.72*s, 14, 12), materials.leaf);
  crown1.position.set(0, 1.7*s, 0); crown1.castShadow = true; crown1.receiveShadow = true; g.add(crown1);
  const crown2 = new THREE.Mesh(new THREE.SphereGeometry(0.56*s, 14, 12), materials.leaf);
  crown2.position.set(0.3*s, 2.0*s, 0.15*s); crown2.castShadow = true; crown2.receiveShadow = true; g.add(crown2);
  g.position.set(x, 0, z);
  areaGroup.add(g);
  addBoxCollider(x, z, 0.9*s, 0.9*s);
}


function maybeStartDay3GuideTease(){
  if (state.cutscene || state.menuOpen || state.chase) return;
  if (state.area !== 'corridor' || state.step !== 'guide_tease_day3') return;
  if (state.questFlags.sawGuideTease2) {
    setStep('enter_203_phantom');
    return;
  }
  if (Math.hypot(player.x - 7.2, player.z + 1.2) > 3.5) return;
  state.questFlags.sawGuideTease2 = true;
  const actor = spawnPreviewGuide(9.6, -2.4, Math.PI * 0.92);
  actor.group.visible = false;
  const startYaw = player.yaw;
  const lookYaw = Math.atan2(player.x - actor.group.position.x, player.z - actor.group.position.z);
  startCutscene([
    {
      duration: 0.4,
      onUpdate(t){
        player.yaw = lerpAngle(startYaw, lookYaw, easeInOut(t));
        player.pitch = lerp(player.pitch, -0.04, t);
      }
    },
    {
      duration: 0.8,
      onStart(){ actor.group.visible = true; },
      onUpdate(t){
        const e = easeInOut(t);
        actor.group.position.x = lerp(9.6, 8.6, e);
        actor.group.position.z = lerp(-2.4, -4.0, e);
        actor.x = actor.group.position.x;
        actor.z = actor.group.position.z;
      },
      onEnd(){ actor.group.visible = false; }
    },
    {
      duration: 0.35,
      onUpdate(t){
        player.pitch = lerp(player.pitch, -0.02, t);
      },
      onEnd(){
        clearPreviewGuide();
        setStep('enter_203_phantom');
      }
    }
  ], () => saveToSlot(1, true));
}

function buildArea(areaId){
  areaGroup.clear(); dynamicGroup.clear(); clearArray(colliders); clearArray(doors); clearArray(npcs); clearArray(items); state.previewGuide = null; state.cutscene = null;
  areaLabelEl.textContent = areaLabels[areaId];
  phaseLabelEl.textContent = stepDefs[state.step].phase;
  dayLabelEl.textContent = 'DAY ' + stepDefs[state.step].day;
  state.day = stepDefs[state.step].day;
  state.phaseLabel = stepDefs[state.step].phase;
  scene.background = new THREE.Color(0x06080d);
  hemi.intensity = 0.7;
  dirLight.intensity = 0.9;
  dirLight.position.set(6, 10, 5);
  scene.fog.color.set(0x080a10);
  scene.fog.near = 16; scene.fog.far = 42;
  if (areaId === 'home') buildHome();
  else if (areaId === 'town') buildTown();
  else if (areaId === 'lobby') buildLobby();
  else if (areaId === 'kitchen') buildKitchen();
  else if (areaId === 'corridor') buildCorridor();
  else if (areaId === 'room201') buildRoom201();
  else if (areaId === 'room202') buildRoom202();
  else if (areaId === 'bath') buildBath();
  else if (areaId === 'archive') buildArchive();
  else if (areaId === 'north') buildNorth();
  else if (areaId === 'detached') buildDetached();
}


function buildHome(){
  const night = state.step === 'sleep_day1';
  scene.background = new THREE.Color(night ? 0x0b0f17 : 0x6f7f93);
  scene.fog.color.set(night ? 0x0b0f17 : 0x738193);
  scene.fog.near = 18; scene.fog.far = 48;
  hemi.intensity = night ? 0.9 : 1.45;
  dirLight.intensity = night ? 0.7 : 1.9;
  dirLight.position.set(-3, 8, 6);
  createFloor(10, 8, materials.wood, -0.1);
  createCeiling(10, 8, night ? 0xd7d2cb : 0xece7dd);
  wallSegment(0,-3.95,10,3.2,0.14,materials.wallWarm); wallSegment(0,3.95,10,3.2,0.14,materials.wallWarm); wallSegment(-4.95,0,0.14,3.2,8,materials.wallDark); wallSegment(4.95,0,0.14,3.2,8,materials.wallDark);
  const homeWindow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.1), new THREE.MeshBasicMaterial({ color: night ? 0x24344a : 0xe7eef7 }));
  homeWindow.position.set(-4.76, 1.95, -0.6); homeWindow.rotation.y = Math.PI / 2; areaGroup.add(homeWindow);
  const desk = new THREE.Mesh(new THREE.BoxGeometry(1.8,0.82,0.8), materials.darkWood); desk.position.set(-2.0,0.41,-2.2); desk.castShadow = desk.receiveShadow = true; areaGroup.add(desk); addBoxCollider(-2.0,-2.2,1.8,0.8);
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.8,1.8,0.5), materials.darkWood); shelf.position.set(-4.1,0.9,2.8); shelf.castShadow = shelf.receiveShadow = true; areaGroup.add(shelf); addBoxCollider(-4.1,2.8,0.8,0.5);
  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.54,0.42,0.24), new THREE.MeshStandardMaterial({ color: 0x41474f, roughness: 0.92 })); bag.position.set(-1.8,0.9,-2.05); areaGroup.add(bag);
  const futon = new THREE.Mesh(new THREE.BoxGeometry(2.6,0.22,2.6), new THREE.MeshStandardMaterial({ color: 0xf0eee8, roughness: 1 })); futon.position.set(0.8,0.02,0.9); areaGroup.add(futon); addBoxCollider(0.8,0.9,2.6,2.6);
  const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.72,0.16,0.34), materials.paper); pillow.position.set(0.1,0.15,-0.02); areaGroup.add(pillow);
  const doorMat = new THREE.Mesh(new THREE.BoxGeometry(1.1,0.02,0.8), materials.carpet); doorMat.position.set(4.1,-0.08,1.0); areaGroup.add(doorMat);
  addLamp(-2.6,-0.4, night ? 0.4 : 0.7); addLamp(2.6,0.2, night ? 0.34 : 0.58);
  const noteMesh = new THREE.Mesh(new THREE.BoxGeometry(0.42,0.02,0.28), materials.paper); noteMesh.position.y = 0.84;
  if (state.step === 'start_note') addItem('scheduleNote','手紙',-2.0,-2.2,noteMesh,itemInteract);
  if (state.step === 'sleep_day1' || state.step === 'sleep_day2') {
    const futonTrigger = new THREE.Mesh(new THREE.BoxGeometry(2.2,0.04,2.0), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.01 }));
    futonTrigger.position.y = 0.05;
    addItem('futonBed','布団',0.8,0.9,futonTrigger,itemInteract);
  }
  addDoor('homeToTown','外へ出る',4.36,1.0,1.1,'town',{x:-8.3,z:0,yaw:-Math.PI/2},'x',0xe7d9be);
  const homeLabel = makeLabelPlane('自宅', 1.4, 0.42); homeLabel.position.set(0,2.45,-3.84); areaGroup.add(homeLabel);
}

function buildTown(){
  scene.background = new THREE.Color(0xaecdf0);
  hemi.intensity = 1.12;
  dirLight.intensity = 1.35;
  dirLight.position.set(-8, 14, 6);
  scene.fog.color.set(0xb7d3ee);
  scene.fog.near = 34;
  scene.fog.far = 82;

  createFloor(40, 24, materials.grass, -0.11);
  const road = new THREE.Mesh(new THREE.BoxGeometry(32, 0.03, 5.4), new THREE.MeshStandardMaterial({ color: 0x7d736a, roughness: 1 }));
  road.position.set(1.5, -0.06, 0);
  road.receiveShadow = true;
  areaGroup.add(road);
  const shoulderA = new THREE.Mesh(new THREE.BoxGeometry(32, 0.02, 0.55), new THREE.MeshStandardMaterial({ color: 0xcbb48a, roughness: 1 }));
  shoulderA.position.set(1.5, -0.07, -2.95);
  areaGroup.add(shoulderA);
  const shoulderB = shoulderA.clone(); shoulderB.position.z = 2.95; areaGroup.add(shoulderB);

  addCollider(-19.8, -11.6, 19.8, -9.4);
  addCollider(-19.8, 9.4, 19.8, 11.6);
  addCollider(-19.8, -11.6, -17.4, 11.6);
  addCollider(17.4, -11.6, 19.8, 11.6);

  const mountainMat = new THREE.MeshStandardMaterial({ color: 0x5e6f67, roughness: 1 });
  for (const [x,z,s] of [[-10,-12,6],[2,-13,7],[14,-12.5,5.8],[-4,12.5,5.6],[11,13,6.6]]) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(s, 6.2, 5), mountainMat);
    m.position.set(x, 2.2, z); m.rotation.y = Math.PI * 0.25; m.castShadow = true; m.receiveShadow = true; areaGroup.add(m);
  }

  const house = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.8, 2.6, 3.8), new THREE.MeshStandardMaterial({ color: 0xcab89b, roughness: 1 }));
  body.position.y = 1.3; body.castShadow = true; body.receiveShadow = true; house.add(body);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.8, 1.8, 4), new THREE.MeshStandardMaterial({ color: 0x5f4b40, roughness: 1 }));
  roof.position.y = 3.0; roof.rotation.y = Math.PI * 0.25; roof.castShadow = true; roof.receiveShadow = true; house.add(roof);
  house.position.set(-12.4, 0, 0);
  areaGroup.add(house);
  addBoxCollider(-12.4, 0, 5.1, 4.0);

  const inn = new THREE.Group();
  const main = new THREE.Mesh(new THREE.BoxGeometry(8.4, 3.0, 6.8), new THREE.MeshStandardMaterial({ color: 0xd7c6aa, roughness: 1 }));
  main.position.set(0,1.5,0); main.castShadow = true; main.receiveShadow = true; inn.add(main);
  const wingL = new THREE.Mesh(new THREE.BoxGeometry(3.0, 2.6, 4.0), new THREE.MeshStandardMaterial({ color: 0xd2c1a4, roughness: 1 }));
  wingL.position.set(-5.2,1.3,0.8); wingL.castShadow = true; wingL.receiveShadow = true; inn.add(wingL);
  const wingR = wingL.clone(); wingR.position.set(5.2,1.3,0.8); inn.add(wingR);
  const roofMain = new THREE.Mesh(new THREE.ConeGeometry(6.3, 2.4, 4), new THREE.MeshStandardMaterial({ color: 0x514134, roughness: 1 }));
  roofMain.position.set(0,3.6,0); roofMain.rotation.y = Math.PI * 0.25; roofMain.castShadow = true; roofMain.receiveShadow = true; inn.add(roofMain);
  const roofWingL = new THREE.Mesh(new THREE.ConeGeometry(3.0, 1.6, 4), new THREE.MeshStandardMaterial({ color: 0x5a493c, roughness: 1 }));
  roofWingL.position.set(-5.2,2.9,0.8); roofWingL.rotation.y = Math.PI * 0.25; roofWingL.castShadow = true; roofWingL.receiveShadow = true; inn.add(roofWingL);
  const roofWingR = roofWingL.clone(); roofWingR.position.set(5.2,2.9,0.8); inn.add(roofWingR);

  const forecourt = new THREE.Mesh(new THREE.BoxGeometry(6.8,0.12,6.8), new THREE.MeshStandardMaterial({ color: 0xada08b, roughness: 1 }));
  forecourt.position.set(0,0.06,5.3); forecourt.receiveShadow = true; inn.add(forecourt);
  const stonePath = new THREE.Mesh(new THREE.BoxGeometry(2.2,0.08,10.4), new THREE.MeshStandardMaterial({ color: 0x92816b, roughness: 1 }));
  stonePath.position.set(0,0.04,1.8); stonePath.receiveShadow = true; inn.add(stonePath);
  const porch = new THREE.Mesh(new THREE.BoxGeometry(4.4,0.18,2.3), materials.darkWood); porch.position.set(0,0.18,4.2); porch.castShadow = true; porch.receiveShadow = true; inn.add(porch);
  const step = new THREE.Mesh(new THREE.BoxGeometry(5.2,0.18,1.1), new THREE.MeshStandardMaterial({ color: 0x857462, roughness: 1 })); step.position.set(0,0.09,5.65); step.receiveShadow = true; inn.add(step);
  const gatePostL = new THREE.Mesh(new THREE.BoxGeometry(0.28,2.4,0.28), materials.darkWood); gatePostL.position.set(-2.2,1.2,6.45); inn.add(gatePostL);
  const gatePostR = gatePostL.clone(); gatePostR.position.x = 2.2; inn.add(gatePostR);
  const gateLintel = new THREE.Mesh(new THREE.BoxGeometry(4.8,0.22,0.34), materials.darkWood); gateLintel.position.set(0,2.32,6.45); inn.add(gateLintel);
  const gateRoof = new THREE.Mesh(new THREE.BoxGeometry(5.3,0.18,1.15), materials.wood); gateRoof.position.set(0,2.52,6.55); inn.add(gateRoof);
  const gateSign = makeLabelPlane('正面玄関', 1.7, 0.32); gateSign.position.set(0,2.86,6.6); inn.add(gateSign);

  const doorFrameL = new THREE.Mesh(new THREE.BoxGeometry(0.16,2.2,0.22), materials.darkWood);
  doorFrameL.position.set(-1.12,1.1,3.43); doorFrameL.castShadow = true; doorFrameL.receiveShadow = true; inn.add(doorFrameL);
  const doorFrameR = doorFrameL.clone(); doorFrameR.position.x = 1.12; inn.add(doorFrameR);
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.48,0.24,0.28), materials.darkWood); lintel.position.set(0,2.3,3.36); lintel.castShadow = true; lintel.receiveShadow = true; inn.add(lintel);
  const doorL = new THREE.Mesh(new THREE.BoxGeometry(0.94,2.02,0.11), new THREE.MeshStandardMaterial({ color: 0xeee6d7, roughness: 0.95 }));
  doorL.position.set(-0.5,1.02,3.44); doorL.castShadow = true; doorL.receiveShadow = true; inn.add(doorL);
  const doorR = doorL.clone(); doorR.position.x = 0.5; inn.add(doorR);
  const handleL = new THREE.Mesh(new THREE.SphereGeometry(0.04,10,10), materials.brass); handleL.position.set(-0.12,1.02,3.51); inn.add(handleL);
  const handleR = handleL.clone(); handleR.position.x = 0.12; inn.add(handleR);
  const noren = new THREE.Mesh(new THREE.BoxGeometry(2.35,0.02,1.0), new THREE.MeshStandardMaterial({ color: 0x25496e, roughness: 1 })); noren.position.set(0,2.02,3.7); inn.add(noren);
  const lanternL = new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.26,0.58,16), new THREE.MeshStandardMaterial({ color: 0xf8f1df, emissive: 0x7a5314, emissiveIntensity: 0.18, roughness: 0.8 }));
  lanternL.position.set(-1.9,1.9,4.05); lanternL.castShadow = true; lanternL.receiveShadow = true; inn.add(lanternL);
  const lanternR = lanternL.clone(); lanternR.position.set(1.9,1.9,4.05); inn.add(lanternR);
  const stoneLampL = new THREE.Mesh(new THREE.CylinderGeometry(0.18,0.22,1.1,12), new THREE.MeshStandardMaterial({ color: 0xb8b0a0, roughness: 1 }));
  stoneLampL.position.set(-2.6,0.55,5.6); inn.add(stoneLampL);
  const stoneLampR = stoneLampL.clone(); stoneLampR.position.x = 2.6; inn.add(stoneLampR);
  const windowMat = new THREE.MeshStandardMaterial({ map: makeShojiTexture(320,320), roughness: 1 });
  for (const x of [-2.9,2.9,-5.4,5.4]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(1.5,1.2,0.08), windowMat); win.position.set(x,1.5,3.48); win.castShadow = true; win.receiveShadow = true; inn.add(win);
  }
  const nameBoard = makeLabelPlane('宵宿旅館', 2.3, 0.5); nameBoard.position.set(0,2.95,3.58); inn.add(nameBoard);
  inn.position.set(12.7,0,0);
  inn.rotation.y = -Math.PI / 2;
  inn.traverse(m => { if (m.isMesh){ m.castShadow = true; m.receiveShadow = true; } });
  areaGroup.add(inn);
  addBoxCollider(12.7,3.1,7.0,3.3);
  addBoxCollider(12.7,-3.1,7.0,3.3);
  addBoxCollider(15.35,0,1.35,8.0);
  addBoxCollider(9.95,2.4,1.15,3.3);
  addBoxCollider(9.95,-2.4,1.15,3.3);

  const gravel = new THREE.Mesh(new THREE.BoxGeometry(8.4,0.04,5.8), new THREE.MeshStandardMaterial({ color: 0xb5a387, roughness: 1 }));
  gravel.position.set(11.2,-0.05,0); gravel.receiveShadow = true; areaGroup.add(gravel);
  const path = new THREE.Mesh(new THREE.BoxGeometry(17.2,0.03,2.5), new THREE.MeshStandardMaterial({ color: 0x9c8a73, roughness: 1 }));
  path.position.set(4.6,-0.04,0); path.receiveShadow = true; areaGroup.add(path);
  const frontPath = new THREE.Mesh(new THREE.BoxGeometry(5.0,0.03,3.2), new THREE.MeshStandardMaterial({ color: 0x9c8a73, roughness: 1 }));
  frontPath.position.set(9.8,-0.04,0); frontPath.receiveShadow = true; areaGroup.add(frontPath);
  const sideFenceMat = new THREE.MeshStandardMaterial({ color: 0x6e5a49, roughness: 1 });
  for (const z of [-6.8, 6.8]) {
    const fence = new THREE.Mesh(new THREE.BoxGeometry(18, 0.9, 0.12), sideFenceMat);
    fence.position.set(4.8, 0.45, z); fence.castShadow = true; fence.receiveShadow = true; areaGroup.add(fence);
  }

  for (let x = -16; x <= 16; x += 3.6) {
    addTree(x, -8.8 + ((x % 2) ? 0.4 : -0.4), 1 + (Math.abs(x) % 3) * 0.05);
    addTree(x + 0.9, 8.8 + ((x % 2) ? -0.25 : 0.25), 0.94);
  }
  addTree(-4.0, -7.4, 1.1); addTree(-1.0, 7.4, 1.05); addTree(5.8, -7.2, 1.08); addTree(9.2, 7.2, 1.0); addTree(15.5, -7.1, 1.0);

  addLamp(-6.0, 0, 0.28, 0xfff2d4);
  addLamp(1.8, 0, 0.24, 0xfff2d4);
  addLamp(9.2, 0, 0.24, 0xfff2d4);
  addLamp(10.1, 0, 0.42, 0xffecbf);
  addAndonLamp(6.8, 2.55, 0.92);
  addAndonLamp(6.8, -2.55, 0.92);
  addUmbrellaStand(8.2, -2.75, 0.8, Math.PI/2);

  const posterBoard = new THREE.Group();
  const boardPostL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.1, 0.12), materials.darkWood);
  const boardPostR = boardPostL.clone();
  const boardFace = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.4, 0.08), new THREE.MeshStandardMaterial({ color: 0xd9cbb4, roughness: 1 }));
  boardPostL.position.set(-0.9, 1.05, 0);
  boardPostR.position.set(0.9, 1.05, 0);
  boardFace.position.set(0, 1.45, 0);
  posterBoard.add(boardPostL, boardPostR, boardFace);
  for (const [px, py, sx, sy] of [[-0.42, 1.6, 0.52, 0.72], [0.18, 1.62, 0.56, 0.76], [-0.12, 1.0, 0.8, 0.46]]) {
    const poster = new THREE.Mesh(new THREE.PlaneGeometry(sx, sy), new THREE.MeshBasicMaterial({ map: realismAssets.missing, transparent: true }));
    poster.position.set(px, py, 0.05);
    posterBoard.add(poster);
  }
  if (stepDefs[state.step].day >= 3) {
    const extra = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.84), new THREE.MeshBasicMaterial({ map: realismAssets.missing, transparent: true, opacity: 0.88 }));
    extra.position.set(0.52, 1.14, 0.06);
    extra.rotation.z = -0.08;
    posterBoard.add(extra);
  }
  posterBoard.position.set(-0.45, 0, 2.85);
  posterBoard.rotation.y = -Math.PI * 0.16;
  posterBoard.traverse(m => { if (m.isMesh) { m.castShadow = m.receiveShadow = true; } });
  areaGroup.add(posterBoard);
  addBoxCollider(-0.45, 2.85, 2.1, 0.5);
  if (state.step === 'inspect_poster_day3') {
    const trigger = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.5, 0.16), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.01 }));
    trigger.position.y = 1.45;
    addItem('posterBoard', '掲示板', -0.45, 2.85, trigger, itemInteract);
  }

  addDoor('townToHome','自宅',-9.1,0,1.2,'home',{x:3.4,z:1.0,yaw:Math.PI/2},'x',0xc4c0b5);
  addDoor('townToLobby','旅館入口',9.15,0,2.1,'lobby',{x:0,z:4.8,yaw:Math.PI},'x',0xc9b07a);
  addBackdropPlane(realismAssets.exterior, 0, 4.4, -15.5, 18, 8.5, 0, 0.88);
  addNPC('villager','町の住民','villager','coat',-2.6,-1.2,Math.PI/2,npcInteract);
}

function buildLobby(){
  createFloor(16, 14, materials.tatami, -0.1);
  createCeiling(16, 14, 0xf0eadc);
  wallSegment(0, -6.95, 16, 3.2, 0.14, materials.wallWarm);
  wallSegment(0, 6.95, 16, 3.2, 0.14, materials.wallWarm);
  wallSegment(-7.95, 0, 0.14, 3.2, 14, materials.darkWood);
  wallSegment(7.95, 0, 0.14, 3.2, 14, materials.darkWood);
  receptionDesk();
  addLamp(-2.9, -0.8, 0.9); addLamp(2.9, -0.8, 0.9); addLamp(0, -2.2, 0.62);
  const sign = makeLabelPlane('帳場', 1.5, 0.46); sign.position.set(0, 2.56, -6.82); areaGroup.add(sign);
  const rearShoji = new THREE.Mesh(new THREE.BoxGeometry(6.4, 1.18, 0.08), new THREE.MeshStandardMaterial({ color: 0xf1ead9, emissive: 0x7a5b26, emissiveIntensity: 0.09, roughness: 1 }));
  rearShoji.position.set(0, 0.86, -6.76); areaGroup.add(rearShoji);
  for (let i = -7; i <= 7; i++) { const rib = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.28, 0.1), materials.darkWood); rib.position.set(i * 0.42, 0.88, -6.7); areaGroup.add(rib); }
  const ceilingBeam = new THREE.Mesh(new THREE.BoxGeometry(6.7, 0.12, 0.2), materials.darkWood); ceilingBeam.position.set(0, 2.15, -6.72); areaGroup.add(ceilingBeam);
  const latticeTop = new THREE.Mesh(new THREE.BoxGeometry(7.1, 0.18, 0.22), materials.darkWood);
  latticeTop.position.set(0, 2.52, -6.66); areaGroup.add(latticeTop);
  const keyShelf = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.3, 0.44), materials.darkWood);
  keyShelf.position.set(5.6, 1.0, -5.85); keyShelf.castShadow = keyShelf.receiveShadow = true; areaGroup.add(keyShelf);
  for (let i = 0; i < 4; i++) {
    const cubby = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.26, 0.34), new THREE.MeshStandardMaterial({ color: 0x6f5236, roughness: 1 }));
    cubby.position.set(5.02 + i * 0.36, 1.06, -5.7); cubby.castShadow = cubby.receiveShadow = true; areaGroup.add(cubby);
  }
  const noticeFrame = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.9, 0.06), materials.darkWood);
  noticeFrame.position.set(-5.3, 1.82, -6.74); areaGroup.add(noticeFrame);
  const noticePaper = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.72, 0.03), new THREE.MeshStandardMaterial({ color: 0xeee1c4, roughness: 1 }));
  noticePaper.position.set(-5.3, 1.82, -6.68); areaGroup.add(noticePaper);
  const cabinet = new THREE.Mesh(new THREE.BoxGeometry(1.3,1.8,0.6), materials.darkWood);
  cabinet.position.set(-6.2,0.9,4.4); cabinet.castShadow = cabinet.receiveShadow = true; areaGroup.add(cabinet); addBoxCollider(-5.2,3.4,1.3,0.6);
  const blackPhone = new THREE.Mesh(new THREE.BoxGeometry(0.4,0.14,0.28), materials.black);
  blackPhone.position.set(2.2,1.36,-4.35); areaGroup.add(blackPhone);
  const amenityCab = new THREE.Mesh(new THREE.BoxGeometry(0.72,0.4,0.46), new THREE.MeshStandardMaterial({ color: 0x8f7555, roughness: 0.9 })); amenityCab.position.y = 1.28;
  if (state.step === 'stock_amenities') addItem('amenityBag','客用備品袋',-5.2,3.42, amenityCab, itemInteract);
  const registerBook = new THREE.Mesh(new THREE.BoxGeometry(0.78,0.08,0.54), new THREE.MeshStandardMaterial({ color: 0x31546b, roughness: 0.82 }));
  registerBook.position.y = 1.36;
  if (state.step === 'inspect_register' || state.step === 'inspect_guestbook_203') addItem('registerBook','宿帳',1.1,-4.25, registerBook, itemInteract);
  if (state.step === 'choose_fate') {
    const burn = new THREE.Mesh(new THREE.BoxGeometry(0.42,0.06,0.3), new THREE.MeshStandardMaterial({ color: 0x3c2f27, roughness: 1 }));
    burn.position.y = 1.38;
    addItem('endingBurn','宿帳を燃やす',-0.9,-4.22,burn,itemInteract);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.42,0.06,0.3), new THREE.MeshStandardMaterial({ color: 0x27495b, roughness: 0.95 }));
    sign.position.y = 1.38;
    addItem('endingSign','宿帳に名前を書く',0,-4.22,sign,itemInteract);
    const follow = new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,0.22,14), materials.brass);
    follow.rotation.z = Math.PI * 0.5;
    follow.position.y = 1.39;
    addItem('endingFollow','誘導員について行く',0.9,-4.22,follow,itemInteract);
  }

  addIkebana(-5.95, 4.15, 0.9);
  addAndonLamp(5.85, 5.65, 0.82);
  addUmbrellaStand(-7.12, -5.6, 0.82, 0);
  addTeaSet(1.85, -4.35, 1.0);

  addFramedPoster(posterAssets.missing, -7.82, 1.65, -0.9, 1.25, 1.75, Math.PI / 2);
  addFramedPoster(posterAssets.wanted, -7.82, 1.55, -3.25, 1.2, 1.65, Math.PI / 2);
  addFramedPoster(posterAssets.missing, 7.82, 1.6, 4.1, 1.15, 1.55, -Math.PI / 2);

  addDoor('lobbyToCorridor', '客室廊下', 7.32, 0, 1.35, 'corridor', { x: -7.6, z: 0, yaw: 0 });
  addDoor('lobbyToKitchen', '厨房', -7.32, 2.6, 1.2, 'kitchen', { x: 5.0, z: -1.2, yaw: Math.PI });
  addDoor('lobbyToArchive', '宿帳庫', -7.32, -2.6, 1.2, 'archive', { x: 5.1, z: 0, yaw: Math.PI });
  if (!state.questFlags.okamiArrivalSceneDone && (state.step === 'walk_to_ryokan' || state.step === 'talk_okami')) addNPC('okami', '女将', 'okami', 'suit', -6.1, 2.55, -0.35, npcInteract);
  else addNPC('okami', '女将', 'okami', 'suit', 0, -3.0, Math.PI, npcInteract);
}

function buildKitchen(){
  createFloor(11, 9, materials.tile, -0.1);
  createCeiling(11, 9, 0xece7dd);
  wallSegment(0,-4.45,11,3.2,0.14,materials.wallDark); wallSegment(0,4.45,11,3.2,0.14,materials.wallDark); wallSegment(-5.45,0,0.14,3.2,9,materials.wallDark); wallSegment(5.45,0,0.14,3.2,9,materials.wallDark);
  const counter = new THREE.Mesh(new THREE.BoxGeometry(3.8,0.92,1.3), materials.darkWood); counter.position.set(0,0.46,-2.3); counter.castShadow = counter.receiveShadow = true; areaGroup.add(counter); addBoxCollider(0,-2.3,3.8,1.3);
  const stove = new THREE.Mesh(new THREE.BoxGeometry(1.6,0.92,0.8), new THREE.MeshStandardMaterial({ color: 0x54565d, roughness: 0.5 })); stove.position.set(-3.7,0.46,2.5); areaGroup.add(stove); addBoxCollider(-3.7,2.5,1.6,0.8);
  addLamp(0,0,0.9); addLamp(3.2,-1.4,0.7);
  addDoor('kitchenToLobby','帳場',5.0,-1.2,1.2,'lobby',{x:-4.8,z:2.2,yaw:0},'x');
  addNPC('chef','料理番','chef','tracksuit',1.8,-1.2,-Math.PI/2,npcInteract);
  const teaTray = new THREE.Mesh(new THREE.BoxGeometry(0.86,0.08,0.56), new THREE.MeshStandardMaterial({ color: 0x7a4e2f, roughness: 0.85 }));
  teaTray.position.y = 0.94;
  const teapot = new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.16,0.18,18), new THREE.MeshStandardMaterial({ color: 0xdfddd7, roughness: 0.55 }));
  teapot.position.set(0.1,0.12,0); teaTray.add(teapot);
  const cup1 = new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,0.08,18), materials.paper); cup1.position.set(-0.18,0.08,-0.1); teaTray.add(cup1);
  const cup2 = cup1.clone(); cup2.position.z = 0.1; teaTray.add(cup2);
  addItem('tray','お茶の盆',0.2,-2.25,teaTray,itemInteract);

  const breakfastTray = new THREE.Mesh(new THREE.BoxGeometry(1.0,0.08,0.66), new THREE.MeshStandardMaterial({ color: 0x77482b, roughness: 0.82 }));
  breakfastTray.position.y = 0.94;
  const rice = new THREE.Mesh(new THREE.CylinderGeometry(0.11,0.11,0.08,18), materials.paper); rice.position.set(-0.16,0.08,-0.08); breakfastTray.add(rice);
  const soup = new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.14,0.12,18), new THREE.MeshStandardMaterial({ color: 0x6d3224, roughness: 0.85 })); soup.position.set(0.14,0.1,-0.08); breakfastTray.add(soup);
  const fish = new THREE.Mesh(new THREE.BoxGeometry(0.24,0.05,0.12), new THREE.MeshStandardMaterial({ color: 0xcbaa64, roughness: 0.9 })); fish.position.set(-0.02,0.09,0.14); breakfastTray.add(fish);
  if (state.step === 'get_breakfast202') addItem('breakfastTray','202号室の朝食膳',-1.55,-2.18,breakfastTray,itemInteract);
}

function buildCorridor(){
  createFloor(24, 9.6, materials.wood, -0.1);
  createCeiling(24, 9.6, 0xe7dcc9);
  wallSegment(0,-4.75,24,3.2,0.14,materials.wallDark);
  wallSegment(0,4.75,24,3.2,0.14,materials.wallDark);
  wallSegment(-11.95,0,0.14,3.2,9.6,materials.wallDark);
  wallSegment(11.95,0,0.14,3.2,9.6,materials.wallDark);

  const runner = new THREE.Mesh(new THREE.BoxGeometry(22.8,0.04,2.55), materials.tatami);
  runner.position.set(0,-0.01,0); runner.receiveShadow = true; areaGroup.add(runner);
  addPebbleStrip(0,-2.2,22.8,0.95,0xb0a48e);
  addPebbleStrip(0,2.2,22.8,0.95,0xb0a48e);
  for (let x=-10; x<=10; x+=4) {
    addLamp(x,0,0.62,0xffd7a6);
    addCeilingBeam(x, 0, 0.22, 9.2);
  }
  const sideRailA = new THREE.Mesh(new THREE.BoxGeometry(23.5,0.2,0.24), materials.darkWood);
  sideRailA.position.set(0,0.18,-4.22); sideRailA.castShadow = sideRailA.receiveShadow = true; areaGroup.add(sideRailA);
  const sideRailB = sideRailA.clone(); sideRailB.position.z = 4.22; areaGroup.add(sideRailB);

  addDoor('corridorToLobby','帳場',-11.34,0,1.2,'lobby',{x:7.1,z:0,yaw:Math.PI},'x');
  addDoor('corridorToNorth','北廊下',11.34,0,1.2,'north',{x:-3.7,z:0,yaw:0},'x',0xc3b28a);
  addDoor('corridorTo201','201',0,-4.58,1.25,'room201',{x:0,z:4.0,yaw:Math.PI},null,0xf0e7d1,{style:'fusuma'});
  addDoor('corridorTo202','202',4.8,-4.58,1.25,'room202',{x:0,z:4.0,yaw:Math.PI},null,0xeaddcd,{style:'fusuma'});
  addDoor('corridorToBath','男湯',8.55,3.95,1.35,'bath',{x:-5.2,z:0,yaw:0},null,0xd7ecef,{style:'noren', clothColor:0x2a3f53, subLabel:'MEN'});
  norenDoorModel(4.75, 3.95, null, '女湯', { clothColor:0x7a463b, subLabel:'WOMEN', blocked:true, cleanText:'清掃中' });

  const placard = makeTextPlane('客室廊下', 1.7, 0.34, { fg:'#f2ecdf', bg:'rgba(14,10,8,.5)', fontSize:78 });
  placard.position.set(-8.4,2.45,-4.58); areaGroup.add(placard);

  addShojiWallSpan(-8.1, 4.66, 5.8, { side:'south', glow:true });
  addShojiWallSpan(-0.9, 4.66, 4.2, { side:'south', glow:true });
  addShojiWallSpan(3.1, 4.66, 1.6, { side:'south', glow:true });
  addShojiWallSpan(-2.35, -4.66, 3.7, { side:'north' });
  addShojiWallSpan(2.25, -4.66, 1.9, { side:'north' });
  addShojiWallSpan(7.55, -4.66, 2.2, { side:'north' });

  const amenityBox = new THREE.Mesh(new THREE.BoxGeometry(0.88,0.7,0.64), materials.darkWood);
  amenityBox.position.set(-6.1,0.35,2.4); amenityBox.castShadow = amenityBox.receiveShadow = true; areaGroup.add(amenityBox); addBoxCollider(-6.1,2.4,0.88,0.64);
  const slipperRack = new THREE.Group();
  const rackBase = new THREE.Mesh(new THREE.BoxGeometry(1.7,0.55,0.36), materials.darkWood); rackBase.position.set(0,0.28,0); slipperRack.add(rackBase);
  for (const [sx,sz] of [[-0.45,-0.06],[0,0.04],[0.45,-0.02]]) { const pair = new THREE.Mesh(new THREE.BoxGeometry(0.28,0.08,0.16), new THREE.MeshStandardMaterial({ color: 0xe8e0ce, roughness: 1 })); pair.position.set(sx,0.38,sz); slipperRack.add(pair); }
  slipperRack.position.set(-9.3,0,-3.25); slipperRack.traverse(m=>{ if(m.isMesh){ m.castShadow = m.receiveShadow = true; } }); areaGroup.add(slipperRack); addBoxCollider(-9.3,-3.25,1.7,0.36);
  if (state.step === 'place_amenities') addItem('amenityBox','備品箱',-6.1,2.4, new THREE.Mesh(new THREE.BoxGeometry(0.48,0.18,0.32), new THREE.MeshStandardMaterial({ color: 0xe1d4be, roughness: 1 })), itemInteract);
  if (state.step === 'arrange_slippers') addItem('slipperRack','下駄箱前',-9.3,-3.25, new THREE.Mesh(new THREE.BoxGeometry(0.6,0.1,0.3), new THREE.MeshStandardMaterial({ color: 0xf4efe5, roughness: 1 })), itemInteract);
  if (state.step === 'enter_203_phantom') {
    const phantom = new THREE.Group();
    const panelL = new THREE.Mesh(new THREE.BoxGeometry(1.0,2.0,0.08), new THREE.MeshStandardMaterial({ color: 0xe9e0d2, roughness: 1, transparent: true, opacity: 0.86 }));
    const panelR = panelL.clone();
    panelL.position.set(-0.52, 1.0, 0);
    panelR.position.set(0.52, 1.0, 0);
    const railTop = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 0.12), materials.darkWood);
    railTop.position.set(0, 2.04, 0.02);
    const railBottom = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 0.12), materials.darkWood);
    railBottom.position.set(0, 0.02, 0.02);
    const plaque = makeTextPlane('203', 0.72, 0.18, { fg:'#f5efdf', bg:'rgba(12,8,6,.55)', fontSize:78 });
    plaque.position.set(0, 2.3, 0.06);
    phantom.add(panelL, panelR, railTop, railBottom, plaque);
    phantom.position.set(8.6, 0, -4.62);
    phantom.traverse(m => { if (m.isMesh) { m.castShadow = m.receiveShadow = true; } });
    addItem('phantom203','203の痕跡',8.6,-4.22,phantom,itemInteract);
  }
  if (state.step === 'collect_lost_item') {
    const lostKey = new THREE.Mesh(new THREE.TorusGeometry(0.14,0.03,8,20), materials.brass);
    lostKey.rotation.x = Math.PI/2; lostKey.position.y = 0.06;
    addItem('lostKey','鍵束',3.2,1.25,lostKey,itemInteract);
  }
  addAndonLamp(-10.45, 3.78, 0.8);
  addAndonLamp(-6.0, 3.78, 0.72);
  addAndonLamp(0.1, 3.78, 0.72);
  addAndonLamp(10.5, 3.78, 0.8);
  addBambooPlant(-7.2, 3.76, 1.15);
  addBambooPlant(-0.6, 3.76, 1.0);
  addBambooPlant(6.2, 3.76, 0.98);
  addIkebana(1.8, 3.86, 0.82);
  addUmbrellaStand(9.8, 3.7, 0.72, Math.PI);
  addNPC('maid','仲居','maid','yukata',4.6,1.2,Math.PI,npcInteract);
}

function buildRoom201(){
  createFloor(9, 9, materials.tatami, -0.1);
  createCeiling(9, 9, 0xf2ece1);
  wallSegment(0,-4.45,9,3.2,0.14,materials.wallWarm); wallSegment(0,4.45,9,3.2,0.14,materials.wallWarm); wallSegment(-4.45,0,0.14,3.2,9,materials.wallDark); wallSegment(4.45,0,0.14,3.2,9,materials.wallDark);
  const alcove = new THREE.Mesh(new THREE.BoxGeometry(1.6,2.5,0.4), materials.darkWood); alcove.position.set(-3.2,1.25,-3.6); areaGroup.add(alcove); addBoxCollider(-3.2,-3.6,1.6,0.4);
  const futon = new THREE.Mesh(new THREE.BoxGeometry(2.2,0.26,3.0), new THREE.MeshStandardMaterial({ color: 0xf1efe8, roughness: 1 })); futon.position.set(1.7,0.03,-1.2); areaGroup.add(futon); addBoxCollider(1.7,-1.2,2.2,3.0);
  const table = new THREE.Mesh(new THREE.BoxGeometry(1.2,0.38,1.2), materials.darkWood); table.position.set(-0.2,0.19,0.8); areaGroup.add(table); addBoxCollider(-0.2,0.8,1.2,1.2);
  addLamp(0,0,0.8); addDoor('room201ToCorridor','客室廊下',0,4.18,1.1,'corridor',{x:0,z:-1.8,yaw:0},null,0xf0e7d1,{style:'fusuma'});
  addBackdropPlane(realismAssets.roomA, 0, 1.65, -4.1, 7.6, 3.3, 0, 0.7);
  addTeaSet(-0.18, 0.82, 1.0);
  addAndonLamp(-3.78, 2.92, 0.62);
  addNPC('guest201','201号室の客','guest','casual',-1.6,-1.2,Math.PI/2,npcInteract);
}



function buildRoom202(){
  createFloor(9, 9, materials.tatami, -0.1);
  createCeiling(9, 9, 0xf2ece1);
  wallSegment(0,-4.45,9,3.2,0.14,materials.wallWarm); wallSegment(0,4.45,9,3.2,0.14,materials.wallWarm); wallSegment(-4.45,0,0.14,3.2,9,materials.wallDark); wallSegment(4.45,0,0.14,3.2,9,materials.wallDark);
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.18,1.9,2.8), materials.shoji); screen.position.set(0.4,0.95,-2.2); areaGroup.add(screen); addBoxCollider(0.4,-2.2,0.18,2.8);
  const futon = new THREE.Mesh(new THREE.BoxGeometry(2.4,0.26,2.8), new THREE.MeshStandardMaterial({ color: 0xf1efe8, roughness: 1 })); futon.position.set(1.7,0.03,-0.6); areaGroup.add(futon); addBoxCollider(1.7,-0.6,2.4,2.8);
  const table = new THREE.Mesh(new THREE.BoxGeometry(1.3,0.38,1.0), materials.darkWood); table.position.set(-0.4,0.19,1.0); areaGroup.add(table); addBoxCollider(-0.4,1.0,1.3,1.0);
  addLamp(0,0,0.8);
  addDoor('room202ToCorridor','客室廊下',0,4.18,1.1,'corridor',{x:4.8,z:-1.2,yaw:0},null,0xeadfcb,{style:'fusuma'});
  addBackdropPlane(realismAssets.roomB, 0, 1.7, -4.1, 7.6, 3.4, 0, 0.74);
  addTeaSet(-0.4, 1.0, 1.0);
  addIkebana(-3.6, 2.85, 0.72);
  addNPC('guest202','202号室の客','guest','coat',-1.4,-1.0,Math.PI/2,npcInteract);
}

function buildBath(){
  createFloor(15, 8, materials.tile, -0.1);
  createCeiling(15, 8, 0xe9ecef);
  wallSegment(0,-3.95,15,3.2,0.14,materials.wallWarm);
  wallSegment(0,3.95,15,3.2,0.14,materials.wallWarm);
  wallSegment(-7.45,0,0.14,3.2,8,materials.wallWarm);
  wallSegment(7.45,0,0.14,3.2,8,materials.wallWarm);

  const runner = new THREE.Mesh(new THREE.BoxGeometry(6.2,0.03,3.2), new THREE.MeshStandardMaterial({ color: 0xd7d1c3, roughness: 1 }));
  runner.position.set(-2.2,-0.085,0); runner.receiveShadow = true; areaGroup.add(runner);
  addDoor('bathToCorridor','戻る',-6.85,0,1.25,'corridor',{x:6.2,z:1.8,yaw:Math.PI},'x',0xddeff3,{style:'noren', clothColor:0x5b3e2d, signText:'暖簾口'});

  const slatMat = new THREE.MeshStandardMaterial({ color: 0x8a6b4b, roughness: 1 });
  const frontDesk = new THREE.Group();
  const desk = new THREE.Mesh(new THREE.BoxGeometry(2.8,0.9,0.78), new THREE.MeshStandardMaterial({ color: 0x6e4a32, roughness: 0.9 }));
  desk.position.set(0,0.45,0);
  frontDesk.add(desk);
  const top = new THREE.Mesh(new THREE.BoxGeometry(3.0,0.08,0.86), materials.darkWood); top.position.set(0,0.9,0); frontDesk.add(top);
  frontDesk.position.set(-1.05,0,2.95);
  frontDesk.traverse(m=>{ if(m.isMesh){ m.castShadow = m.receiveShadow = true; }});
  areaGroup.add(frontDesk); addBoxCollider(-1.05,2.95,3.0,0.86);

  const slatWall = new THREE.Group();
  const backPanel = new THREE.Mesh(new THREE.BoxGeometry(4.8,2.4,0.14), new THREE.MeshStandardMaterial({ color: 0xcfb595, roughness: 1 }));
  backPanel.position.set(0,1.2,0); slatWall.add(backPanel);
  for (let i=-7; i<=7; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.08,2.2,0.08), slatMat);
    slat.position.set(i*0.28,1.18,0.08); slatWall.add(slat);
  }
  const topBeam = new THREE.Mesh(new THREE.BoxGeometry(5.2,0.24,0.24), materials.darkWood); topBeam.position.set(0,2.52,0); slatWall.add(topBeam);
  slatWall.position.set(-1.05,0,3.24);
  slatWall.traverse(m=>{ if(m.isMesh){ m.castShadow = m.receiveShadow = true; }});
  areaGroup.add(slatWall);

  norenDoorModel(-3.45, 2.85, null, '女湯', { clothColor:0x7a463b, subLabel:'WOMEN', blocked:true, cleanText:'清掃中' });
  norenDoorModel(1.45, 2.85, null, '男湯', { clothColor:0x2f3b45, subLabel:'MEN' });

  const bench = new THREE.Mesh(new THREE.BoxGeometry(2.2,0.42,0.6), materials.darkWood); bench.position.set(0.95,0.21,1.95); areaGroup.add(bench); addBoxCollider(0.95,1.95,2.2,0.6);
  const shelfBody = new THREE.Mesh(new THREE.BoxGeometry(1.5,1.4,0.42), materials.darkWood); shelfBody.position.set(4.9,0.7,2.45); shelfBody.castShadow = shelfBody.receiveShadow = true; areaGroup.add(shelfBody); addBoxCollider(4.9,2.45,1.5,0.42);
  for (const sy of [0.48,0.94]) { const plank = new THREE.Mesh(new THREE.BoxGeometry(1.44,0.05,0.5), materials.wood); plank.position.set(4.9,sy,2.45); areaGroup.add(plank); }
  for (const [tx,ty,tz] of [[4.5,1.15,2.47],[4.9,1.15,2.47],[5.3,1.15,2.47],[4.6,0.69,2.47],[5.0,0.69,2.47],[5.4,0.69,2.47]]) { const towel = new THREE.Mesh(new THREE.BoxGeometry(0.22,0.16,0.24), new THREE.MeshStandardMaterial({ color: 0xf1f3f6, roughness: 1 })); towel.position.set(tx,ty,tz); areaGroup.add(towel); }
  if (state.step === 'restock_towels') addItem('towelShelf','替えタオル棚',4.9,2.45, new THREE.Mesh(new THREE.BoxGeometry(0.54,0.22,0.26), new THREE.MeshStandardMaterial({ color: 0xf1f3f6, roughness: 1 })), itemInteract);

  addLamp(-4.7,0.2,0.55,0xffe6bc); addLamp(-1.0,0.2,0.55,0xffe6bc); addLamp(3.1,0.2,0.52,0xffe6bc);
  const phoneTable = new THREE.Mesh(new THREE.BoxGeometry(0.9,0.52,0.58), materials.darkWood); phoneTable.position.set(2.55,0.26,-2.35); areaGroup.add(phoneTable); addBoxCollider(2.55,-2.35,0.9,0.58);
  const phone = new THREE.Mesh(new THREE.BoxGeometry(0.46,0.14,0.32), materials.black); phone.position.set(2.55,0.61,-2.35); areaGroup.add(phone);
  addItem('phone','黒電話',2.55,-2.35, phone, itemInteract);

  wallSegment(4.25,-2.35,0.14,3.2,3.0,materials.wallWarm);
  wallSegment(4.25,2.6,0.14,3.2,2.1,materials.wallWarm);
  const toiletLintel = new THREE.Mesh(new THREE.BoxGeometry(0.14,0.36,2.0), materials.darkWood); toiletLintel.position.set(4.25,2.82,0.25); areaGroup.add(toiletLintel);
  const toiletSign = makeTextPlane('トイレ', 0.9, 0.22, { fg:'#f2ecdf', bg:'rgba(14,10,8,.4)', fontSize:84 }); toiletSign.position.set(4.33,2.55,0.25); toiletSign.rotation.y = -Math.PI / 2; areaGroup.add(toiletSign);

  const toiletFloor = new THREE.Mesh(new THREE.BoxGeometry(5.0,0.03,6.8), new THREE.MeshStandardMaterial({ color: 0xd9d9d7, roughness: 1 }));
  toiletFloor.position.set(6.9,-0.085,0.2); toiletFloor.receiveShadow = true; areaGroup.add(toiletFloor);
  const stallBack = new THREE.Mesh(new THREE.BoxGeometry(4.8,2.2,0.14), materials.wallWarm); stallBack.position.set(6.9,1.1,3.15); areaGroup.add(stallBack); addBoxCollider(6.9,3.15,4.8,0.14);
  const stallLeft = new THREE.Mesh(new THREE.BoxGeometry(0.14,2.2,2.5), materials.wallWarm); stallLeft.position.set(4.6,1.1,1.95); areaGroup.add(stallLeft); addBoxCollider(4.6,1.95,0.14,2.5);
  const stallRight = stallLeft.clone(); stallRight.position.x = 9.2; areaGroup.add(stallRight); addBoxCollider(9.2,1.95,0.14,2.5);
  const stallDivider = stallLeft.clone(); stallDivider.position.set(7.05,1.1,1.95); areaGroup.add(stallDivider); addBoxCollider(7.05,1.95,0.14,2.5);

  if (state.questFlags.toiletStallOpened) {
    addOpenedToiletStallDoor(5.0, 0.26);
  } else {
    const stallDoorL = makeToiletStallDoorMesh();
    stallDoorL.position.y = 0.95;
    addItem('toiletStallDoor','手前個室の扉',5.9,0.8, stallDoorL, itemInteract);
  }
  const stallDoorR = makeToiletStallDoorMesh(); stallDoorR.position.set(8.1,0.95,0.8); areaGroup.add(stallDoorR);

  const toiletA = new THREE.Group();
  const bowlA = new THREE.Mesh(new THREE.CylinderGeometry(0.28,0.34,0.58,18), materials.paper); bowlA.position.set(0,0.29,0); bowlA.castShadow = bowlA.receiveShadow = true; toiletA.add(bowlA);
  const tankA = new THREE.Mesh(new THREE.BoxGeometry(0.45,0.5,0.24), materials.paper); tankA.position.set(0,0.73,-0.18); toiletA.add(tankA);
  toiletA.position.set(5.9,0,2.35); areaGroup.add(toiletA); addBoxCollider(5.9,2.35,0.9,0.9);
  const toiletB = toiletA.clone(); toiletB.position.set(8.1,0,2.35); areaGroup.add(toiletB); addBoxCollider(8.1,2.35,0.9,0.9);
  const sinkBase = new THREE.Mesh(new THREE.BoxGeometry(1.0,0.86,0.5), materials.paper); sinkBase.position.set(8.25,0.43,-2.2); areaGroup.add(sinkBase); addBoxCollider(8.25,-2.2,1.0,0.5);
  const mirror = new THREE.Mesh(new THREE.BoxGeometry(1.1,1.4,0.06), new THREE.MeshStandardMaterial({ color: 0xc3d4e2, roughness: 0.2, metalness: 0.1 })); mirror.position.set(8.25,1.45,-2.6); areaGroup.add(mirror);
  addAndonLamp(3.9, -2.92, 0.72);
  addUmbrellaStand(1.0, -2.85, 0.56, Math.PI);
  addBambooPlant(-5.55, 2.72, 1.0);
  const basket1 = new THREE.Mesh(new THREE.CylinderGeometry(0.24,0.24,0.22,14), new THREE.MeshStandardMaterial({ color: 0x9e825d, roughness: 0.92 })); basket1.position.set(0.15,0.12,1.68); basket1.castShadow = basket1.receiveShadow = true; areaGroup.add(basket1);
  const basket2 = basket1.clone(); basket2.position.x = -0.45; areaGroup.add(basket2);

  if (state.step === 'inspect_bath_notice') {
    const notice = makeTextPlane('清掃案内', 1.02, 0.26, { fg:'#f6efe2', bg:'rgba(40,24,20,.68)', fontSize:76 });
    notice.position.set(-3.45, 1.1, 2.25);
    addItem('bathNotice','清掃中の案内',-3.45,2.25,notice,itemInteract);
  }

  if (state.questFlags.toiletStallOpened) {
    addNPC('toiletGuest','しゃがみ客','guest','crouch',6.15,1.42,0,function(){
      if (state.step === 'talk_toilet_guest_day3') {
        state.questFlags.talkedToToiletGuestDay3 = true;
        showDialogue(storyNodes.toiletGuestDay3, ()=> setStep('inspect_bath_notice'));
      } else {
        showDialogue([['しゃがみ客','……今は話しかけないでくれ。','guest']], ()=>{});
      }
    });
  }
}

function buildArchive(){
  createFloor(14, 12, materials.tile, -0.1);
  createCeiling(14, 12, 0xdad8d6);
  wallSegment(0,-5.95,14,3.2,0.14,materials.wallDark); wallSegment(0,5.95,14,3.2,0.14,materials.wallDark); wallSegment(-6.95,0,0.14,3.2,12,materials.wallDark); wallSegment(6.95,0,0.14,3.2,12,materials.wallDark);
  archiveShelves();
  addLamp(-2.6,0,0.6,0xffe0b4); addLamp(2.6,0,0.6,0xffe0b4);
  addDoor('archiveToLobby','帳場',6.25,0,1.15,'lobby',{x:-5.6,z:-2.2,yaw:0},'x',0xb7b39b);
  addDoor('archiveToDetached','離れ通路',0,-5.25,1.15,'detached',{x:0,z:4.6,yaw:Math.PI},null,0x9689a6);
  const ledger = new THREE.Mesh(new THREE.BoxGeometry(0.72,0.16,0.48), new THREE.MeshStandardMaterial({ color: 0x225688, roughness: 0.85 }));
  ledger.position.y = 1.16;
  addBackdropPlane(realismAssets.forbidden, 0, 1.7, -5.7, 12.4, 3.1, 0, 0.58);
  addItem('blueLedger','青い宿帳',0,1.8, ledger, itemInteract);
}

function buildNorth(){
  createFloor(11, 7, materials.carpet, -0.1);
  createCeiling(11, 7, 0xd7cab5);
  wallSegment(0,-3.45,11,3.2,0.14,materials.wallDark); wallSegment(0,3.45,11,3.2,0.14,materials.wallDark); wallSegment(-5.45,0,0.14,3.2,7,materials.wallDark); wallSegment(5.45,0,0.14,3.2,7,materials.wallDark);
  addLamp(-2,0,0.45,0xffc388); addLamp(2.4,0,0.45,0xffc388);
  addDoor('northToCorridor','客室廊下',-4.85,0,1.1,'corridor',{x:8.1,z:0,yaw:Math.PI},'x',0xbda67e);
  addDoor('northToDetached','離れ通路',4.85,0,1.1,'detached',{x:-3.8,z:0,yaw:0},'x',0xa89676);
  const rope = new THREE.Mesh(new THREE.BoxGeometry(2.4,0.06,0.06), new THREE.MeshStandardMaterial({ color: 0x8f5c3d, roughness: 1 })); rope.position.set(0,1.4,-1.8); rope.rotation.z = 0.25; areaGroup.add(rope);
  const seal = new THREE.Mesh(new THREE.BoxGeometry(0.18,0.36,0.02), new THREE.MeshStandardMaterial({ color: 0xf7f1df, roughness: 1 })); seal.position.set(0,1.15,-1.78); areaGroup.add(seal);
  addItem('sealTag','閉ざされた札',0,-1.8, seal, itemInteract);
  if (state.step === 'inspect_fire_map') {
    const fireMap = makeTextPlane('避難図', 1.1, 0.28, { fg:'#1f1611', bg:'rgba(244,238,222,.95)', fontSize:86 });
    fireMap.position.y = 1.3;
    addItem('fireMap','古い避難図',1.95,-1.15, fireMap, itemInteract);
  }
}

function buildDetached(){
  createFloor(16, 10, materials.wood, -0.1);
  createCeiling(16, 10, 0x1d2235);
  scene.fog.color.set(0x0c1019); scene.fog.near = 10; scene.fog.far = 28;
  wallSegment(0,-4.95,16,3.2,0.14,materials.wallDark); wallSegment(0,4.95,16,3.2,0.14,materials.wallDark); wallSegment(-7.95,0,0.14,3.2,10,materials.wallDark); wallSegment(7.95,0,0.14,3.2,10,materials.wallDark);
  for(let i=-5;i<=5;i+=5) addLamp(i,0,0.32,0x6e88aa);
  addDoor('detachedToNorth','北廊下',-7.25,0,1.15,'north',{x:5.2,z:0,yaw:Math.PI},'x',0xa89676);
  addDoor('detachedToArchive','宿帳庫',0,4.25,1.15,'archive',{x:0,z:-4.2,yaw:0},null,0x9689a6);
  const shrine = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.2,0.44,0.8), materials.darkWood); base.position.y = 0.22; shrine.add(base);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.84,1.0,0.44), materials.darkWood); body.position.y = 0.92; shrine.add(body);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.3,0.16,0.8), materials.wood); roof.position.y = 1.48; shrine.add(roof);
  shrine.position.set(0,0,-3.2); shrine.traverse(m => { if (m.isMesh){ m.castShadow = true; m.receiveShadow = true; }}); areaGroup.add(shrine); addBoxCollider(0,-2.6,1.3,0.8);
  addBackdropPlane(realismAssets.forbidden, 0, 1.7, -4.75, 14, 3.1, 0, 0.55);
  addItem('altar','祠',0,-3.2, shrine, itemInteract);
}

function npcInteract(entity){
  if (entity.id === 'okami') {
    if (state.step === 'talk_okami') {
      showDialogue(storyNodes.okami_intro, () => setStep('get_tray'));
    } else if (state.step === 'report_okami') {
      showDialogue(storyNodes.report_okami, () => setStep('stock_amenities'));
    } else if (state.step === 'escape_archive') {
      showDialogue(storyNodes.escape_archive, () => openReturnHome());
    } else if (state.step === 'escape_detached' || state.step === 'finale') {
      showDialogue(storyNodes.finale, () => {
        state.area = 'home';
        buildArea(state.area);
        player.x = 0.6; player.z = 2.6; player.yaw = 0; player.pitch = -0.05;
        resetInput();
        state.inputLockUntil = performance.now() + 500;
        state.doorCooldownUntil = performance.now() + 900;
        state.ended = false;
        setStep('sleep_day2');
      });
    } else if (state.step === 'talk_okami_day3') {
      state.questFlags.heardAbout203 = true;
      showDialogue(storyNodes.okami_day3, () => setStep('inspect_guestbook_203'));
    } else if (state.step === 'final_choice') {
      showDialogue(storyNodes.finalChoiceIntro, () => setStep('choose_fate'));
    }
  } else if (entity.id === 'guest201' && state.step === 'deliver_201') {
    showDialogue(storyNodes.guest201, () => setStep('report_okami'));
  } else if (entity.id === 'maid' && state.step === 'talk_maid') {
    showDialogue(storyNodes.maid, () => setStep('get_breakfast202'));
  } else if (entity.id === 'guest202' && state.step === 'deliver_202') {
    showDialogue(storyNodes.guest202, () => setStep('collect_lost_item'));
  } else if (entity.id === 'chef' && state.step === 'get_tray') {
    showDialogue(storyNodes.tray, ()=>{});
  } else if (entity.id === 'villager') {
    showDialogue(storyNodes.villager, ()=>{});
  }
}

function itemInteract(entity){
  if (entity.id === 'scheduleNote' && state.step === 'start_note') {
    showDialogue(storyNodes.home_note, () => setStep('leave_home'));
  } else if (entity.id === 'tray' && state.step === 'get_tray') {
    dynamicGroup.remove(entity.mesh);
    removeItem(entity.id);
    state.questFlags.hasTray = true;
    showDialogue(storyNodes.tray, () => setStep('deliver_201'));
  } else if (entity.id === 'amenityBag' && state.step === 'stock_amenities') {
    state.questFlags.hasAmenityBag = true;
    showDialogue(storyNodes.amenityBag, () => setStep('place_amenities'));
  } else if (entity.id === 'amenityBox' && state.step === 'place_amenities') {
    state.questFlags.placedAmenities = true;
    showDialogue(storyNodes.amenityBox, () => setStep('arrange_slippers'));
  } else if (entity.id === 'slipperRack' && state.step === 'arrange_slippers') {
    state.questFlags.arrangedSlippers = true;
    showDialogue(storyNodes.slippers, () => setStep('restock_towels'));
  } else if (entity.id === 'towelShelf' && state.step === 'restock_towels') {
    state.questFlags.restockedTowels = true;
    showDialogue(storyNodes.towel, () => setStep('answer_phone'));
  } else if (entity.id === 'phone' && state.step === 'answer_phone') {
    showDialogue(storyNodes.phone, () => setStep('inspect_archive'));
  } else if (entity.id === 'toiletStallDoor') {
    dynamicGroup.remove(entity.mesh);
    removeItem(entity.id);
    state.questFlags.toiletStallOpened = true;
    addOpenedToiletStallDoor(5.0, 0.26);
    addNPC('toiletGuest','しゃがみ客','guest','crouch',6.15,1.42,0,function(){
      showDialogue([['しゃがみ客','……今は話しかけないでくれ。','guest']], ()=>{});
    });
    showDialogue([['あなた','ACTで手前の個室を開けた。','hero'], ['しゃがみ客','……っ。誰かいる。', 'guest']], ()=>{});
  } else if (entity.id === 'blueLedger' && state.step === 'inspect_archive') {
    dynamicGroup.remove(entity.mesh);
    removeItem(entity.id);
    state.questFlags.hasLedger = true;
    showDialogue(storyNodes.blueLedger, () => {
      startChase('archive', { x: 0, z: 0 }, 'escape_archive');
      setStep('escape_archive');
    });
  } else if (entity.id === 'breakfastTray' && state.step === 'get_breakfast202') {
    showDialogue(storyNodes.breakfast202, () => setStep('deliver_202'));
  } else if (entity.id === 'lostKey' && state.step === 'collect_lost_item') {
    showDialogue(storyNodes.lostKey, () => setStep('inspect_register'));
  } else if (entity.id === 'registerBook' && state.step === 'inspect_register') {
    showDialogue(storyNodes.registerCheck, () => setStep('inspect_north'));
  } else if (entity.id === 'sealTag' && state.step === 'inspect_north') {
    showDialogue(storyNodes.sealTag, () => setStep('inspect_detached'));
  } else if (entity.id === 'futonBed' && state.step === 'sleep_day1') {
    showDialogue(storyNodes.sleep_day1, () => {
      state.area = 'home';
      buildArea(state.area);
      player.x = 0.6; player.z = 2.6; player.yaw = 0; player.pitch = -0.05;
      resetInput();
      setStep('leave_home_day2');
    });
  } else if (entity.id === 'futonBed' && state.step === 'sleep_day2') {
    showDialogue(storyNodes.sleep_day2, () => {
      state.area = 'home';
      buildArea(state.area);
      player.x = 0.6; player.z = 2.6; player.yaw = 0; player.pitch = -0.05;
      resetInput();
      setStep('leave_home_day3');
    });
  } else if (entity.id === 'posterBoard' && state.step === 'inspect_poster_day3') {
    state.questFlags.sawMissingPosterShift = true;
    showDialogue(storyNodes.posterShift, () => setStep('commute_day3'));
  } else if (entity.id === 'bathNotice' && state.step === 'inspect_bath_notice') {
    state.questFlags.checkedBathNoticeDay3 = true;
    showDialogue(storyNodes.bathNotice, () => setStep('inspect_fire_map'));
  } else if (entity.id === 'fireMap' && state.step === 'inspect_fire_map') {
    state.questFlags.checkedFireMap = true;
    showDialogue(storyNodes.fireMap, () => setStep('read_blue_note_2'));
  } else if (entity.id === 'blueLedger2' && state.step === 'read_blue_note_2') {
    state.questFlags.readBlueNote2 = true;
    showDialogue(storyNodes.blueLedger2, () => setStep('guide_tease_day3'));
  } else if (entity.id === 'phantom203' && state.step === 'enter_203_phantom') {
    state.questFlags.entered203Phantom = true;
    showDialogue(storyNodes.phantom203, () => setStep('final_choice'));
  } else if (entity.id === 'endingBurn' && state.step === 'choose_fate') {
    showDialogue(storyNodes.ending_return, () => {
      setStep('ending_return');
      finishEnding('return');
    });
  } else if (entity.id === 'endingSign' && state.step === 'choose_fate') {
    showDialogue(storyNodes.ending_guest, () => {
      setStep('ending_guest');
      finishEnding('guest');
    });
  } else if (entity.id === 'endingFollow' && state.step === 'choose_fate') {
    showDialogue(storyNodes.ending_replace, () => {
      setStep('ending_replace');
      finishEnding('replace');
    });
  } else if (entity.id === 'altar' && state.step === 'inspect_detached') {
    showDialogue(storyNodes.altar, () => {
      startChase('detached', { x: 0, z: 0 }, 'escape_detached');
      setStep('escape_detached');
    });
  }
}

function removeItem(id){
  const idx = items.findIndex(it => it.id === id);
  if (idx >= 0) items.splice(idx,1);
}

function showDialogue(list, done){
  state.menuOpen = true;
  state.dialogueQueue = list.map(row => ({ name: row[0], text: row[1], face: row[2] }));
  dialogueOverlay.classList.remove('hidden');
  dialogueOverlay.dataset.done = done ? '1' : '';
  dialogueOverlay._done = done || null;
  advanceDialogue();
}
function advanceDialogue(){
  if (!state.dialogueQueue.length) {
    dialogueOverlay.classList.add('hidden');
    state.menuOpen = false;
    const done = dialogueOverlay._done;
    dialogueOverlay._done = null;
    if (done) done();
    return;
  }
  const row = state.dialogueQueue.shift();
  dialogueNameEl.textContent = row.name;
  dialogueTextEl.textContent = row.text;
  portraitEl.innerHTML = '';
  portraitEl.appendChild(makePortrait(row.face || 'hero'));
}
function makePortrait(face){
  const wrap = document.createElement('div');
  wrap.style.width = '100%'; wrap.style.height = '100%'; wrap.style.display = 'grid'; wrap.style.placeItems = 'center';
  const card = document.createElement('div');
  card.style.width = '82%'; card.style.aspectRatio = '0.68'; card.style.borderRadius = '18px';
  const path = portraitPaths[face];
  if (path) {
    card.style.background = `linear-gradient(180deg, rgba(255,255,255,.14), rgba(0,0,0,.16)), url(${path}) center/cover no-repeat`;
  } else {
    card.style.background = `linear-gradient(180deg, rgba(255,255,255,.14), rgba(0,0,0,.16)), url(${faceTextures[face].image.toDataURL()}) center/cover no-repeat`;
  }
  card.style.border = '1px solid rgba(255,255,255,.12)';
  wrap.appendChild(card);
  return wrap;
}
dialogueOverlay.addEventListener('pointerdown', advanceDialogue);
dialogueOverlay.addEventListener('touchstart', function(e){ e.preventDefault(); advanceDialogue(); }, { passive:false });

function applyEndingScreen(type){
  if (!endingTitleEl || !endingTextEl) return;
  if (type === 'return') {
    endingTitleEl.textContent = '帰還エンド';
    endingTextEl.innerHTML = '旅館を離れることはできた。<br>だが町の掲示板には、今夜から自分の失踪ポスターが増えている。';
  } else if (type === 'guest') {
    endingTitleEl.textContent = '宿泊エンド';
    endingTextEl.innerHTML = '翌朝、主人公は客室で目を覚ます。<br>帳場の宿帳には、以前から宿泊していたように連続した記録が残っている。';
  } else if (type === 'replace') {
    endingTitleEl.textContent = '交代エンド';
    endingTextEl.innerHTML = '誘導員の役目を引き継いだ主人公は、<br>次の来客を正面玄関で静かに待ち続ける。';
  } else {
    endingTitleEl.textContent = '第二夜・終了';
    endingTextEl.innerHTML = '自宅から始まった二日間の勤務で、旅館の異変は日常にまで滲み出した。<br>続きは次章へ。';
  }
}
function finishEnding(type){
  state.questFlags.endingType = type;
  state.ended = true;
  applyEndingScreen(type);
  endingEl.classList.remove('hidden');
  saveToSlot(1, true);
}

function currentStep(){ return stepDefs[state.step]; }
function setStep(id){
  state.step = id;
  const def = currentStep();
  dayLabelEl.textContent = 'DAY ' + def.day;
  phaseLabelEl.textContent = def.phase;
  saveToSlot(1, true);
}

function getChaseCheckpoint(areaId, linkedStep){
  if (areaId === 'archive') {
    return { area: 'archive', x: 3.4, z: 2.2, yaw: Math.PI * 0.9, step: linkedStep, guideSpawn: { x: -3.4, z: -1.4 } };
  }
  if (areaId === 'detached') {
    return { area: 'detached', x: 0, z: 2.2, yaw: Math.PI, step: linkedStep, guideSpawn: { x: 0, z: -2.8 } };
  }
  return { area: areaId, x: player.x, z: player.z, yaw: player.yaw, step: linkedStep, guideSpawn: { x: 0, z: 0 } };
}
function startChase(areaId, guidePos, linkedStep){
  const cp = getChaseCheckpoint(areaId, linkedStep);
  state.checkpoint = { area: cp.area, x: cp.x, z: cp.z, yaw: cp.yaw, step: linkedStep, guideSpawn: cp.guideSpawn };
  player.x = cp.x;
  player.z = cp.z;
  player.yaw = cp.yaw;
  player.pitch = 0;
  state.inputLockUntil = performance.now() + 900;
  state.doorCooldownUntil = performance.now() + 1200;
  resetInput();
  state.chase = { active: true, speed: 2.35, graceUntil: performance.now() + 2200 };
  spawnGuide(cp.guideSpawn.x, cp.guideSpawn.z);
}
function stopChase(){
  state.chase = null;
  if (state.guide) { dynamicGroup.remove(state.guide.group); state.guide = null; }
}
function openReturnHome(){
  state.menuOpen = true;
  resetInput();
  returnHomeEl.classList.remove('hidden');
}
function goHomeNow(){
  returnHomeEl.classList.add('hidden');
  state.menuOpen = false;
  state.area = 'home';
  buildArea(state.area);
  player.x = 0.6; player.z = 2.6; player.yaw = 0; player.pitch = -0.05;
  resetInput();
  state.inputLockUntil = performance.now() + 500;
  state.doorCooldownUntil = performance.now() + 900;
  setStep(state.day >= 2 ? 'sleep_day2' : 'sleep_day1');
}
function spawnGuide(x,z){
  if (state.guide) dynamicGroup.remove(state.guide.group);
  const group = makeCharacter('guide', 0x2f4d7d);
  group.position.set(x,0,z);
  dynamicGroup.add(group);
  state.guide = { group, x, z, yaw: 0 };
  updateCharacterBillboard(state.guide);
}
function triggerGameOver(){
  state.menuOpen = true;
  resetInput();
  gameOverEl.classList.remove('hidden');
}
function retryFromCheckpoint(){
  gameOverEl.classList.add('hidden');
  state.menuOpen = false;
  state.ended = false;
  if (!state.checkpoint) {
    beginNewGame();
    return;
  }
  stopChase();
  state.area = state.checkpoint.area;
  buildArea(state.area);
  player.x = state.checkpoint.x;
  player.z = state.checkpoint.z;
  player.yaw = state.checkpoint.yaw;
  player.pitch = 0;
  resetInput();
  state.inputLockUntil = performance.now() + 1000;
  state.doorCooldownUntil = performance.now() + 1400;
  setStep(state.checkpoint.step);
  if (state.step === 'escape_archive') {
    state.chase = { active: true, speed: 2.35, graceUntil: performance.now() + 2200 };
    const gs = state.checkpoint.guideSpawn || {x:-3.4,z:-1.4};
    spawnGuide(gs.x, gs.z);
  }
  if (state.step === 'escape_detached') {
    state.chase = { active: true, speed: 2.35, graceUntil: performance.now() + 2200 };
    const gs = state.checkpoint.guideSpawn || {x:0,z:-2.8};
    spawnGuide(gs.x, gs.z);
  }
}

function interact(){
  if (state.menuOpen) return;
  if (!dialogueOverlay.classList.contains('hidden')) return;
  const target = getNearestInteractable();
  if (!target) return;
  if (target.type === 'door') {
    useDoor(target.entity);
  } else if (target.type === 'npc') {
    target.entity.onInteract(target.entity);
  } else if (target.type === 'item') {
    target.entity.onInteract(target.entity);
  }
}

function getNearestInteractable(){
  let best = null; let bestScore = Infinity;
  const def = currentStep();
  const trigger = def && def.trigger ? def.trigger : null;
  const facing = { x: -Math.sin(player.yaw), z: -Math.cos(player.yaw) };
  const all = [];
  doors.forEach(d => all.push({ type: 'door', entity: d, x: d.x, z: d.z, label: d.label }));
  npcs.forEach(n => all.push({ type: 'npc', entity: n, x: n.x, z: n.z, label: n.name }));
  items.forEach(i => all.push({ type: 'item', entity: i, x: i.x, z: i.z, label: i.label }));
  for (const obj of all) {
    const dx = obj.x - player.x, dz = obj.z - player.z;
    const dist = Math.hypot(dx, dz);
    const isCurrentTarget = !!(trigger && trigger.type === obj.type && trigger.id === obj.entity.id);
    const maxDist = obj.type === 'door' ? 2.4 : (isCurrentTarget ? 4.1 : 3.0);
    if (dist > maxDist) continue;
    const dir = dist > 0.001 ? ((dx * facing.x + dz * facing.z) / dist) : 1;
    const minDir = obj.type === 'door' ? 0.08 : (isCurrentTarget ? -0.55 : -0.18);
    if (dir < minDir && dist > 1.2) continue;
    const score = dist - (isCurrentTarget ? 0.75 : 0);
    if (score < bestScore) { bestScore = score; best = obj; }
  }
  return best;
}
function useDoor(door){
  const now = performance.now();
  if (now < state.doorCooldownUntil || now < state.inputLockUntil) return;
  if (state.lastDoorId === door.id) return;
  if (state.step === 'start_note' && door.id === 'homeToTown') {
    showDialogue([['主人公', '机の手紙を確認してから出よう。', 'hero']], ()=>{});
    return;
  }
  const leavingArea = state.area;
  const chaseSucceeded = !!(state.chase && ((state.step === 'escape_archive' && leavingArea === 'archive' && door.toArea !== 'archive') || (state.step === 'escape_detached' && leavingArea === 'detached' && door.toArea !== 'detached')));
  state.lastDoorId = door.id;
  state.doorCooldownUntil = now + 1600;
  state.inputLockUntil = now + 950;
  resetInput();
  if (chaseSucceeded) {
    stopChase();
    state.checkpoint = null;
    gameOverEl.classList.add('hidden');
  }
  returnHomeEl.classList.add('hidden');
  state.area = door.toArea;
  buildArea(state.area);
  player.x = door.toSpawn.x;
  player.z = door.toSpawn.z;
  player.yaw = door.toSpawn.yaw || 0;
  player.pitch = 0;
  if (chaseSucceeded) {
    if (state.step === 'escape_archive') {
      openReturnHome();
      return;
    } else if (state.step === 'escape_detached') setStep('finale');
  }
  if (door.id === 'homeToTown' && state.step === 'leave_home') setStep('walk_to_ryokan');
  else if (door.id === 'townToLobby' && state.step === 'walk_to_ryokan') setStep('talk_okami');
  else if (door.id === 'homeToTown' && state.step === 'leave_home_day2') setStep('commute_day2');
  else if (door.id === 'townToLobby' && state.step === 'commute_day2') setStep('talk_maid');
  else if (door.id === 'homeToTown' && state.step === 'leave_home_day3') setStep('inspect_poster_day3');
  else if (door.id === 'townToLobby' && state.step === 'commute_day3') setStep('talk_okami_day3');
  maybeStartLobbyArrivalCutscene(door.id);
}


function updatePrompt(){
  const now = performance.now();
  const obj = getNearestInteractable();
  if (!obj || state.menuOpen || !dialogueOverlay.classList.contains('hidden') || now < state.inputLockUntil) {
    promptEl.classList.remove('show');
    return;
  }
  const kind = obj.type === 'door' ? '移動' : (obj.type === 'npc' ? '話す' : '調べる');
  promptEl.textContent = 'E / ACT : ' + obj.label + ' / ' + kind;
  promptEl.classList.add('show');
}

function updateObjectiveDistance(){
  const def = currentStep();
  const approx = calculateDistanceToObjective();
  distanceLabelEl.textContent = def.sub + ' 約' + Math.max(1, Math.round(approx)) + 'm';
}
function calculateDistanceToObjective(){
  const def = currentStep();
  if (state.area === def.targetArea) return Math.hypot(player.x - def.targetPos.x, player.z - def.targetPos.z);
  const route = shortestAreaDistance(state.area, def.targetArea);
  return route + 6;
}
function shortestAreaDistance(from, to){
  if (from === to) return 0;
  const dist = {}; const done = {};
  Object.keys(graph).forEach(k => dist[k] = Infinity);
  dist[from] = 0;
  while (true) {
    let current = null, currentDist = Infinity;
    Object.keys(dist).forEach(k => { if (!done[k] && dist[k] < currentDist) { current = k; currentDist = dist[k]; } });
    if (!current) break;
    if (current === to) break;
    done[current] = true;
    const edges = graph[current] || {};
    Object.keys(edges).forEach(next => { dist[next] = Math.min(dist[next], dist[current] + edges[next]); });
  }
  return dist[to] === Infinity ? 99 : dist[to];
}

function updateMinimap(){
  minimapCtx.clearRect(0,0,minimap.width,minimap.height);
  minimapCtx.fillStyle = 'rgba(8,10,18,.86)';
  roundRect(minimapCtx, 0,0,minimap.width,minimap.height,22); minimapCtx.fill();
  minimapCtx.fillStyle = '#a79b84'; minimapCtx.font = '12px sans-serif'; minimapCtx.fillText('館内導線', 14, 18);
  const nodes = {
    home:[18,30], town:[60,30], lobby:[104,30], kitchen:[104,72], corridor:[156,30], room201:[204,12], room202:[204,48], bath:[252,14], archive:[156,72], north:[204,86], detached:[252,72]
  };
  minimapCtx.strokeStyle='rgba(255,255,255,.14)'; minimapCtx.lineWidth=2;
  Object.keys(graph).forEach(k=>{ Object.keys(graph[k]).forEach(to=>{ if(k<to){ const a=nodes[k], b=nodes[to]; minimapCtx.beginPath(); minimapCtx.moveTo(a[0],a[1]); minimapCtx.lineTo(b[0],b[1]); minimapCtx.stroke(); } }); });
  Object.keys(nodes).forEach(k=>{
    const [x,y]=nodes[k];
    minimapCtx.fillStyle = k===state.area ? '#d4bb7a' : (k===currentStep().targetArea ? '#91aaf3' : '#2b3348');
    roundRect(minimapCtx, x-28, y-12, 56, 24, 6); minimapCtx.fill();
    minimapCtx.fillStyle = '#f1ede5'; minimapCtx.font = '11px sans-serif'; minimapCtx.textAlign='center'; minimapCtx.textBaseline='middle';
    minimapCtx.fillText(areaLabels[k], x, y);
  });
  minimapCtx.textAlign='start'; minimapCtx.textBaseline='alphabetic';
}
function roundRect(ctx,x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }

function setCamera(){
  camera.position.set(player.x, player.height, player.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
}

function movePlayer(dt){
  if (state.menuOpen || !dialogueOverlay.classList.contains('hidden')) return;
  const moveX = input.joyX + ((input.keys.KeyD?1:0) - (input.keys.KeyA?1:0));
  const moveY = input.joyY + ((input.keys.KeyW?1:0) - (input.keys.KeyS?1:0));
  const len = Math.hypot(moveX, moveY);
  if (len < 0.01) return;
  const nx = moveX / Math.max(1, len);
  const nz = moveY / Math.max(1, len);
  const speed = player.speed * ((input.keys.ShiftLeft || input.runHeld || input.runToggle) ? player.run : 1) * dt;
  const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
  const dx = (cos * nx - sin * nz) * speed;
  const dz = (-sin * nx - cos * nz) * speed;
  attemptMove(player.x + dx, player.z + dz);
}
function attemptMove(nx, nz){
  const r = player.radius;
  for (const c of colliders) {
    if (nx + r > c.x1 && nx - r < c.x2 && nz + r > c.z1 && nz - r < c.z2) {
      // try slide X only
      const clearX = !(nx + r > c.x1 && nx - r < c.x2 && player.z + r > c.z1 && player.z - r < c.z2);
      const clearZ = !(player.x + r > c.x1 && player.x - r < c.x2 && nz + r > c.z1 && nz - r < c.z2);
      if (clearX) { player.x = nx; return; }
      if (clearZ) { player.z = nz; return; }
      return;
    }
  }
  player.x = nx; player.z = nz;
}

function updateChase(dt){
  if (!state.chase || !state.guide || state.menuOpen || !dialogueOverlay.classList.contains('hidden')) return;
  const gx = state.guide.group.position.x, gz = state.guide.group.position.z;
  const dx = player.x - gx, dz = player.z - gz;
  const dist = Math.hypot(dx,dz);
  if (performance.now() > state.chase.graceUntil && dist < 0.96) {
    triggerGameOver();
    return;
  }
  const move = Math.min(state.chase.speed * dt, dist * 0.92);
  state.guide.group.position.x += (dx / Math.max(.001, dist)) * move;
  state.guide.group.position.z += (dz / Math.max(.001, dist)) * move;
  state.guide.group.rotation.y = Math.atan2(dx, dz);
}

function updateDoorLatch(){
  if (!state.lastDoorId) return;
  const door = doors.find(d => d.id === state.lastDoorId);
  if (!door) { state.lastDoorId = null; return; }
  const dist = Math.hypot(player.x - door.x, player.z - door.z);
  if (dist > door.radius + 1.2 && performance.now() > state.doorCooldownUntil) state.lastDoorId = null;
}

function update(){
  updateDoorLatch();
  updatePrompt();
  updateObjectiveDistance();
  updateMinimap();
  npcs.forEach(updateCharacterBillboard);
  if (state.guide) updateCharacterBillboard(state.guide);
  if (state.previewGuide) updateCharacterBillboard(state.previewGuide);
  maybeStartLobbyArrivalCutscene();
  maybeStartArchiveGuideGlimpse();
  maybeStartDay3GuideTease();
  if (state.hudHidden) {
    hud.style.display = 'none';
    joystickZone.style.display = 'none';
    actBtn.style.display = 'none';
    lookZone.style.display = 'none';
    if (runBtn) runBtn.style.display = 'none';
  } else {
    hud.style.display = '';
    joystickZone.style.display = '';
    actBtn.style.display = '';
    lookZone.style.display = '';
    if (runBtn) runBtn.style.display = '';
  }
}

let lastTime = performance.now();
function animate(now){
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  movePlayer(dt);
  updateChase(dt);
  updateCutscene(dt);
  setCamera();
  update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function slotKey(slot){ return SAVE_PREFIX + String(slot); }
function serializeState(){
  return {
    area: state.area,
    areaLabel: areaLabels[state.area] || state.area,
    step: state.step,
    x: player.x,
    z: player.z,
    yaw: player.yaw,
    pitch: player.pitch,
    hudHidden: state.hudHidden,
    questFlags: state.questFlags,
    ended: state.ended,
    checkpoint: state.checkpoint,
    chaseStep: state.chase ? state.step : null
  };
}
function saveToSlot(slot, silent){
  const data = serializeState();
  if (state.chase && state.checkpoint) {
    data.area = state.checkpoint.area;
    data.areaLabel = areaLabels[data.area] || data.area;
    data.x = state.checkpoint.x;
    data.z = state.checkpoint.z;
    data.yaw = state.checkpoint.yaw;
    data.pitch = 0;
  }
  localStorage.setItem(slotKey(slot), JSON.stringify(data));
  if (!silent) window.alert('SLOT ' + slot + ' に保存しました');
}
function loadFromSlot(slot, silent){
  const raw = localStorage.getItem(slotKey(slot));
  if (!raw) { if (!silent) window.alert('SLOT ' + slot + ' は空です'); return false; }
  try {
    const data = JSON.parse(raw);
    stopChase();
    gameOverEl.classList.add('hidden');
    endingEl.classList.add('hidden');
    returnHomeEl.classList.add('hidden');
    state.menuOpen = false;
    menuOverlay.classList.add('hidden');
    if (slotOverlay) slotOverlay.classList.add('hidden');
    state.area = data.area || 'lobby';
    state.step = data.step || 'talk_okami';
    state.hudHidden = !!data.hudHidden;
    state.questFlags = ensureQuestFlagDefaults(data.questFlags || {});
    state.ended = !!data.ended;
    if (state.step === 'finale' && state.ended) {
      state.step = 'sleep_day2';
      state.ended = false;
      state.area = 'home';
      data.x = 0.6; data.z = 2.6; data.yaw = 0; data.pitch = -0.05;
    }
    state.checkpoint = data.checkpoint || null;
    state.cutscene = null;
    state.previewGuide = null;
    buildArea(state.area);
    player.x = typeof data.x === 'number' ? data.x : 0;
    player.z = typeof data.z === 'number' ? data.z : 0;
    player.yaw = typeof data.yaw === 'number' ? data.yaw : 0;
    player.pitch = typeof data.pitch === 'number' ? data.pitch : 0;
    resetInput();
    state.inputLockUntil = performance.now() + 400;
    state.doorCooldownUntil = performance.now() + 600;
    if (data.chaseStep === 'escape_archive' && state.checkpoint) {
      state.step = 'escape_archive';
      const gs=(state.checkpoint.guideSpawn)||{x:-3.4,z:-1.4};
      state.chase={active:true,speed:2.35,graceUntil:performance.now()+2400};
      spawnGuide(gs.x,gs.z);
    } else if (data.chaseStep === 'escape_detached' && state.checkpoint) {
      state.step = 'escape_detached';
      const gs=(state.checkpoint.guideSpawn)||{x:0,z:-2.8};
      state.chase={active:true,speed:2.35,graceUntil:performance.now()+2400};
      spawnGuide(gs.x,gs.z);
    }
    if (state.ended) {
      applyEndingScreen(state.questFlags.endingType || '');
      endingEl.classList.remove('hidden');
    }
    setStep(state.step);
    if (!silent) window.alert('SLOT ' + slot + ' を読み込みました');
    return true;
  } catch (e) {
    console.error(e);
    if (!silent) window.alert('SLOT ' + slot + ' の読み込みに失敗しました');
    return false;
  }
}
function slotSummary(slot){
  const raw = localStorage.getItem(slotKey(slot));
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}
function openSlotOverlay(mode){
  state.slotMode = mode;
  slotTitleEl.textContent = mode === 'save' ? 'SAVE' : 'LOAD';
  slotNoteEl.textContent = mode === 'save' ? '保存先のスロットを選んでください。' : '読み込むスロットを選んでください。';
  slotListEl.innerHTML = '';
  for (let i=1;i<=3;i++) {
    const data = slotSummary(i);
    const btn = document.createElement('button');
    btn.className = 'slot-btn';
    if (data) {
      const label = (data.areaLabel || areaLabels[data.area] || data.area || '不明') + ' / ' + ((stepDefs[data.step] && stepDefs[data.step].sub) || data.step || '進行中');
      btn.innerHTML = '<strong>SLOT ' + i + '</strong><span>' + label + '</span>';
    } else {
      btn.innerHTML = '<strong>SLOT ' + i + '</strong><span>空き</span>';
    }
    btn.dataset.slot = String(i);
    slotListEl.appendChild(btn);
  }
  slotOverlay.classList.remove('hidden');
}
function closeSlotOverlay(){
  state.slotMode = null;
  slotOverlay.classList.add('hidden');
}

function resetInput(){
  input.joyX = 0; input.joyY = 0; input.keys = Object.create(null);
  input.joyId = null; input.lookId = null; input.lookDragging = false; input.mouseDrag = false;
  input.runHeld = false;
  input.runToggle = false;
  syncRunButton();
  centerJoystick();
}

function setupControls(){
  window.addEventListener('resize', onResize);
  document.addEventListener('keydown', function(e){
    if (e.code === 'KeyE') { interact(); e.preventDefault(); return; }
    if (e.code === 'Escape') { toggleMenu(); e.preventDefault(); return; }
    input.keys[e.code] = true;
  });
  document.addEventListener('keyup', function(e){ input.keys[e.code] = false; });
  actBtn.addEventListener('pointerdown', function(e){ e.preventDefault(); interact(); });
  bindRunButton();
  syncRunButton();
  menuBtn.addEventListener('click', toggleMenu);
  menuOverlay.addEventListener('click', function(e){
    const btn = e.target.closest('button'); if (!btn) return;
    const act = btn.dataset.action;
    if (act === 'close') toggleMenu(false);
    else if (act === 'save') { toggleMenu(false); openSlotOverlay('save'); }
    else if (act === 'load') { toggleMenu(false); openSlotOverlay('load'); }
    else if (act === 'hud') { state.hudHidden = !state.hudHidden; toggleMenu(false); saveToSlot(1, true); }
    else if (act === 'title') { stopChase(); gameOverEl.classList.add('hidden'); location.href = 'index.html'; }
  });
  gameOverEl.addEventListener('click', function(e){
    const btn = e.target.closest('button'); if (!btn) return;
    if (btn.dataset.go === 'retry') { gameOverEl.classList.add('hidden'); retryFromCheckpoint(); }
    else location.href = 'index.html';
  });
  slotOverlay.addEventListener('click', function(e){
    const closeBtn = e.target.closest('[data-slot-close]');
    if (closeBtn || e.target === slotOverlay) { closeSlotOverlay(); return; }
    const btn = e.target.closest('[data-slot]');
    if (!btn) return;
    const slot = Number(btn.dataset.slot || '0');
    if (!slot) return;
    if (state.slotMode === 'save') { saveToSlot(slot, false); closeSlotOverlay(); }
    else if (state.slotMode === 'load') { loadFromSlot(slot, false); closeSlotOverlay(); }
  });
  endingEl.addEventListener('click', function(e){ if (e.target.closest('button')) location.href = 'index.html'; });
  returnHomeEl.addEventListener('click', function(e){
    if (e.target === returnHomeEl || e.target.closest('[data-return-home]')) goHomeNow();
  });

  joystickZone.addEventListener('pointerdown', startJoy);
  window.addEventListener('pointermove', moveJoy);
  window.addEventListener('pointerup', endJoy);
  window.addEventListener('pointercancel', endJoy);

  lookZone.addEventListener('pointerdown', startLook);
  canvas.addEventListener('pointerdown', function(e){
    if (state.menuOpen) return;
    if (e.clientX > window.innerWidth * 0.36) {
      input.lookId = e.pointerId;
      input.lookDragging = true;
      input.pointerX = e.clientX;
      input.pointerY = e.clientY;
      canvas.setPointerCapture?.(e.pointerId);
    }
  });
  window.addEventListener('pointermove', moveLook);
  window.addEventListener('pointerup', endLook);
  window.addEventListener('pointercancel', endLook);

  joystickZone.addEventListener('touchstart', function(e){
    if (state.menuOpen || input.joyId !== null) return;
    const t = e.changedTouches && e.changedTouches[0];
    if (!t) return;
    e.preventDefault();
    input.joyId = t.identifier;
    updateJoy(t);
  }, {passive:false});
  lookZone.addEventListener('touchstart', function(e){
    if (state.menuOpen || input.lookId !== null) return;
    const t = e.changedTouches && e.changedTouches[0];
    if (!t) return;
    e.preventDefault();
    input.lookId = t.identifier;
    input.lookDragging = true;
    input.pointerX = t.clientX;
    input.pointerY = t.clientY;
  }, {passive:false});
  window.addEventListener('touchmove', onTouchMove, {passive:false});
  window.addEventListener('touchend', onTouchEnd, {passive:false});
  window.addEventListener('touchcancel', onTouchEnd, {passive:false});

  canvas.addEventListener('mousedown', function(e){ if (e.clientX > window.innerWidth * .36) { input.mouseDrag = true; input.pointerX = e.clientX; input.pointerY = e.clientY; } });
  window.addEventListener('mousemove', function(e){ if (!input.mouseDrag || state.menuOpen) return; const dx = e.clientX - input.pointerX; const dy = e.clientY - input.pointerY; input.pointerX = e.clientX; input.pointerY = e.clientY; rotateLook(dx,dy); });
  window.addEventListener('mouseup', function(){ input.mouseDrag = false; });
  document.addEventListener('gesturestart', preventer, {passive:false});
  document.addEventListener('dblclick', preventer, {passive:false});
}
function preventer(e){ e.preventDefault(); }
function syncRunButton(){
  if (!runBtn) return;
  const active = !!(input.runHeld || input.runToggle);
  runBtn.classList.toggle('active', active);
  runBtn.textContent = active ? 'RUN ON' : 'RUN';
}
function bindRunButton(){
  if (!runBtn) return;
  let lastToggleAt = 0;
  const toggleRun = () => {
    const now = performance.now();
    if (now - lastToggleAt < 220) return;
    lastToggleAt = now;
    input.runToggle = !input.runToggle;
    input.runHeld = false;
    syncRunButton();
  };
  runBtn.addEventListener('click', function(e){ e.preventDefault(); toggleRun(); });
  runBtn.addEventListener('touchstart', function(e){ e.preventDefault(); toggleRun(); }, {passive:false});
}
function startJoy(e){ if(state.menuOpen) return; input.joyId = e.pointerId; updateJoy(e); joystickZone.setPointerCapture?.(e.pointerId); }
function moveJoy(e){ if(e.pointerId !== input.joyId) return; updateJoy(e); }
function endJoy(e){ if(e.pointerId !== input.joyId) return; clearJoyInput(); }
function clearJoyInput(){ input.joyId = null; input.joyX = 0; input.joyY = 0; centerJoystick(); }
function updateJoy(e){
  const rect = joystickBase.getBoundingClientRect();
  const cx = rect.left + rect.width/2, cy = rect.top + rect.height/2;
  const dx = e.clientX - cx, dy = e.clientY - cy;
  const max = rect.width * 0.34; const len = Math.hypot(dx,dy); const clamped = Math.min(max, len || 0.001);
  const nx = dx / (len || 1), ny = dy / (len || 1);
  const x = nx * clamped, y = ny * clamped;
  joystickKnob.style.transform = `translate(${x}px, ${y}px)`;
  input.joyX = x / max;
  input.joyY = -(y / max);
}
function centerJoystick(){ joystickKnob.style.transform = 'translate(0px, 0px)'; }
function startLook(e){ if(state.menuOpen) return; input.lookId = e.pointerId; input.lookDragging = true; input.pointerX = e.clientX; input.pointerY = e.clientY; lookZone.setPointerCapture?.(e.pointerId); }
function moveLook(e){ if(!input.lookDragging || e.pointerId !== input.lookId || state.menuOpen) return; const dx = e.clientX - input.pointerX; const dy = e.clientY - input.pointerY; input.pointerX = e.clientX; input.pointerY = e.clientY; rotateLook(dx,dy); }
function endLook(e){ if(e.pointerId !== input.lookId) return; clearLookInput(); }
function clearLookInput(){ input.lookDragging = false; input.lookId = null; }
function findTouchByIdentifier(list, identifier){
  if (identifier === null || identifier === undefined) return null;
  for (let i = 0; i < list.length; i++) if (list[i].identifier === identifier) return list[i];
  return null;
}
function onTouchMove(e){
  if (state.menuOpen) return;
  let used = false;
  const joyTouch = findTouchByIdentifier(e.touches, input.joyId);
  if (joyTouch) { updateJoy(joyTouch); used = true; }
  const lookTouch = findTouchByIdentifier(e.touches, input.lookId);
  if (lookTouch && input.lookDragging) {
    const dx = lookTouch.clientX - input.pointerX;
    const dy = lookTouch.clientY - input.pointerY;
    input.pointerX = lookTouch.clientX;
    input.pointerY = lookTouch.clientY;
    rotateLook(dx,dy);
    used = true;
  }
  if (used) e.preventDefault();
}
function onTouchEnd(e){
  if (findTouchByIdentifier(e.changedTouches, input.joyId)) clearJoyInput();
  if (findTouchByIdentifier(e.changedTouches, input.lookId)) clearLookInput();
}
function rotateLook(dx,dy){ player.yaw -= dx * 0.0122; player.pitch -= dy * 0.0088; player.pitch = Math.max(-1.05, Math.min(1.05, player.pitch)); }
function toggleMenu(force){
  if (state.cutscene) return;
  const open = typeof force === 'boolean' ? force : !state.menuOpen;
  state.menuOpen = open;
  menuOverlay.classList.toggle('hidden', !open);
  if (open) resetInput();
}
function onResize(){ renderer.setSize(window.innerWidth, window.innerHeight, false); camera.aspect = window.innerWidth/window.innerHeight; camera.updateProjectionMatrix(); }


function beginNewGame(){
  state.area = 'home';
  state.day = 1;
  state.phaseLabel = '昼勤務';
  state.step = 'start_note';
  state.hudHidden = false;
  state.menuOpen = false;
  state.dialogueQueue = [];
  state.checkpoint = null;
  state.chase = null;
  state.guide = null;
  state.slotMode = null;
  state.lastDoorId = null;
  state.doorCooldownUntil = 0;
  state.inputLockUntil = 0;
  state.questFlags = ensureQuestFlagDefaults({});
  state.ended = false;
  state.cutscene = null;
  state.previewGuide = null;
  gameOverEl.classList.add('hidden');
  endingEl.classList.add('hidden');
  returnHomeEl.classList.add('hidden');
  dialogueOverlay.classList.add('hidden');
  menuOverlay.classList.add('hidden');
  stopChase();
  buildArea('home');
  player.x = 0.6; player.z = 2.6; player.yaw = 0; player.pitch = -0.05;
  resetInput();
  setStep('start_note');
}



function showFatalDebug(message){
  let box = document.getElementById('fatal-debug');
  if(!box){
    box = document.createElement('div');
    box.id='fatal-debug';
    box.style.cssText='position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;padding:12px 14px;border-radius:14px;background:rgba(80,0,0,.92);color:#fff;font:14px/1.5 sans-serif;white-space:pre-wrap';
    document.body.appendChild(box);
  }
  box.textContent = message;
}

window.addEventListener('error', function(e){
  showFatalDebug('runtime error: ' + (e.message || 'unknown') + '\n' + (e.filename || '') + ':' + (e.lineno || 0));
});

function init(){
  setupControls();
  const params = new URLSearchParams(location.search);
  const slotParam = Number(params.get('slot') || '0');
  if (params.get('new') === '1') {
    beginNewGame();
    history.replaceState(null, '', 'play.html');
  } else if (slotParam >= 1 && slotParam <= 3) {
    const ok = loadFromSlot(slotParam, true);
    if (!ok) beginNewGame();
    history.replaceState(null, '', 'play.html');
  } else {
    beginNewGame();
  }
  requestAnimationFrame(animate);
}

try {
  init();
} catch (e) {
  console.error(e);
  showFatalDebug('init error: ' + (e && e.message ? e.message : String(e)));
}
})();
