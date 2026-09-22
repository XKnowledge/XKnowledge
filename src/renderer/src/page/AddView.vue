<template>
  <div class="inner-div">
    <div class="content">
      <div class="gallery-header">
        <a-typography-title :level="2">示例图库</a-typography-title>
        <a-input
          v-model:value="keyword"
          class="gallery-search"
          placeholder="搜索示例：标题 / 描述 / 分类"
          allow-clear
        >
          <template #prefix><SearchOutlined /></template>
        </a-input>
      </div>
      <a-space :size="[8, 16]" wrap>
        <!-- 首卡：空框，单击新建空白文件；搜索过滤时隐藏（此时意图是找示例） -->
        <div
          v-if="!keyword.trim()"
          class="new-blank-card"
          title="新建空白文件"
          @click="createBlankFile"
        >
          <PlusOutlined class="new-blank-icon" />
          <div>新建空白文件</div>
        </div>
        <XkExampleCard
          v-for="ex in visibleExamples"
          :key="ex.fileName"
          :example="ex"
          :selected="ex.fileName === selected"
          @select="selected = ex.fileName"
          @open="openExampleChart(ex)"
        />
      </a-space>
      <a-empty
        v-if="!loading && filteredExamples.length === 0"
        :description="keyword.trim() ? '无匹配的示例' : '暂无示例'"
      />
    </div>
  </div>
</template>

<script setup>
import { PlusOutlined, SearchOutlined } from '@ant-design/icons-vue'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'

import XkExampleCard from '../components/XkExampleCard.vue'
import { setPendingChart } from '../store/chartStore'
import { filterExamples } from '../utils/filterExamples'
import { sortExamples } from '../utils/sortExamples'

const router = useRouter()

const examples = ref([])
const loading = ref(true)
const selected = ref('')
const keyword = ref('')

/** 搜索过滤：标题/描述/分类子串匹配，空关键字即全量 */
const filteredExamples = computed(() => filterExamples(examples.value, keyword.value))

/* 分帧渲染：207 张卡片一次性挂载的 paint 是 200~350ms 的主线程长帧
   （页面无响应、掉帧——「新建空白卡先出、卡一下、卡片齐现」的观感来源，
   dev 模式更甚）。改为数据到手后首批 40 张（覆盖任意窗口的首屏视口：
   大屏 2560 宽每行 ~12 张 × 2 行视口 = 24 张，40 含余量；与虚线框几乎
   同帧可见），剩余每帧一批铺完，单帧稳定 ~100ms 内（64/帧实测会
   100~127ms 贴着可感线晃）。只服务初始装载；搜索结果必须即时全量
   （反馈不能等分帧）。 */
const BATCH = 40
const renderedCount = ref(Infinity)
let renderChainStopped = false

/** 实际进 DOM 的卡片：装载期分帧截断，其余阶段全量 */
const visibleExamples = computed(() => filteredExamples.value.slice(0, renderedCount.value))

watch(keyword, () => {
  // 搜索即时全量：结果集本就小，且反馈延迟比掉帧更伤
  renderChainStopped = true
  renderedCount.value = Infinity
})
onUnmounted(() => {
  renderChainStopped = true
})

onMounted(async () => {
  try {
    const res = await window.electronAPI.listExamples()
    // 载入即拼音序（展示层职责）：filterExamples 保序，搜索结果自动同序
    examples.value = sortExamples(res.examples ?? [])
    // 分帧启动：首批同帧可见，剩余逐帧铺完
    renderedCount.value = Math.min(BATCH, examples.value.length)
    renderChainStopped = false
    const renderNextBatch = () => {
      if (renderChainStopped || renderedCount.value >= examples.value.length) return
      renderedCount.value = Math.min(renderedCount.value + BATCH, examples.value.length)
      requestAnimationFrame(renderNextBatch)
    }
    requestAnimationFrame(renderNextBatch)
  } catch (err) {
    // 列表失败按空态处理，不弹错误框打扰首页浏览
    console.error('加载示例列表失败', err)
    examples.value = []
  } finally {
    loading.value = false
  }
})

/** 单击空框：空图模板同窗口进入图表页（未存盘，path 为空） */
const createBlankFile = () => {
  setPendingChart({ value: JSON.stringify({ version: 2, nodes: [], links: [] }), path: '' })
  router.push('/chart')
}

/**
 * 双击打开示例：与"打开本地文件"同一装载机制（同窗口跳转）。
 * 副本语义——path 置空，保存时现有逻辑自动弹"另存为"，
 * 安装包内示例只读，用户编辑的始终是自己的副本。
 */
const openExampleChart = async (ex) => {
  try {
    const { content } = await window.electronAPI.openExample({ fileName: ex.fileName })
    setPendingChart({ value: content, path: '' })
    router.push('/chart')
  } catch (err) {
    console.error('打开示例失败', err)
    // 不解析 err.message（跨 IPC 边界后文案不可靠），使用固定中文提示
    message.error('打开失败：文件读取失败或已损坏')
  }
}
</script>

<style scoped>
/* 首卡空框：尺寸对齐 XkExampleCard（200×150），
   line-height 重置理由同其注释——顶掉 BasicLayout 的 120px 行高 */
/* 标题行：标题在左，搜索框靠右同行；窄窗口放不下时换行不挤压 */
.gallery-header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 16px;
}

.gallery-search {
  margin-left: auto;
  width: 240px;
}

.new-blank-card {
  width: 200px;
  height: 150px;
  border: 1px dashed #c0c4cc;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  color: #8c8c8c;
  background: #ffffff;
  font-size: 13px;
  line-height: 1.4;
}

.new-blank-card:hover {
  border-color: #2e64d6;
  color: #2e64d6;
}

.new-blank-icon {
  font-size: 28px;
}

.content {
  padding-top: 10px;
  /* 上边距为 10px */
  padding-left: 30px;
  /* 左边距为 30px */
  padding-right: 30px;
  /* 右边距为 30px */
  padding-bottom: 30px;
  /* 底部留隙：滚到底后末行卡片不贴窗口底边。
     注：Chromium 滚动容器会截断末端 padding（CSS Overflow 规范允许），
     30px 实际视觉兑现约 13px（1.25 DPI 下约 16 物理像素），已确认够用 */
}

.inner-div {
  overflow: auto;
  /* 当内容超出容器尺寸时显示滚动条 */
  height: 100%;
  /* 例如，设置一个固定的高度 */
  width: calc(100% - 2px);
  /* 或者设置为父元素宽度的一部分 */
}

.inner-div::-webkit-scrollbar-track {
  background: #ffffff;
  /* 设置滚动条轨道背景颜色 */
}

.inner-div::-webkit-scrollbar-thumb {
  background: #e5e5e5;
  /* 设置滚动条滑块颜色 */
}

.inner-div::-webkit-scrollbar-button {
  display: none;
  /* 隐藏滚动条按钮 */
}

.inner-div::-webkit-scrollbar-thumb:hover {
  background: #b2b2b2;
  /* 设置滚动条滑块鼠标悬停时的颜色 */
}

.inner-div::-webkit-scrollbar-corner {
  background: #f1f1f1;
  /* 设置滚动条角落背景颜色 */
}
</style>
