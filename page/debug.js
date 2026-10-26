import { createWidget, widget, prop, align, text_style } from '@zos/ui'
import { Wear, BodyTemperature } from '@zos/sensor'
import { setPageBrightTime } from '@zos/display'
import { queryPermission, requestPermission } from '@zos/app'
import { readWristTempWithSource } from '../utils/wrist'

const REFRESH_MS = 1000
const PERMISSIONS = ['data:user.hd.heart_rate', 'data:user.hd.body_temp']
const PERMISSION_NAMES = { 0: 'denied', 1: 'unknown', 2: 'granted' }
const WEAR_NAMES = { 0: 'off', 1: 'worn', 2: 'motion', 3: 'unsure' }

// Sensors may be missing on some devices, so every read is isolated
function safe(read) {
  try {
    return read()
  } catch (e) {
    return `err ${e}`
  }
}

function wristTemp(sensor) {
  const { temp, source } = readWristTempWithSource(sensor)
  return temp === null ? '--' : `${temp.toFixed(1)}°C (${source})`
}

Page({
  state: {
    timer: null,
  },

  build() {
    setPageBrightTime({ brightTime: 5 * 60 * 1000 })

    this.globalData = getApp()._options.globalData
    this.globalData.debugOpen = true

    createWidget(widget.TEXT, {
      x: 0,
      y: 80,
      w: 480,
      h: 40,
      text: 'DEBUG',
      text_size: 28,
      color: 0xffcc66,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
    })
    this.text = createWidget(widget.TEXT, {
      x: 60,
      y: 150,
      w: 360,
      h: 200,
      text: '',
      text_size: 28,
      color: 0xffffff,
      align_h: align.CENTER_H,
      align_v: align.TOP,
      text_style: text_style.WRAP,
    })

    this.wear = new Wear()
    this.bodyTemp = new BodyTemperature()

    if (queryPermission({ permissions: PERMISSIONS }).some((r) => r !== 2)) {
      requestPermission({ permissions: PERMISSIONS, callback: () => this.refresh() })
    }

    this.refresh()
    this.state.timer = setInterval(() => this.refresh(), REFRESH_MS)
  },

  refresh() {
    const perms = queryPermission({ permissions: PERMISSIONS })
    const lines = [
      `perm hr: ${PERMISSION_NAMES[perms[0]]}  temp: ${PERMISSION_NAMES[perms[1]]}`,
      `wear: ${safe(() => WEAR_NAMES[this.wear.getStatus()])}`,
      `wrist: ${safe(() => wristTemp(this.bodyTemp))}`,
    ]
    this.text.setProperty(prop.TEXT, lines.join('\n'))
  },

  onDestroy() {
    clearInterval(this.state.timer)
    this.globalData.debugOpen = false
  },
})
