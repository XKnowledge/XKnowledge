<template>
  <a-space direction="vertical" :style="{ width: '100%' }" :size="[0, 48]">
    <a-layout :style="{ height: '100vh' }">
      <a-layout-header class="move-show" :class="{ 'is-macos': isMacOS }">
        <a-layout>
          <a-layout-sider class="sider-menu-style">
            <XkMenu
              v-model:shortcut-active="shortcutActive"
              v-model:shortcut-watch="shortcutWatch"
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
                  :disabled="focusMode === 'off'"
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
                  @change="onChangeRepulsion"
                />
              </a-col>
              <a-col :flex="1">
                <a-input-number
                  v-model:value="repulsion"
                  :min="1"
                  :max="500"
                  @change="onChangeRepulsion"
                />
              </a-col>
            </a-row>
            <a-divider orientation="left">{{ $t('chart.description') }}</a-divider>
            <!-- 图表级元数据：即时写入 chartData.description 并置脏（同复选框/
                 滑块），不进 undo/redo；绑定经 computed 兜底，见脚本区注释 -->
            <a-textarea v-model:value="chartDescription" :rows="4" @change="onDescriptionChange" />
            <a-divider orientation="left">{{ $t('chart.view') }}</a-divider>
            <!-- space-evenly：2 个 flex 项产生 3 段等宽空隙（左边缘/按钮间/右边缘） -->
            <a-row justify="space-evenly">
              <a-button size="small" @click="graph3dRef?.exportPng()">{{
                $t('chart.exportPng')
              }}</a-button>
              <a-button size="small" @click="graph3dRef?.resetView()">{{
                $t('chart.resetView')
              }}</a-button>
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
import {
  addHistory,
  createEdgeInChart,
  createNodeInChart,
  jsonReactive,
  resetEdgeRef,
  resetNodeRef
} from '../utils/XkUtils'
import { applyUndo, applyRedo } from '../utils/historyActions'
import { defaultFocusNode, focusNeighborhood, reconcileNodeHighlight } from '../utils/graphData.js'
import { shortcutModifierActive } from '../utils/platformModifier.js'
import { matchEvent } from '../utils/keybindings.js'
import { bindings as keybindings } from '../store/keybindingStore.js'
import { locale } from '../store/localeStore.js'
import { t } from '../i18n.js'
import { takePendingChart } from '../store/chartStore'

import XkCurrentNode from '../components/XkCurrentNode.vue'
import XkCurrentEdge from '../components/XkCurrentEdge.vue'
import XkMenu from '../components/XkMenu.vue'
import XkGraph3D from '../components/XkGraph3D.vue'
import XkTitleText from '../components/XkTitleText.vue'
import XkSettings from '../components/XkSettings.vue'
import XkOutlineImport from '../components/XkOutlineImport.vue'
import XkWindowControls from '../components/XkWindowControls.vue'

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
const checkedValues = ref([])
const repulsion = ref(100)

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
const settingsRef = ref(null) // XkSettings 实例（expose open），菜单「设置」入口
const outlineImportRef = ref(null) // XkOutlineImport 实例（expose open/close）
const showLinkName = ref(false) // 会话级渲染设置：悬浮时是否显示边名
const showSmallLabels = ref(true) // 会话级渲染设置：是否常显小节点名称（默认开，全显）
// 聚焦模式（会话级，不写盘、不置脏、不进 initAttr——用户开着探照灯换图，
// 灯不应被默默关掉，否则「打开新图自动聚焦」永远不触发）：
// off 关闭 / focus 灰化（邻域外退灰）/ deep 隐藏（邻域外直接隐藏）
const focusMode = ref('off')
const focusHops = ref(2)
const focusNodeId = ref('')
// 邻域集合：依赖 chartData/focusNodeId/focusHops，图被增删编辑后自动重算
const focusNodeNames = computed(() => {
  if (focusMode.value === 'off' || !focusNodeId.value) return []
  const chart = xkContext.value.chartData
  return [
    ...focusNeighborhood(chart?.nodes ?? [], chart?.links ?? [], focusNodeId.value, focusHops.value)
  ]
})
// 高亮边 index（-1 表示无）；原 `let highlightEdge` 变量由此 ref 替代
const highlightEdgeIndex = ref(-1)
// 选中高亮节点名（''=无）。name 键：增删后 index 漂移，name 全图唯一稳定；
// 与 highlightEdgeIndex 互斥——同一时刻图上最多一个高亮对象
const highlightNodeName = ref('')
// Shift+拖框选的批量选中集：节点名 + 边 index（chartData.links 索引，选择时
// 快照；后续任何单击选中/结构变更都会清空，index 不会失配）。与单击高亮
// （highlightNodeName/highlightEdgeIndex）互斥——Delete 按框选优先分发的
// 语义只能有一个「当前删除对象」
const selectionNodeNames = ref([])
const selectionLinkIndexes = ref([])
const highlightEdgeObj = computed(() => {
  const i = highlightEdgeIndex.value
  const links = xkContext.value.chartData?.links
  return i > -1 && links?.[i]
    ? { source: links[i].source, target: links[i].target, name: links[i].name }
    : null
})

/** 按名同步选中态（默认焦点/焦点删除回退时用）：index 与 currentNode 对齐 */
const syncCurrentNodeByName = (name) => {
  const nodes = xkContext.value.chartData?.nodes ?? []
  const i = nodes.findIndex((n) => n.name === name)
  if (i === -1) return
  currentNodeDataIndex.value = i
  currentNode.value = jsonReactive({ ...nodes[i] })
}

/** 模式切换（取 change 的新值而非 ref：antdv select 的 update:value 与 change
 *  的触发顺序无契约，参数值永远可靠）。聚焦/深度聚焦开启路径完全一致 */
const onFocusModeChange = (mode) => {
  if (mode === 'off') {
    // 关闭：去色立即消失、相机恢复（XkGraph3D 的 focusNodeNames watch 处理）
    focusNodeId.value = ''
    return
  }
  // 开启：优先当前选中节点，否则默认焦点（度数最高 → symbolSize → 先出现）
  const nodes = xkContext.value.chartData?.nodes ?? []
  const selected =
    currentNodeDataIndex.value > -1 && nodes[currentNodeDataIndex.value]
      ? nodes[currentNodeDataIndex.value].name
      : currentNode.value?.name || ''
  focusNodeId.value = selected || defaultFocusNode(nodes, xkContext.value.chartData?.links ?? [])
  // 焦点同步选中（仅数据，不强制弹侧栏/切面板——不打扰当前面板状态）
  if (focusNodeId.value) syncCurrentNodeByName(focusNodeId.value)
}

// 焦点节点被删：回退默认焦点；全图删空 → '' → 邻域空 = 全图恢复正常色
watch(
  () => xkContext.value.chartData?.nodes,
  (nodes) => {
    if (focusMode.value === 'off' || !focusNodeId.value) return
    if (!nodes?.some((n) => n.name === focusNodeId.value)) {
      const next = defaultFocusNode(nodes ?? [], xkContext.value.chartData?.links ?? [])
      focusNodeId.value = next
      if (next) syncCurrentNodeByName(next)
    }
  }
)

let filePath = ''
const shortcutActive = ref('')
const shortcutWatch = ref(false)

let autoSaveTimer = null
let offRequestClose = null
let autoSaveSuspended = false // 文件冲突后暂停自动保存，避免每分钟重复报错

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
  // 通知主进程解锁窗口并注册关闭确认
  window.electronAPI.enterChartMode().catch((err) => {
    console.error('进入图表模式失败', err)
  })

  autoSaveTimer = setInterval(() => {
    // 1分钟保存一次：走 persistFile 纯保存，不重置侧边栏——后台保存
    // 必须隐形，清表单/跳属性页会打断正在编辑的用户（也不借用
    // shortcutActive 分发，避免占用菜单按钮的 v-model 状态）
    if (!autoSaveSuspended && saveNodeVisible.value && filePath !== '') {
      persistFile()
    }
  }, 60000)

  // 用户点击窗口关闭按钮：主进程拦截 close 后推送本事件，
  // 由本页面决定是否可以关闭。
  offRequestClose = window.electronAPI.onRequestClose(async () => {
    if (!saveNodeVisible.value) {
      window.electronAPI.closeWindow()
      return
    }

    let choice
    try {
      choice = await window.electronAPI.confirmUnsaved()
    } catch (err) {
      console.error('退出确认失败', err)
      return // 确认框失败按“取消”处理，避免误丢用户数据
    }
    if (choice === 'cancel') return
    if (choice === 'discard') {
      window.electronAPI.closeWindow()
      return
    }
    // choice === 'save'：保存成功才关闭；失败留在当前页面
    const ok = await saveFile()
    if (ok) window.electronAPI.closeWindow()
  })
})

onUnmounted(() => {
  // 同窗口再次挂载（路由进出图表页）时，旧实例的监听器与定时器若不
  // 释放，会导致快捷键跑两遍、自动保存累积、内存泄漏
  window.removeEventListener('keydown', shortcut)
  if (autoSaveTimer) clearInterval(autoSaveTimer)
  if (offRequestClose) offRequestClose()

  // 解除主进程的窗口锁定与关闭拦截（与挂载时的 enterChartMode 对称）
  window.electronAPI.exitChartMode().catch((err) => {
    console.error('退出图表模式失败', err)
  })
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

  filePath = data.path
  // 向主进程登记"本窗口正在编辑该文件"：再次打开同一文件时聚焦本窗口
  window.electronAPI.fileOpened({ path: filePath }).catch((err) => {
    console.error('登记文件打开状态失败', err)
  })

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

const initAttr = () => {
  // v2 格式不存渲染配置，恢复会话默认值
  showLinkName.value = false
  showSmallLabels.value = true
  repulsion.value = 100
  checkedValues.value = ['showSmallLabels']
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

// 未保存状态上报主进程：窗口标题加/去圆点（标题条文件名后、任务栏标题前）。
// 现有置位/清零点（编辑、属性开关、保存、另存、装载）全部照旧翻转
// saveNodeVisible，这里统一上报；红条警示已删，标题圆点是唯一未保存提示
watch(saveNodeVisible, (v) => {
  window.electronAPI.fileDirty({ dirty: v }).catch((err) => {
    console.error('未保存状态上报失败', err)
  })
})

// 语言切换重报当前未保存状态：主进程 refreshTitles 只覆盖已登记文件窗口，
// 未命名窗口（无登记项）靠这条重报走 file:dirty 的未命名标题分支，
// 「未保存圆点 + 新语言标题」才能即时刷新（与 dirty 翻转共用同一条管道）
watch(locale, () => {
  window.electronAPI.fileDirty({ dirty: saveNodeVisible.value }).catch((err) => {
    console.error('未保存状态上报失败', err)
  })
})

const onChangeAttr = () => {
  showLinkName.value = checkedValues.value.includes('showEdgeName')
  showSmallLabels.value = checkedValues.value.includes('showSmallLabels')
  saveNodeVisible.value = true
}

// 图谱简介：双向包装 chartData.description——装载失败时 chartData 为 null，
// 而属性面板仅被 v-show 隐藏仍会渲染，裸绑 description 会在渲染期抛
// TypeError；get 兜底空串，set 顺带覆盖「新建文件无该字段」的首次创建
const chartDescription = computed({
  get: () => xkContext.value.chartData?.description ?? '',
  set: (v) => {
    if (!xkContext.value.chartData) return
    xkContext.value.chartData.description = v
  }
})

const onDescriptionChange = () => {
  saveNodeVisible.value = true
}

const onChangeRepulsion = () => {
  graph3dRef.value?.setRepulsion(repulsion.value)
  saveNodeVisible.value = true
}

const shortcut = (event) => {
  // 统一转换为小写处理
  const key = event.key.toLowerCase()
  // 焦点在按钮等普通控件上时快捷键照常生效，只在文本输入元素中屏蔽，
  // 否则点击工具栏/侧边栏控件后焦点残留，Delete/Ctrl(⌘)+Z/Y 会静默失效
  const target = event.target
  const isTypingContext =
    target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable

  // 快捷键配置映射表：5 个可自定义键位读 keybindingStore（设置里录制改键），
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
    undo: undo,
    redo: redo,
    open_settings: () => settingsRef.value?.open(),
    import_outline: () => outlineImportRef.value?.open()
  }

  const actionName = shortcutActive.value
  if (actionName && actionMap[actionName]) {
    actionMap[actionName]()
  } else if (actionName) {
    console.warn(`未定义的快捷操作: ${actionName}`)
  }
})

const downplayAllHightlight = () => {
  highlightEdgeIndex.value = -1
  highlightNodeName.value = ''
}

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
  selectionNodeNames.value = []
  selectionLinkIndexes.value = []
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

// 画布直操：就地编辑器提交 → 共享数据操作（校验/历史/刷新与表单路径同源）；
// 错误走全局 message（侧栏此刻未必展开）。建点成功后回填落点坐标。
const onCanvasCreateNode = ({ name, category, symbolSize, des, world }) => {
  const result = createNodeInChart(xkContext, {
    name,
    des: des ?? '',
    symbolSize: symbolSize ?? 50,
    category
  })
  if (!result.ok) {
    message.error(result.error)
    return
  }
  if (world) graph3dRef.value?.notifyNodeDropPos(result.data.name, world)
}

const onCanvasCreateEdge = ({ source, target, name }) => {
  const result = createEdgeInChart(xkContext, { source, target, name: name ?? '', des: '' })
  if (!result.ok) message.error(result.error)
}

/** 大纲导入：追加合并进当前图（同名节点跳过、边按无向端点对去重且端点须在
 *  图内），整批一条 importOutline 历史（一步撤销）。history.data 持有 push 进
 *  chartData 的同一批对象引用——undo 按引用移除，redo 按 push 复原 */
const onOutlineImport = ({ nodes, links }) => {
  const chart = xkContext.value.chartData
  const existing = new Set(chart.nodes.map((n) => n.name))
  const addedNodes = nodes.filter((n) => !existing.has(n.name))
  const nameSet = new Set([...existing, ...addedNodes.map((n) => n.name)])
  const pairKey = (a, b) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`)
  const existingPairs = new Set(chart.links.map((l) => pairKey(l.source, l.target)))
  const addedLinks = links.filter(
    (l) =>
      nameSet.has(l.source) &&
      nameSet.has(l.target) &&
      !existingPairs.has(pairKey(l.source, l.target))
  )

  if (!addedNodes.length && !addedLinks.length) {
    message.info(t('outline.nothingToImport'))
    return
  }

  const batch = {
    nodes: jsonReactive(addedNodes),
    links: jsonReactive(addedLinks.filter((l) => nameSet.has(l.source) && nameSet.has(l.target)))
  }
  chart.nodes.push(...batch.nodes)
  chart.links.push(...batch.links)
  addHistory(xkContext, { act: 'importOutline', data: batch })
  xkContext.value.updateChart = !xkContext.value.updateChart
  outlineImportRef.value?.close()
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

const createNewFile = () => {
  /**
   * 实现新建文件：新窗口装载空白图谱（未存盘，path 为空）
   */
  window.electronAPI
    .newChartWindow({ content: JSON.stringify({ version: 2, nodes: [], links: [] }), path: '' })
    .catch((err) => {
      console.error('新建图表窗口失败', err)
      message.error(t('chart.newWindowFailed'))
    })
}

const openFile = async () => {
  /**
   * 实现打开文件：读取成功后在新窗口打开（保持新窗口的保存直接写回原文件）。
   * 同一文件已在其他窗口打开时，主进程会聚焦那个窗口并返回 alreadyOpen。
   */
  try {
    const res = await window.electronAPI.openFile()
    if (res.canceled) return
    if (res.alreadyOpen) {
      message.info(t('chart.alreadyOpen'))
      return
    }
    window.electronAPI.newChartWindow({ content: res.content, path: res.path }).catch((err) => {
      console.error('打开失败', err)
      message.error(t('chart.openFailed'))
    })
  } catch (err) {
    console.error('打开失败', err)
    // 不解析 err.message（跨 IPC 边界后文案不可靠），使用固定中文提示
    message.error(t('common.openFailedDetail'))
  }
}

const closeFile = async () => {
  /**
   * 实现关闭文件：未保存确认与窗口关闭按钮同款（保存/放弃/取消），
   * 通过后清掉主进程的打开登记再跳回首页，其余清理由 onUnmounted 完成
   */
  if (saveNodeVisible.value) {
    let choice
    try {
      choice = await window.electronAPI.confirmUnsaved()
    } catch (err) {
      console.error('关闭文件确认失败', err)
      return // 确认框失败按“取消”处理，避免误丢用户数据
    }
    if (choice === 'cancel') return
    if (choice === 'save') {
      const ok = await saveFile()
      if (!ok) return // 保存失败留在图表页（报错沿用 saveFile 现有分支）
    }
  }
  // 清掉本窗口的打开登记（空路径只清不登）：不清的话，再次打开同一文件
  // 会“聚焦”到这个实际已回到首页的窗口
  window.electronAPI.fileOpened({ path: '' }).catch((err) => {
    console.error('清除打开登记失败', err)
  })
  router.push('/')
}

const persistFile = async () => {
  /**
   * 保存核心层：写盘 + 路径/登记/脏标记维护与错误处理，无任何 UI 重置
   * 副作用。60 秒自动保存与手动保存共用——后台保存必须隐形，清表单/
   * 跳属性页会打断正在编辑的用户。
   * 返回是否保存成功。
   */
  if (!xkContext.value.chartData) {
    // 装载失败的窗口没有可保存内容，禁止把字面量 "null" 写成损坏文件
    message.error(t('chart.nothingToSave'))
    return false
  }
  try {
    const res = await window.electronAPI.saveFile({
      path: filePath,
      content: JSON.stringify(jsonReactive(xkContext.value.chartData))
    })
    if (res.canceled) return false
    filePath = res.path
    autoSaveSuspended = false
    // 首次保存（原 path 为空）后文件有了路径，更新登记
    window.electronAPI.fileOpened({ path: filePath }).catch(() => {})
    saveNodeVisible.value = false
    return true
  } catch (err) {
    console.error('保存失败', err)
    // invoke 错误边界只保留 message（code 属性跨 IPC 丢失），
    // 按主进程错误里的稳定 token 区分冲突场景
    if (String(err?.message).includes('[FILE_CONFLICT]')) {
      autoSaveSuspended = true // 冲突未解决前不再自动保存，避免每分钟重复报错
      message.error(t('chart.fileConflictHint'))
    } else if (String(err?.message).includes('[EXAMPLE_PROTECTED]')) {
      // 另存对话框里选到了示例目录内（示例是内置资产，不允许覆盖）
      message.error(t('chart.exampleProtectedHint'))
    } else {
      message.error(t('chart.saveFailed'))
    }
    saveNodeVisible.value = true
    return false
  }
}

const saveFile = async () => {
  /**
   * 手动保存（Ctrl/⌘+S/菜单/关闭前保存）：在 persistFile 之上叠加 UI 重置
   * ——保存成功后回到干净的属性面板，这是用户主动动作的预期反馈。
   * 返回是否保存成功（供退出流程使用）。
   */
  const ok = await persistFile()
  if (ok) {
    resetSider()
    resetRefData()
  }
  return ok
}

const saveAs = async () => {
  /**
   * 实现文件另存为。
   */
  if (!xkContext.value.chartData) {
    message.error(t('chart.nothingToSave'))
    return
  }
  try {
    const res = await window.electronAPI.saveFileAs({
      content: JSON.stringify(jsonReactive(xkContext.value.chartData))
    })
    if (res.canceled) return
    filePath = res.path
    autoSaveSuspended = false // 换了新文件，恢复自动保存
    // 另存为换了路径：更新登记，旧文件不再聚焦到本窗口
    window.electronAPI.fileOpened({ path: filePath }).catch(() => {})
    saveNodeVisible.value = false
    resetSider()
    resetRefData()
  } catch (err) {
    console.error('另存为失败', err)
    if (String(err?.message).includes('[EXAMPLE_PROTECTED]')) {
      message.error(t('chart.exampleProtectedHint'))
    } else {
      message.error(t('chart.saveAsFailed'))
    }
  }
}

const undo = () => {
  /**
   * 实现快捷键Ctrl/⌘+Z
   * 数据补偿逻辑在 utils/historyActions（多重边安全），这里只管序号与 UI
   */
  const { historyList, historySequenceNumber } = xkContext.value

  if (historySequenceNumber < 0) return

  const currentHistory = historyList[historySequenceNumber]
  xkContext.value.historySequenceNumber--

  if (applyUndo(xkContext.value.chartData, currentHistory)) {
    xkContext.value.updateChart = !xkContext.value.updateChart
  }

  resetSider()
  resetRefData()
}

const redo = () => {
  /**
   * 实现快捷键Ctrl/⌘+Y
   * 数据补偿逻辑在 utils/historyActions（多重边安全），这里只管序号与 UI
   */
  const currentHSN = xkContext.value.historySequenceNumber + 1
  if (currentHSN >= xkContext.value.historyList.length) return

  const currentHistory = xkContext.value.historyList[currentHSN]
  xkContext.value.historySequenceNumber = currentHSN

  if (applyRedo(xkContext.value.chartData, currentHistory)) {
    xkContext.value.updateChart = !xkContext.value.updateChart
  }

  resetSider()
  resetRefData()
}

const deleteNode = () => {
  /**
   * 删除节点
   */
  if (currentNodeDataIndex.value < 0) return

  const { nodes, links } = xkContext.value.chartData
  const deletedNode = nodes[currentNodeDataIndex.value]

  // 更新历史记录
  const newHistory = {
    act: 'deleteNode',
    data: jsonReactive(deletedNode),
    links: links.filter(
      (link) => link.source === deletedNode.name || link.target === deletedNode.name
    )
  }

  addHistory(xkContext, newHistory)

  // 使用 filter 替代循环
  xkContext.value.chartData.nodes = nodes.filter((_, index) => index !== currentNodeDataIndex.value)

  // 过滤保留不相关的边
  xkContext.value.chartData.links = links.filter(
    (link) => link.source !== deletedNode.name && link.target !== deletedNode.name
  )

  xkContext.value.updateChart = !xkContext.value.updateChart

  resetSider()
  resetRefData()
}

const deleteEdge = () => {
  /**
   * 删除连接
   */
  if (currentEdgeDataIndex.value < 0) return

  const { links } = xkContext.value.chartData
  addHistory(xkContext, {
    act: 'deleteEdge',
    data: jsonReactive(links[currentEdgeDataIndex.value])
  })

  // 删除连接
  xkContext.value.chartData.links = links.filter((_, index) => index !== currentEdgeDataIndex.value)

  xkContext.value.updateChart = !xkContext.value.updateChart
  resetSider()
  resetRefData()
}

const deleteSelection = () => {
  /**
   * 框选批量删除：Delete 在框选集非空时优先走这里。一条 deleteSelection 历史
   * 承载整批——被选节点 + 直选边 + 删点连带边（与单点删除同语义），一步撤销。
   * 边按对象引用进出历史（undo push 回的即 history 持有的对象），多重边安全
   */
  const names = new Set(selectionNodeNames.value)
  const linkIdxs = new Set(selectionLinkIndexes.value)
  if (!names.size && !linkIdxs.size) return

  const { nodes, links } = xkContext.value.chartData
  const deletedNodes = nodes.filter((n) => names.has(n.name))
  const removedLinks = links.filter(
    (l, i) => linkIdxs.has(i) || names.has(l.source) || names.has(l.target)
  )

  addHistory(xkContext, {
    act: 'deleteSelection',
    data: { nodes: jsonReactive(deletedNodes), links: jsonReactive(removedLinks) }
  })

  xkContext.value.chartData.nodes = nodes.filter((n) => !names.has(n.name))
  xkContext.value.chartData.links = links.filter(
    (l, i) => !linkIdxs.has(i) && !names.has(l.source) && !names.has(l.target)
  )

  xkContext.value.updateChart = !xkContext.value.updateChart
  resetSider()
  resetRefData()
  message.info(
    t('chart.deletedSummary', { nodes: deletedNodes.length, edges: removedLinks.length })
  )
}

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
