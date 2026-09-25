<template>
  <div v-if="open" class="world-search">
    <div class="world-search-bar">
      <input
        ref="inputRef"
        class="world-search-input"
        type="text"
        :value="keyword"
        placeholder="搜索全库节点：名称 / 描述"
        @input="$emit('keyword', $event.target.value)"
        @keydown.enter.prevent="$emit('next')"
        @keydown.down.prevent="$emit('next')"
        @keydown.up.prevent="$emit('prev')"
        @keydown.esc="$emit('close')"
      />
      <span class="world-search-count">{{ hitTotal ? `${activeIndex + 1}/${hitTotal}` : '' }}</span>
      <button class="world-search-close" title="关闭 (Esc)" @click="$emit('close')">✕</button>
    </div>
    <div v-if="hits.length" class="world-search-list">
      <!-- mousedown.prevent：点列表项不让输入框失焦（点完还能继续 Enter） -->
      <div
        v-for="(hit, i) in hits"
        :key="`${hit.graphId}|${hit.name}`"
        class="world-search-item"
        :class="{ 'world-search-item-active': i === activeIndex }"
        @click="$emit('select', i)"
        @mousedown.prevent
      >
        <span class="world-search-graph">{{ hit.graphTitle }}</span>
        <span class="world-search-sep">›</span>
        <span class="world-search-name">{{ hit.name }}</span>
        <span class="world-search-des">{{ hit.des }}</span>
      </div>
      <div v-if="hitTotal > hits.length" class="world-search-more">…共 {{ hitTotal }} 个命中</div>
    </div>
    <div v-else-if="keyword" class="world-search-empty">无匹配节点</div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

defineProps({
  open: { type: Boolean, default: false },
  keyword: { type: String, default: '' },
  // 已截断的前 100 项（同 XkGraphSearch 策略），hitTotal 才是真实总数
  hits: { type: Array, default: () => [] },
  hitTotal: { type: Number, default: 0 },
  activeIndex: { type: Number, default: 0 }
})
defineEmits(['keyword', 'next', 'prev', 'select', 'close'])

const inputRef = ref(null)
defineExpose({ focus: () => inputRef.value?.focus() })
</script>

<style scoped>
.world-search {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 420px;
  max-width: calc(100% - 32px);
  background: var(--xk-float-bg);
  border: 1px solid var(--xk-border-strong);
  border-radius: 6px;
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.15);
  font: 13px sans-serif;
  z-index: 4;
}
.world-search-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
}
.world-search-input {
  flex: 1;
  border: none;
  outline: none;
  font: 13px sans-serif;
}
.world-search-count {
  color: var(--xk-text-secondary);
  white-space: nowrap;
}
.world-search-close {
  border: none;
  background: none;
  cursor: pointer;
  color: var(--xk-text-secondary);
  padding: 2px 4px;
}
.world-search-close:hover {
  color: var(--xk-text);
}
.world-search-list {
  max-height: 260px;
  overflow-y: auto;
  border-top: 1px solid var(--xk-card-border);
}
.world-search-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  cursor: pointer;
}
.world-search-item:hover {
  background: var(--xk-hover);
}
.world-search-item-active {
  background: var(--xk-search-active-bg);
}
.world-search-graph {
  color: var(--xk-text-secondary);
  white-space: nowrap;
}
.world-search-sep {
  color: var(--xk-text-secondary);
}
.world-search-name {
  white-space: nowrap;
  font-weight: 500;
}
.world-search-des {
  color: var(--xk-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}
.world-search-more,
.world-search-empty {
  padding: 5px 10px;
  color: var(--xk-text-secondary);
}
</style>
