// Run with Playwright available locally, or WETALK_PLAYWRIGHT_PACKAGE pointing to its package directory.
const { chromium } = require(process.env.WETALK_PLAYWRIGHT_PACKAGE || 'playwright')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const assert = require('node:assert/strict')

async function main() {
  const stylesheet = readFileSync(resolve(__dirname, '../src/styles/main.css'), 'utf8')
  const browser = await chromium.launch({ headless: true, channel: 'chromium' })
  try {
    for (const [width, height] of [[390, 844], [768, 1024], [1280, 900], [390, 450]]) {
      const page = await browser.newPage({ viewport: { width, height } })
      await page.setContent(`<style>${stylesheet}</style><div id="app"><main class="chat-shell">
        <aside class="chat-sidebar">WeTalk</aside><section class="chat-main">
        <header class="chat-topbar">A conversation</header>
        <div class="conversation-actions"><button>取消置顶</button><button>从列表移除</button></div>
        <section class="web-release-notice"><div class="web-release-copy"><strong>WeTalk 新版本 1.10.1</strong>
        <ul class="web-release-list"><li>版本说明</li></ul><small>网页版展示发布说明。</small></div><button>×</button></section>
        <section class="conversation-panel"><div class="message-list">${Array.from({ length: 40 }, (_, index) => `<article class="message-row"><div class="message-bubble">消息 ${index + 1}<p>真实浏览器布局回归内容</p></div></article>`).join('')}</div></section>
        <div class="composer-preview"><button>＋</button><textarea rows="1" aria-label="消息内容"></textarea><button>发送</button></div>
        <p class="chat-disclaimer">历史消息在消息区域内滚动。</p></section></main></div>`)
      const layout = await page.evaluate(() => {
        const bounds = (selector) => {
          const rect = document.querySelector(selector).getBoundingClientRect()
          return { top: rect.top, bottom: rect.bottom, height: rect.height }
        }
        const messages = document.querySelector('.conversation-panel')
        return { shell: bounds('.chat-shell'), main: bounds('.chat-main'), composer: bounds('.composer-preview'),
          scrolls: messages.scrollHeight > messages.clientHeight, pageWidth: document.documentElement.scrollWidth }
      })
      assert(layout.composer.bottom <= height + 1 && layout.composer.top >= 0, `${width}x${height}: composer outside viewport: ${JSON.stringify(layout)}`)
      assert(layout.main.bottom <= layout.shell.bottom + 1, `${width}x${height}: chat main escaped its grid row`)
      assert(layout.scrolls, `${width}x${height}: long history must scroll inside the message panel`)
      assert(layout.pageWidth <= width, `${width}x${height}: horizontal overflow`)
      console.log(JSON.stringify({ viewport: `${width}x${height}`, ...layout }))
      await page.close()
    }
  } finally { await browser.close() }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
