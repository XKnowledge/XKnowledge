<template>
  <div class="inner-div">
    <div class="content">
      <a-typography-title :level="2">示例图库</a-typography-title>
      <a-space :size="[8, 16]" wrap>
        <!-- 首卡：空框，单击新建空白文件 -->
        <div class="new-blank-card" title="新建空白文件" @click="createBlankFile">
          <PlusOutlined class="new-blank-icon" />
          <div>新建空白文件</div>
        </div>
        <XkExampleCard
          v-for="ex in examples"
          :key="ex.fileName"
          :example="ex"
          :selected="ex.fileName === selected"
          @select="selected = ex.fileName"
          @open="openExampleChart(ex)"
        />
      </a-space>
      <a-empty v-if="!loading && examples.length === 0" description="暂无示例" />
    </div>
  </div>
</template>

<script setup>
import { PlusOutlined } from '@ant-design/icons-vue'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'

import XkExampleCard from '../components/XkExampleCard.vue'
import { setPendingChart } from '../store/chartStore'

const router = useRouter()

const examples = ref([])
const loading = ref(true)
const selected = ref('')

onMounted(async () => {
  try {
    const res = await window.electronAPI.listExamples()
    examples.value = res.examples ?? []
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
