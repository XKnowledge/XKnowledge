<template>
  <a-modal
    v-model:open="open"
    :title="$t('outline.title')"
    :ok-text="$t('common.import')"
    :cancel-text="$t('common.cancel')"
    :ok-button-props="{ disabled: !parsed.nodes.length }"
    :mask-closable="false"
    data-outline-import
    @ok="onImport"
    @cancel="close"
  >
    <p class="xk-outline-hint">
      {{ $t('outline.hint1') }}
      <code># {{ $t('outline.codeHeading') }}</code
      >{{ $t('outline.hintHeading') }}<code>[[{{ $t('outline.codeWikilink') }}]]</code
      >{{ $t('outline.hintWikilink') }}
      {{ $t('outline.hint2') }}
    </p>
    <a-textarea v-model:value="text" :rows="12" :placeholder="$t('outline.textareaPlaceholder')" />
    <p v-if="text.trim()" class="xk-outline-stat">
      {{ $t('outline.importSummary', { nodes: parsed.nodes.length, edges: parsed.links.length }) }}
    </p>
  </a-modal>
</template>

<script setup>
import { ref, computed } from 'vue'
import { parseOutline } from '../utils/outlineParser.js'

const emit = defineEmits(['import'])

const open = ref(false)
const text = ref('')

const parsed = computed(() => parseOutline(text.value))

const onImport = () => {
  if (!parsed.value.nodes.length) return
  emit('import', parsed.value)
}

const openDialog = () => {
  text.value = ''
  open.value = true
}

const close = () => {
  open.value = false
}

defineExpose({ open: openDialog, close })
</script>

<style scoped>
.xk-outline-hint {
  font-size: 13px;
  color: var(--xk-text);
  opacity: 0.75;
  margin-bottom: 8px;
}

.xk-outline-stat {
  font-size: 13px;
  margin-top: 8px;
  margin-bottom: 0;
}
</style>
