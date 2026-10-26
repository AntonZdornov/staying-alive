import { BaseSideService } from '@zeppos/zml/base-side'
import { NAME_KEY, normalizeName } from '../utils/config'

AppSideService(
  BaseSideService({
    onInit() {},
    onRun() {},
    onDestroy() {},

    readName() {
      return normalizeName(this.settings.getItem(NAME_KEY))
    },

    // The watch asks for the name when the app starts
    onRequest(req, res) {
      if (req.method === 'name.get') {
        res(null, { name: this.readName() })
        return
      }
      res({ message: `unknown method: ${req.method}` })
    },

    // The user changed the name in the Zepp app — push it to the watch right away
    onSettingsChange() {
      this.call({ method: 'name.changed', params: { name: this.readName() } })
    },
  }),
)
