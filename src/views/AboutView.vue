<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
const version = import.meta.env.VITE_WEB_VERSION || '0.1.0'

function returnToChat() {
  void router.push({ name: 'chat' })
}
</script>

<template>
  <main class="about-page">
    <header class="about-header">
      <button class="about-back-button" data-testid="about-back" type="button" @click="returnToChat">← 返回聊天</button>
      <span class="about-brand"><span class="brand-mark">W</span>WeTalk</span>
    </header>

    <section class="about-card" aria-labelledby="about-title">
      <p class="eyebrow">关于</p>
      <h1 id="about-title">WeTalk Web</h1>
      <p class="about-description">一个简洁、专注的浏览器聊天空间，连接现有 WeTalk 服务。</p>

      <dl class="about-details">
        <div><dt>客户端版本</dt><dd data-testid="web-version">{{ version }}</dd></div>
        <div><dt>后端接口</dt><dd>WeTalk 0.0.2</dd></div>
        <div><dt>会话保护</dt><dd>HttpOnly Cookie 与短期 WebSocket 票据</dd></div>
        <div><dt>本机缓存</dt><dd>仅缓存最近查看的文字消息，不保存附件或登录 token</dd></div>
      </dl>

      <button class="about-chat-button" type="button" @click="returnToChat">返回聊天</button>
    </section>
    <p class="about-footer">WeTalk · 简洁、专注的聊天空间</p>
  </main>
</template>
