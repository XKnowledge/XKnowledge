<template>
  <a-space :size="[8, 16]" wrap>
    <div v-for="file in fileList" :id="file.id" :key="file.id"
         :class="[file.id!==selected?'xk-card':'xk-card xk-card-selected']" @click="handleClick(file.id)"
         @dblclick="handleDoubleClick(file.id, file.name)" @contextmenu.prevent="handleRightClick(file.id, $event)">
      <img :src="file.src" alt="" />
      <a-button type="link">{{ file.name }}</a-button>
    </div>
  </a-space>
</template>

<script setup>
import { ref } from "vue";
import createTemplate1 from "../utils/template1.ts";

const props = defineProps({
  fileList: {
    type: Array,
    required: true,
    default: () => []
  }
});

let selected = ref(""); // 用于记录前一个点击的id

const handleClick = (id) => {
  if (id !== selected.value) {
    selected.value = id;
  }
};

/**
 * 双击事件打开这个 文件 or 模板
 */
const handleDoubleClick = async (id, fileName) => {
  if (id === "template1") {
    window.electronAPI.sendAct("save_as");
    window.electronAPI.sendData(createTemplate1());
  }
};

/**
 * 右键事件 弹出右键窗口
 * @param id
 */
const handleRightClick = async (id, event) => {
  // 阻止默认右键事件
  event.preventDefault();
};


</script>

<style scoped>
.xk-card {
  position: relative;
  width: 200px;
  height: 150px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.xk-card img {
  display: block;
  width: 200px;
  height: 120px;
  border-radius: 10px;
  margin-bottom: 10px;
}

.xk-card button {
  color: #535353;
  font-size: 13px;
  padding: 0 2px 0 2px;
}

.xk-card-selected img {
  box-shadow: 0 0 0 2px #2e64d6;
  /* 设置图片周围的边框效果 */
}

.xk-card-selected button {
  background-color: #2e64d6;
  color: #ffffff;
  padding: 0 2px 0 2px;
  border-radius: 6px;
}
</style>
