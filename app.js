import { BaseApp } from '@zeppos/zml/base-app'

// BaseApp sets up the messaging channel with the phone — the page needs it to receive the name
App(
  BaseApp({
    globalData: {},
    onCreate() {},
    onDestroy() {},
  }),
)
