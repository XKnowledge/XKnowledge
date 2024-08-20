<template>
  <a-space :size="[8, 16]" wrap>
    <div v-for="file in props.fileList" :id="file.id" :key="file.id" class="xk-card" @click="handleClick(file.id)"
      @dblclick="handleDoubleClick(file.id, file.name)" @contextmenu.prevent="handleRightClick(file.id, $event)">
      <img :src="file.src" />
      <a-button type="link">{{ file.name }}</a-button>
    </div>
  </a-space>
</template>

<script setup>
import { defineProps } from "vue";

const props = defineProps({
  fileList: {
    type: Array,
    required: true,
    default: () => []
  }
});

let selected = ""; // 用于记录前一个点击的id

const handleClick = (id) => {
  if (id !== selected) {
    // 前一个单击和当前单击不同，将前一个点击高亮去掉，将现在点击的id加上高亮
    if (selected !== "") {
      // 将前一个点击高亮去掉
      document.getElementById(selected).classList.remove("xk-card-selected");
    }
    // 添加选中样式，将现在点击的id加上高亮
    document.getElementById(id).classList.add("xk-card-selected");
    selected = id;
  }
};

/**
 * 双击事件打开这个 文件 or 模板
 */
import createTemplate1 from "../utils/template1.ts";

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

  // 在控制台输出鼠标右键点击的位置
  console.log("Right clicked at:", { x: event.clientX, y: event.clientY });

  // 在这里执行其他你想要的操作，比如显示自定义右键菜单等
  console.log("右键", id);

  // const content = 'test_save_content'
  //
  // const fileName = 'test_save'
  // const saveAns = await window.electronAPI.saveFile(fileName + '.xk', content)
  // console.log('保存结果:', saveAns)
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
