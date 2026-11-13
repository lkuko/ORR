<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { api } from '../api'
import { formatTime, statusLabel } from '../presentation'
import RecordId from './RecordId.vue'
import AppIcon from './AppIcon.vue'
const props = defineProps({ mode: String, askReason: Function })
const emit = defineEmits(['acting'])
const items = ref([]), query = ref(''), status = ref('ALL'), visibility = ref('ALL'), loading = ref(false), acting = ref(false)
const cursor = ref(''), error = ref(''), notice = ref(''), preview = ref('')
const isProducts = computed(() => props.mode === 'products')
const filters = computed(() => isProducts.value ? [ ['ALL','全部状态'], ['AVAILABLE','在售'], ['RESERVED','已预约'], ['SOLD','已售出'], ['WITHDRAWN','已下架'] ]
  : [ ['ALL','全部订单'], ['PENDING','待卖家确认'], ['ACCEPTED','待交付'], ['CANCEL_PENDING','取消协商'], ['DISPUTED','待裁定'], ['COMPLETED','已完成'], ['CANCELLED','已取消'] ])
let request = 0
onBeforeUnmount(() => { request++ })
async function load(append = false) {
  append = append === true
  if (append && (loading.value || !cursor.value)) return
  const current = ++request
  loading.value = true; error.value = ''
  try {
    const data = { q: query.value, status: status.value, visibility: visibility.value, cursor: append ? cursor.value : '' }
    const result = isProducts.value ? await api.products(data) : await api.productOrders(data)
    let rows = isProducts.value ? result.products : result.orders
    if (isProducts.value && rows.length) {
      const { urls } = await api.marketImages(rows.map(p => p.id))
      rows = rows.map(p => ({ ...p, urls: urls[p.id] || [] }))
    }
    if (current !== request) return
    items.value = append ? [...new Map([...items.value, ...rows].map(p => [p.id, p])).values()] : rows
    cursor.value = result.nextCursor
  } catch (e) { if (current === request) error.value = e.message }
  finally { if (current === request) loading.value = false }
}
async function handle(item, cancelled = true) {
  if (acting.value) return
  acting.value = true; emit('acting', true)
  try {
    const title = isProducts.value ? '下架商品并记录原因' : cancelled ? '裁定取消交易' : '恢复交易'
    const reason = await props.askReason(title, item.cancelReason || '')
    if (reason === null) return
    if (isProducts.value) await api.hideProduct(item.id, reason)
    else await api.resolveProductOrder(item.id, cancelled, reason)
    notice.value = isProducts.value ? '商品已下架，处理记录已保存' : '订单处理结果已保存'
    await load()
  } catch (e) { error.value = e.message }
  finally { acting.value = false; emit('acting', false) }
}
defineExpose({ load })
</script>

<template>
  <section class="content-section market-panel" :aria-busy="loading">
    <form class="section-toolbar market-filters" @submit.prevent="load()">
      <label v-if="isProducts" class="search-input"><AppIcon name="search" /><input v-model="query" maxlength="60" placeholder="搜索商品标题或描述" aria-label="商品关键词" :disabled="acting" /></label>
      <label class="market-select"><span>状态</span><select v-model="status" :disabled="acting" @change="load()"><option v-for="[value,label] in filters" :key="value" :value="value">{{ label }}</option></select></label>
      <label v-if="isProducts" class="market-select"><span>可见性</span><select v-model="visibility" :disabled="acting" @change="load()"><option value="ALL">全部</option><option value="VISIBLE">正常</option><option value="HIDDEN">管理下架</option></select></label>
      <button v-if="isProducts" class="primary" :disabled="loading || acting">搜索</button>
    </form>
    <p v-if="notice" class="notice" role="status">{{ notice }}</p><p v-if="error" class="error-banner" role="alert">{{ error }}</p>
    <div v-if="loading && !items.length" class="empty-state" role="status"><h2>正在读取{{ isProducts ? '商品' : '订单' }}…</h2></div>
    <div v-else-if="!items.length && !error" class="empty-state"><span class="empty-icon"><AppIcon :name="mode" /></span><h2>没有匹配的{{ isProducts ? '商品' : '订单' }}</h2><p>换个筛选条件，或稍后刷新查看新记录。</p></div>
    <div class="record-list">
      <article v-for="item in items" :key="item.id" class="record-row">
        <div class="record-main">
          <div class="record-heading"><h2>{{ item.title }}</h2><strong class="trade-price">¥{{ item.price }}</strong></div><RecordId :value="item.id" :label="isProducts ? '商品编号' : '订单编号'" />
          <template v-if="isProducts">
            <div v-if="item.urls?.length" class="market-photos"><button v-for="(url,index) in item.urls" :key="url" type="button" :aria-label="'查看第 ' + (index+1) + ' 张商品图'" @click="preview = url"><img :src="url" :alt="item.title + ' 第 ' + (index+1) + ' 张照片'" loading="lazy" /></button></div>
            <p class="product-description">{{ item.description }}</p><dl class="record-facts"><div><dt>卖家</dt><dd>{{ item.sellerNickname }}</dd></div><div><dt>交易区域</dt><dd>{{ item.publicArea }}</dd></div><div><dt>收藏量</dt><dd>{{ item.favoriteCount }}</dd></div><div><dt>发布时间</dt><dd>{{ formatTime(item.createdAt) }}</dd></div></dl>
            <p v-if="item.moderationReason" class="resolution-note">下架原因：{{ item.moderationReason }}</p>
          </template>
          <template v-else><div class="participant-row"><div><span class="field-caption">卖家</span><strong>{{ item.sellerNickname }}</strong></div><div><span class="field-caption">买家</span><strong>{{ item.buyerNickname }}</strong></div><div><span class="field-caption">交易区域</span><strong>{{ item.publicArea }}</strong></div></div><p v-if="item.cancelReason" class="dispute-reason">取消原因：{{ item.cancelReason }}</p><p v-if="item.resolution" class="resolution-note">管理说明：{{ item.resolution }}</p><time>{{ formatTime(item.createdAt) }}</time></template>
        </div>
        <div class="record-actions"><span :class="['status', item.status === 'DISPUTED' ? 'pending' : 'neutral']">{{ statusLabel(item.status) }}</span>
          <template v-if="isProducts"><span v-if="item.visibility === 'HIDDEN'" class="status blocked">管理下架</span><button v-else class="danger" :disabled="acting || loading" @click="handle(item)">下架商品</button></template>
          <template v-else-if="!['COMPLETED','CANCELLED'].includes(item.status)"><button class="danger" :disabled="acting || loading" @click="handle(item, true)">裁定取消</button><button v-if="item.status === 'DISPUTED'" :disabled="acting || loading" @click="handle(item, false)">恢复交易</button></template>
        </div>
      </article>
    </div>
    <div class="market-pagination"><span>{{ items.length }} 条已加载记录</span><button v-if="cursor" :disabled="loading || acting" @click="load(true)">{{ loading ? '读取中…' : '加载更多' }}</button></div>
    <div v-if="preview" class="market-preview" role="dialog" aria-modal="true" aria-label="商品大图" @click.self="preview = ''" @keydown.esc="preview = ''"><button type="button" class="preview-close" aria-label="关闭大图" autofocus @click="preview = ''">关闭</button><img :src="preview" alt="商品大图" /></div>
  </section>
</template>

<style scoped>
.market-filters { justify-content: flex-start; gap: 16px; flex-wrap: wrap; }
.market-filters .search-input { flex: 1 1 240px; }
.market-select { display: flex; align-items: center; gap: 8px; color: #52617a; font-size: 13px; }
.market-select select { min-height: 42px; max-width: 190px; padding: 8px 28px 8px 12px; border: 1px solid #d6dfee; border-radius: 8px; background: #fff; color: #24324a; font: inherit; }
.market-select select:focus-visible { outline: 3px solid #8ca5ef; outline-offset: 2px; }
.trade-price { color: #b7452b; font-size: 22px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.market-photos { display: flex; flex-wrap: wrap; gap: 12px; margin: 20px 0; }
.market-photos button { width: 100px; height: 100px; padding: 0; overflow: hidden; border: 1px solid #dfe5ec; border-radius: 8px; background: #f5f7f6; }
.market-photos img { width: 100%; height: 100%; object-fit: cover; }
.product-description { white-space: pre-wrap; overflow-wrap: anywhere; max-width: 72ch; line-height: 1.8; }
.market-pagination { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 24px; color: #66738a; font-size: 13px; }
.market-preview { position: fixed; inset: 0; z-index: 50; background: rgba(19,31,44,.85); display: flex; align-items: center; justify-content: center; padding: 72px 24px 24px; }
.market-preview img { max-width: 100%; max-height: 100%; object-fit: contain; }
.preview-close { position: absolute; top: 24px; right: 24px; min-width: 80px; background: #fff; color: #203137; }
@media (max-width: 680px) {
  .market-select { flex: 1 1 180px; min-width: 0; }
  .market-select > span { flex: 0 0 42px; white-space: nowrap; }
  .market-select select { flex: 1; min-width: 0; max-width: none; }
  .market-filters > .primary { flex: 1 1 100%; }
  .market-photos button { width: 80px; height: 80px; }
  .record-heading { align-items: flex-start; }
  .market-filters .search-input { flex-basis: 100%; }
}
</style>
