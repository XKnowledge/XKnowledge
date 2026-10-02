import { createApp } from 'vue'
import Antd from 'ant-design-vue'
import 'ant-design-vue/dist/reset.css'
import './assets/theme.css'
import App from './App.vue'
import router from './router.js'
import { initTheme } from './store/themeStore.js'
import { initKeybindingSync } from './store/keybindingStore.js'
import { initLocaleSync } from './store/localeStore.js'
import { i18n } from './i18n.js'

initTheme() // mount 前设 data-theme + 上报主进程，首帧即正确
initKeybindingSync() // 其他窗口改键本窗口实时跟随（storage 事件）
initLocaleSync() // mount 前上报主进程，首帧对话框/窗口标题语言正确

const app = createApp(App)

app.use(Antd)
app.use(i18n) // $t / useI18n（快捷注入由 i18n.js 的 globalInjection 开启）
app.use(router).mount('#app')
