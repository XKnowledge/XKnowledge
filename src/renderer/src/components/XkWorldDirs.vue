<template>
  <a-modal
    v-model:open="open"
    :title="$t('world.dirsTitle')"
    :footer="null"
    :width="520"
    :mask-closable="false"
    data-world-dirs
    @cancel="close"
  >
    <!-- 内置示例目录：置顶、只读展示（不可移除） -->
    <div class="world-dirs-row world-dirs-fixed">
      <span class="world-dirs-path" :title="examplesDirLabel">resources/examples</span>
      <span class="world-dirs-count">{{ $t('world.sourceExample') }}</span>
      <a-tag class="world-dirs-tag">{{ $t('world.dirsBuiltIn') }}</a-tag>
    </div>
    <!-- 用户目录列表：路径 + 收录图谱数 + 移除 -->
    <div v-for="d in userDirs" :key="d" class="world-dirs-row" data-world-dir-row>
      <span class="world-dirs-path" :title="d">{{ d }}</span>
      <span class="world-dirs-count">
        {{
          dirGraphCounts.has(d) ? $t('world.dirsGraphCount', { count: dirGraphCounts.get(d) }) : '—'
        }}
      </span>
      <a-button size="small" danger :loading="removing === d" @click="removeDir(d)">
        {{ $t('world.dirsRemove') }}
      </a-button>
    </div>
    <a-empty
      v-if="!userDirs.length"
      class="world-dirs-empty"
      :image-style="{ height: '40px' }"
      :description="$t('world.dirsEmpty')"
    />
    <a-button block class="world-dirs-add" :loading="picking" @click="addDir">
      {{ $t('world.dirsAdd') }}
    </a-button>
    <p class="world-dirs-hint">{{ $t('world.dirsHint') }}</p>
  </a-modal>
</template>

<script setup>
import { ref } from 'vue'
import { message } from 'ant-design-vue'
import { t } from '../i18n.js'

const emit = defineEmits(['changed'])

const open = ref(false)
const picking = ref(false)
const removing = ref('')
const userDirs = ref([])
/** 各目录收录图谱数（loadIndex 后由父级灌入） */
const dirGraphCounts = ref(new Map())

const examplesDirLabel = 'resources/examples'

const openDialog = (dirs, counts) => {
  userDirs.value = [...(dirs ?? [])]
  dirGraphCounts.value = counts ?? new Map()
  open.value = true
}
const close = () => {
  open.value = false
}

/** 增加目录：主进程模态选框选中即追加；取消静默（用户主动放弃） */
const addDir = async () => {
  if (picking.value) return
  picking.value = true
  try {
    const res = await window.electronAPI.worldSetUserDirs('pick')
    if (res.ok) {
      userDirs.value = res.userDirs
      emit('changed')
    } else if (res.reason === 'duplicate') {
      message.warning(t('world.dirsDuplicate'))
    } else if (res.reason === 'limit') {
      message.warning(t('world.dirsLimit'))
    }
  } catch (err) {
    console.error('增加图库目录失败', err)
    message.error(t('world.setDirFailed'))
  } finally {
    picking.value = false
  }
}

/** 移除目录：仅取消收录（不删磁盘文件），主进程按归一化路径匹配 */
const removeDir = async (dir) => {
  if (removing.value) return
  removing.value = dir
  try {
    const res = await window.electronAPI.worldSetUserDirs({ remove: dir })
    if (res.ok) {
      userDirs.value = res.userDirs
      emit('changed')
    }
    // notfound（已被移除）：幂等——列表刷新即对齐，无需提示
  } catch (err) {
    console.error('移除图库目录失败', err)
    message.error(t('world.dirsRemoveFailed'))
  } finally {
    removing.value = ''
  }
}

defineExpose({ open: openDialog, close })
</script>

<style scoped>
.world-dirs-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border: 1px solid var(--xk-border);
  border-radius: 6px;
  margin-bottom: 8px;
  font-size: 13px;
}
.world-dirs-fixed {
  background: var(--xk-float-bg);
  border-style: dashed;
}
.world-dirs-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--xk-text);
}
.world-dirs-count {
  flex-shrink: 0;
  font-size: 12px;
  opacity: 0.65;
}
.world-dirs-tag {
  flex-shrink: 0;
  margin-right: 0;
}
.world-dirs-empty {
  margin: 8px 0;
}
.world-dirs-hint {
  margin: 10px 0 0;
  font-size: 12px;
  opacity: 0.65;
}
</style>
