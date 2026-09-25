import { createRouter, createWebHashHistory } from 'vue-router'
import AddView from './page/AddView.vue'
import ChartView from './page/ChartView.vue'
import WorldView from './page/WorldView.vue'

const routes = [
  { path: '/', name: 'index', component: AddView },
  { path: '/chart', name: 'chart', component: ChartView },
  { path: '/world', name: 'world', component: WorldView }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
