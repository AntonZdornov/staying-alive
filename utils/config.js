// Shared between the watch, the side service and the settings page
export const NAME_KEY = 'character_name'
export const NAME_MAX_LENGTH = 16

export function normalizeName(value) {
  let name = value
  try {
    name = JSON.parse(value)
  } catch (e) {}
  return typeof name === 'string' ? name.trim().slice(0, NAME_MAX_LENGTH) : ''
}

// Swipe right on the main screen opens the sensor debug screen. Turn off for release:
// with it on, swipe right no longer exits the app from the main screen
export const DEBUG = true
