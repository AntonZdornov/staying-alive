import { BasePage } from '@zeppos/zml/base-page'
import { createWidget, widget, prop, align } from '@zos/ui'
import { Time, Wear, HeartRate, BodyTemperature, Screen } from '@zos/sensor'
import { setPageBrightTime } from '@zos/display'
import { localStorage } from '@zos/storage'
import { queryPermission, requestPermission } from '@zos/app'
import { onGesture, offGesture, GESTURE_RIGHT } from '@zos/interaction'
import { push } from '@zos/router'
import { NAME_KEY, normalizeName, DEBUG } from '../utils/config'
import { readWristTemp } from '../utils/wrist'

const FIRE_FRAMES = 6
const FRAME_MS = 120
const CLOCK_POLL_MS = 60 * 1000

// Time of day by hour (start hour inclusive) picks the sky and a name color readable on it
const PHASES = [
  { name: 'night', from: 0, nameColor: 0xf0d8a8 },
  { name: 'morning', from: 5, nameColor: 0x3c2818 },
  { name: 'day', from: 10, nameColor: 0x1e3250 },
  { name: 'sunset', from: 17, nameColor: 0xfff0dc },
  { name: 'night', from: 21, nameColor: 0xf0d8a8 },
]

// Warmth 0..100 follows the wrist: while the watch is worn it heads to a target set by the
// wrist temperature, once the watch is taken off it slowly cools down to embers
const WARMTH_TICK_MS = 1000
const WARMING_PER_SEC = 100 / 30 // cold to full fire in ~30 s on the wrist
const COOLING_PER_SEC = 100 / 90 // full fire to embers in ~1.5 min off the wrist
const SMALL_FIRE_FROM = 20
const BIG_FIRE_FROM = 60

// Wrist temperature to warmth target: below WRIST_COLD_C the fire dies even on the wrist,
// from there it grows from a small fire up to a full one at WRIST_WARM_C
const WRIST_COLD_C = 28
const WRIST_WARM_C = 34
const WORN_MIN_WARMTH = SMALL_FIRE_FROM + 5

// Wear.getStatus(): 0 not worn, 1 worn, 2 in motion, 3 not sure
const WEAR_OFF = 0
const WEAR_UNSURE = 3

// Warmth is saved so the fire keeps cooling while the app is closed. Pages have no
// pause callback, so it is saved on exit, on screen off and whenever the watch is put on or off
const STORAGE_KEY = 'fire'
const SCREEN_OFF = 2

// While the app is closed, wrist time is recovered from today's per-minute heart rate:
// it is only measured on the wrist, but periodically, so a reading this close counts as worn
const HR_PERMISSION = 'data:user.hd.heart_rate'
const TEMP_PERMISSION = 'data:user.hd.body_temp'
const PERMISSION_GRANTED = 2
const WORN_NEAR_HR_MIN = 15
const MINUTE_MS = 60 * 1000
const MAX_CATCH_UP_MS = 24 * 60 * MINUTE_MS

// Man poses: frames live in assets/default.r/man_<pose>/man_<i>.png, all MAN.w x MAN.h
const MAN = { x: 96, y: 212, w: 100, h: 172 }
const MAN_FRAMES = { warm: 1, cold: 4 }

// Character name from the Zepp app settings, centered above the man's head
const NAME_LABEL = { x: 22, y: 180, w: 200, h: 36 }

// Positions are tuned so the flame base sits on the fire pit in the backgrounds
const FIRES = {
  small: { x: 230, y: 294, w: 56, h: 64 },
  big: { x: 210, y: 238, w: 96, h: 120 },
}

function phaseAt(hour) {
  let phase = PHASES[0]
  for (const p of PHASES) if (hour >= p.from) phase = p
  return phase
}

function fireLevel(warmth) {
  if (warmth < SMALL_FIRE_FROM) return 'embers'
  return warmth < BIG_FIRE_FROM ? 'small' : 'big'
}

const clampWarmth = (value) => Math.max(0, Math.min(100, value))

// Without a temperature reading the fire burns fully while worn
function warmthTarget(tempC) {
  if (tempC === null) return 100
  if (tempC < WRIST_COLD_C) return 0
  const t = Math.max(0, Math.min(1, (tempC - WRIST_COLD_C) / (WRIST_WARM_C - WRIST_COLD_C)))
  return WORN_MIN_WARMTH + t * (100 - WORN_MIN_WARMTH)
}

function loadSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY, 'null'))
    return saved && typeof saved.warmth === 'number' ? saved : null
  } catch (e) {
    return null
  }
}

// Returns minuteOfDay -> worn, or null when heart rate history is unavailable
function wornFromHeartRate() {
  try {
    const today = new HeartRate().getToday() || []
    // prefix[i] = number of minutes with a reading before minute i
    const prefix = [0]
    for (let i = 0; i < today.length; i++) prefix.push(prefix[i] + (today[i] > 0 ? 1 : 0))
    const readingsBetween = (from, to) => {
      const a = Math.max(0, from)
      const b = Math.min(today.length, to)
      return b > a ? prefix[b] - prefix[a] : 0
    }
    return (minute) => readingsBetween(minute - WORN_NEAR_HR_MIN, minute + WORN_NEAR_HR_MIN + 1) > 0
  } catch (e) {
    return null
  }
}

// Replays the time the app was closed minute by minute
function catchUp(warmth, from, to, wornAt) {
  const midnight = new Date(to)
  midnight.setHours(0, 0, 0, 0)
  for (let t = Math.max(from, to - MAX_CATCH_UP_MS); t < to; t += MINUTE_MS) {
    const minute = Math.floor((t - midnight.getTime()) / MINUTE_MS)
    // Before midnight there is no history, so that time counts as off the wrist
    const worn = minute >= 0 && wornAt(minute)
    const seconds = Math.min(MINUTE_MS, to - t) / 1000
    warmth = clampWarmth(warmth + (worn ? WARMING_PER_SEC : -COOLING_PER_SEC) * seconds)
  }
  return warmth
}

// The man freezes only once there is no fire left
const manPose = (fire) => (fire === 'embers' ? 'cold' : 'warm')

Page(
  BasePage({
    state: {
      frame: 0,
      manFrame: 0,
      phase: null,
      warmth: 0,
      fire: null,
      animTimer: null,
      clockTimer: null,
      warmthTimer: null,
      name: '',
      tempAllowed: false,
      wristTemp: null,
    },

    build() {
      setPageBrightTime({ brightTime: 5 * 60 * 1000 })

      this.bg = createWidget(widget.IMG, { x: 0, y: 0, src: 'bg_night.png' })
      this.man = createWidget(widget.IMG, { ...MAN, src: 'man_warm/man_0.png' })
      this.nameLabel = createWidget(widget.TEXT, {
        ...NAME_LABEL,
        text: '',
        text_size: 24,
        color: PHASES[0].nameColor,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
      })

      this.fires = {}
      for (const name of Object.keys(FIRES)) {
        this.fires[name] = createWidget(widget.IMG, {
          ...FIRES[name],
          src: `fire_${name}/fire_0.png`,
        })
        this.fires[name].setProperty(prop.VISIBLE, false)
      }

      this.time = new Time()
      this.updatePhase()
      this.state.clockTimer = setInterval(() => this.updatePhase(), CLOCK_POLL_MS)

      this.wear = new Wear()
      const saved = loadSaved()
      // First launch: start from the current wear state
      this.state.warmth = saved ? saved.warmth : this.isWorn() ? 100 : 0
      this.updateFire()
      this.bodyTemp = new BodyTemperature()
      this.withPermissions(([hr, temp]) => {
        this.state.tempAllowed = temp === PERMISSION_GRANTED
        if (saved) this.catchUp(saved, hr === PERMISSION_GRANTED ? wornFromHeartRate() : null)
      })
      this.state.warmthTimer = setInterval(() => this.updateWarmth(), WARMTH_TICK_MS)

      this.onWearChange = () => this.save()
      this.wear.onChange(this.onWearChange)
      this.screen = new Screen()
      this.onScreenChange = (status) => status === SCREEN_OFF && this.save()
      this.screen.onChange(this.onScreenChange)

      this.state.animTimer = setInterval(() => this.nextFrame(), FRAME_MS)

      if (DEBUG) this.enableDebugSwipe()

      // Show the cached name right away; the phone may be out of reach
      this.state.name = normalizeName(localStorage.getItem(NAME_KEY, ''))
      this.nameLabel.setProperty(prop.TEXT, this.state.name)
      this.request({ method: 'name.get' })
        .then((res) => res && this.applyName(res.name))
        .catch(() => {})
    },

    // The debug screen reads the live game state from globalData. The gesture listener is global,
    // so while the debug screen is open swipe right falls through to the default back
    enableDebugSwipe() {
      const globalData = getApp()._options.globalData
      globalData.game = this.state
      onGesture({
        callback: (event) => {
          if (event !== GESTURE_RIGHT || globalData.debugOpen) return false
          push({ url: 'page/debug' })
          return true
        },
      })
    },

    // Push from the side service when the name changes in the Zepp app
    onCall(req) {
      if (req && req.method === 'name.changed') this.applyName(req.params && req.params.name)
    },

    applyName(raw) {
      const name = normalizeName(raw)
      if (name === this.state.name) return
      this.state.name = name
      // Stored as JSON like in settings, so names such as "123" survive normalizeName
      localStorage.setItem(NAME_KEY, JSON.stringify(name))
      this.nameLabel.setProperty(prop.TEXT, name)
    },

    updatePhase() {
      const phase = phaseAt(this.time.getHours())
      if (phase === this.state.phase) return
      this.state.phase = phase
      this.bg.setProperty(prop.SRC, `bg_${phase.name}.png`)
      this.nameLabel.setProperty(prop.COLOR, phase.nameColor)
    },

    isWorn() {
      return this.wear.getStatus() !== WEAR_OFF
    },

    // Health data permissions must be granted by the user at runtime, not just declared in app.json
    withPermissions(done) {
      const permissions = [HR_PERMISSION, TEMP_PERMISSION]
      const results = queryPermission({ permissions })
      if (results.every((r) => r === PERMISSION_GRANTED)) return done(results)
      requestPermission({
        permissions,
        callback: () => done(queryPermission({ permissions })),
      })
    },

    catchUp(saved, wornAt) {
      // Without heart rate history, assume the watch stayed on if it is worn both then and now
      const worn = wornAt || (() => saved.worn && this.isWorn())
      this.state.warmth = catchUp(saved.warmth, saved.savedAt, Date.now(), worn)
      this.updateFire()
      this.save()
    },

    save() {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ warmth: this.state.warmth, worn: this.isWorn(), savedAt: Date.now() }),
      )
    },

    updateWarmth() {
      const status = this.wear.getStatus()
      if (status === WEAR_UNSURE) return
      const dt = WARMTH_TICK_MS / 1000
      const { warmth } = this.state
      if (status === WEAR_OFF) {
        this.state.warmth = clampWarmth(warmth - COOLING_PER_SEC * dt)
      } else {
        this.state.wristTemp = this.state.tempAllowed ? readWristTemp(this.bodyTemp) : null
        const target = warmthTarget(this.state.wristTemp)
        this.state.warmth =
          warmth < target
            ? Math.min(target, warmth + WARMING_PER_SEC * dt)
            : Math.max(target, warmth - COOLING_PER_SEC * dt)
      }
      this.updateFire()
    },

    updateFire() {
      const fire = fireLevel(this.state.warmth)
      if (fire === this.state.fire) return
      this.state.fire = fire
      for (const name of Object.keys(this.fires)) {
        this.fires[name].setProperty(prop.VISIBLE, name === fire)
      }
      this.state.manFrame = 0
      this.man.setProperty(prop.SRC, `man_${manPose(fire)}/man_0.png`)
    },

    nextFrame() {
      const { fire: level } = this.state

      const fire = this.fires[level]
      if (fire) {
        this.state.frame = (this.state.frame + 1) % FIRE_FRAMES
        fire.setProperty(prop.SRC, `fire_${level}/fire_${this.state.frame}.png`)
      }

      const pose = manPose(level)
      if (MAN_FRAMES[pose] > 1) {
        this.state.manFrame = (this.state.manFrame + 1) % MAN_FRAMES[pose]
        this.man.setProperty(prop.SRC, `man_${pose}/man_${this.state.manFrame}.png`)
      }
    },

    onDestroy() {
      clearInterval(this.state.animTimer)
      clearInterval(this.state.clockTimer)
      clearInterval(this.state.warmthTimer)
      this.wear.offChange(this.onWearChange)
      this.screen.offChange(this.onScreenChange)
      if (DEBUG) offGesture()
      this.save()
    },
  }),
)
