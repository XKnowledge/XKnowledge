import { createRouter, createWebHashHistory } from 'vue-router'
import AddView from './page/AddView.vue'
import ChartView from './page/ChartView.vue'

const routes = [
  { path: '/', name: 'index', component: AddView },
  { path: '/chart', name: 'chart', component: ChartView }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
