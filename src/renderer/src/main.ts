import { createApp } from 'vue'
import Antd from 'ant-design-vue'
import 'ant-design-vue/dist/reset.css'
import './assets/theme.css'
import App from './App.vue'
import router from './router.js'
import { initTheme } from './store/themeStore.js'
import { initKeybindingSync } from './store/keybindingStore.js'

initTheme() // mount 前设 data-theme + 上报主进程，首帧即正确
initKeybindingSync() // 其他窗口改键本窗口实时跟随（storage 事件）

const app = createApp(App)

app.use(Antd)
app.use(router).mount('#app')
