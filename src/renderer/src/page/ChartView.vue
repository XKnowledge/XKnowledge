<template>
  <a-space direction="vertical" :style="{ width: '100%' }" :size="[0, 48]">
    <a-layout :style="{height: '100vh'}">
      <a-layout-header class="move-show">
        <a-layout>
          <a-layout-sider class="sider-menu-style">
            <XkMenu v-model:shortcutActive="shortcutActive" v-model:shortcutWatch="shortcutWatch" />
          </a-layout-sider>
          <a-space v-show="saveNodeVisible" direction="vertical" class="save-note">
            <a-alert message="未保存" type="error" />
          </a-space>
          <a-layout-content class="move-header">
            <a-space size="large">
              <a-space v-for="item in buttonList" style="align-items: center" direction="vertical" size="small">
                <a-button type="link" class="no-move-button" @click="item.click">
                  <img :src="item.src" alt="" :style="{ width: '20px', height: '20px'}" />
                </a-button>
                {{ item.name }}
              </a-space>
            </a-space>
          </a-layout-content>

        </a-layout>
      </a-layout-header>
      <a-layout>
        <a-layout-content :style="contentStyle">
          <div class="echarts-style" ref="chartDom"></div>
        </a-layout-content>
        <a-layout-sider v-show="siderVisible" class="sider-style">

          <a-space v-show="xkContext.errorMessage !== ''" direction="vertical" style="width: 80%">
            <a-alert :message="xkContext.errorMessage" type="error" />
          </a-space>

          <a-space v-show="attributeVisible">
            <a-checkbox-group v-model:value="checkedValues" @change="onChangeAttr">
              <a-row>
                <a-col :flex="1">
                  <a-checkbox value="draggable">
                    元素拖拽
                  </a-checkbox>
                </a-col>
                <a-col :flex="1">
                  <a-checkbox value="showEdgeName">
                    显示连接名称
                  </a-checkbox>
                </a-col>
              </a-row>
              <a-divider orientation="left">排斥力大小</a-divider>
              <a-row>
                <a-col :flex="4">
                  <a-slider v-model:value="repulsion" :min="1" :max="10000" @change="onChangeRepulsion" />
                </a-col>
                <a-col :flex="1">
                  <a-input-number v-model:value="repulsion" :min="1" :max="10000" @change="onChangeRepulsion" />
                </a-col>
              </a-row>
            </a-checkbox-group>
          </a-space>

          <XkCreateNode v-show="createNodeVisible"
                        v-model:newNode="newNode"
                        v-model:categoryItems="categoryItems"
                        v-model:categoryName="categoryName"
                        v-model:currentNode="currentNode"

                        v-model:xkContext="xkContext"></XkCreateNode>

          <XkCurrentNode v-show="currentNodeVisible"
                         v-model:currentNode="currentNode"
                         v-model:categoryItems="categoryItems"
                         v-model:categoryName="categoryName"
                         v-model:currentNodeDataIndex="currentNodeDataIndex"

                         v-model:xkContext="xkContext"></XkCurrentNode>

          <XkCreateEdge v-show="createEdgeVisible"
                        v-model:newEdge="newEdge"
                        v-model:highlightNodeList="highlightNodeList"

                        v-model:xkContext="xkContext"></XkCreateEdge>

          <XkCurrentEdge v-show="currentEdgeVisible"
                         v-model:currentEdge="currentEdge"
                         v-model:currentEdgeDataIndex="currentEdgeDataIndex"

                         v-model:xkContext="xkContext"></XkCurrentEdge>

        </a-layout-sider>
      </a-layout>
      <a-layout-footer class="footer-style" v-show=false>Footer</a-layout-footer>
    </a-layout>
  </a-space>
</template>

<script setup>
import { nextTick, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import { jsonReactive, resetEdgeRef, resetNodeRef } from '../utils/XkUtils'

import XkCreateNode from '../components/XkCreateNode.vue'
import XkCurrentNode from '../components/XkCurrentNode.vue'
import XkCreateEdge from '../components/XkCreateEdge.vue'
import XkCurrentEdge from '../components/XkCurrentEdge.vue'
import XkMenu from '../components/XkMenu.vue'

import CreateNodeIcon from '../assets/create_node.png'
import DeleteNodeIcon from '../assets/delete_node.png'
import CreateEdgeIcon from '../assets/create_edge.png'
import DeleteEdgeIcon from '../assets/delete_edge.png'
import EditIcon from '../assets/edit.png'

const xkContext = ref({
  'errorMessage': '',
  'chartData': null,
  'updateChart': false,
  'historyList': [], // 记录历史
  'historySequenceNumber': -1 // HSN：历史操作对应的目前的位置
})

const echartsWidth = ref('100vh')
const siderVisible = ref(false)
const saveNodeVisible = ref(false)

const attributeVisible = ref(true)
const checkedValues = ref([])
const repulsion = ref(1000)
let timer = null

const createNodeVisible = ref(false)
const newNode = ref({
  'name': '',
  'des': '',
  'symbolSize': 50,
  // placeholder 只有在 value = undefined 才会显示
  'category': undefined
})

const currentNodeVisible = ref(false)
const currentNode = ref({
  'name': '',
  'des': '',
  'symbolSize': 50,
  'category': ''
})
const currentNodeDataIndex = ref(-1) // todo 这块有一个优化，可以和highlightNodeList合并，相当于highlightNodeList的最后一个值，不确定能不能替换，替换之后如果highlightNodeList中没有节点，会有问题？

const createEdgeVisible = ref(false)
const newEdge = ref({
  'source': '',
  'target': '',
  'name': '',
  'des': ''
})

const currentEdgeVisible = ref(false)
const currentEdge = ref({
  'source': '',
  'target': '',
  'name': '',
  'des': ''
})
const currentEdgeDataIndex = ref(-1)

// 新增时的类目
const categoryItems = ref([])
const categoryName = ref()

// 基于准备好的dom，初始化echarts实例
const chartDom = ref(null)
let chartInstance = null

const highlightNodeList = ref([]) // 高亮节点记录
let highlightEdge = null

let filePath = ''
const shortcutActive = ref('')
const shortcutWatch = ref(false)

onMounted(async () => {
  // 调用渲染图表逻辑
  window.addEventListener('resize', resizeChart)
  window.addEventListener('keydown', shortcut)
  setInterval(() => {
    // 1分钟保存一次
    if (saveNodeVisible.value && filePath !== '') {
      shortcutActive.value = 'save_file'
      shortcutWatch.value = !shortcutWatch.value
    }
  }, 60000)
})


window.electronAPI.receiveData((data) => {
  xkContext.value.chartData = JSON.parse(data.value)
  filePath = data.path
  console.log(data.path)
  // 图表初始化
  console.log('option')
  // 基于准备好的dom，初始化echarts实例
  if (chartDom.value) {
    // 初始化 ECharts 图表
    chartInstance = echarts.init(chartDom.value)
    if (xkContext.value.chartData) {
      initChartData()
      initAttr()
      // 使用刚指定的配置项和数据显示图表。
      xkContext.value.updateChart = !xkContext.value.updateChart
      nextTick(() => {
        saveNodeVisible.value = false
      })
      chartInstance.on('click', clickChart)
    }
  }
})

const initAttr = () => {
  // 将读取的属性赋值给组件
  const attrs = []
  if (xkContext.value.chartData.series[0].draggable) {
    attrs.push('draggable')
  }
  if (xkContext.value.chartData.series[0].edgeLabel.show) {
    attrs.push('showEdgeName')
  }

  checkedValues.value = attrs
  repulsion.value = xkContext.value.chartData.series[0].force.repulsion
}

const initChartData = () => {
  // 增加水印
  xkContext.value.chartData.graphic = [
    {
      'type': 'text',
      'left': 'center',
      'bottom': '5%',
      'style': {
        'fill': 'rgba(0,0,0,1)',
        'text': 'By XKnowledge',
        'font': 'bold 18px sans-serif'
      }
    }
  ]
  xkContext.value.chartData.toolbox = {
    // 显示工具箱
    'show': true,
    'feature': {
      // 保存为图片
      'saveAsImage': {
        'show': true
      },
      'restore': {
        'show': true
      }
    }
  }

  // 提示框的配置
  xkContext.value.chartData.tooltip = {
    show: true,
    formatter: function(x) {
      return x.data.des
    }
  }

  xkContext.value.chartData.series[0].edgeLabel.formatter = function(x) {
    return x.data.name
  }
}

watch(() => xkContext.value.updateChart, () => {
  // 自动监听，刷新图表
  // 保证chartInstance在当前文件中
  // 让操作变重了，但是为了后面文件拆分做准备
  // 更新图例，比如节点类别
  // 生成类目和图例
  let categories = [...new Set(xkContext.value.chartData.series[0].data.map((x) => {
    return x.category
  }))] // 将类型去重
  xkContext.value.chartData.series[0].categories = categories.map((x) => {
    return { 'name': x }
  })
  xkContext.value.chartData.legend[0].data = categories.map((x) => {
    return x
  })

  // 更新选择下拉框类目
  categoryItems.value = categories

  // 更新图表
  chartInstance.setOption(xkContext.value.chartData, {
    notMerge: true
  })
  saveNodeVisible.value = true
})

const onChangeAttr = () => {
  const [series] = xkContext.value.chartData.series
  const hasShowEdgeName = checkedValues.value.includes('showEdgeName') // 使用 includes 替代 indexOf 判断
  const hasDraggable = checkedValues.value.includes('draggable')

  series.edgeLabel = Object.assign({}, series.edgeLabel, {
    show: hasShowEdgeName,
    formatter: x => x.data.name
  })

  series.draggable = hasDraggable

  chartInstance.setOption({ series: [series] })

  saveNodeVisible.value = true
}

const onChangeRepulsion = () => {
  xkContext.value.chartData.series[0].force.repulsion = repulsion.value
  chartInstance.setOption(xkContext.value.chartData)
  saveNodeVisible.value = true
}

const shortcut = (event) => {
  // 统一转换为小写处理
  const key = event.key.toLowerCase()
  const isBodyEvent = event.target === document.body // 严格判断事件目标

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

    // 图表区域快捷键 (仅在BODY标签生效)
    'insert': {
      match: () => isBodyEvent && key === 'insert',
      action: () => triggerShortcut('create_node')
    },
    'delete': {
      match: () => isBodyEvent && key === 'delete',
      action: () => triggerShortcut('delete_node')
    },
    'ctrl+z': {
      match: () => isBodyEvent && event.ctrlKey && key === 'z',
      action: () => triggerShortcut('undo')
    },
    'ctrl+y': {
      match: () => isBodyEvent && event.ctrlKey && key === 'y',
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
    'save_file': saveFile,
    'save_as': saveAs,
    'create_node': createNode,
    'delete_node': deleteNode,
    'create_edge': createEdge,
    'delete_edge': deleteEdge,
    'undo': undo,
    'redo': redo
  }

  const actionName = shortcutActive.value
  if (actionName && actionMap[actionName]) {
    actionMap[actionName]()
  } else if (actionName) {
    console.warn(`未定义的快捷操作: ${actionName}`)
  }
})

const downplayAllHightlight = () => {
  // 收起所有高亮的节点
  highlightNodeList.value.forEach(node =>
    operateChart(node, 'node', 'downplay')
  )

  // 收起当前高亮的边（如果存在）
  const edgeIndex = currentEdgeDataIndex.value
  if (edgeIndex > -1) {
    operateChart(edgeIndex, 'edge', 'downplay')
  }
}

const resetRefData = () => {
  /**
   * 重置各种ref，配合侧边栏显示一块用
   */
  downplayAllHightlight()
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

const clickChart = event => {
  console.log(event)
  resetSider()
  attributeVisible.value = false

  const handleNodeClick = () => {
    currentNodeVisible.value = true
    currentNode.value = jsonReactive(event.data)
    newNode.value.symbolSize = currentNode.value.symbolSize
    currentNodeDataIndex.value = event.dataIndex

    const currentIndex = highlightNodeList.value.indexOf(event.dataIndex)
    const hasHighlight = currentIndex !== -1
    const maxSelections = 2

    // 处理已高亮节点的点击
    if (hasHighlight) {
      operateChart(event.dataIndex, 'node', 'downplay')
      highlightNodeList.value.splice(currentIndex, 1)
      return
    }

    // 处理新节点高亮
    if (highlightNodeList.value.length < maxSelections) {
      highlightNodeList.value.push(event.dataIndex)
      operateChart(event.dataIndex, 'node', 'highlight')
    } else {
      // 替换最早的高亮节点
      const [oldIndex] = highlightNodeList.value
      operateChart(oldIndex, 'node', 'downplay')
      highlightNodeList.value = [highlightNodeList.value[1], event.dataIndex]
      operateChart(event.dataIndex, 'node', 'highlight')
    }
  }

  const handleEdgeClick = () => {
    currentEdgeVisible.value = true
    currentEdge.value = jsonReactive(event.data)
    currentEdgeDataIndex.value = event.dataIndex

    const isNewEdge = highlightEdge !== event.dataIndex
    if (highlightEdge !== null) {
      // 如果点击的不是当前高亮的边，将当前高亮的边取消高亮
      operateChart(highlightEdge, 'edge', 'downplay')
    }
    highlightEdge = isNewEdge ? event.dataIndex : null

    if (highlightEdge !== null) {
      operateChart(highlightEdge, 'edge', 'highlight')
    }
  }

  if (event.dataType === 'node') {
    handleNodeClick()
  } else if (event.dataType === 'edge') {
    handleEdgeClick()
  }

  if (!siderVisible.value) {
    switchSider()
  }
}

const operateChart = (dataIndex, dataType, action) => {
  /**
   * 操作图表内的节点，根据数据类型和位置来高亮或者去除高亮
   */
  chartInstance.dispatchAction({
    type: action,
    seriesIndex: 0,
    dataType: dataType,
    dataIndex: dataIndex
  })
}

const resizeChart = () => {
  chartInstance.resize()
}

const switchSider = () => {
  // 当侧边栏收起的时候，直接点击图表，就回唤起侧边栏，这种情况下不能清空侧壁栏
  siderVisible.value = !siderVisible.value // 切换侧边栏的显示状态
  echartsWidth.value = siderVisible.value ? `calc(100vw - ${270}px)` : '100vw'
  // 使用 nextTick 等待DOM更新完成后执行resize
  nextTick(resizeChart)
}

const toggleSider = () => {
  /**
   * 显示或者关闭侧边栏
   */
  const SIDER_WIDTH = 270
  const wasAttributeVisible = attributeVisible.value
  switchSider()
  // 如果是从打开到收起，一定会清空图表
  // 如果是从收起到打开，应该打开attributeVisible，同样清空图表
  resetRefData()
  resetSider()

  if (!wasAttributeVisible) {
    siderVisible.value = true
    echartsWidth.value = `calc(100vw - ${SIDER_WIDTH}px)`
    nextTick(resizeChart)
    return
  }

  if (!siderVisible.value) {
    downplayAllHightlight()
  }
}

const saveFile = () => {
  /**
   * 实现文件保存，electronAPI详见/src/preload/index.js
   */
  console.log('save file')
  window.electronAPI.sendAct('save_file')
  window.electronAPI.sendData({ path: filePath, file: jsonReactive(xkContext.value.chartData) })
  resetSider()
  resetRefData()
}

const saveAs = () => {
  /**
   * 实现文件另存为，electronAPI详见/src/preload/index.js
   */
  console.log('save as')
  window.electronAPI.sendAct('save_as')
  window.electronAPI.sendData({ path: filePath, file: jsonReactive(xkContext.value.chartData) })
  resetSider()
  resetRefData()
}

window.electronAPI.receiveAct((act) => {
  const actionHandlers = {
    save_success: () => {
      saveNodeVisible.value = false
    },

    save_failure: () => {
      saveNodeVisible.value = true
    },

    quit: () => {
      const hasUnsavedChanges = saveNodeVisible.value
      window.electronAPI.sendAct(hasUnsavedChanges ? 'unsaved' : 'saved')
    },

    save_file: () => {
      saveFile()
    }
  }

  actionHandlers[act]()
})

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
      xkContext.value.chartData.series[0].data = xkContext.value.chartData.series[0].data
        .filter(node => node.name !== currentHistory.data.name)
    },

    changeNode: () => {
      const nodeIndex = xkContext.value.chartData.series[0].data
        .findIndex(node => node.name === currentHistory.new.name)

      if (nodeIndex > -1) {
        // 还原节点数据
        xkContext.value.chartData.series[0].data[nodeIndex] = currentHistory.old

        // 更新关联的边
        if (currentHistory.new.name !== currentHistory.old.name) {
          xkContext.value.chartData.series[0].links.forEach(link => {
            if (link.source === currentHistory.new.name) link.source = currentHistory.old.name
            if (link.target === currentHistory.new.name) link.target = currentHistory.old.name
          })
        }
      }
    },

    deleteNode: () => {
      xkContext.value.chartData.series[0].data.push(currentHistory.data)
      xkContext.value.chartData.series[0].links.push(...currentHistory.links)
    },

    createEdge: () => {
      xkContext.value.chartData.series[0].links = xkContext.value.chartData.series[0].links
        .filter(link =>
          link.source !== currentHistory.data.source ||
          link.target !== currentHistory.data.target
        )
    },

    changeEdge: () => {
      const edgeIndex = xkContext.value.chartData.series[0].links
        .findIndex(link =>
          link.source === currentHistory.new.source &&
          link.target === currentHistory.new.target
        )

      if (edgeIndex > -1) {
        xkContext.value.chartData.series[0].links[edgeIndex] = currentHistory.old
      }
    },

    deleteEdge: () => {
      xkContext.value.chartData.series[0].links.push(currentHistory.data)
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
      xkContext.value.chartData.series[0].data.push(currentHistory.data)
    },

    changeNode: () => {
      const seriesData = xkContext.value.chartData.series[0].data
      const nodeIndex = seriesData.findIndex(n => n.name === currentHistory.old.name)

      if (nodeIndex > -1) {
        seriesData[nodeIndex] = currentHistory.new

        // 更新关联边名称
        if (currentHistory.new.name !== currentHistory.old.name) {
          xkContext.value.chartData.series[0].links.forEach(link => {
            if (link.source === currentHistory.old.name) link.source = currentHistory.new.name
            if (link.target === currentHistory.old.name) link.target = currentHistory.new.name
          })
        }
      }
    },

    deleteNode: () => {
      const series = xkContext.value.chartData.series[0]

      series.data = series.data.filter(n => n.name !== currentHistory.data.name)
      series.links = series.links.filter(l =>
        l.source !== currentHistory.data.name &&
        l.target !== currentHistory.data.name
      )
    },

    createEdge: () => {
      xkContext.value.chartData.series[0].links.push(currentHistory.data)
    },

    changeEdge: () => {
      const links = xkContext.value.chartData.series[0].links
      const edgeIndex = links.findIndex(l =>
        l.source === currentHistory.old.source &&
        l.target === currentHistory.old.target
      )

      if (edgeIndex > -1) {
        links[edgeIndex] = currentHistory.new
      }
    },

    deleteEdge: () => {
      xkContext.value.chartData.series[0].links =
        xkContext.value.chartData.series[0].links.filter(l =>
          l.source !== currentHistory.data.source ||
          l.target !== currentHistory.data.target
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
  echartsWidth.value = siderVisible.value ? `calc(100vw - ${270}px)` : '100vw'
  createNodeVisible.value = true
  nextTick(resizeChart)
}

const deleteNode = () => {
  /**
   * 删除节点
   */
  if (currentNodeDataIndex.value < 0) return

  const currentSeries = xkContext.value.chartData.series[0]
  const deletedNode = currentSeries.data[currentNodeDataIndex.value]

  // 更新历史记录
  const newHistory = {
    'act': 'deleteNode',
    'data': jsonReactive(deletedNode),
    'links': currentSeries.links.filter(link =>
      link.source === deletedNode.name || link.target === deletedNode.name
    )
  }

  xkContext.value.historySequenceNumber++
  xkContext.value.historyList.push(newHistory)

  // 使用 filter 替代循环
  currentSeries.data = currentSeries.data.filter(
    (_, index) => index !== currentNodeDataIndex.value
  )

  // 过滤保留不相关的边
  currentSeries.links = currentSeries.links.filter(
    link => link.source !== deletedNode.name && link.target !== deletedNode.name
  )

  xkContext.value.updateChart = !xkContext.value.updateChart

  resetSider()
  resetRefData()
}

const createEdge = () => {
  /**
   * 创建新连接
   */
  const SIDER_WIDTH = 270;
  resetSider()
  attributeVisible.value = false
  siderVisible.value = true // 切换侧边栏的显示状态
  echartsWidth.value = siderVisible.value ? `calc(100vw - ${SIDER_WIDTH}px)` : '100vw'
  createEdgeVisible.value = true
  nextTick(resizeChart)
}

const deleteEdge = () => {
  /**
   * 删除连接
   */
  if (currentEdgeDataIndex.value < 0) return

  const series = xkContext.value.chartData.series[0]
  xkContext.value.historyList.push({
    'act': 'deleteEdge',
    'data': jsonReactive(series.links[currentEdgeDataIndex.value])
  })
  xkContext.value.historySequenceNumber = xkContext.value.historyList.length - 1

  // 删除连接
  xkContext.value.chartData.series[0].links = series.links.filter(
    (_, index) => index !== currentEdgeDataIndex.value
  )

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

const contentStyle = {
  textAlign: 'center',
  minHeight: 120,
  lineHeight: '120px',
  backgroundColor: '#ffffff',
  width: echartsWidth.value
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
  //font: 13px sans-serif;
  border-bottom: 1px solid rgba(5, 5, 5, 0.06);
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
  border-bottom: 1px solid rgba(5, 5, 5, 0.06);
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
  border-bottom: 1px solid rgba(5, 5, 5, 0.06);
}

.no-move-button {
  -webkit-app-region: no-drag;
  height: 25px !important;
}

.footer-style {
  padding: 0 !important;
  text-align: center;
  background-color: #f5f5f5;
  height: 33px !important;
  border-top: 1px solid rgba(5, 5, 5, 0.06);
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
  border-bottom: 1px solid rgba(5, 5, 5, 0.06);
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
