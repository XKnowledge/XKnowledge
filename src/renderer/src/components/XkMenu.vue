<template>
  <a-dropdown :trigger="menuTrigger">
    <a class="no-move" @click.prevent>
      <img :src="MenuIcon" alt="MenuIcon" :style="{ width: '20px', height: '20px' }" />
    </a>
    <template #overlay>
      <a-menu style="width: 200px">
        <a-menu-item key="1" @click="dispatch('create_new_file')">
          {{ $t('menu.newFile') }}
        </a-menu-item>
        <a-menu-item key="2" @click="dispatch('open_file')"> {{ $t('menu.openFile') }} </a-menu-item>
        <a-menu-item key="12" @click="dispatch('close_file')">
          {{ $t('menu.closeFile') }}
        </a-menu-item>
        <a-menu-divider />
        <a-menu-item key="3" @click="dispatch('undo')">
          <a-row>
            <a-col flex="120px">{{ $t('keybinding.names.undo') }}</a-col>
            <a-col flex="auto">{{ undoLabel }}</a-col>
          </a-row>
        </a-menu-item>
        <a-menu-item key="4" @click="dispatch('redo')">
          <a-row>
            <a-col flex="120px">{{ $t('keybinding.names.redo') }}</a-col>
            <a-col flex="auto">{{ redoLabel }}</a-col>
          </a-row>
        </a-menu-item>
        <a-menu-divider />
        <a-menu-item key="7" @click="dispatch('delete_node')">
          <a-row>
            <a-col flex="120px">{{ $t('chart.deleteNode') }}</a-col>
            <a-col flex="auto">Delete</a-col>
          </a-row>
        </a-menu-item>
        <a-menu-item key="9" @click="dispatch('delete_edge')">
          {{ $t('chart.deleteEdge') }}
        </a-menu-item>
        <a-menu-divider />
        <a-menu-item key="10" @click="dispatch('save_file')">
          <a-row>
            <a-col flex="120px">{{ $t('keybinding.names.save') }}</a-col>
            <a-col flex="auto">{{ saveLabel }}</a-col>
          </a-row>
        </a-menu-item>
        <a-menu-item key="11" @click="dispatch('save_as')"> {{ $t('menu.saveAs') }} </a-menu-item>
        <a-menu-divider />
        <!-- 导出子菜单（桌面软件惯例）：四种导出的禁用/文案态与原侧栏按钮
             一致——录制状态经 props 从 ChartView（单一来源）传入；
             data-* 锚点随按钮迁到菜单项上供冒烟定位 -->
        <a-sub-menu key="15" :title="$t('menu.export')">
          <a-menu-item key="15-1" @click="dispatch('export_png')">
            {{ $t('chart.exportPng') }}
          </a-menu-item>
          <a-menu-item key="15-2" data-export-html @click="dispatch('export_html')">
            {{ $t('chart.exportHtml') }}
          </a-menu-item>
          <a-menu-item
            key="15-3"
            data-export-video
            :disabled="exportingVideo || screenRecording"
            @click="dispatch('export_video')"
          >
            {{ exportingVideo ? $t('chart.recording') : $t('chart.exportVideo') }}
          </a-menu-item>
          <a-menu-item
            key="15-4"
            data-screen-record
            :danger="screenRecording"
            :disabled="exportingVideo"
            @click="dispatch('screen_record')"
          >
            {{ screenRecording ? $t('chart.stopRecord') : $t('chart.screenRecord') }}
          </a-menu-item>
        </a-sub-menu>
        <a-menu-divider />
        <a-menu-item key="14" @click="dispatch('import_outline')">
          {{ $t('menu.importOutline') }}
        </a-menu-item>
        <!-- 新手教程：录制中禁用——教程遮罩盖画布会毁录制画面 -->
        <a-menu-item
          key="16"
          data-start-tour
          :disabled="exportingVideo || screenRecording"
          @click="dispatch('start_tour')"
        >
          {{ $t('menu.tour') }}
        </a-menu-item>
        <a-menu-item key="13" @click="dispatch('open_settings')">
          {{ $t('common.settings') }}
        </a-menu-item>
      </a-menu>
    </template>
  </a-dropdown>
</template>

<script setup>
import { computed } from 'vue'
import MenuIcon from '../assets/menu.png'
import { bindings as keybindings } from '../store/keybindingStore.js'
import { formatBindingLabel } from '../utils/keybindings.js'

const isDarwin = window.electronAPI.platform === 'darwin'
// 菜单快捷键标注跟随用户自定义（keybindingStore 生效视图）
const undoLabel = computed(() => formatBindingLabel(keybindings.value.undo, isDarwin))
const redoLabel = computed(() => formatBindingLabel(keybindings.value.redo, isDarwin))
const saveLabel = computed(() => formatBindingLabel(keybindings.value.save, isDarwin))
const menuTrigger = isDarwin ? ['click'] : ['hover']
// 录制状态（导出子菜单的禁用/文案/danger 态）：ChartView 是单一来源，
// 这里只读展示；动作分发与键盘快捷键共用 dispatch 入口（useShortcuts 提供）
defineProps({
  exportingVideo: { type: Boolean, default: false },
  screenRecording: { type: Boolean, default: false },
  dispatch: { type: Function, required: true }
})
</script>

<style scoped>
.no-move {
  -webkit-app-region: no-drag;
}
</style>
