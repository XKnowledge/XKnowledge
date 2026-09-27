<template>
  <a-dropdown :trigger="menuTrigger">
    <a class="no-move" :class="{ 'menu-anchor-macos': isMacOS }" @click.prevent>
      <img :src="MenuIcon" alt="MenuIcon" :style="{ width: '20px', height: '20px' }" />
    </a>
    <template #overlay>
      <a-menu style="width: 200px">
        <a-menu-item key="1" :disabled="picking" @click="emit('pickDir')"> 增加目录 </a-menu-item>
        <a-menu-item key="2" @click="emit('refresh')"> 刷新视图 </a-menu-item>
        <a-menu-divider />
        <a-menu-item key="3" @click="emit('close')"> 返回首页 </a-menu-item>
      </a-menu>
    </template>
  </a-dropdown>
</template>

<script setup>
import MenuIcon from '../assets/menu.png'

const isMacOS = window.electronAPI.platform === 'darwin'
const menuTrigger = isMacOS ? ['click'] : ['hover']

defineProps({
  picking: { type: Boolean, default: false }
})

const emit = defineEmits(['close', 'refresh', 'pickDir'])
</script>

<style scoped>
.no-move {
  -webkit-app-region: no-drag;
}

/* macOS 原生红绿灯占据左上角（trafficLightPosition x:20 起约至 72px），
   菜单右移让位（同图表页 .move-show.is-macos 的 95px 偏移）：头部
   padding 16px + margin 79px = 命中区起点 95px，53px 方块内居中同图表页
   sider；整块 no-drag，点击触发时误点周边不拖动窗口 */
.menu-anchor-macos {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 53px;
  height: 53px;
  margin-left: 79px;
}
</style>
