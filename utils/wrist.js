// The sensor reports -1000 (or nothing) when there is no measurement
const isValidTemp = (value) => typeof value === 'number' && value > -100

// Wrist temperature in °C from a BodyTemperature sensor, or null.
// getCurrent() is often empty, so fall back to the latest 5-minute average of today
export function readWristTemp(sensor) {
  return readWristTempWithSource(sensor).temp
}

export function readWristTempWithSource(sensor) {
  try {
    const { current } = sensor.getCurrent() || {}
    if (isValidTemp(current)) return { temp: current, source: 'current' }
  } catch (e) {}
  try {
    const today = sensor.getToday() || []
    for (let i = today.length - 1; i >= 0; i--) {
      if (isValidTemp(today[i])) return { temp: today[i], source: '5 min avg' }
    }
  } catch (e) {}
  return { temp: null, source: '' }
}
