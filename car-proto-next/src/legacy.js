// CHUBZ: the whole game, as it was in the single index.html up to build 136 (ADR-0003: modules come out of here one by one).
// THREE is the r128 namespace plus the post-processing addons, see three.js next to this file.
import { THREE } from './three.js';
import { GS, expose } from './game/state.ts';
import { createSfx } from './audio/sfx.ts';
import { createMusic } from './audio/music.ts';
import { createBaker } from './textures/bake.ts';
import { scaleUV, worldUV } from './textures/uv.ts';
import { wetGround } from './textures/wet.ts';
import { CrewArt, createCrew } from './ui/crew.ts';
import { p2pRoom } from './net/p2p-room.ts';
import { ARENA, FIRE_RATE, W_STATS, W_ORDER, W_GEAR, SWORD_T, TUNE, UNI, BUG, RIDE_KIT, RIDE_ACTIVE, STOMP, BROOD, SPIKE, STARB, BOMB, TRAIL_T, SW_KINDS, MINI_KINDS, MINI_SEQ, RIG, TNT, PHASES, WAVE_PLANS, BOSS_HP, TENT_SP, TENT_MIN, TENT_MAX, BOSS2, LOOT, SHOP, ULT, WEB_N, WEB_R, WEB_T, HALO_SWORDS, BEAM_PER, BULLET, DRILL_DPS, DRILL_REACH, DATA_HASH } from './data/index.js';
import { createCubes } from './enemies/cubes.ts';
import { createDrill } from './rides/drill.ts';
import { createGrabber } from './rides/grabber.ts';
import { createBurrow } from './rides/burrow.ts';
import { createSkids } from './fx/skids.ts';
import { createDecoy } from './rides/decoy.ts';
import { createWingCubes } from './rides/wing-cubes.ts';
import { createTrail } from './rides/trail.ts';
import { createPedestals } from './game/pedestals.ts';
import { createJump } from './rides/jump.ts';
import { createLanding } from './rides/landing.ts';
import { createWeapons } from './weapons/weapons.ts';
import { createSwarm } from './enemies/swarm.ts';
import { createShop } from './game/shop.ts';
import { createLoot } from './game/loot.ts';
import { createChubziks } from './world/chubziks.ts';
import { createFinale } from './world/finale.ts';
import { createDig } from './rides/dig.ts';
import { createShield } from './rides/shield.ts';
import { createBoss } from './enemies/boss.ts';
import { createEffects } from './fx/effects.ts';
import { createCollision } from './game/collision.ts';
import { createPillars } from './world/pillars.ts';
import { createArena } from './world/arena.ts';
import { createBullets } from './weapons/bullets.ts';
import { createAim } from './weapons/aim.ts';
import { createCarModel } from './rides/car.ts';
import { createRides } from './rides/rides.ts';
import { createTouch } from './input/touch.ts';
import { createKeys } from './input/keys.ts';
import { createWorldSetup } from './world/setup.ts';
import { createRenderer } from './render/renderer.ts';
import { createCamera } from './render/camera.ts';
import { createLights } from './render/lights.ts';
import { createPost } from './render/post.ts';
import { createGround } from './world/ground.ts';
import { createObstacles } from './world/obstacles.ts';
import { createLoop } from './game/loop.ts';
import { createMultiplayer } from './net/multiplayer.ts';

(() => {
  // GAME: what the modules taken out of this file use from it, read when they run (dev/tools/extract_section.cjs adds to it)
  const GAME = {};
  expose(GAME, {
    glow: () => glow,
    scene: () => scene,
    burst: () => burst,
    flash: () => flash,
    SFX: () => SFX,
    mkCanvas: () => mkCanvas,
    crateTex: () => crateTex,
    obstacles: () => obstacles,
    active: () => active,
    inWorld: () => inWorld,
    crateMat: () => crateMat,
    rand: () => rand,
    freeSpot: () => freeSpot,
    crewSay: () => crewSay,
    crewKill: () => crewKill,
    carGroup: () => carGroup,
    car: () => car,
    spawnParticles: () => spawnParticles,
    RAM_SPEED: () => RAM_SPEED,
    damageCrate: () => damageCrate,
    releaseIfHeld: () => releaseIfHeld,
    carSeen: () => carSeen,
    domes: () => domes,
    inDome: () => inDome,
    lootFrom: () => lootFrom,
    dropLoot: () => dropLoot,
    myKill: () => myKill,
    haloHoly: () => haloHoly,
    deathToll: () => deathToll,
    groundChubNear: () => groundChubNear,
    perchedNear: () => perchedNear,
    knockOff: () => knockOff,
    eatChub: () => eatChub,
    cart: () => cart,
    safeCount: () => safeCount,
    cartFling: () => cartFling,
    cartKick: () => cartKick,
    updateDig: () => updateDig,
    shield: () => shield,
    chewShield: () => chewShield,
    angLerp: () => angLerp,
    tmp: () => tmp,
    NET: () => NET,
    netEv: () => netEv,
    netPick: () => netPick,
    r1: () => r1,
    r2: () => r2,
    SEED: () => SEED,
    drill: () => drill,
    drillSpin: () => drillSpin,
    drillMat: () => drillMat,
    killsEl: () => killsEl,
    respawnQueue: () => respawnQueue,
    enemies: () => enemies,
    hitEnemy: () => hitEnemy,
    grab: () => grab,
    abilities: () => abilities,
    abLv: () => abLv,
    weapons: () => weapons,
    crateDrop: () => crateDrop,
    swarm: () => swarm,
    hitCritter: () => hitCritter,
    threatNear: () => threatNear,
    bossDamage: () => bossDamage,
    arm: () => arm,
    armSeg: () => armSeg,
    claw: () => claw,
    fingers: () => fingers,
    groundAim: () => groundAim,
    wakeEnemy: () => wakeEnemy,
    hurtCar: () => hurtCar,
    throwMul: () => throwMul,
    critterTop: () => critterTop,
    flashAlert: () => flashAlert,
    surfaceBlast: () => surfaceBlast,
    bombDome: () => bombDome,
    throwDecoys: () => throwDecoys,
    releaseCubes: () => releaseCubes,
    puff: () => puff,
    wheels: () => wheels,
    DECOY_CD: () => DECOY_CD,
    decoyCd: () => decoyCd,
    CUBE_CD: () => CUBE_CD,
    cubeCd: () => cubeCd,
    blastAt: () => blastAt,
    swShadowMat: () => swShadowMat,
    swShadowGeo: () => swShadowGeo,
    CHUB_SIZE: () => CHUB_SIZE,
    chubMats: () => chubMats,
    ringBlast: () => ringBlast,
    waveFx: () => waveFx,
    srgbTex: () => srgbTex,
    startEl: () => startEl,
    kit: () => kit,
    ICONS: () => ICONS,
    toast: () => toast,
    applyAbilityVisuals: () => applyAbilityVisuals,
    pickups: () => pickups,
    pickupTex: () => pickupTex,
    gainWeapon: () => gainWeapon,
    spawnCritter: () => spawnCritter,
    makeMini: () => makeMini,
    digOut: () => digOut,
    altars: () => altars,
    landPower: () => landPower,
    throwBomb: () => throwBomb,
    SPD: () => SPD,
    bullets: () => bullets,
    bulletGeo: () => bulletGeo,
    BOSS_POS: () => BOSS_POS,
    muzzle: () => muzzle,
    smashPillar: () => smashPillar,
    wPrice: () => wPrice,
    ICON_URLS: () => ICON_URLS,
    X_TOKENS: () => X_TOKENS,
    spawnPickup: () => spawnPickup,
    stunCritter: () => stunCritter,
    boss: () => boss,
    PH: () => PH,
    ekillsEl: () => ekillsEl,
    pushOutOfBox: () => pushOutOfBox,
    pedestals: () => pedestals,
    bossDrop: () => bossDrop,
    dropWeapon: () => dropWeapon,
    bombOff: () => bombOff,
    waves: () => waves,
    lobbyViews: () => lobbyViews,
    offscreenSpot: () => offscreenSpot,
    camera: () => camera,
    camFocus: () => camFocus,
    GATE_HZ: () => GATE_HZ,
    inRoom: () => inRoom,
    crew: () => crew,
    ISO_SQUASH: () => ISO_SQUASH,
    eshots: () => eshots,
    MOB_PAT: () => MOB_PAT,
    mobGeo: () => mobGeo,
    mobLook: () => mobLook,
    mobThrow: () => mobThrow,
    decoys: () => decoys,
    decoyNear: () => decoyNear,
    wbFar: () => wbFar,
    JUMP_V: () => JUMP_V,
    isFry: () => isFry,
    ult: () => ult,
    SW_FRAMES: () => SW_FRAMES,
    globs: () => globs,
    SW_CAP: () => SW_CAP,
    swById: () => swById,
    killCritter: () => killCritter,
    rigDirector: () => rigDirector,
    rigAI: () => rigAI,
    rigTick: () => rigTick,
    rigBreak: () => rigBreak,
    bombs: () => bombs,
    HAND: () => HAND,
    handAxis: () => handAxis,
    inkMat: () => inkMat,
    inkBack: () => inkBack,
    gSph: () => gSph,
    gCyl: () => gCyl,
    makeHand2D: () => makeHand2D,
    handPose: () => handPose,
    bombModel: () => bombModel,
    handTick: () => handTick,
    addBomb: () => addBomb,
    chubVulnerable: () => chubVulnerable,
    pickPrey: () => pickPrey,
    cartReset: () => cartReset,
    angel: () => angel,
    resetChubs: () => resetChubs,
    waveTargets: () => waveTargets,
    netAnyPlayer: () => netAnyPlayer,
    waveMul: () => waveMul,
    hellTotal: () => hellTotal,
    hellAlive: () => hellAlive,
    bullbar: () => bullbar,
    mast: () => mast,
    bulletMat: () => bulletMat,
    touch: () => touch,
    stickWorld: () => stickWorld,
    layoutTouch: () => layoutTouch,
    toggleBurrow: () => toggleBurrow,
    addDome: () => addDome,
    activeCdK: () => activeCdK,
    addDecoy: () => addDecoy,
    spawnCubes: () => spawnCubes,
    jump: () => jump,
    updateWeaponHUD: () => updateWeaponHUD,
    novaMat: () => novaMat,
    netMe: () => netMe,
    ROOM_X2: () => ROOM_X2,
    door: () => door,
    seedRandom: () => seedRandom,
    rocks: () => rocks,
    metal: () => metal,
    tyreMat: () => tyreMat,
    drawCritter: () => drawCritter,
    setDoor: () => setDoor,
    ROOM_X1: () => ROOM_X1,
    hardReload: () => hardReload,
    CHUB_FR: () => CHUB_FR,
    chubs: () => chubs,
    cartNEl: () => cartNEl,
    carOK: () => carOK,
    perchSlot: () => perchSlot,
    spawnChub: () => spawnChub,
    monsterDist: () => monsterDist,
    nearestRock: () => nearestRock,
    chubArc: () => chubArc,
    cartAdd: () => cartAdd,
    updateCart: () => updateCart,
    rockGrow: () => rockGrow,
    altarFeed: () => altarFeed,
    mound: () => mound,
    holdPos: () => holdPos,
    ROOM_HZ: () => ROOM_HZ,
    LAIR_POS: () => LAIR_POS,
    runeMat: () => runeMat,
    doorMesh: () => doorMesh,
    eshotGeo: () => eshotGeo,
    eshotMat: () => eshotMat,
    eshotHaloMat: () => eshotHaloMat,
    G: () => G,
    thrown: () => thrown,
    finishThrown: () => finishThrown,
    angelStart: () => angelStart,
    num: () => num,
    COARSE: () => COARSE,
    LIGHT: () => LIGHT,
    particles: () => particles,
    PILLAR_RAM: () => PILLAR_RAM,
    cartSpill: () => cartSpill,
    pillarMat: () => pillarMat,
    rockMat: () => rockMat,
    rockSmashed: () => rockSmashed,
    groundTex: () => groundTex,
    concreteTex: () => concreteTex,
    blockTex: () => blockTex,
    muzzleLight: () => muzzleLight,
    turret: () => turret,
    pickAutoTarget: () => pickAutoTarget,
    autoTargetPos: () => autoTargetPos,
    body: () => body,
    dark: () => dark,
    SW_ART: () => SW_ART,
    cartG: () => cartG,
    cartBody: () => cartBody,
    bubbleMats: () => bubbleMats,
    carBub: () => carBub,
    SPL: () => SPL,
    spUp: () => spUp,
    spO: () => spO,
    spDn: () => spDn,
    spC: () => spC,
    spIn: () => spIn,
    spF: () => spF,
    spA: () => spA,
    spT: () => spT,
    spBoxes: () => spBoxes,
    climbable: () => climbable,
    spCast: () => spCast,
    renderer: () => renderer,
    RIDES: () => RIDES,
    setRide: () => setRide,
    placeEnemy: () => placeEnemy,
    clearEShots: () => clearEShots,
    clearSwarm: () => clearSwarm,
    resetBoss: () => resetBoss,
    netStart: () => netStart,
    netPurge: () => netPurge,
    diagToggle: () => diagToggle,
    resizeCam: () => resizeCam,
    MUSIC: () => MUSIC,
    syncMute: () => syncMute,
    respawn: () => respawn,
    special: () => special,
    convertCoins: () => convertCoins,
    useUlt: () => useUlt,
    doUnload: () => doUnload,
    addRock: () => addRock,
    addPillar: () => addPillar,
    addCrate: () => addCrate,
    logError: () => logError,
    GROUND_TILE: () => GROUND_TILE,
    HX: () => HX,
    ISO_OFFSET: () => ISO_OFFSET,
    SUN_OFFSET: () => SUN_OFFSET,
    sun: () => sun,
    updateFx: () => updateFx,
    crateHitMat: () => crateHitMat,
    paint: () => paint,
    updateHeadlight: () => updateHeadlight,
    updateHorn: () => updateHorn,
    updateRide: () => updateRide,
    updateAim: () => updateAim,
    fire: () => fire,
    keys: () => keys,
    spdEl: () => spdEl,
    updateEnemies: () => updateEnemies,
    resolveCarVsBox: () => resolveCarVsBox,
    updateChunks: () => updateChunks,
    crateSpot: () => crateSpot,
    updateDrill: () => updateDrill,
    updateGrab: () => updateGrab,
    BURY_DEPTH: () => BURY_DEPTH,
    updateBurrow: () => updateBurrow,
    updateSkid: () => updateSkid,
    updateDomes: () => updateDomes,
    updateDecoys: () => updateDecoys,
    updateCubes: () => updateCubes,
    updateTrails: () => updateTrails,
    updateWbMarks: () => updateWbMarks,
    updatePedestals: () => updatePedestals,
    updateJump: () => updateJump,
    updateLandFx: () => updateLandFx,
    updateLoot: () => updateLoot,
    updateAbHud: () => updateAbHud,
    updatePickups: () => updatePickups,
    updateLossFx: () => updateLossFx,
    updateWeapons: () => updateWeapons,
    updateUlts: () => updateUlts,
    updateBombs: () => updateBombs,
    towK: () => towK,
    updateSwarm: () => updateSwarm,
    updateAltars: () => updateAltars,
    updateAngel: () => updateAngel,
    updateChubs: () => updateChubs,
    updateShieldBar: () => updateShieldBar,
    roomSpot: () => roomSpot,
    updateBoss: () => updateBoss,
    updateDiag: () => updateDiag,
    updateNet: () => updateNet,
    updatePhases: () => updatePhases,
    updateMinimap: () => updateMinimap,
    updateHints: () => updateHints,
    softTex: () => softTex,
    puffPool: () => puffPool,
    flashPool: () => flashPool,
    fxSprite: () => fxSprite,
    trueRandom: () => trueRandom,
    rideG: () => rideG,
    strut: () => strut,
    rideClone: () => rideClone,
    partGeo: () => partGeo,
    starGeo: () => starGeo,
    starMat: () => starMat,
    toComic: () => toComic,
    BUILD: () => BUILD,
    enemyFlash: () => enemyFlash,
    setEnemyLook: () => setEnemyLook,
    enemyDieFx: () => enemyDieFx,
    enemyVolley: () => enemyVolley,
    firstGun: () => firstGun,
    pedIcon: () => pedIcon,
    ambush: () => ambush,
    crewArmed: () => crewArmed,
    armedFx: () => armedFx,
    wbGift: () => wbGift,
    makeWanderer: () => makeWanderer,
    stompAt: () => stompAt,
    landFxRemote: () => landFxRemote,
    loot: () => loot,
    addLoot: () => addLoot,
    lootGain: () => lootGain,
    AB_INFO: () => AB_INFO,
    gearDone: () => gearDone,
    pickupGone: () => pickupGone,
    fireBeams: () => fireBeams,
    launchWebs: () => launchWebs,
    sawMat: () => sawMat,
    sawGeo: () => sawGeo,
    dodecaGeo: () => dodecaGeo,
    dodecaMats: () => dodecaMats,
    fireMortar: () => fireMortar,
    SW_KEYS: () => SW_KEYS,
    makeRig: () => makeRig,
    ultKillAt: () => ultKillAt,
    castUlt: () => castUlt,
    dropBomb: () => dropBomb,
    bombBoom: () => bombBoom,
    miniStart: () => miniStart,
    spit: () => spit,
    safeKeeps: () => safeKeeps,
    ALTAR_NEED: () => ALTAR_NEED,
    openGate: () => openGate,
    rising: () => rising,
    worldWake: () => worldWake,
    updateRising: () => updateRising,
    altarGuards: () => altarGuards,
    altarApply: () => altarApply,
    altarWave: () => altarWave,
    bossBarEl: () => bossBarEl,
    tentacles: () => tentacles,
    tentRoot: () => tentRoot,
    bossFan: () => bossFan,
    netPeerPos: () => netPeerPos,
    bossLift: () => bossLift,
    bossHurl: () => bossHurl,
    bossHealth: () => bossHealth,
    bossMax: () => bossMax,
    bossBar: () => bossBar,
    releaseLift: () => releaseLift,
    killBoss: () => killBoss,
    bossEmerge: () => bossEmerge,
    bossFightNow: () => bossFightNow,
    quakes: () => quakes,
    bossQuake: () => bossQuake,
    bossMove: () => bossMove,
    bossFlee: () => bossFlee,
    lavas: () => lavas,
    bossLava: () => bossLava,
  });
  // Test seam: the harness puts its frame clock on window.__hx before the page loads (dev/harness/hx.js). Players never have it.
  const HX = window.__hx || null;
  // Every uncaught error and rejected promise goes to the lobby's diagnostics log (tap the build number), each distinct one once.
  // Errors from before the log exists wait in earlyErrors until the end of the set-up. localStorage reads and writes stay silent: private mode refuses them.
  const earlyErrors = [], seenErrors = new Set();
  function logError(s) {
    s = String(s).slice(0, 300); if (seenErrors.has(s) || seenErrors.size > 30) return; seenErrors.add(s);
    try { netLog('error: ' + s); } catch (e) { earlyErrors.push(s); }
  }
  addEventListener('error', e => logError(`${e.message} (${String(e.filename || '').split('/').pop()}:${e.lineno}:${e.colno})`));
  addEventListener('unhandledrejection', e => { const r = e.reason; logError('promise: ' + ((r && (r.message || r)) || 'rejected')); });

  // ---------- colour pipeline ----------
  // Colours are authored in sRGB (hex, CSS, HSL), lit in linear HDR, then tone-mapped and encoded in the final post pass.
  // Three's ColorManagement (on since r152) turns hex and CSS colours from sRGB into linear; setHSL needs THREE.SRGBColorSpace
  // passed, or it reads the numbers as linear. setRGB and vertex colours are linear, as they always were here.
  const srgbTex = c => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  const glow = (mat, k) => { mat.color.multiplyScalar(k); return mat; };   // push an unlit colour into HDR so it blooms

  // ---------- renderer / scene ---------- -> src/render/renderer.ts
  const { renderer, COARSE, LIGHT, MAX_ANISO, scene } = createRenderer(GAME);

  // ---------- isometric camera ---------- -> src/render/camera.ts
  const { ISO_OFFSET, camera, resizeCam, camFocus } = createCamera(GAME);

  // ---------- lights: low warm sun, cool sky fill, blue rim ---------- -> src/render/lights.ts
  const { SUN_OFFSET, sun } = createLights(GAME);

  // ---------- post-processing: HDR bloom -> filmic grade -> FXAA ---------- -> src/render/post.ts
  const {  } = createPost(GAME);

  // ---------- FX: soft sprites, additive flashes, pooled lights (light count never changes -> no shader recompiles) ---------- -> src/fx/effects.ts
  const { softTex, puffs, flashes, puffPool, flashPool, fxSprite, puff, burst, muzzleLight, flash, updateFx } = createEffects(GAME);

  // ---------- AUDIO: no sound files, every sound is synthesised at startup ----------
  // A bank of recipes renders into AudioBuffers (several random variants each), then plays through
  // buses with voice limits, distance falloff and stereo pan from the camera's point of view.
  const SFX = createSfx({ camera, listenerPos: () => car.pos });      // src/audio/sfx.ts; the car is built later, so it is read when a sound plays

  const MUSIC = createMusic({ sfx: SFX });      // src/audio/music.ts

  // ---------- procedural textures, baked on the GPU ----------
  // Each material is a GLSL recipe surf(uv) -> albedo, roughness, an extra channel and a height.
  // A full-screen pass renders it once into render targets: albedo (sRGB), packed roughness (G) + extra (B),
  // and a tangent-space normal map taken from the height by finite differences. All recipes tile seamlessly.
  const mkCanvas = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

  const bakeTextures = createBaker({ renderer, maxAniso: MAX_ANISO });      // src/textures/bake.ts
  const GROUND_TILE = 16;
  const groundTex = bakeTextures('ground', COARSE ? 1024 : 2048, COARSE ? 6 : 12);
  const crateTex = bakeTextures('crate', 512, 5);
  const concreteTex = bakeTextures('concrete', 512, 4);
  const blockTex = bakeTextures('blocks', 512, 5);


  // ---------- ground ---------- -> src/world/ground.ts
  const {  } = createGround(GAME);

  // ---------- obstacles ---------- -> src/world/obstacles.ts
  const { obstacles, active } = createObstacles(GAME);

  // ---------- стены (твёрдые) + комната босса за восточной стеной ---------- -> src/world/arena.ts
  const { ROOM_X1, ROOM_X2, ROOM_HZ, GATE_HZ, BOSS_POS, LAIR_POS, inRoom, inWorld, runeMat, doorMesh, door, pillarMat, crateMat, crateHitMat, rand, SEED, trueRandom, seedRandom, freeSpot, rocks, rockMat, addRock, addPillar, addCrate, crew, crewSay, crewKill } = createArena(GAME);

  // ---------- car ---------- -> src/rides/car.ts
  const { carGroup, body, paint, dark, metal, tyreMat, turret, muzzle, bullbar, updateHeadlight, drill, drillSpin, drillMat, arm, mast, armSeg, claw, fingers, wheels } = createCarModel(GAME);

  // ---------- rides: the buggy plus three stranger things on the same chassis logic. Models are built the first time they are picked ---------- -> src/rides/rides.ts
  const { RIDES, rideG, strut, setRide, rideClone, updateHorn, updateRide, car } = createRides(GAME);

  // ---------- bullets & particles ---------- -> src/weapons/bullets.ts
  const { bullets, bulletGeo, bulletMat, particles, partGeo, spawnParticles } = createBullets(GAME);

  // ---------- aiming ---------- -> src/weapons/aim.ts
  const { groundAim, updateAim, starGeo, starMat, fire } = createAim(GAME);

  // ---------- input ---------- -> src/input/keys.ts
  const { keys } = createKeys(GAME);

  // ---------- touch input ---------- -> src/input/touch.ts
  const { ISO_SQUASH, touch, stickWorld, layoutTouch, enableTouch, startEl, toComic, BUILD, hardReload, syncMute, respawn } = createTouch(GAME);

  // ---------- world setup ---------- -> src/world/setup.ts
  const { killsEl, spdEl, respawnQueue } = createWorldSetup(GAME);

  // ---------- evil cubes ---------- -> src/enemies/cubes.ts
  const { enemyFlash, enemies, ekillsEl, setEnemyLook, placeEnemy, wakeEnemy, hurtCar, pushOutOfBox, enemyDieFx, updateEnemies, eshots, eshotGeo, eshotMat, eshotHaloMat, enemyVolley, MOB_PAT, mobGeo, mobLook, mobThrow, clearEShots, hitEnemy } = createCubes(GAME);

  // ---------- collision helpers ---------- -> src/game/collision.ts
  const { RAM_SPEED, resolveCarVsBox } = createCollision(GAME);

  // ---------- smashable pillars: ram one and it bursts into heavy chunks that mow through the small stuff ---------- -> src/world/pillars.ts
  const { PILLAR_RAM, chunks, smashPillar, updateChunks } = createPillars(GAME);

  // ---------- drill logic ---------- -> src/rides/drill.ts
  const { crateSpot, damageCrate, updateDrill } = createDrill(GAME);

  // ---------- grabber logic ---------- -> src/rides/grabber.ts
  const { G, grab, thrown, holdPos, releaseIfHeld, finishThrown, updateGrab } = createGrabber(GAME);

  // ---------- burrow ---------- -> src/rides/burrow.ts
  const { BURY_DEPTH, mound, carSeen, special, toggleBurrow, updateBurrow } = createBurrow(GAME);

  // ---------- skid marks + tire smoke ---------- -> src/fx/skids.ts
  const { updateSkid, throwMul, ringBlast, blastAt, surfaceBlast, domes, bombDome, addDome, inDome, updateDomes, activeCdK } = createSkids(GAME);

  // ---------- Decoy Chubz (buggy): a squeaky fake chubzik; on the host every monster nearby goes for it, then it blows up ----- -> src/rides/decoy.ts
  const { DECOY_CD, decoys, decoyCd, throwDecoys, addDecoy, decoyNear, updateDecoys } = createDecoy(GAME);

  // ---------- Wing Cubes (angel): run by the caster's machine; others just see them flutter round the angel ----- -> src/rides/wing-cubes.ts
  const { CUBE_CD, cubeCd, releaseCubes, spawnCubes, updateCubes, cubes } = createWingCubes(GAME);

  // ---------- Rainbow Trail (unicorn, passive): biters that step on it lose you; the host runs it for every unicorn it knows ----- -> src/rides/trail.ts
  const { updateTrails, trails } = createTrail(GAME);

  // ---------- the warm-up: everybody has their own weapon pedestals; one rises out of the ground when you come close and has to be fought for. -> src/game/pedestals.ts
  const { pedestals, firstGun, pedIcon, ambush, crewArmed, armedFx, wbGift, updateWbMarks, makeWanderer, wbFar, updatePedestals, addPedestal, spawnWanderers, wbTopUp, wbMarks } = createPedestals(GAME);

  // ---------- jump ---------- -> src/rides/jump.ts
  const { JUMP_V, jump, updateJump } = createJump(GAME);

  // ---------- landing powers: what a levelled jump does when the ride comes down. One per ride, three levels each ---------- -> src/rides/landing.ts
  const { isFry, waveFx, stompAt, landPower, landFxRemote, updateLandFx, broods, spikeFields } = createLanding(GAME);

  // ---------- abilities & loot ---------- -> src/game/loot.ts
  const { abilities, kit, abLv, loot, ult, addLoot, dropCoins, lootRemove, lootFrom, updateLoot, lootGain, abPrice, wPrice, abMax, AB_INFO, ICONS, ICON_URLS, X_TOKENS, upgradeAb, updateAbHud, toast, applyAbilityVisuals, pickups, pickupTex, dropLoot, gearDone, myKill, bossDrop, spawnPickup, pickupGone, updatePickups } = createLoot(GAME);

  // ---------- weapons, survivors-style: broken crates drop chips that add a weapon or level it up ---------- -> src/weapons/weapons.ts
  const { weapons, updateWeaponHUD, dropWeapon, crateDrop, gainWeapon, novaMat, beams, haloHoly, fireBeams, webs, launchWebs, sawMat, sawGeo, saws, dodecaGeo, dodecaMats, deathToll, lossFx, updateLossFx, shells, fireMortar, updateWeapons } = createWeapons(GAME);

  // ---------- 2D swarm: flat paper-cutout critters that come in waves ---------- -> src/enemies/swarm.ts
  const { SW_FRAMES, drawCritter, swShadowMat, swShadowGeo, SW_ART, swarm, globs, SW_CAP, swById, SW_KEYS, spawnCritter, killCritter, hitCritter, makeMini, makeRig, spawnRig, rigDirector, rigAI, rigLog, rigTick, rigToss, rigBreak, bombs, HAND, handAxis, inkMat, inkBack, gSph, gCyl, FLAT, ART, makeHand2D, handPose, bombModel, makeHand, handTick, addBomb } = createSwarm(GAME);

  // ---------- the shop and the level's ultimates ---------- -> src/game/shop.ts
  const { ultFx, furrows, convertCoins, buyUlt, useUlt, ultKillAt, makeSword, castUlt, updateUlts, dropBomb, bombRefill, bombOff, bombBoom, updateBombs, throwBomb, towK, spawnMinis, miniStart, stunCritter, critterTop, waves, lobbyViews, offscreenSpot, digOut, spawnWave, updateSwarm, spit, clearSwarm, threatNear } = createShop(GAME);

  // ---------- chubziks: small blue locals. Monsters hunt them, they hide on rocks, you scoop them into a cart ---------- -> src/world/chubziks.ts
  const { CHUB_FR, CHUB_SIZE, chubMats, chubs, cartNEl, chubVulnerable, carOK, perchSlot, spawnChub, monsterDist, nearestRock, groundChubNear, perchedNear, pickPrey, chubArc, knockOff, eatChub, cart, cartG, cartBody, cartAdd, cartReset, safeKeeps, safeCount, cartSpill, cartFling, cartKick, updateCart, rockGrow, rockSmashed, ALTAR_NEED, altars, openGate, rising, worldWake, updateRising, altarGuards, bubbleMats, carBub, doUnload, altarFeed, altarApply, altarWave, updateAltars } = createChubziks(GAME);

  // ---------- finale: once Pyramidon is down, a huge blue cube-angel descends and every surviving chubzik flies up into it ---------- -> src/world/finale.ts
  const { angel, angelStart, updateAngel, updateChubs, resetChubs, pickAutoTarget, autoTargetPos } = createFinale(GAME);

  // ---------- выкапывание ---------- -> src/rides/dig.ts
  const { flashAlert, updateDig } = createDig(GAME);

  // ---------- shield (то, что висит на буре) ---------- -> src/rides/shield.ts
  const { shield, chewShield, updateShieldBar } = createShield(GAME);

  // ---------- BOSS: Пирамидон ---------- -> src/enemies/boss.ts
  const { bossBarEl, boss, tentacles, tentRoot, angLerp, roomSpot, bossFan, bossTgts, netPeerPos, bossFanTick, bossLift, bossHurl, bossDamage, bossHealth, bossMax, bossBar, setDoor, releaseLift, killBoss, bossEmerge, bossFightNow, resetBoss, quakes, bossQuake, bossSetPos, bossMove, bossFlee, bossDash, lavas, bossLava, updateBoss } = createBoss(GAME);

  // ---------- loop ---------- -> src/game/loop.ts
  const { clock, tmp, SPL, SPD, spUp, spO, spDn, spC, spIn, spF, spA, spT, spBoxes, climbable, spCast, update, adaptQuality } = createLoop(GAME);

  // ---------- multiplayer over the artifact's room channel: lobby list on the start screen, other players as ghost rides ---------- -> src/net/multiplayer.ts
  const { NET, num, VER, netStart, netMe, netEv, netPurge, netPick, waveTargets, netAnyPlayer, DG, netLog, diagToggle, updateDiag, r1, r2, updateNet, PH, waveMul, hellTotal, hellAlive, phEnter, phAdvance, phFind, updatePhases, updateMinimap, updateHints } = createMultiplayer(GAME);
  if (window.__skipLobby) GAME.toComic('solo');             // tests: straight into a solo game

  /* test-seam: debug registry */

  // ---------- start: the first frame ----------
  if (HX && HX.reseed) HX.reseed();                     // tests: the game's own randomness starts from the test's seed here, however many numbers Three.js took while loading
  for (const e of earlyErrors.splice(0)) try { netLog('error: ' + e); } catch (x) {}      // the log exists now
  { const a = Math.random() * 6.283; car.pos.set(Math.cos(a) * ARENA * 0.4, 0, Math.sin(a) * ARENA * 0.4); car.heading = Math.atan2(-car.pos.x, -car.pos.z); }      // start out on the plain, facing the centre pedestal
  camFocus.copy(car.pos);
  function musicLevel() {                               // how hard the band plays: by phase, one notch up when the crowd is on you
    if (startEl.isConnected) return 0; if (PH.brk > 0) return 1;
    const l = { roll: 1, scout: 2, save: 2, hell: 3, boss: 3 }[PHASES[PH.i].key] || 1;
    return Math.min(4, l + (waves.alive >= 14 || boss.state === 'fight' ? 1 : 0));
  }
  function frame() {
    MUSIC.level = MUSIC.force ?? musicLevel(); MUSIC.muffle = !startEl.isConnected && !car.alive; MUSIC.tick();
    clock.update(); const raw = clock.getDelta(), dt = HX ? HX.dt(raw) : Math.min(raw, 1 / 30);
    adaptQuality(raw);
    for (let k = 0, n = HX ? HX.sub : 1; k < n; k++) update(dt);      // tests in turbo run several game steps a frame
    if (++GS.shadowTick >= GS.shadowEvery) { GS.shadowTick = 0; renderer.shadowMap.needsUpdate = true; }
    if (HX && HX.skipRender()) { /* tests: nothing to draw */ } else if (GS.composer) {
      GS.gradePass.uniforms.time.value = GS.elapsed;
      GS.gradePass.uniforms.hurt.value = Math.max(0, GS.hurtFlash) / 0.18;
      GS.gradePass.uniforms.lowHp.value = car.alive ? Math.max(0, 1 - car.hp / (car.maxHp * 0.35)) : 0;
      GS.composer.render();
    } else renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  frame();
})();
