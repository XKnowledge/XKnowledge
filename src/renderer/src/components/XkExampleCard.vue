<template>
  <div
    :class="['xk-example-card', { selected }]"
    @click="$emit('select')"
    @dblclick="$emit('open')"
  >
    <div class="name" :title="example.title">{{ example.title }}</div>
    <div class="dots">
      <!-- 色点按本图谱类型集合顺延分配：卡片配色与打开后一致。
           封顶 MAX_DOTS 个防挤爆卡片（合并大图分类可达 75 个），
           超出部分收进末尾 +N 点，悬停 title 可看全部剩余分类名 -->
      <span
        v-for="c in shownCategories"
        :key="c"
        class="dot"
        :style="{ background: catColor(c) }"
        :title="c"
      />
      <span
        v-if="example.categories.length > MAX_DOTS"
        class="dot dot-more"
        :title="example.categories.slice(MAX_DOTS).join('、')"
      >
        +{{ example.categories.length - MAX_DOTS }}
      </span>
    </div>
    <div class="stats">{{ example.nodeCount }} 节点 · {{ example.linkCount }} 边</div>
    <div class="desc" :title="example.description">{{ example.description }}</div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { assignCategoryColors } from '../utils/categoryColor'

const props = defineProps({
  example: {
    type: Object,
    required: true
  },
  selected: {
    type: Boolean,
    default: false
  }
})

defineEmits(['select', 'open'])

/** 色点封顶：卡片宽 200px 每行约 11 点，18 个恰两行不挤 stats/desc */
const MAX_DOTS = 18
const shownCategories = computed(() => props.example.categories.slice(0, MAX_DOTS))

/** 色点按本图谱类型集合顺延分配：卡片配色与打开后的图内一致 */
const categoryColors = computed(() => assignCategoryColors(props.example.categories))
const catColor = (c) => categoryColors.value.get(String(c ?? ''))
</script>

<style scoped>
.xk-example-card {
  width: 200px;
  height: 150px;
  padding: 14px 12px 10px;
  border: 1px solid var(--xk-card-border);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  cursor: pointer;
  user-select: none;
  background: var(--xk-bg);
  /* BasicLayout 的 contentStyle 行内 lineHeight:120px 会继承进来，
     不重置时 stats 撑 120px 高、name/desc 被 flex 压到 0 高而不可见 */
  line-height: 1.4;
  /* 图库 207 张卡片时视口外的整卡渲染（布局+绘制）是大头：卡片固定
     200×150，用 content-visibility 让浏览器跳过视口外渲染、以
     intrinsic 尺寸占位，配合 AddView 的分帧挂载消除长帧 */
  content-visibility: auto;
  contain-intrinsic-size: 200px 150px;
}

.xk-example-card:hover {
  border-color: var(--xk-border-strong);
}

.xk-example-card.selected {
  border-color: var(--xk-accent);
  box-shadow: 0 0 0 1px var(--xk-accent);
}

.name {
  font-size: 15px;
  font-weight: 600;
  color: var(--xk-text);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dots {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 5px;
  margin: 10px 0 8px;
  max-width: 100%;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* +N 溢出提示点：小胶囊样式，与色点同行同高 */
.dot-more {
  width: auto;
  min-width: 10px;
  height: 10px;
  border-radius: 5px;
  padding: 0 4px;
  background: var(--xk-border-strong);
  color: var(--xk-text-secondary);
  font-size: 9px;
  line-height: 10px;
  text-align: center;
}

.stats {
  font-size: 12px;
  color: var(--xk-text-secondary);
}

.desc {
  margin-top: 6px;
  font-size: 12px;
  color: var(--xk-text-secondary);
  max-width: 100%;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
</style>
