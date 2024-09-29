<template>
  <a-dropdown>
    <a class="no-move" @click.prevent>
      <img :src="MenuIcon" alt="MenuIcon" :style="{ width: '20px', height: '20px'}" />
    </a>
    <template #overlay>
      <a-menu style="width: 200px">
        <a-menu-item key="1" @click="undo">
          <a-row>
            <a-col flex="120px">撤销</a-col>
            <a-col flex="auto">Ctrl+Z</a-col>
          </a-row>
        </a-menu-item>
        <a-menu-item key="2" @click="redo">
          <a-row>
            <a-col flex="120px">重做</a-col>
            <a-col flex="auto">Ctrl+Y</a-col>
          </a-row>
        </a-menu-item>
        <a-menu-divider />
        <a-menu-item key="3" @click="createNode">
          <a-row>
            <a-col flex="120px">创建节点</a-col>
            <a-col flex="auto">Insert</a-col>
          </a-row>
        </a-menu-item>
        <a-menu-item key="4" @click="deleteNode">
          <a-row>
            <a-col flex="120px">删除节点</a-col>
            <a-col flex="auto">Delete</a-col>
          </a-row>
        </a-menu-item>
        <a-menu-item key="5" @click="createEdge">
          创建连接
        </a-menu-item>
        <a-menu-item key="6" @click="deleteEdge">
          删除连接
        </a-menu-item>
        <a-menu-divider />
        <a-menu-item key="7" @click="saveFile">
          <a-row>
            <a-col flex="120px">保存</a-col>
            <a-col flex="auto">Ctrl+S</a-col>
          </a-row>
        </a-menu-item>
        <a-menu-item key="8" @click="saveAs">
          另存为...
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

const saveAs = () => {
  shortcutActive.value = "save_as";
  shortcutWatch.value = !shortcutWatch.value;
};

</script>

<style scoped>
.no-move {
  -webkit-app-region: no-drag;
}
</style>
