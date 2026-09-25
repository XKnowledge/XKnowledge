<template>
  <a-layout style="height: 100vh">
    <a-layout-header class="world-header">
      <a-button size="small" @click="router.push('/')">← 返回</a-button>
      <span class="world-title">世界图</span>
      <a-button size="small" :loading="loading" @click="loadIndex">刷新世界</a-button>
      <a-button size="small" @click="pickUserDir">图库目录</a-button>
      <span class="world-tip">Ctrl+F 搜索全库</span>
    </a-layout-header>
    <a-layout-content class="world-content">
      <a-spin v-if="loading" class="world-loading" />
      <a-empty v-else-if="!index?.graphs?.length" class="world-loading" description="世界为空" />
      <XkWorldGraph
        v-else
        ref="graphRef"
        :scene="scene"
        :expanded="worldState.expanded"
        @node-click="onNodeClick"
      />
      <!-- 已展开域浮动列表：逐个收拢 + 全部收拢 -->
      <div v-if="expandedList.length" class="world-expanded-bar">
        <a-tag v-for="g in expandedList" :key="g.id" closable @close="collapse(g.id)">
          {{ g.title }}
        </a-tag>
        <a-button size="small" @click="collapseAll">全部收拢</a-button>
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
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
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
  searchWorldNodes
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
  if (payload.__kind !== 'graph') return // 展开域节点点击：MVP 无动作
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
  try {
    const res = await window.electronAPI.worldSetUserDir('pick')
    if (res.ok) {
      message.success('图库目录已更新')
      await loadIndex()
    }
  } catch (err) {
    console.error('设置图库目录失败', err)
    message.error('设置图库目录失败')
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
  await loadIndex()
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<style scoped>
.world-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 16px;
  height: 44px !important;
  line-height: 44px;
  background-color: var(--xk-bg-layout);
  border-bottom: 1px solid var(--xk-border);
}
.world-title {
  font-weight: 600;
}
.world-tip {
  margin-left: auto;
  color: var(--xk-text-secondary);
  font: 12px sans-serif;
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
</style>
