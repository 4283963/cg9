import { createRouter, createWebHistory } from 'vue-router'
import TwinPage from '@/pages/TwinPage.vue'
import MonitorPage from '@/pages/MonitorPage.vue'

const routes = [
  {
    path: '/',
    name: 'twin',
    component: TwinPage,
  },
  {
    path: '/monitor',
    name: 'monitor',
    component: MonitorPage,
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
