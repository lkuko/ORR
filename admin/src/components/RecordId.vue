<script setup>
import { ref, onBeforeUnmount } from 'vue'
import AppIcon from './AppIcon.vue'
import { shortId } from '../presentation'
const props = defineProps({ value: { type: String, default: '' }, label: { type: String, default: '编号' } })
const copied = ref(false)
const failed = ref(false)
let timer
async function copy() {
  try {
    await navigator.clipboard.writeText(props.value)
    copied.value = true
    failed.value = false
    clearTimeout(timer)
    timer = setTimeout(() => { copied.value = false }, 2000)
  } catch { failed.value = true }
}
onBeforeUnmount(() => clearTimeout(timer))
</script>
<template>
  <span class="record-id"><span>{{ label }} {{ shortId(value) }}</span><button type="button" class="copy-id" :title="value" :aria-label="'复制完整' + label" @click="copy"><AppIcon :name="copied ? 'check' : 'copy'" /><span>{{ copied ? '已复制' : '复制' }}</span></button><span v-if="failed" class="copy-fallback" role="status">请长按选择编号：{{ value }}</span></span>
</template>
