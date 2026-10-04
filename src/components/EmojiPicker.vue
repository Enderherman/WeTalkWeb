<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ select: [emoji: string] }>()
const open = ref(false)
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const choices = [
  ['😀', '开心'], ['😄', '大笑'], ['😂', '笑哭'], ['😊', '微笑'],
  ['🥰', '喜爱'], ['😎', '酷'], ['🤔', '思考'], ['😅', '汗颜'],
  ['😭', '大哭'], ['😮', '惊讶'], ['👍', '赞'], ['👏', '鼓掌'],
  ['🙏', '感谢'], ['❤️', '爱心'], ['🎉', '庆祝'], ['✅', '完成'],
] as const

async function toggle() {
  open.value = !open.value
  if (open.value) {
    await nextTick()
    root.value?.querySelector<HTMLButtonElement>('[data-emoji]')?.focus()
  }
}

function close(restoreFocus = false) {
  open.value = false
  if (restoreFocus) void nextTick(() => trigger.value?.focus())
}

function choose(emoji: string) {
  close()
  emit('select', emoji)
}

function outside(event: MouseEvent) {
  if (event.target instanceof Node && !root.value?.contains(event.target)) close()
}

watch(() => props.disabled, (disabled) => { if (disabled) close() })
onMounted(() => document.addEventListener('click', outside))
onBeforeUnmount(() => document.removeEventListener('click', outside))
</script>

<template>
  <div ref="root" class="emoji-picker" @keydown.esc.stop.prevent="close(true)">
    <button ref="trigger" type="button" class="file-attach-button" data-testid="emoji-picker-toggle"
      aria-label="选择表情" :aria-expanded="open" aria-controls="emoji-picker-panel" :disabled="disabled"
      @click="toggle"
    >☺</button>
    <div v-if="open" id="emoji-picker-panel" class="emoji-picker-panel" role="group" aria-label="表情">
      <button v-for="[emoji, label] in choices" :key="emoji" type="button" :aria-label="label"
        :data-emoji="emoji" @click="choose(emoji)"
      >{{ emoji }}</button>
    </div>
  </div>
</template>

<style scoped>
.emoji-picker { position: relative; flex: 0 0 auto; }
.emoji-picker-panel {
  position: absolute; z-index: 20; bottom: calc(100% + 10px); left: -32px;
  display: grid; grid-template-columns: repeat(4, 36px); gap: 4px; padding: 8px;
  border: 1px solid var(--wt-line); border-radius: 12px; background: var(--wt-white);
  box-shadow: 0 8px 24px rgb(0 0 0 / 12%);
}
.emoji-picker-panel button {
  width: 36px; height: 36px; border: 0; border-radius: 8px; background: transparent; font-size: 23px; cursor: pointer;
}
.emoji-picker-panel button:hover { background: var(--wt-accent-soft); }
</style>
