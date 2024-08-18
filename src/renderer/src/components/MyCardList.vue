<template>
  <a-space :size="[8, 16]" wrap>
    <div
      v-for="history in props.historyList"
      :id="history.id"
      :key="history.id"
      class="my-card"
      @click="handleClick(history.id)"
      @dblclick="handleDoubleClick(history.id, history.name)"
      @contextmenu.prevent="handleRightClick(history.id, $event)"
    >
      <img :src="history.src" />
      <a-button type="link">{{ history.name }}</a-button>
    </div>
  </a-space>
</template>

<script setup>
import { ref } from "vue";
import { defineProps } from "vue";

const props = defineProps({
  historyList: {
    type: Array,
    required: true,
    default: () => []
  }
});

/**
 * 检测双击事件和单击事件使用
 */
let timer = null;

const selected = ref("");

const handleClick = (id) => {
  //清除未执行的定时器
  clearTimeout(timer);
  timer = setTimeout(function() {
    if (id === selected.value) return;
    var card = document.getElementById(id);
    // 添加选中样式
    // card.classList.remove('my-card')
    card.classList.add("my-card-selected");

    unHandleClick();

    selected.value = id;
  }, 400);
};

const unHandleClick = () => {
  if (selected.value === "") {
    return;
  }
  var card = document.getElementById(selected.value);
  card.classList.remove("my-card-selected");
  // card.classList.add('my-card')
  selected.value = "";
};

/**
 * 双击事件打开这个 文件 or 模板
 * @param id
 */
const handleDoubleClick = async (id, fileName) => {
  clearTimeout(timer); //清除未执行的定时器
  // handleClick(id)
  // console.log('fileName', fileName + '.xk')
  // const file_content = await window.electronAPI.openFileByName(fileName + '.xk')
  // console.log(file_content)

  // const formData = new FormData();
  // formData.append("operationType", "openFile");
  // formData.append("fileName", JSON.stringify(fileName));

  // myAxios.post("http://127.0.0.1:5000/", {
  //   operationType: "openFile",
  //   fileName: fileName
  // }).then(response => {
  //   console.log(response);
  //   if (response === "ok") {
  //     console.log("跳转打开");
  //     window.electronAPI.ipcSend();
  //   }
  // });
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

.my-card {
  position: relative;
  width: 200px;
  height: 150px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.my-card img {
  display: block;
  width: 200px;
  height: 120px;
  border-radius: 10px;
  margin-bottom: 10px;
}

.my-card button {
  color: #535353;
  font-size: 13px;
  padding: 0 2px 0 2px;
}

.my-card-selected img {
  box-shadow: 0 0 0 2px #2e64d6; /* 设置图片周围的边框效果 */
}

.my-card-selected button {
  background-color: #2e64d6;
  color: #ffffff;
  padding: 0 2px 0 2px;
  border-radius: 6px;
}
</style>
