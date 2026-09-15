<template>
  <a-space direction="vertical" :style="{ width: '100%' }" :size="[0, 48]">
    <a-layout :style="{ height: '100vh' }">
      <a-layout-header class="move-show">
        <a-layout>
          <a-layout-sider class="sider-menu-style">
            <XkMenu v-model:shortcutActive="shortcutActive" v-model:shortcutWatch="shortcutWatch" />
          </a-layout-sider>
          <a-space v-show="saveNodeVisible" direction="vertical" class="save-note">
            <a-alert message="未保存" type="error" />
          </a-space>
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
        </a-layout>
      </a-layout-header>
      <a-layout>
        <a-layout-content :style="contentStyle">
          <XkGraph3D
            ref="graph3dRef"
            class="echarts-style"
            :nodes="xkContext.chartData?.nodes ?? []"
            :links="xkContext.chartData?.links ?? []"
            :highlight-nodes="highlightNodeNames"
            :highlight-link="highlightEdgeObj"
            :draggable="draggable"
            :show-link-name="showLinkName"
            @node-click="onGraphNodeClick"
            @link-click="onGraphLinkClick"
          />
        </a-layout-content>
        <a-layout-sider v-show="siderVisible" class="sider-style">
          <a-space v-show="xkContext.errorMessage !== ''" direction="vertical" style="width: 80%">
            <a-alert :message="xkContext.errorMessage" type="error" />
          </a-space>

          <a-space v-show="attributeVisible">
            <a-checkbox-group v-model:value="checkedValues" @change="onChangeAttr">
              <a-row>
                <a-col :flex="1">
                  <a-checkbox value="draggable"> 元素拖拽 </a-checkbox>
                </a-col>
                <a-col :flex="1">
                  <a-checkbox value="showEdgeName"> 悬浮显示连接名称 </a-checkbox>
                </a-col>
              </a-row>
              <a-divider orientation="left">排斥力大小</a-divider>
              <a-row>
                <a-col :flex="4">
                  <a-slider
                    v-model:value="repulsion"
                    :min="1"
                    :max="10000"
                    @change="onChangeRepulsion"
                  />
                </a-col>
                <a-col :flex="1">
                  <a-input-number
                    v-model:value="repulsion"
                    :min="1"
                    :max="10000"
                    @change="onChangeRepulsion"
                  />
                </a-col>
              </a-row>
              <a-divider orientation="left">视图</a-divider>
              <a-row :gutter="8">
                <a-col :flex="1">
                  <a-button size="small" @click="graph3dRef?.exportPng()">导出图片</a-button>
                </a-col>
                <a-col :flex="1">
                  <a-button size="small" @click="graph3dRef?.resetView()">复位视图</a-button>
                </a-col>
              </a-row>
            </a-checkbox-group>
          </a-space>

          <XkCreateNode
            v-show="createNodeVisible"
            v-model:newNode="newNode"
            v-model:categoryItems="categoryItems"
            v-model:categoryName="categoryName"
            v-model:xkContext="xkContext"
          ></XkCreateNode>

          <XkCurrentNode
            v-show="currentNodeVisible"
            v-model:currentNode="currentNode"
            v-model:categoryItems="categoryItems"
            v-model:categoryName="categoryName"
            v-model:currentNodeDataIndex="currentNodeDataIndex"
            v-model:xkContext="xkContext"
          ></XkCurrentNode>

          <XkCreateEdge
            v-show="createEdgeVisible"
            v-model:newEdge="newEdge"
            v-model:highlightNodeList="highlightNodeList"
            v-model:xkContext="xkContext"
          ></XkCreateEdge>

          <XkCurrentEdge
            v-show="currentEdgeVisible"
            v-model:currentEdge="currentEdge"
            v-model:currentEdgeDataIndex="currentEdgeDataIndex"
            v-model:xkContext="xkContext"
          ></XkCurrentEdge>
        </a-layout-sider>
      </a-layout>
      <a-layout-footer class="footer-style" v-show="false">Footer</a-layout-footer>
    </a-layout>
  </a-space>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import { addHistory, jsonReactive, resetEdgeRef, resetNodeRef } from '../utils/XkUtils'
import { takePendingChart } from '../store/chartStore'
import createTemplate1 from '../template/template1.ts'

import XkCreateNode from '../components/XkCreateNode.vue'
import XkCurrentNode from '../components/XkCurrentNode.vue'
import XkCreateEdge from '../components/XkCreateEdge.vue'
import XkCurrentEdge from '../components/XkCurrentEdge.vue'
import XkMenu from '../components/XkMenu.vue'
import XkGraph3D from '../components/XkGraph3D.vue'

import CreateNodeIcon from '../assets/create_node.png'
import DeleteNodeIcon from '../assets/delete_node.png'
import CreateEdgeIcon from '../assets/create_edge.png'
import DeleteEdgeIcon from '../assets/delete_edge.png'
import EditIcon from '../assets/edit.png'

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
const repulsion = ref(1000)
// let windowID = null

const createNodeVisible = ref(false)
const newNode = ref({
  name: '',
  des: '',
  symbolSize: 50,
  // placeholder 只有在 value = undefined 才会显示
  category: undefined
})

const currentNodeVisible = ref(false)
const currentNode = ref({
  name: '',
  des: '',
  symbolSize: 50,
  category: ''
})
const currentNodeDataIndex = ref(-1) // todo 这块有一个优化，可以和highlightNodeList合并，相当于highlightNodeList的最后一个值，不确定能不能替换，替换之后如果highlightNodeList中没有节点，会有问题？

const createEdgeVisible = ref(false)
const newEdge = ref({
  source: '',
  target: '',
  name: '',
  des: ''
})

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
const draggable = ref(true) // 会话级渲染设置，不进文件
const showLinkName = ref(false) // 会话级渲染设置：悬浮时是否显示边名
const highlightNodeList = ref([]) // 高亮节点 index 记录（最多 2 个，逻辑照旧）
const highlightNodeNames = computed(() =>
  highlightNodeList.value.map((i) => xkContext.value.chartData?.nodes?.[i]?.name).filter(Boolean)
)
// 高亮边 index（-1 表示无）；原 `let highlightEdge` 变量由此 ref 替代
const highlightEdgeIndex = ref(-1)
const highlightEdgeObj = computed(() => {
  const i = highlightEdgeIndex.value
  const links = xkContext.value.chartData?.links
  return i > -1 && links?.[i]
    ? { source: links[i].source, target: links[i].target, name: links[i].name }
    : null
})

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
      message.error('图表数据装载失败，请关闭窗口后重新打开文件')
    }
  }
  // 通知主进程解锁窗口并注册关闭确认
  window.electronAPI.enterChartMode().catch((err) => {
    console.error('进入图表模式失败', err)
  })

  autoSaveTimer = setInterval(() => {
    // 1分钟保存一次
    if (!autoSaveSuspended && saveNodeVisible.value && filePath !== '') {
      shortcutActive.value = 'save_file'
      shortcutWatch.value = !shortcutWatch.value
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

// window.electronAPI.getWindowId().then(id => {
//   windowID = id
//   console.log('窗口ID:', id)
// })

const loadChartData = (data) => {
  const chart = (() => {
    try {
      return JSON.parse(data.value)
    } catch (e) {
      console.error('文件内容解析失败', e)
      message.error('文件内容已损坏或格式不正确，无法打开')
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
    message.error('文件内容已损坏或格式不正确，无法打开')
    return
  }
  // 与主进程 fileService 对齐：悬空边（source/target 不在任何节点上）同样视为损坏
  const names = new Set(chart.nodes.map((n) => n.name))
  if (chart.links.some((l) => !l || !names.has(l?.source) || !names.has(l?.target))) {
    message.error('文件内容已损坏或格式不正确，无法打开')
    return
  }
  xkContext.value.chartData = chart

  filePath = data.path
  // 向主进程登记"本窗口正在编辑该文件"：再次打开同一文件时聚焦本窗口
  window.electronAPI.fileOpened({ path: filePath }).catch((err) => {
    console.error('登记文件打开状态失败', err)
  })

  initAttr()
  xkContext.value.updateChart = !xkContext.value.updateChart
  nextTick(() => {
    saveNodeVisible.value = false
  })
}

const initAttr = () => {
  // v2 格式不存渲染配置，恢复会话默认值
  draggable.value = true
  showLinkName.value = false
  repulsion.value = 1000
  checkedValues.value = ['draggable']
}

watch(
  () => xkContext.value.updateChart,
  () => {
    const categories = [...new Set(xkContext.value.chartData.nodes.map((x) => x.category))]
    categoryItems.value = categories
    saveNodeVisible.value = true
  }
)

const onChangeAttr = () => {
  draggable.value = checkedValues.value.includes('draggable')
  showLinkName.value = checkedValues.value.includes('showEdgeName')
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
  // 否则点击工具栏/侧边栏控件后焦点残留，Insert/Delete/Ctrl+Z/Y 会静默失效
  const target = event.target
  const isTypingContext =
    target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable

  // 快捷键配置映射表
  const shortcutMap = {
    // 全局快捷键
    'ctrl+s': {
      match: () => event.ctrlKey && key === 's',
      action: () => triggerShortcut('save_file')
    },
    'ctrl+r': {
      match: () => event.ctrlKey && key === 'r',
      action: () => event.preventDefault() // 阻止浏览器刷新
    },

    // 图表区域快捷键（输入文本时不触发）
    insert: {
      match: () => !isTypingContext && key === 'insert',
      action: () => triggerShortcut('create_node')
    },
    delete: {
      match: () => !isTypingContext && key === 'delete',
      action: () => triggerShortcut('delete_node')
    },
    'ctrl+z': {
      match: () => !isTypingContext && event.ctrlKey && key === 'z',
      action: () => triggerShortcut('undo')
    },
    'ctrl+y': {
      match: () => !isTypingContext && event.ctrlKey && key === 'y',
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
    create_new_file: createNewFile,
    open_file: openFile,
    create_node: createNode,
    delete_node: deleteNode,
    create_edge: createEdge,
    delete_edge: deleteEdge,
    undo: undo,
    redo: redo
  }

  const actionName = shortcutActive.value
  if (actionName && actionMap[actionName]) {
    actionMap[actionName]()
  } else if (actionName) {
    console.warn(`未定义的快捷操作: ${actionName}`)
  }
})

const downplayAllHightlight = () => {
  highlightNodeList.value = []
  highlightEdgeIndex.value = -1
}

const resetRefData = () => {
  /**
   * 重置各种ref，配合侧边栏显示一块用
   */
  downplayAllHightlight()
  // 高亮索引在节点/边增删后随数组前移而失效，必须连同清空，
  // 否则“创建连接”会按陈旧索引连到错误节点
  highlightNodeList.value = []
  resetNodeRef(newNode)
  resetEdgeRef(newEdge)
  currentNodeDataIndex.value = -1
  resetNodeRef(currentNode)
  currentEdgeDataIndex.value = -1
  resetEdgeRef(currentEdge)
}

const resetSider = () => {
  /**
   * 将侧边栏中显示的信息全部隐藏
   */
  xkContext.value.errorMessage = ''
  attributeVisible.value = true
  createNodeVisible.value = false
  currentNodeVisible.value = false
  createEdgeVisible.value = false
  currentEdgeVisible.value = false
}

const onGraphNodeClick = (nodeData, index) => {
  resetSider()
  attributeVisible.value = false
  currentNodeVisible.value = true
  currentNode.value = jsonReactive(nodeData)
  newNode.value.symbolSize = currentNode.value.symbolSize
  currentNodeDataIndex.value = index

  const currentIndex = highlightNodeList.value.indexOf(index)
  if (currentIndex !== -1) {
    highlightNodeList.value.splice(currentIndex, 1)
  } else if (highlightNodeList.value.length < 2) {
    highlightNodeList.value.push(index)
  } else {
    highlightNodeList.value = [highlightNodeList.value[1], index]
  }

  if (!siderVisible.value) switchSider()
}

const onGraphLinkClick = (linkData, index) => {
  resetSider()
  attributeVisible.value = false
  currentEdgeVisible.value = true
  currentEdge.value = jsonReactive(linkData)
  currentEdgeDataIndex.value = index
  highlightEdgeIndex.value = highlightEdgeIndex.value === index ? -1 : index

  if (!siderVisible.value) switchSider()
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
   * 实现新建文件：新窗口装载空白模板（未存盘，path 为空）
   */
  window.electronAPI
    .newChartWindow({ content: JSON.stringify(createTemplate1()), path: '' })
    .catch((err) => {
      console.error('新建图表窗口失败', err)
      message.error('新建图表窗口失败')
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
      message.info('该文件已在打开的窗口中')
      return
    }
    window.electronAPI.newChartWindow({ content: res.content, path: res.path }).catch((err) => {
      console.error('打开失败', err)
      message.error('打开失败')
    })
  } catch (err) {
    console.error('打开失败', err)
    // 不解析 err.message（跨 IPC 边界后文案不可靠），使用固定中文提示
    message.error('打开失败：文件读取失败或已损坏')
  }
}

const saveFile = async () => {
  /**
   * 实现文件保存：有路径直接写，无路径由主进程弹另存对话框。
   * 返回是否保存成功（供退出流程使用）。
   */
  if (!xkContext.value.chartData) {
    // 装载失败的窗口没有可保存内容，禁止把字面量 "null" 写成损坏文件
    message.error('没有可保存的图表内容')
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
    resetSider()
    resetRefData()
    return true
  } catch (err) {
    console.error('保存失败', err)
    // invoke 错误边界只保留 message（code 属性跨 IPC 丢失），
    // 按主进程错误里的稳定 token 区分冲突场景
    if (String(err?.message).includes('[FILE_CONFLICT]')) {
      autoSaveSuspended = true // 冲突未解决前不再自动保存，避免每分钟重复报错
      message.error('文件已被其他窗口或外部程序修改，请使用“另存为”保留修改')
    } else {
      message.error('保存失败')
    }
    saveNodeVisible.value = true
    return false
  }
}

const saveAs = async () => {
  /**
   * 实现文件另存为。
   */
  if (!xkContext.value.chartData) {
    message.error('没有可保存的图表内容')
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
    message.error('另存为失败')
  }
}

const undo = () => {
  /**
   * 实现快捷键Ctrl+Z
   */
  const { historyList, historySequenceNumber } = xkContext.value

  if (historySequenceNumber < 0) return

  const currentHistory = historyList[historySequenceNumber]
  xkContext.value.historySequenceNumber--

  // 策略模式处理不同操作类型
  const actionHandlers = {
    createNode: () => {
      xkContext.value.chartData.nodes = xkContext.value.chartData.nodes.filter(
        (node) => node.name !== currentHistory.data.name
      )
    },

    changeNode: () => {
      const nodeIndex = xkContext.value.chartData.nodes.findIndex(
        (node) => node.name === currentHistory.new.name
      )

      if (nodeIndex > -1) {
        // 还原节点数据
        xkContext.value.chartData.nodes[nodeIndex] = currentHistory.old

        // 更新关联的边
        if (currentHistory.new.name !== currentHistory.old.name) {
          xkContext.value.chartData.links.forEach((link) => {
            if (link.source === currentHistory.new.name) link.source = currentHistory.old.name
            if (link.target === currentHistory.new.name) link.target = currentHistory.old.name
          })
        }
      }
    },

    deleteNode: () => {
      xkContext.value.chartData.nodes.push(currentHistory.data)
      xkContext.value.chartData.links.push(...currentHistory.links)
    },

    createEdge: () => {
      xkContext.value.chartData.links = xkContext.value.chartData.links.filter(
        (link) =>
          link.source !== currentHistory.data.source || link.target !== currentHistory.data.target
      )
    },

    changeEdge: () => {
      const edgeIndex = xkContext.value.chartData.links.findIndex(
        (link) =>
          link.source === currentHistory.new.source && link.target === currentHistory.new.target
      )

      if (edgeIndex > -1) {
        xkContext.value.chartData.links[edgeIndex] = currentHistory.old
      }
    },

    deleteEdge: () => {
      xkContext.value.chartData.links.push(currentHistory.data)
    }
  }

  // 执行对应操作处理
  if (actionHandlers[currentHistory.act]) {
    actionHandlers[currentHistory.act]()
    xkContext.value.updateChart = !xkContext.value.updateChart
  }

  resetSider()
  resetRefData()
}

const redo = () => {
  /**
   * 实现快捷键Ctrl+Y
   */
  const currentHSN = xkContext.value.historySequenceNumber + 1
  if (currentHSN >= xkContext.value.historyList.length) return

  const currentHistory = xkContext.value.historyList[currentHSN]
  xkContext.value.historySequenceNumber = currentHSN

  // 策略模式处理不同操作类型
  const actionHandlers = {
    createNode: () => {
      xkContext.value.chartData.nodes.push(currentHistory.data)
    },

    changeNode: () => {
      const nodes = xkContext.value.chartData.nodes
      const nodeIndex = nodes.findIndex((n) => n.name === currentHistory.old.name)

      if (nodeIndex > -1) {
        nodes[nodeIndex] = currentHistory.new

        // 更新关联边名称
        if (currentHistory.new.name !== currentHistory.old.name) {
          xkContext.value.chartData.links.forEach((link) => {
            if (link.source === currentHistory.old.name) link.source = currentHistory.new.name
            if (link.target === currentHistory.old.name) link.target = currentHistory.new.name
          })
        }
      }
    },

    deleteNode: () => {
      const { nodes, links } = xkContext.value.chartData

      xkContext.value.chartData.nodes = nodes.filter((n) => n.name !== currentHistory.data.name)
      xkContext.value.chartData.links = links.filter(
        (l) => l.source !== currentHistory.data.name && l.target !== currentHistory.data.name
      )
    },

    createEdge: () => {
      xkContext.value.chartData.links.push(currentHistory.data)
    },

    changeEdge: () => {
      const links = xkContext.value.chartData.links
      const edgeIndex = links.findIndex(
        (l) => l.source === currentHistory.old.source && l.target === currentHistory.old.target
      )

      if (edgeIndex > -1) {
        links[edgeIndex] = currentHistory.new
      }
    },

    deleteEdge: () => {
      xkContext.value.chartData.links = xkContext.value.chartData.links.filter(
        (l) => l.source !== currentHistory.data.source || l.target !== currentHistory.data.target
      )
    }
  }

  // 执行对应操作处理
  if (actionHandlers[currentHistory.act]) {
    actionHandlers[currentHistory.act]()
    xkContext.value.updateChart = !xkContext.value.updateChart
  }

  resetSider()
  resetRefData()
}

const createNode = () => {
  /**
   * 创建新节点
   */
  resetSider()
  attributeVisible.value = false
  siderVisible.value = true // 切换侧边栏的显示状态
  createNodeVisible.value = true
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

const createEdge = () => {
  /**
   * 创建新连接
   */
  resetSider()
  attributeVisible.value = false
  siderVisible.value = true // 切换侧边栏的显示状态
  createEdgeVisible.value = true
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

const buttonList = ref([
  { src: CreateNodeIcon, name: '创建节点', click: createNode },
  { src: DeleteNodeIcon, name: '删除节点', click: deleteNode },
  { src: CreateEdgeIcon, name: '创建连接', click: createEdge },
  { src: DeleteEdgeIcon, name: '删除连接', click: deleteEdge },
  { src: EditIcon, name: '编辑框', click: toggleSider }
])

// 图表区宽度不在此设定：由 antd flex 布局撑开；3D 图组件经
// ResizeObserver 自适应容器尺寸，无需页面联动 resize
const contentStyle = {
  textAlign: 'center',
  minHeight: 120,
  lineHeight: '120px',
  backgroundColor: '#ffffff'
  // height: "calc(100vh - 86px)"
}
</script>

<style>
.echarts-style {
  width: 100%;
  height: 100%;
}

.save-note {
  display: flex;
  align-items: center;
  /* 垂直居中 */
  justify-content: center;
  /* 水平居中 */
  -webkit-app-region: no-drag;
  /* 可拖动 */
  height: 53px !important;
  border-bottom: 1px solid #0505050f;
}

.move-show {
  display: flex;
  align-items: center;
  /* 垂直居中 */
  justify-content: center;
  /* 水平居中 */
  -webkit-app-region: drag;
  /* 可拖动 */
  background-color: #f5f5f5;
  width: 100%;
  height: 53px !important;
  font: 13px sans-serif;
  border-bottom: 1px solid #0505050f;
  text-align: center;
  line-height: 64px;
}

.move-header {
  display: flex;
  align-items: center;
  /* 垂直居中 */
  justify-content: center;
  /* 水平居中 */
  -webkit-app-region: drag;
  /* 可拖动 */
  background-color: #f5f5f5;
  width: 100%;
  height: 53px !important;
  font: 13px sans-serif;
  border-bottom: 1px solid #0505050f;
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
  background-color: #0000000d;
  /* 添加圆角 */
  border-radius: 4px;
}

.footer-style {
  padding: 0 !important;
  text-align: center;
  background-color: #f5f5f5;
  height: 33px !important;
  border-top: 1px solid #0505050f;
}

.sider-style {
  text-align: center;
  line-height: 50px;
  width: 270px !important;
  max-width: 270px !important;
  min-width: 270px !important;
  background-color: #f5f5f5 !important;
  overflow-y: scroll; /* 添加垂直滚动条 */
  overflow-x: hidden; /* 隐藏水平滚动条 */
  box-sizing: border-box; /* 使宽度包括内容、内边距和边框 */
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
  background-color: #888; /* 滑块颜色，可以设置为你想要的颜色 */
}

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
  border-bottom: 1px solid #0505050f;
  border-right: none;
}

/* 解决框架本身获取高度错误而显示进度条Bug */
.ant-layout .ant-layout-sider-children {
  height: calc(100% - 33px);
}

.form-style {
  background-color: #f5f5f5 !important;
}

.form-style input {
  width: 200px !important;
  max-width: 200px !important;
  min-width: 200px !important;
  height: 30px !important;
}

.form-style button {
  height: 30px !important;
  background-color: #0d5bc6 !important;
  color: #ffffff;
}
</style>
