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
        <a-menu-item key="3" @click="createNode">
          创建节点 Insert
        </a-menu-item>
        <a-menu-item key="4" @click="deleteNode">
          删除节点 Delete
        </a-menu-item>
        <a-menu-item key="5" @click="createEdge">
          创建连接
        </a-menu-item>
        <a-menu-item key="6" @click="deleteEdge">
          删除连接
        </a-menu-item>
        <a-menu-divider />
        <a-menu-item key="7" @click="saveFile">
          保存 Ctrl+S
        </a-menu-item>
      </a-menu>
    </template>
  </a-dropdown>
</template>

<script setup>
import MenuIcon from "../assets/menu.png";

const shortcutActive = defineModel("shortcutActive");
const shortcutWatch = defineModel("shortcutWatch");

const undo = () => {
  shortcutActive.value = "undo";
  shortcutWatch.value = !shortcutWatch.value;
};

const redo = () => {
  shortcutActive.value = "redo";
  shortcutWatch.value = !shortcutWatch.value;
};

const createNode = () => {
  shortcutActive.value = "create_node";
  shortcutWatch.value = !shortcutWatch.value;
};

const deleteNode = () => {
  shortcutActive.value = "delete_node";
  shortcutWatch.value = !shortcutWatch.value;
};

const createEdge = () => {
  shortcutActive.value = "create_edge";
  shortcutWatch.value = !shortcutWatch.value;
};

const deleteEdge = () => {
  shortcutActive.value = "delete_edge";
  shortcutWatch.value = !shortcutWatch.value;
};

const saveFile = () => {
  shortcutActive.value = "save_file";
  shortcutWatch.value = !shortcutWatch.value;
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
