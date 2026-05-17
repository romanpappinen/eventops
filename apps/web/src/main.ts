import { createApp } from 'vue'
import { router } from './router/router'
import { pinia } from './store'
import './style.css'
import App from './App.vue'

const app = createApp(App)

app.use(pinia)
app.use(router)
app.mount('#app')
