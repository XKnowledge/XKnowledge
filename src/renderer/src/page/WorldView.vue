<template>
  <a-layout style="height: 100vh">
    <a-layout-header class="world-header">
      <a-button size="small" @click="router.push('/')">关闭</a-button>
      <a-button size="small" :loading="loading" @click="loadIndex">刷新</a-button>
      <a-button size="small" :disabled="picking" @click="pickUserDir">图库目录</a-button>
    </a-layout-header>
    <a-layout-content class="world-content">
      <a-spin v-if="loading" class="world-loading" />
      <a-empty v-else-if="!index?.graphs?.length" class="world-loading" description="世界为空" />
      <XkWorldGraph
        v-else
        ref="graphRef"
        :scene="scene"
        :expanded="worldState.expanded"
        :focus-node-ids="focusNodeIds"
        :focus-deep="focusMode === 'deep'"
        :search-hit-ids="searchHitIds"
        @node-click="onNodeClick"
      />
      <!-- 已展开域浮动列表：逐个收拢 + 全部收拢 -->
      <div v-if="expandedList.length" class="world-expanded-bar">
        <a-tag v-for="g in expandedList" :key="g.id" closable @close="collapse(g.id)">
          {{ g.title }}
        </a-tag>
        <a-button size="small" @click="collapseAll">全部收拢</a-button>
      </div>
      <!-- 视图调节：排斥力 + 聚焦模式（会话级浮动卡片，默认收起）。
           data-focus-node/data-focus-mode 是冒烟断言锚点（同图表页 focus-row） -->
      <div
        v-if="!loading"
        class="world-view-panel"
        :data-focus-node="focusNodeId"
        :data-focus-mode="focusMode"
      >
        <a-button v-if="!viewPanelOpen" size="small" @click="viewPanelOpen = true">视图</a-button>
        <div v-else class="world-view-panel-body">
          <div class="world-view-panel-head">
            <span>视图调节</span>
            <button class="world-view-panel-fold" title="收起" @click="viewPanelOpen = false">
              −
            </button>
          </div>
          <div class="world-view-panel-row">
            <span class="world-view-label">排斥力</span>
            <a-slider
              v-model:value="repulsion"
              class="world-view-slider"
              :min="1"
              :max="500"
              @change="onChangeRepulsion"
            />
            <a-input-number
              v-model:value="repulsion"
              :min="1"
              :max="500"
              size="small"
              class="world-view-number"
              @change="onChangeRepulsion"
            />
          </div>
          <div class="world-view-panel-row">
            <span class="world-view-label">聚焦</span>
            <a-select
              v-model:value="focusMode"
              size="small"
              class="world-view-select"
              :options="[
                { value: 'off', label: '关闭' },
                { value: 'focus', label: '灰化' },
                { value: 'deep', label: '隐藏' }
              ]"
              @change="onFocusModeChange"
            />
            <span class="world-view-label">跳数</span>
            <a-select
              v-model:value="focusHops"
              size="small"
              class="world-view-hops"
              :disabled="focusMode === 'off'"
              :options="[
                { value: 1, label: '1' },
                { value: 2, label: '2' },
                { value: 3, label: '3' }
              ]"
            />
          </div>
        </div>
      </div>
      <!-- 超节点信息卡：展开 / 打开完整编辑 -->
      <a-drawer v-model:open="cardOpen" :title="selected?.title" width="320px">
        <p v-if="selected">
          节点 {{ selected.nodeCount }} 个 · 来源：{{
            selected.source === 'example' ? '内置示例' : '用户图库'
          }}
        </p>
        <a-space direction="vertical" style="width: 100%">
          <a-button type="primary" block :loading="expanding" @click="expand(selected?.id)">
            展开此图
          </a-button>
          <a-button block @click="openFull(selected)">打开完整编辑</a-button>
        </a-space>
      </a-drawer>
      <XkWorldSearch
        ref="searchRef"
        :open="searchOpen"
        :keyword="searchKeyword"
        :hits="slicedHits"
        :hit-total="hits.length"
        :active-index="searchActiveIdx"
        @keyword="onKeyword"
        @next="goToHit(searchActiveIdx + 1)"
        @prev="goToHit(searchActiveIdx - 1)"
        @select="goToHit"
        @close="closeSearch"
      />
    </a-layout-content>
  </a-layout>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import XkWorldGraph from '../components/XkWorldGraph.vue'
import XkWorldSearch from '../components/XkWorldSearch.vue'
import { setPendingChart } from '../store/chartStore'
import {
  createWorldState,
  applyExpansion,
  applyCollapse,
  worldScene,
  searchWorldNodes,
  worldFocusNeighborhood,
  defaultFocusNodeId
} from '../utils/worldGraph.js'

const router = useRouter()

const index = ref(null) // worldLoadIndex 原始返回
const worldState = ref(createWorldState([], []))
const loading = ref(true)
const scene = computed(() => worldScene(worldState.value))
const graphsById = computed(() => new Map((index.value?.graphs ?? []).map((g) => [g.id, g])))
const expandedList = computed(() =>
  Object.keys(worldState.value.expanded)
    .map((id) => graphsById.value.get(id))
    .filter(Boolean)
)

const graphRef = ref(null)
const searchRef = ref(null)
const cardOpen = ref(false)
const selected = ref(null)
const expanding = ref(false)
const picking = ref(false)

// 图内搜索（会话级，同图表页语义：不写盘、换页即弃）
const searchOpen = ref(false)
const searchKeyword = ref('')
const hits = ref([])
const searchActiveIdx = ref(0)
const SEARCH_LIST_LIMIT = 100
const slicedHits = computed(() => hits.value.slice(0, SEARCH_LIST_LIMIT))

const recomputeSearch = () => {
  hits.value = searchWorldNodes(index.value?.nodes ?? [], graphsById.value, searchKeyword.value)
  searchActiveIdx.value = 0
}
const onKeyword = (v) => {
  searchKeyword.value = v
  recomputeSearch()
}
const closeSearch = () => {
  searchOpen.value = false
  searchKeyword.value = ''
  recomputeSearch()
}

// 视图调节（会话级，不写盘）：排斥力 + 聚焦模式（同图表页语义，按场景 id）
const viewPanelOpen = ref(false)
const repulsion = ref(100)
const focusMode = ref('off') // off 关闭 / focus 灰化（邻域外退灰）/ deep 隐藏
// 默认 1 跳：世界是小世界网络（缝合紧密），从度数最高枢纽出发 2 跳即
// 覆盖 44% 的图（实测 135/310）、3 跳 72%——探照灯照大半个世界等于没照；
// 1 跳 = 焦点图 + 直连缝合邻居，才有聚光效果（图表页默认 2 跳不适用）
const focusHops = ref(1)
const focusNodeId = ref('')
const focusNodeIds = computed(() => {
  if (focusMode.value === 'off' || !focusNodeId.value) return []
  return [...worldFocusNeighborhood(scene.value, focusNodeId.value, focusHops.value)]
})
// 搜索命中 id 豁免深度隐藏（找到了就该看见，跳转不飞空处）
const searchHitIds = computed(() =>
  searchOpen.value ? hits.value.map((h) => `${h.graphId}|${h.name}`) : []
)

const onChangeRepulsion = () => {
  graphRef.value?.setRepulsion(repulsion.value)
}

/** 开启聚焦的默认焦点：当前选中超节点（信息卡，须仍在场景中）→ 度数最高 */
const pickDefaultFocus = () => {
  const sel = selected.value
  if (sel && scene.value.nodes.some((n) => n.id === sel.id)) return sel.id
  return defaultFocusNodeId(scene.value.nodes, scene.value.links)
}

/** 模式切换（取 change 新值：antdv select 的 update:value 触发顺序无契约） */
const onFocusModeChange = (mode) => {
  focusNodeId.value = mode === 'off' ? '' : pickDefaultFocus()
}

// 焦点随场景消失（收拢其域/刷新）：回退默认焦点，探照灯不灭（同图表页）
watch(
  () => scene.value.nodes,
  (nodes) => {
    if (focusMode.value === 'off' || !focusNodeId.value) return
    if (!nodes.some((n) => n.id === focusNodeId.value)) {
      focusNodeId.value = defaultFocusNodeId(nodes, scene.value.links)
    }
  }
)

const loadIndex = async () => {
  loading.value = true
  try {
    const res = await window.electronAPI.worldLoadIndex()
    if (res.brokenCount) {
      message.warning(`世界索引：${res.brokenCount} 个损坏文件已跳过`)
    }
    // spec §6：用户目录配置了却没扫到图（不存在/无权限/为空）须有界面提示，
    // 否则选错目录的用户只看到无声的空操作
    if (res.userDir && !res.graphs.some((g) => g.source === 'user')) {
      message.warning(`图库目录未发现任何图谱：${res.userDir}`)
    }
    index.value = res
    worldState.value = createWorldState(res.graphs, res.stitches)
  } catch (err) {
    console.error('世界索引加载失败', err)
    message.error('世界索引加载失败')
  } finally {
    loading.value = false
  }
}

/** 展开一域：锚点 = 超节点当前 d3 坐标（未布局时兜底原点） */
const expand = async (graphId) => {
  if (!graphId || worldState.value.expanded[graphId]) return
  expanding.value = true
  try {
    const { content } = await window.electronAPI.worldReadGraph(graphId)
    const anchor = graphRef.value?.superNodeCoords(graphId) ?? { x: 0, y: 0, z: 0 }
    worldState.value = applyExpansion(worldState.value, graphId, JSON.parse(content), anchor)
  } catch (err) {
    console.error('展开失败', err)
    message.error('展开失败：文件读取失败或已损坏')
  } finally {
    expanding.value = false
  }
}

const collapse = (graphId) => {
  worldState.value = applyCollapse(worldState.value, graphId)
}

const collapseAll = () => {
  let s = worldState.value
  for (const id of Object.keys(s.expanded)) s = applyCollapse(s, id)
  worldState.value = s
}

const onNodeClick = (payload) => {
  // 聚焦模式：点击只移焦点，不弹信息卡——抽屉自带全屏遮罩，会把后续
  // 连续点击吃掉（点画布变成关抽屉，到不了节点）；关聚焦后点击即可打开信息卡
  if (focusMode.value !== 'off') {
    focusNodeId.value = payload.id
    return
  }
  if (payload.__kind !== 'graph') return // 展开域节点点击：无其他动作
  selected.value = payload
  cardOpen.value = true
}

/**
 * 打开完整编辑（spec §5.1）：示例走同窗口副本语义（path 置空走另存，
 * 与首页打开示例同流）；用户图走新窗口直存回原路径——世界会话
 * （展开域/视角）不被打断
 */
const openFull = async (g) => {
  if (!g) return
  try {
    const { content } = await window.electronAPI.worldReadGraph(g.id)
    if (g.source === 'example') {
      setPendingChart({ value: content, path: '' })
      router.push('/chart')
    } else {
      await window.electronAPI.newChartWindow({ content, path: g.id })
    }
  } catch (err) {
    console.error('打开失败', err)
    message.error('打开失败：文件读取失败或已损坏')
  }
}

/** 搜索跳转：未展开先自动展开（唯一自动展开例外），飞相机带重试兜底 */
const goToHit = async (idx) => {
  if (!hits.value.length) return
  searchActiveIdx.value = (idx + hits.value.length) % hits.value.length
  const hit = hits.value[searchActiveIdx.value]
  await expand(hit.graphId)
  const nodeId = `${hit.graphId}|${hit.name}`
  for (let i = 0; i < 15; i++) {
    if (graphRef.value?.focusCamera([nodeId])) return
    await new Promise((r) => setTimeout(r, 200)) // 坐标未就绪：等布局给出有限坐标
  }
  graphRef.value?.focusCamera([hit.graphId]) // 3s 超时兜底：飞超节点锚点
}

const pickUserDir = async () => {
  // 选目录期间禁用按钮：主进程对话框对同窗口模态，但渲染层仍须防
  // 对话框弹出前的连点（每次 invoke 都会各开一个目录选择框）
  if (picking.value) return
  picking.value = true
  try {
    const res = await window.electronAPI.worldSetUserDir('pick')
    if (res.ok) {
      message.success('图库目录已更新')
      await loadIndex()
    }
  } catch (err) {
    console.error('设置图库目录失败', err)
    message.error('设置图库目录失败')
  } finally {
    picking.value = false
  }
}

const onKeydown = (event) => {
  if (event.ctrlKey && event.key.toLowerCase() === 'f') {
    event.preventDefault()
    if (!loading.value) {
      searchOpen.value = true
      nextTick(() => searchRef.value?.focus())
    }
  }
}

onMounted(async () => {
  window.addEventListener('keydown', onKeydown)
  // 通知主进程解锁窗口（最大化/最小化/缩放），与图表页的 enterChartMode 同构
  window.electronAPI.enterWorldMode().catch((err) => {
    console.error('进入世界树模式失败', err)
  })
  await loadIndex()
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  // 恢复窗口锁定（与挂载时的 enterWorldMode 对称）
  window.electronAPI.exitWorldMode().catch((err) => {
    console.error('退出世界树模式失败', err)
  })
})
</script>

<style scoped>
.world-header {
  display: flex;
  align-items: center;
  gap: 12px;
  /* ！important：BasicLayout 全局 .ant-layout-header{padding-inline:0!important}
     会清掉本页头部左右留白，使「关闭」贴死窗口左缘 */
  padding: 0 16px !important;
  height: 53px !important; /* 与图表页头部（.move-show/.move-header）一致 */
  line-height: 53px;
  background-color: var(--xk-bg-layout);
  border-bottom: 1px solid var(--xk-border);
  /* 与图表页头部一致：整条头部为窗口拖动区（titleBarStyle hidden 后拖动
     全靠 CSS 区域声明）；按钮须 no-drag 恢复点击，否则拖动语义吞掉 click */
  -webkit-app-region: drag;
}
.world-header .ant-btn {
  -webkit-app-region: no-drag;
}
.world-content {
  position: relative;
  background-color: var(--xk-bg);
}
.world-loading {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}
.world-expanded-bar {
  position: absolute;
  top: 52px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  max-width: 50%;
  background: var(--xk-float-bg);
  border: 1px solid var(--xk-border-strong);
  border-radius: 6px;
  padding: 6px 8px;
  font: 13px sans-serif;
  z-index: 2;
}
.world-view-panel {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 2;
}
.world-view-panel-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 248px;
  background: var(--xk-float-bg);
  border: 1px solid var(--xk-border-strong);
  border-radius: 6px;
  padding: 8px 10px;
  font: 13px sans-serif;
}
.world-view-panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
}
.world-view-panel-fold {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 15px;
  line-height: 1;
  padding: 0 2px;
}
.world-view-panel-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.world-view-label {
  flex-shrink: 0;
}
.world-view-slider {
  flex: 1;
  min-width: 0;
  margin: 0;
}
.world-view-number {
  width: 64px;
}
.world-view-select {
  width: 76px;
}
.world-view-hops {
  width: 56px;
}
</style>
