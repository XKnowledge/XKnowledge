<template>
  <div class="inner-div">
    <div class="content">
      <a-typography-title :level="2">示例图库</a-typography-title>
      <a-empty v-if="!loading && examples.length === 0" description="暂无示例" />
      <a-space v-else :size="[8, 16]" wrap>
        <XkExampleCard
          v-for="ex in examples"
          :key="ex.fileName"
          :example="ex"
          :selected="ex.fileName === selected"
          @select="selected = ex.fileName"
          @open="openExampleChart(ex)"
        />
      </a-space>
    </div>
    <!-- 「打开本地文件」按钮（左下角）的正上方，固定常驻不受滚动影响 -->
    <div class="back-home">
      <a-button @click="router.push('/')">
        <template #icon><LeftOutlined /></template>
        返回首页
      </a-button>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { LeftOutlined } from '@ant-design/icons-vue'

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

/**
 * 双击打开示例：与首页"打开本地文件"同一装载机制（同窗口跳转）。
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
/* 「打开本地文件」(#uploadFile) 按钮底边固定在视口底上方约 16px、
   顶边约 46px 处；此处 bottom = 46px 顶边 + 8px 间距 = 54px。
   flex 布局避免继承侧边栏 line-height:120px 撑高行盒；
   宽度 200px 对齐侧边栏，按钮水平居中与其下方的上传按钮对齐。 */
.back-home {
  position: fixed;
  left: 0;
  bottom: 54px;
  width: 200px;
  display: flex;
  justify-content: center;
}

.content {
  padding-top: 10px;
  padding-left: 30px;
  padding-right: 30px;
}

.inner-div {
  overflow: auto;
  height: 100%;
  width: calc(100% - 2px);
}

.inner-div::-webkit-scrollbar-track {
  background: #ffffff;
}

.inner-div::-webkit-scrollbar-thumb {
  background: #e5e5e5;
}

.inner-div::-webkit-scrollbar-button {
  display: none;
}

.inner-div::-webkit-scrollbar-thumb:hover {
  background: #b2b2b2;
}

.inner-div::-webkit-scrollbar-corner {
  background: #f1f1f1;
}
</style>
