// Settings page in the Zepp phone app.
// Keys must match utils/config.js.
const NAME_KEY = 'character_name'
const NAME_MAX_LENGTH = 16

function read(storage, key, fallback) {
  const v = storage.getItem(key)
  if (v === undefined || v === null || v === '') return fallback
  try {
    return JSON.parse(v)
  } catch (e) {
    return v
  }
}

function hint(text) {
  return Text({ paragraph: true, style: { fontSize: '12px', color: '#888', marginTop: '4px' } }, text)
}

AppSettingsPage({
  build({ settingsStorage }) {
    const name = read(settingsStorage, NAME_KEY, '')

    return View({ style: { padding: '12px 20px' } }, [
      Section({ title: 'Character' }, [
        TextInput({
          label: 'Name',
          placeholder: 'Who sits by the fire?',
          value: name,
          maxLength: NAME_MAX_LENGTH,
          onChange: (v) => settingsStorage.setItem(NAME_KEY, JSON.stringify(String(v).trim())),
        }),
        hint('Shown above the character on the watch. Leave empty to hide it.'),
      ]),
    ])
  },
})
