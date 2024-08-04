import { createRouter, createWebHashHistory } from "vue-router";
import AddView from "../page/AddView.vue";
import GalleryView from "../page/GalleryView.vue";
import HistoryView from "../page/HistoryView.vue";
import MyFilesView from "../page/MyFilesView.vue";
import ChartView from "../page/ChartView.vue";

const routes = [
  { path: "/", name: "index", component: AddView },
  { path: "/add", name: "add", component: AddView },
  { path: "/history", name: "history", component: HistoryView },
  { path: "/gallery", name: "gallery", component: GalleryView },
  { path: "/myFiles", name: "myFiles", component: MyFilesView },
  { path: "/chart", name: "chart", component: ChartView }
];

const router = createRouter({
  history: createWebHashHistory(),
  routes
});

export default router;
