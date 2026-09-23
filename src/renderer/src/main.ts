import { createApp } from 'vue'
import Antd from 'ant-design-vue'
import 'ant-design-vue/dist/reset.css'
import './assets/theme.css'
import App from './App.vue'
import router from './router.js'
import { initTheme } from './store/themeStore.js'

initTheme() // mount 前设 data-theme + 上报主进程，首帧即正确

const app = createApp(App)

app.use(Antd)
app.use(router).mount('#app')
