<template>
  <a-space direction="vertical" :style="{ width: '100%' }" :size="[0, 48]">
    <a-layout :style="{ height: '100vh' }">
      <a-layout-header class="move-show" :class="{ 'is-macos': isMacOS }">
        <a-layout>
          <a-layout-sider class="sider-menu-style">
            <XkMenu
              v-model:shortcut-active="shortcutActive"
              v-model:shortcut-watch="shortcutWatch"
              :exporting-video="exportingVideo"
              :screen-recording="screenRecording"
            />
          </a-layout-sider>
          <!-- 窗口标题：紧挨菜单图标右侧（与首页标题条共用 XkTitleText，主进程统一推送） -->
          <XkTitleText class="chart-title" :compact="isMacOS" />
          <a-layout-content class="move-header">
            <a-space size="large" style="margin-top: 5px">
              <a-space
                v-for="item in buttonList"
                :key="item.name"
                style="align-items: center"
                direction="vertical"
                size="small"
              >
                <a-button type="link" class="no-move-button" @click="item.click">
                  <img :src="item.src" alt="" :style="{ width: '20px', height: '20px' }" />
                </a-button>
                <div style="text-align: center; margin-top: -8px; font: 12px sans-serif">
                  {{ item.name }}
                </div>
              </a-space>
            </a-space>
          </a-layout-content>
          <!-- 图表页经 enterChartMode 解锁窗口尺寸：最小化/最大化/关闭齐备 -->
          <XkWindowControls sizable />
        </a-layout>
      </a-layout-header>
      <a-layout>
        <a-layout-content class="xk-chart-content">
          <XkGraph3D
            ref="graph3dRef"
            class="echarts-style"
            :nodes="xkContext.chartData?.nodes ?? []"
            :links="xkContext.chartData?.links ?? []"
            :highlight-link="highlightEdgeObj"
            :highlight-node="highlightNodeName"
            :show-link-name="showLinkName"
            :show-small-labels="showSmallLabels"
            :focus-node-names="focusNodeNames"
            :focus-deep="focusMode === 'deep'"
            :selection-nodes="selectionNodeNames"
            :selection-links="selectionLinkIndexes"
            @node-click="onGraphNodeClick"
            @link-click="onGraphLinkClick"
            @background-click="onGraphBackgroundClick"
            @canvas-create-node="onCanvasCreateNode"
            @canvas-create-edge="onCanvasCreateEdge"
            @marquee-select="onGraphMarqueeSelect"
          />
          <!-- 录屏控制卡片：悬浮画布上（仅录屏态出现），暂停/继续 + 结束，
               可拖动；组件自身不持录屏状态（ChartView 单一来源经 props 下发） -->
          <XkRecordingCard
            v-if="screenRecording"
            :paused="screenPaused"
            @toggle-pause="onToggleRecordPause"
            @stop="onToggleScreenRecord"
          />
        </a-layout-content>
        <a-layout-sider v-show="siderVisible" class="sider-style">
          <a-space v-show="xkContext.errorMessage !== ''" direction="vertical" style="width: 80%">
            <a-alert :message="xkContext.errorMessage" type="error" />
          </a-space>

          <!-- 属性面板用普通块级容器：a-checkbox-group 是 inline-flex，
               divider/按钮行嵌在里面会被当 flex 子项挤到侧边栏外（按钮不可见） -->
          <div v-show="attributeVisible" class="attr-panel">
            <a-checkbox-group
              v-model:value="checkedValues"
              class="attr-checkboxes"
              :disabled="exportingVideo"
              @change="onChangeAttr"
            >
              <a-checkbox value="showEdgeName"> {{ $t('chart.showEdgeName') }} </a-checkbox>
              <a-checkbox value="showSmallLabels"> {{ $t('chart.showSmallLabels') }} </a-checkbox>
            </a-checkbox-group>
            <!-- 聚焦模式：三态选择（关闭/灰化/隐藏）不走 checkedValues/onChangeAttr
                 ——那条管道会置脏且被 initAttr 连带重置，与「跨图保持/不写盘」冲突。
                  data-focus-node/data-focus-mode 是冒烟断言锚点 -->
            <a-row
              align="middle"
              class="focus-row"
              :data-focus-node="focusNodeId"
              :data-focus-mode="focusMode"
            >
              <a-col flex="auto" style="text-align: left">
                <span class="focus-mode-label">{{ $t('chart.focusMode') }}</span>
                <a-select
                  v-model:value="focusMode"
                  class="focus-mode-select"
                  :disabled="exportingVideo"
                  :options="[
                    { value: 'off', label: $t('chart.focusOff') },
                    { value: 'focus', label: $t('chart.focusDim') },
                    { value: 'deep', label: $t('chart.focusHide') }
                  ]"
                  size="small"
                  style="width: 68px"
                  @change="onFocusModeChange"
                />
              </a-col>
              <a-col>
                <span class="focus-hops-label">{{ $t('chart.focusHops') }}</span>
                <a-select
                  v-model:value="focusHops"
                  class="focus-hops-select"
                  :disabled="focusMode === 'off' || exportingVideo"
                  :options="[
                    { value: 1, label: '1' },
                    { value: 2, label: '2' },
                    { value: 3, label: '3' }
                  ]"
                  size="small"
                  style="width: 64px"
                />
              </a-col>
            </a-row>
            <a-divider orientation="left">{{ $t('chart.repulsion') }}</a-divider>
            <!-- align="middle"：滑块轨道高 12px、数字框高 32px，
                 默认顶部对齐会让滑块明显偏上 -->
            <a-row align="middle">
              <a-col :flex="4">
                <a-slider
                  v-model:value="repulsion"
                  :min="1"
                  :max="500"
                  :disabled="exportingVideo"
                  @change="onChangeRepulsion"
                />
              </a-col>
              <a-col :flex="1">
                <a-input-number
                  v-model:value="repulsion"
                  :min="1"
                  :max="500"
                  :disabled="exportingVideo"
                  @change="onChangeRepulsion"
                />
              </a-col>
            </a-row>
            <a-divider orientation="left">{{ $t('chart.description') }}</a-divider>
            <!-- 图表级元数据：即时写入 chartData.description 并置脏（同复选框/
                 滑块），不进 undo/redo；绑定经 computed 兜底，见脚本区注释 -->
            <a-textarea v-model:value="chartDescription" :rows="4" @change="onDescriptionChange" />
            <a-divider orientation="left">{{ $t('chart.view') }}</a-divider>
            <!-- 四种导出（图片/HTML/环绕/录屏）已收进左上角菜单「导出」子菜单
                 （桌面软件惯例），本区只留复位视图；环绕录制中禁用（复位飞
                 相机+取景会毁掉录制画面） -->
            <a-row justify="space-evenly">
              <a-button
                size="small"
                data-reset-view
                :disabled="exportingVideo"
                @click="graph3dRef?.resetView()"
              >
                {{ $t('chart.resetView') }}
              </a-button>
            </a-row>
          </div>

          <XkCurrentNode
            v-show="currentNodeVisible"
            v-model:current-node="currentNode"
            v-model:category-items="categoryItems"
            v-model:category-name="categoryName"
            v-model:current-node-data-index="currentNodeDataIndex"
            v-model:xk-context="xkContext"
          ></XkCurrentNode>

          <XkCurrentEdge
            v-show="currentEdgeVisible"
            v-model:current-edge="currentEdge"
            v-model:current-edge-data-index="currentEdgeDataIndex"
            v-model:xk-context="xkContext"
          ></XkCurrentEdge>
        </a-layout-sider>
      </a-layout>
    </a-layout>
    <XkSettings ref="settingsRef" />
    <XkOutlineImport ref="outlineImportRef" @import="onOutlineImport" />
  </a-space>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { jsonReactive, resetEdgeRef, resetNodeRef } from '../utils/XkUtils'
import { defaultFocusNode, reconcileNodeHighlight } from '../utils/graphData.js'
import { shortcutModifierActive } from '../utils/platformModifier.js'
import { matchEvent } from '../utils/keybindings.js'
import { serializeGraphForViewer } from '../../../shared/graphViewerData.js'
import { bindings as keybindings } from '../store/keybindingStore.js'
import { locale } from '../store/localeStore.js'
import { t } from '../i18n.js'
import { takePendingChart } from '../store/chartStore'
import { useRecording } from '../composables/useRecording'
import { useChartAttrs } from '../composables/useChartAttrs'
import { useFocusMode } from '../composables/useFocusMode'
import { useSelection } from '../composables/useSelection'
import { useChartFile } from '../composables/useChartFile'
import { useEditActions } from '../composables/useEditActions'

import XkCurrentNode from '../components/XkCurrentNode.vue'
import XkCurrentEdge from '../components/XkCurrentEdge.vue'
import XkMenu from '../components/XkMenu.vue'
import XkGraph3D from '../components/XkGraph3D.vue'
import XkTitleText from '../components/XkTitleText.vue'
import XkSettings from '../components/XkSettings.vue'
import XkOutlineImport from '../components/XkOutlineImport.vue'
import XkWindowControls from '../components/XkWindowControls.vue'
import XkRecordingCard from '../components/XkRecordingCard.vue'

import DeleteNodeIcon from '../assets/delete_node.png'
import DeleteEdgeIcon from '../assets/delete_edge.png'
import EditIcon from '../assets/edit.png'

const isMacOS = window.electronAPI.platform === 'darwin'
const router = useRouter()

const xkContext = ref({
  errorMessage: '',
  chartData: null,
  updateChart: false,
  historyList: [], // 记录历史
  historySequenceNumber: -1 // HSN：历史操作对应的目前的位置
})

const siderVisible = ref(false)
const saveNodeVisible = ref(false)

const attributeVisible = ref(true)

/** 导出交互式单文件 HTML：白名单序列化（动态成形不带坐标）→ 主进程
 *  读 viewer 模板拼装落盘（VIDEO_SAVE 同模式，不进 guard/mtime）。
 *  默认文件名 = 图谱名（发送场景文件名应有意义；PNG/视频是自留档走
 *  时间戳单源）；空图直接提示不导出 */
const onExportHtml = async () => {
  const chart = xkContext.value.chartData
  const graphTitle = filePath.value
    ? filePath.value.split(/[\\/]/).pop().replace(/\.xk$/i, '')
    : chartName.value || t('common.untitled')
  const data = serializeGraphForViewer(chart, graphTitle, locale.value, repulsion.value)
  if (!data) {
    message.info(t('chart.emptyGraphNoExport'))
    return
  }
  const safeName = (data.title || 'xknowledge').replace(/[\\/:*?"<>|]/g, '_').trim() || 'xknowledge'
  try {
    const res = await window.electronAPI.exportHtmlFile({ data, defaultName: `${safeName}.html` })
    if (res?.path) message.success(t('chart.htmlExported'))
  } catch (err) {
    // 主进程 throw（模板缺失/写盘失败）经 invoke 变 reject：静默记录，
    // 不虚构 i18n key（与项目其他导出错误路径一致）
    console.error('导出 HTML 失败', err)
  }
}

const currentNodeVisible = ref(false)
const currentNode = ref({
  name: '',
  des: '',
  symbolSize: 50,
  category: ''
})
const currentNodeDataIndex = ref(-1)

const currentEdgeVisible = ref(false)
const currentEdge = ref({
  source: '',
  target: '',
  name: '',
  des: ''
})
const currentEdgeDataIndex = ref(-1)

// 新增时的类目
const categoryItems = ref([])
const categoryName = ref()

const graph3dRef = ref(null) // XkGraph3D 组件实例（expose setRepulsion/exportPng/resetView）
// 视频导出/录屏状态机（单一来源）：状态与动作收在 useRecording，
// 互斥由按钮 disabled 表达，组件层仅兜底
const {
  exportingVideo,
  screenRecording,
  screenPaused,
  onExportVideo,
  onToggleScreenRecord,
  onToggleRecordPause
} = useRecording(graph3dRef)
// 属性面板状态机（会话级渲染设置 + 简介元数据）：置脏经回调回编排层；
// 刻意与聚焦模式分管道——聚焦「不置脏、跨图保持」是设计意图（见模板内注释）
const {
  checkedValues,
  repulsion,
  showLinkName,
  showSmallLabels,
  chartDescription,
  onChangeAttr,
  onDescriptionChange,
  onChangeRepulsion,
  initAttr
} = useChartAttrs({ xkContext, graph3dRef, markDirty: () => (saveNodeVisible.value = true) })
const settingsRef = ref(null) // XkSettings 实例（expose open），菜单「设置」入口
const outlineImportRef = ref(null) // XkOutlineImport 实例（expose open/close）

/** 按名同步选中态（默认焦点/焦点删除回退时用）：index 与 currentNode 对齐 */
const syncCurrentNodeByName = (name) => {
  const nodes = xkContext.value.chartData?.nodes ?? []
  const i = nodes.findIndex((n) => n.name === name)
  if (i === -1) return
  currentNodeDataIndex.value = i
  currentNode.value = jsonReactive({ ...nodes[i] })
}

// 聚焦模式状态机（会话级）：状态与模式切换收在 useFocusMode，
// 换图时的默认焦点重置由 loadChartData 编排（见下）
const { focusMode, focusHops, focusNodeId, focusNodeNames, onFocusModeChange } = useFocusMode({
  xkContext,
  currentNodeDataIndex,
  currentNode,
  syncCurrentNodeByName
})

// 单击高亮与框选选中态（互斥语义与注释见 composable 头）
const {
  highlightEdgeIndex,
  highlightNodeName,
  highlightEdgeObj,
  selectionNodeNames,
  selectionLinkIndexes,
  downplayAllHightlight,
  clearSelection
} = useSelection(xkContext)

const shortcutActive = ref('')
const shortcutWatch = ref(false)

onMounted(async () => {
  window.addEventListener('keydown', shortcut)

  // 同窗口跳转（首页打开/模板）：从 chartStore 取数据装载
  const local = takePendingChart()
  if (local) {
    loadChartData(local)
  } else {
    // 新窗口（新建文件/打开其他文件）：取主进程暂存的数据
    try {
      const res = await window.electronAPI.takePendingChart()
      if (res?.content) {
        loadChartData({ value: res.content, path: res.path || '' })
      }
    } catch (err) {
      console.error('装载图表数据失败', err)
      message.error(t('chart.loadFailed'))
    }
  }
  // 文件生命周期挂载：解锁窗口并注册关闭确认 + 60 秒自动保存
  // （门控与关闭确认的实现见 useChartFile）
  mountFileLifecycle()
})

onUnmounted(() => {
  // 同窗口再次挂载（路由进出图表页）时，旧实例的监听器与定时器若不
  // 释放，会导致快捷键跑两遍、自动保存累积、内存泄漏
  window.removeEventListener('keydown', shortcut)
  unmountFileLifecycle()
})

const loadChartData = (data) => {
  const chart = (() => {
    try {
      return JSON.parse(data.value)
    } catch (e) {
      console.error('文件内容解析失败', e)
      message.error(t('error.contentInvalid'))
      return null
    }
  })()
  if (!chart) return
  if (
    chart.version !== 2 ||
    !Array.isArray(chart.nodes) ||
    !Array.isArray(chart.links) ||
    chart.nodes.some((n) => !n || typeof n !== 'object')
  ) {
    message.error(t('error.contentInvalid'))
    return
  }
  // 与主进程 fileService 对齐：悬空边（source/target 不在任何节点上）同样视为损坏
  const names = new Set(chart.nodes.map((n) => n.name))
  if (chart.links.some((l) => !l || !names.has(l?.source) || !names.has(l?.target))) {
    message.error(t('error.contentInvalid'))
    return
  }
  xkContext.value.chartData = chart

  // 文件身份维护 + 主进程登记（再次打开同一文件时聚焦本窗口）
  registerOpenedFile(data.path, data.name)

  initAttr()
  // 换图关闭图内搜索：关键词属于旧图，留着是误导
  graph3dRef.value?.closeSearch()
  // 聚焦模式跨图保持：开着时装载即聚焦默认焦点（第一眼是子图不是纹理）；
  // 没开则置空，防旧图 name 泄漏进新图邻域计算
  focusNodeId.value = focusMode.value !== 'off' ? defaultFocusNode(chart.nodes, chart.links) : ''
  if (focusNodeId.value) syncCurrentNodeByName(focusNodeId.value)
  xkContext.value.updateChart = !xkContext.value.updateChart
  nextTick(() => {
    saveNodeVisible.value = false
  })
}

watch(
  () => xkContext.value.updateChart,
  () => {
    const categories = [...new Set(xkContext.value.chartData.nodes.map((x) => x.category))]
    categoryItems.value = categories
    saveNodeVisible.value = true
    // 改名校准：改名提交在子组件内翻转 updateChart，父层只能在此校准——
    // 高亮名消失时跟随侧栏索引的新名，其余结构变更不动既有高亮（删除/撤销
    // 已由 resetRefData→downplayAllHightlight 清理）
    highlightNodeName.value = reconcileNodeHighlight(
      xkContext.value.chartData.nodes,
      highlightNodeName.value,
      currentNodeDataIndex.value
    )
  }
)

const shortcut = (event) => {
  // 统一转换为小写处理
  const key = event.key.toLowerCase()
  // 焦点在按钮等普通控件上时快捷键照常生效，只在文本输入元素中屏蔽，
  // 否则点击工具栏/侧边栏控件后焦点残留，Delete/Ctrl(⌘)+Z/Y 会静默失效
  const target = event.target
  const isTypingContext =
    target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable

  // 快捷键配置映射表：7 个可自定义键位读 keybindingStore（设置里录制改键），
  // 判定经 keybindings.matchEvent 精确匹配（primary=Ctrl/⌘ 双收）；
  // isTypingContext 守卫跟动作走、不跟键走——改键不改变守卫行为
  const shortcutMap = {
    // 全局快捷键
    save: {
      match: () => matchEvent(event, keybindings.value.save),
      action: () => triggerShortcut('save_file')
    },
    'ctrl+r': {
      // 拦截项非用户动作、不进自定义列表，保持原样
      match: () => shortcutModifierActive(event) && key === 'r',
      action: () => event.preventDefault() // 阻止浏览器刷新
    },
    search: {
      // 不加 isTypingContext 守卫：任何输入框聚焦时按搜索键都应跳到
      // 搜索框（浏览器惯例）
      match: () => matchEvent(event, keybindings.value.search),
      action: () => {
        event.preventDefault() // 防御性拦截（Electron 默认无查找，防未来版本行为变化）
        graph3dRef.value?.openSearch()
      }
    },

    // 图表区域快捷键（输入文本时不触发）
    delete: {
      // 删「框选集优先，否则最后点击的对象」：框选批量删（deleteSelection）；
      // 无框选时最后点过边（且未再点节点）删边，否则删节点；两边 index 在对方
      // 被点击时对称清空，无选中时各自函数的 <0 守卫兜底，按键无动作
      match: () => !isTypingContext && matchEvent(event, keybindings.value.delete),
      action: () => {
        if (selectionNodeNames.value.length || selectionLinkIndexes.value.length) {
          triggerShortcut('delete_selection')
          return
        }
        triggerShortcut(currentEdgeDataIndex.value > -1 ? 'delete_edge' : 'delete_node')
      }
    },
    undo: {
      match: () => !isTypingContext && matchEvent(event, keybindings.value.undo),
      action: () => triggerShortcut('undo')
    },
    redo: {
      match: () => !isTypingContext && matchEvent(event, keybindings.value.redo),
      action: () => triggerShortcut('redo')
    },
    copy: {
      // 三路分发在 copySelection 内部（三条路径汇到同一序列化出口，不拆
      // actionMap 多条目）；输入框内放行走浏览器原生文本复制
      match: () => !isTypingContext && matchEvent(event, keybindings.value.copy),
      action: () => triggerShortcut('copy')
    },
    paste: {
      match: () => !isTypingContext && matchEvent(event, keybindings.value.paste),
      action: () => triggerShortcut('paste')
    }
  }

  // 执行匹配的快捷键动作
  for (const config of Object.values(shortcutMap)) {
    if (config.match()) {
      config.action()
      break // 匹配成功后终止循环
    }
  }
}

// 新增的快捷操作触发方法
const triggerShortcut = (actionName) => {
  shortcutActive.value = actionName
  shortcutWatch.value = !shortcutWatch.value
}

watch(shortcutWatch, () => {
  // 使用对象映射替代 switch-case 结构
  const actionMap = {
    save_file: saveFile,
    save_as: saveAs,
    close_file: closeFile,
    create_new_file: createNewFile,
    open_file: openFile,
    delete_node: deleteNode,
    delete_edge: deleteEdge,
    delete_selection: deleteSelection,
    copy: copySelection,
    paste: pasteSelection,
    undo: undo,
    redo: redo,
    open_settings: () => settingsRef.value?.open(),
    import_outline: () => outlineImportRef.value?.open(),
    // 导出子菜单四项（无键盘键位，仅菜单入口）：与原侧栏按钮同一批函数
    export_png: () => graph3dRef.value?.exportPng(),
    export_html: onExportHtml,
    export_video: onExportVideo,
    screen_record: onToggleScreenRecord
  }

  const actionName = shortcutActive.value
  if (actionName && actionMap[actionName]) {
    actionMap[actionName]()
  } else if (actionName) {
    console.warn(`未定义的快捷操作: ${actionName}`)
  }
})

const resetRefData = () => {
  /**
   * 重置各种ref，配合侧边栏显示一块用
   */
  downplayAllHightlight()
  currentNodeDataIndex.value = -1
  resetNodeRef(currentNode)
  currentEdgeDataIndex.value = -1
  resetEdgeRef(currentEdge)
  // 框选集同步清空：删除/撤销/重做/保存/切换侧栏后选中集已失效
  // （节点可能已不在图内、边 index 已漂移）
  clearSelection()
}

const resetSider = () => {
  /**
   * 将侧边栏中显示的信息全部隐藏
   */
  xkContext.value.errorMessage = ''
  attributeVisible.value = true
  currentNodeVisible.value = false
  currentEdgeVisible.value = false
}

const onGraphNodeClick = (nodeData, index) => {
  resetSider()
  attributeVisible.value = false
  currentNodeVisible.value = true
  currentNode.value = jsonReactive(nodeData)
  currentNodeDataIndex.value = index
  // 选中高亮 toggle：再点同一个取消；换点直接换亮。边高亮同步清——
  // 图面高亮与侧栏显示对象必须一一对应（点节点不清边高亮的错位在此修正）
  highlightNodeName.value = highlightNodeName.value === nodeData.name ? '' : nodeData.name
  highlightEdgeIndex.value = -1
  // 对称清对方的选中态：Delete 删「最后一个点击的对象」，选中节点后
  // 旧边选中态作废（防菜单「删除连接」误删旧边）
  currentEdgeDataIndex.value = -1
  // 单击选中与框选互斥：Delete 的删除对象切换为本次点击的节点
  selectionNodeNames.value = []
  selectionLinkIndexes.value = []
  // 聚焦/深度聚焦开着时单击即换焦点（与「选中看属性」一次点击两个语义，不冲突）
  if (focusMode.value !== 'off' && nodeData?.name) focusNodeId.value = nodeData.name

  if (!siderVisible.value) switchSider()
}

const onGraphLinkClick = (linkData, index) => {
  resetSider()
  attributeVisible.value = false
  currentEdgeVisible.value = true
  currentEdge.value = jsonReactive(linkData)
  currentEdgeDataIndex.value = index
  // 对称清节点选中态：点边后按 Delete 删的是这条边，而非之前点的节点
  // （否则「点节点 A → 点边 → Delete」会把 A 及其相连边全部误删）
  currentNodeDataIndex.value = -1
  highlightNodeName.value = ''
  highlightEdgeIndex.value = highlightEdgeIndex.value === index ? -1 : index
  selectionNodeNames.value = []
  selectionLinkIndexes.value = []

  if (!siderVisible.value) switchSider()
}

/** Shift+拖框选提交（XkGraph3D 松手拾取后 emit）：集体高亮、Delete 批量删。
 *  与单击选中互斥——先清单击态再落框选集；空框（Shift+单击未拖）等同点空白
 *  完整取消选中。侧栏回属性页，不弹表单 */
const onGraphMarqueeSelect = (nodes, links) => {
  resetSider()
  resetRefData()
  selectionNodeNames.value = nodes
  selectionLinkIndexes.value = links
}

/** 点空白＝完整取消选中：清高亮与 Delete 对象、面板回默认属性页；侧栏
 *  本身不强制收起（收起动静大，留给出侧栏按钮） */
const onGraphBackgroundClick = () => {
  resetSider()
  resetRefData()
}

const switchSider = () => {
  // 当侧边栏收起的时候，直接点击图表，就回唤起侧边栏，这种情况下不能清空侧壁栏
  siderVisible.value = !siderVisible.value // 切换侧边栏的显示状态
}

const toggleSider = () => {
  /**
   * 显示或者关闭侧边栏
   */
  const wasAttributeVisible = attributeVisible.value
  switchSider()
  // 如果是从打开到收起，一定会清空图表
  // 如果是从收起到打开，应该打开attributeVisible，同样清空图表
  resetRefData()
  resetSider()

  if (!wasAttributeVisible) {
    siderVisible.value = true
    return
  }

  if (!siderVisible.value) {
    downplayAllHightlight()
  }
}

// 文件生命周期（落盘/另存/打开/关闭、自动保存门控、关闭确认、未保存上报）：
// 状态与函数收在 useChartFile；装载广播（上方 loadChartData）只经
// registerOpenedFile 维护文件身份。手动保存/另存成功后的面板重置
// （resetSider/resetRefData）经参数注入
const {
  filePath,
  chartName,
  registerOpenedFile,
  saveFile,
  saveAs,
  createNewFile,
  openFile,
  closeFile,
  mountFileLifecycle,
  unmountFileLifecycle
} = useChartFile({ xkContext, saveNodeVisible, router, resetSider, resetRefData })

// 图谱编辑操作（撤销/重做/三路删除/复制粘贴/大纲导入/画布直操建点建边）：
// 序号与分发收在 useEditActions，数据补偿语义在 utils（多重边安全）；
// 数据变更后的面板复位（resetSider+resetRefData）打包为 afterEdit 注入
const {
  undo,
  redo,
  deleteNode,
  deleteEdge,
  deleteSelection,
  copySelection,
  pasteSelection,
  onOutlineImport,
  onCanvasCreateNode,
  onCanvasCreateEdge
} = useEditActions({
  xkContext,
  currentNodeDataIndex,
  currentEdgeDataIndex,
  selectionNodeNames,
  selectionLinkIndexes,
  graph3dRef,
  afterEdit: () => {
    resetSider()
    resetRefData()
  },
  closeOutlineImport: () => outlineImportRef.value?.close()
})

// 按钮名语言相关：computed 让语言切换后即时跟随（ref 常量不会刷新）
const buttonList = computed(() => [
  { src: DeleteNodeIcon, name: t('chart.deleteNode'), click: deleteNode },
  { src: DeleteEdgeIcon, name: t('chart.deleteEdge'), click: deleteEdge },
  { src: EditIcon, name: t('chart.editSider'), click: toggleSider }
])

// 图表区宽度不在此设定：由 antd flex 布局撑开；3D 图组件经
// ResizeObserver 自适应容器尺寸，无需页面联动 resize
</script>

<style>
.echarts-style {
  width: 100%;
  height: 100%;
}

/* 录屏控制卡片的绝对定位上下文（卡片悬浮在画布区右下角） */
.xk-chart-content {
  position: relative;
}

.move-show {
  display: flex;
  align-items: center;
  /* 垂直居中 */
  justify-content: center;
  /* 水平居中 */
  -webkit-app-region: drag;
  /* 可拖动 */
  /* 背景 !important：antd 的 .ant-layout .ant-layout-header(#001529 藏青)
     specificity (0,2,0) 高于单类 (0,1,0)，不压则头部被盖成藏青
     （同 BasicLayout .xk-header 的处理） */
  background-color: var(--xk-bg-layout) !important;
  width: 100%;
  height: 53px !important;
  font: 13px sans-serif;
  border-bottom: 1px solid var(--xk-border);
  text-align: center;
  line-height: 64px;
  position: relative; /* 作为 .chart-title 绝对定位的上下文 */
}

/* 菜单图标右侧的窗口标题：绝对定位不占布局空间，按钮组（.move-header）
   保持原有几何与居中不被挤偏；菜单 sider 固定 53px，left 锚其右侧 */
.chart-title {
  position: absolute;
  left: 65px; /* 菜单 53px + 12px 间距 */
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none; /* 不挡头部 drag 区拖拽窗口 */
}

/* macOS 原生窗口按钮占据左上角，菜单和标题避开这块区域。 */
.move-show.is-macos .sider-menu-style {
  margin-left: 95px;
  -webkit-app-region: no-drag;
}

.move-show.is-macos .chart-title {
  left: 160px;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.move-header {
  display: flex;
  align-items: center;
  /* 垂直居中 */
  justify-content: center;
  /* 水平居中 */
  -webkit-app-region: drag;
  /* 可拖动 */
  background-color: var(--xk-bg-layout);
  width: 100%;
  height: 53px !important;
  font: 13px sans-serif;
  border-bottom: 1px solid var(--xk-border);
}

.no-move-button {
  -webkit-app-region: no-drag;
  height: 25px !important;
  display: flex;
  justify-content: center;
  align-items: center;
}

.no-move-button:hover {
  -webkit-app-region: no-drag;
  height: 25px !important;
  display: flex;
  justify-content: center;
  align-items: center;
  /* 添加悬停背景色 */
  background-color: var(--xk-hover);
  /* 添加圆角 */
  border-radius: 4px;
}

.attr-panel {
  /* 侧边栏属性面板的左右留白（复选框/分割线/滑杆/按钮）；
     text-align 左对齐顶掉 .sider-style 的 center——否则唯一的内联元素
     checkbox-group 会被整行居中，与分割线错位；
     line-height 顶掉 50px，否则滑块行被撑高、与数字框错位 */
  padding: 0 12px;
  text-align: left;
  line-height: 1.5715;
}

/* checkbox-group 默认横向排 inline-block，两个复选框并排超出侧栏宽度 */
.attr-checkboxes {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

/* 聚焦模式行：模式下拉与跳数下拉同行（左模式右跳数）；空间意外不足时
   a-row 默认 flex-wrap 换行，row-gap 兜底防两行贴死 */
.focus-row {
  margin-top: 8px;
  row-gap: 8px;
}

/* 标签字号与上方 a-checkbox 标签一致（antd 默认 14px） */
.focus-mode-label {
  margin-right: 4px;
  font-size: 14px;
  color: var(--xk-text);
}

.focus-hops-label {
  margin-right: 4px;
  font-size: 14px;
  color: var(--xk-text);
}

.sider-style {
  text-align: center;
  line-height: 50px;
  padding-top: 12px;
  width: 270px !important;
  max-width: 270px !important;
  min-width: 270px !important;
  background-color: var(--xk-bg-layout) !important;
  overflow-y: scroll; /* 添加垂直滚动条 */
  overflow-x: hidden; /* 隐藏水平滚动条 */
  box-sizing: border-box; /* 使宽度包括内容、内边距和边框 */
}

/* 侧边栏表单同样顶掉 .sider-style 继承的 center/50px：
   否则 input-number 这类 inline-block 控件被居中、表单行高异常。
   左右留白对称：右边被常驻滚动条（overflow-y: scroll，自定义 5px，
   125% DPI 下实际占位 5.6px）顶出间隙，右 padding 相应减 6px 补偿，
   内容左 12 / 右 ≈11.6，视觉等宽（100% DPI 下右 11，差 1px 不可见） */
.sider-style .ant-form {
  text-align: left;
  line-height: 1.5715;
  padding: 0 6px 0 12px;
}

/* 四个表单的最后一项都是提交按钮，保持居中 */
.sider-style .ant-form .ant-form-item:last-child {
  text-align: center;
}

/* 针对Webkit内核浏览器的滚动条样式 */
.sider-style::-webkit-scrollbar {
  width: 5px; /* 设置滚动条的宽度为2px */
}

/* 滚动条轨道的样式 */
.sider-style::-webkit-scrollbar-track {
  background-color: transparent; /* 轨道颜色，可以设置为透明或你想要的颜色 */
}

/* 滚动条滑块的样式 */
.sider-style::-webkit-scrollbar-thumb {
  background-color: var(--xk-scrollbar-thumb); /* 滑块颜色，可以设置为你想要的颜色 */
}

.sider-menu-style {
  display: flex;
  align-items: center;
  justify-content: center;
  -webkit-app-region: drag;
  background-color: var(--xk-bg-layout) !important;
  text-align: center;
  width: 53px !important;
  max-width: 53px !important;
  min-width: 53px !important;
  height: 53px !important;
  font: 13px sans-serif;
  border-bottom: 1px solid var(--xk-border);
  border-right: none;
}

/* 解决框架本身获取高度错误而显示进度条Bug */
.ant-layout .ant-layout-sider-children {
  height: calc(100% - 33px);
}
</style>
