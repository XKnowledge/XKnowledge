<template>
  <a-dropdown>
    <a class="no-move" @click.prevent>
      <img :src="MenuIcon" alt="MenuIcon" :style="{ width: '20px', height: '20px'}" />
    </a>
    <template #overlay>
      <a-menu>
        <a-menu-item key="1" @click="undo">
          撤销 Ctrl+Z
        </a-menu-item>
        <a-menu-item key="2" @click="redo">
          重做 Ctrl+Y
        </a-menu-item>
        <a-menu-divider />
        <a-menu-item key="3" @click="saveFile">
          保存 Ctrl+S
        </a-menu-item>
      </a-menu>
    </template>
  </a-dropdown>
</template>

<script setup>
import MenuIcon from "../assets/menu.png";
import { watch } from "vue";
import { jsonReactive } from "../utils/XkUtils";

const shortcutActive = defineModel("shortcutActive");
const shortcutWatch = defineModel("shortcutWatch");
const filePath = defineModel("filePath");

const xkContext = defineModel("xkContext");

watch(shortcutWatch, () => {
  if (shortcutActive.value === "save_file") {
    saveFile();
  } else if (shortcutActive.value === "insert") {

  } else if (shortcutActive.value === "delete") {

  } else if (shortcutActive.value === "redo") {
    redo();
  } else if (shortcutActive.value === "undo") {
    undo();
  }
});

const saveFile = () => {
  /**
   * 实现文件保存，electronAPI详见/src/preload/index.js
   */
  window.electronAPI.sendAct("save_file");
  window.electronAPI.sendData({ path: filePath.value, file: jsonReactive(xkContext.value.chartData) });
};

const undo = () => {
  /**
   * 实现快捷键Ctrl+Z
   */
  if (-1 < xkContext.value.historySequenceNumber) {
    const current_history = xkContext.value.historyList[xkContext.value.historySequenceNumber];
    xkContext.value.historySequenceNumber--;

    const old_data = xkContext.value.chartData.series[0].data;
    const node_length = old_data.length;
    const old_links = xkContext.value.chartData.series[0].links;
    const links_length = old_links.length;

    if (current_history.act === "createNode") {
      const new_data = [];

      for (let i = 0; i < node_length; i++) {
        if (current_history.data.name !== old_data[i].name) {
          new_data.push(old_data[i]);
        }
      }
      xkContext.value.chartData.series[0].data = new_data;
    } else if (current_history.act === "changeNode") {
      for (let i = 0; i < node_length; i++) {
        if (current_history.new.name === old_data[i].name) {
          xkContext.value.chartData.series[0].data[i] = current_history.old;
          break;
        }
      }
      if (current_history.new.name !== current_history.old.name) {
        const links = xkContext.value.chartData.series[0].links;
        for (let i = 0; i < links.length; i++) {
          if (links[i].source === current_history.new.name) {
            xkContext.value.chartData.series[0].links[i].source = current_history.old.name;
          }
          if (links[i].target === current_history.new.name) {
            xkContext.value.chartData.series[0].links[i].target = current_history.old.name;
          }
        }
      }
    } else if (current_history.act === "deleteNode") {
      xkContext.value.chartData.series[0].data.push(current_history.data);
      xkContext.value.chartData.series[0].links.push(...current_history.links);
    } else if (current_history.act === "createEdge") {
      const new_links = [];
      for (let i = 0; i < links_length; i++) {
        if (current_history.data.source !== old_links[i].source || current_history.data.target !== old_links[i].target) {
          new_links.push(old_links[i]);
        }
      }
      xkContext.value.chartData.series[0].links = new_links;
    } else if (current_history.act === "changeEdge") {
      for (let i = 0; i < node_length; i++) {
        if (current_history.new.source === xkContext.value.chartData.series[0].links[i].source && current_history.new.target === xkContext.value.chartData.series[0].links[i].target) {
          xkContext.value.chartData.series[0].links[i] = current_history.old;
          break;
        }
      }
    } else if (current_history.act === "deleteEdge") {
      xkContext.value.chartData.series[0].links.push(current_history.data);
    }
    xkContext.value.updateChart = true;
  }
};

const redo = () => {
  /**
   * 实现快捷键Ctrl+Y
   */
  const currentHSN = xkContext.value.historySequenceNumber + 1;
  if (currentHSN < xkContext.value.historyList.length) {
    const current_history = xkContext.value.historyList[currentHSN];
    xkContext.value.historySequenceNumber = currentHSN;

    if (current_history.act === "createNode") {
      xkContext.value.chartData.series[0].data.push(current_history.data);
    } else if (current_history.act === "changeNode") {
      const old_data = xkContext.value.chartData.series[0].data;
      const length = old_data.length;

      for (let i = 0; i < length; i++) {
        if (current_history.old.name === old_data[i].name) {
          xkContext.value.chartData.series[0].data[i] = current_history.new;
          break;
        }
      }
      if (current_history.new.name !== current_history.old.name) {
        const links = xkContext.value.chartData.series[0].links;
        for (let i = 0; i < links.length; i++) {
          if (links[i].source === current_history.old.name) {
            xkContext.value.chartData.series[0].links[i].source = current_history.new.name;
          }
          if (links[i].target === current_history.old.name) {
            xkContext.value.chartData.series[0].links[i].target = current_history.new.name;
          }
        }
      }
    } else if (current_history.act === "deleteNode") {
      const series = xkContext.value.chartData.series[0];
      const oldName = current_history.data.name;

      // 删除节点
      let data = [];
      let length = series.data.length;
      for (let i = 0; i < length; i++) {
        if (series.data[i].name !== oldName) {
          data.push(series.data[i]);
        }
      }
      xkContext.value.chartData.series[0].data = data;

      // 删除节点所在的边
      let links = [];
      length = series.links.length;
      for (let i = 0; i < length; i++) {
        if (series.links[i].source !== oldName && series.links[i].target !== oldName) {
          links.push(series.links[i]);
        }
      }
      xkContext.value.chartData.series[0].links = links;
    } else if (current_history.act === "createEdge") {
      xkContext.value.chartData.series[0].links.push(current_history.data);
    } else if (current_history.act === "changeEdge") {
      const node_length = xkContext.value.chartData.series[0].links.length;
      for (let i = 0; i < node_length; i++) {
        if (current_history.old.source === xkContext.value.chartData.series[0].links[i].source && current_history.old.target === xkContext.value.chartData.series[0].links[i].target) {
          xkContext.value.chartData.series[0].links[i] = current_history.new;
          break;
        }
      }
    } else if (current_history.act === "deleteEdge") {
      const old_links = xkContext.value.chartData.series[0].links;
      const node_length = old_links.length;
      const new_links = [];
      for (let i = 0; i < node_length; i++) {
        if (current_history.data.source !== old_links[i].source || current_history.data.target !== old_links[i].target) {
          new_links.push(old_links[i]);
        }
      }
      xkContext.value.chartData.series[0].links = new_links;
    }
    xkContext.value.updateChart = true;
  }
};
</script>

<style scoped>
.sider-menu-style {
  display: flex;
  align-items: center;
  justify-content: center;
  -webkit-app-region: drag;
  background-color: #f5f5f5 !important;
  text-align: center;
  width: 53px !important;
  max-width: 53px !important;
  min-width: 53px !important;
  height: 53px !important;
  font: 13px sans-serif;
  border-bottom: 1px solid rgba(5, 5, 5, 0.06);
  border-right: none;
}

.no-move {
  -webkit-app-region: no-drag;
}
</style>
