<template>
  <div v-if="open" class="graph-search">
    <div class="graph-search-bar">
      <input
        ref="inputRef"
        class="graph-search-input"
        type="text"
        :value="keyword"
        placeholder="搜索节点名/描述"
        @input="$emit('keyword', $event.target.value)"
        @keydown.enter.prevent="$emit('next')"
        @keydown.down.prevent="$emit('next')"
        @keydown.up.prevent="$emit('prev')"
        @keydown.esc="$emit('close')"
      />
      <span class="graph-search-count">{{ hitTotal ? `${activeIndex + 1}/${hitTotal}` : '' }}</span>
      <button class="graph-search-close" title="关闭 (Esc)" @click="$emit('close')">✕</button>
    </div>
    <div v-if="hits.length" class="graph-search-list">
      <!-- mousedown.prevent：点列表项不让输入框失焦（点完还能继续 Enter） -->
      <div
        v-for="(hit, i) in hits"
        :key="hit.name"
        class="graph-search-item"
        :class="{ 'graph-search-item-active': i === activeIndex }"
        @click="$emit('select', i)"
        @mousedown.prevent
      >
        <span class="graph-search-dot" :style="{ background: catColor(hit.category) }"></span>
        <span class="graph-search-name">
          <template v-for="(seg, j) in segments(hit.name)" :key="j">
            <mark v-if="seg.hit" class="graph-search-mark">{{ seg.text }}</mark>
            <template v-else>{{ seg.text }}</template>
          </template>
        </span>
        <span class="graph-search-des">
          <template v-for="(seg, j) in segments(hit.des)" :key="j">
            <mark v-if="seg.hit" class="graph-search-mark">{{ seg.text }}</mark>
            <template v-else>{{ seg.text }}</template>
          </template>
        </span>
      </div>
      <div v-if="hitTotal > hits.length" class="graph-search-more">…共 {{ hitTotal }} 个命中</div>
    </div>
    <div v-else-if="keyword" class="graph-search-empty">无匹配节点</div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  keyword: { type: String, default: '' },
  // 已截断的前 100 项（万级命中全渲染卡 UI），hitTotal 才是真实总数
  hits: { type: Array, default: () => [] },
  hitTotal: { type: Number, default: 0 },
  activeIndex: { type: Number, default: 0 },
  catColor: { type: Function, default: () => '#999' }
})

defineEmits(['keyword', 'next', 'prev', 'select', 'close'])

const inputRef = ref(null)
defineExpose({ focus: () => inputRef.value?.focus() })

/** 文本按关键词切分段（命中段标橙）：大小写不敏感，keyword 为空时整段返回 */
const segments = (text) => {
  const kw = String(props.keyword ?? '').trim().toLowerCase()
  const s = String(text ?? '')
  if (!kw || !s) return [{ text: s, hit: false }]
  const out = []
  let i = 0
  while (i < s.length) {
    const at = s.toLowerCase().indexOf(kw, i)
    if (at === -1) {
      out.push({ text: s.slice(i), hit: false })
      break
    }
    if (at > i) out.push({ text: s.slice(i, at), hit: false })
    out.push({ text: s.slice(at, at + kw.length), hit: true })
    i = at + kw.length
  }
  return out
}
</script>

<style scoped>
.graph-search {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 360px;
  max-width: calc(100% - 32px);
  background: #fff;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.15);
  font: 13px sans-serif;
  z-index: 4;
}

.graph-search-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
}

.graph-search-input {
  flex: 1;
  border: none;
  outline: none;
  font: 13px sans-serif;
}

.graph-search-count {
  color: #888;
  white-space: nowrap;
}

.graph-search-close {
  border: none;
  background: none;
  cursor: pointer;
  color: #888;
  padding: 2px 4px;
}

.graph-search-close:hover {
  color: #333;
}

.graph-search-list {
  max-height: 260px;
  overflow-y: auto;
  border-top: 1px solid #f0f0f0;
}

.graph-search-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  cursor: pointer;
}

.graph-search-item:hover {
  background: #f5f5f5;
}

.graph-search-item-active {
  background: #fff7e6; /* 命中色同系浅底 */
}

.graph-search-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
}

.graph-search-name {
  white-space: nowrap;
  font-weight: 500;
}

.graph-search-des {
  color: #888;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis; /* 描述单行截断 */
  flex: 1;
}

.graph-search-mark {
  color: #fa541c; /* 深橙红，与 SEARCH_ACTIVE_COLOR 同系 */
  background: none;
  padding: 0;
}

.graph-search-more,
.graph-search-empty {
  padding: 5px 10px;
  color: #888;
}
</style>
