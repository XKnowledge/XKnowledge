import { createApp } from "vue";
import Antd from "ant-design-vue";
import "ant-design-vue/dist/reset.css";
import App from "./App.vue";
import router from "./router.js";


const app = createApp(App);

app.use(Antd);
app.use(router).mount("#app");
