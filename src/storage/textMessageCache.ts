import type { InitialChatMessage } from '@/stores/chat'

const databaseName = 'wetalk-web-text-cache'
const databaseVersion = 1
const messageStoreName = 'messages'

interface CachedTextMessage extends InitialChatMessage {
  accountId: string
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error || new Error('本机文字缓存写入失败'))
    transaction.onabort = () => reject(transaction.error || new Error('本机文字缓存操作已取消'))
  })
}

export class TextMessageCache {
  private databasePromise: Promise<IDBDatabase | null> | null = null

  constructor(
    private readonly name = databaseName,
    private readonly factory: IDBFactory | undefined = globalThis.indexedDB,
  ) {}

  private openDatabase(): Promise<IDBDatabase | null> {
    if (!this.factory) return Promise.resolve(null)
    if (this.databasePromise) return this.databasePromise

    this.databasePromise = new Promise((resolve, reject) => {
      const request = this.factory!.open(this.name, databaseVersion)
      request.onupgradeneeded = () => {
        const db = request.result
        if (db.objectStoreNames.contains(messageStoreName)) return
        const store = db.createObjectStore(messageStoreName, {
          keyPath: ['accountId', 'sessionId', 'messageId'],
        })
        store.createIndex('byAccount', 'accountId', { unique: false })
        store.createIndex('byAccountSessionTime', ['accountId', 'sessionId', 'sendTime'], { unique: false })
      }
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close()
        resolve(request.result)
      }
      request.onerror = () => reject(request.error || new Error('无法打开本机文字缓存'))
      request.onblocked = () => reject(new Error('本机文字缓存正在被其他页面使用'))
    })
    return this.databasePromise
  }

  async getLatestTextMessages(accountId: string, sessionId: string, limit = 30): Promise<InitialChatMessage[]> {
    if (limit <= 0) return []
    const db = await this.openDatabase()
    if (!db) return []

    const transaction = db.transaction(messageStoreName, 'readonly')
    const index = transaction.objectStore(messageStoreName).index('byAccountSessionTime')
    const range = IDBKeyRange.bound([accountId, sessionId, 0], [accountId, sessionId, Number.MAX_SAFE_INTEGER])
    const rows: CachedTextMessage[] = []

    return new Promise((resolve, reject) => {
      const request = index.openCursor(range, 'prev')
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor || rows.length >= limit) return
        const row = cursor.value as CachedTextMessage
        if (row.messageType === 2) rows.push(row)
        cursor.continue()
      }
      request.onerror = () => reject(request.error || new Error('无法读取本机文字缓存'))
      transaction.oncomplete = () => {
        resolve(rows.reverse().map(({ accountId: _accountId, ...message }) => message))
      }
      transaction.onerror = () => reject(transaction.error || new Error('无法读取本机文字缓存'))
      transaction.onabort = () => reject(transaction.error || new Error('本机文字缓存读取已取消'))
    })
  }

  async saveTextMessages(accountId: string, messages: InitialChatMessage[]): Promise<void> {
    const textMessages = messages.filter((message) => message.messageType === 2 && message.sessionId && message.messageId)
    if (textMessages.length === 0) return
    const db = await this.openDatabase()
    if (!db) return

    const transaction = db.transaction(messageStoreName, 'readwrite')
    const store = transaction.objectStore(messageStoreName)
    for (const message of textMessages) {
      const record: CachedTextMessage = {
        accountId,
        sessionId: message.sessionId,
        messageId: message.messageId,
        messageType: 2,
        messageContent: message.messageContent,
        sendUserId: message.sendUserId,
        sendUserNickName: message.sendUserNickName,
        sendTime: message.sendTime,
        contactId: message.contactId,
      }
      store.put(record)
    }
    await transactionDone(transaction)
  }

  async clearAccount(accountId: string): Promise<void> {
    const db = await this.openDatabase()
    if (!db) return
    const transaction = db.transaction(messageStoreName, 'readwrite')
    const index = transaction.objectStore(messageStoreName).index('byAccount')
    const request = index.openCursor(IDBKeyRange.only(accountId))
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) return
      cursor.delete()
      cursor.continue()
    }
    request.onerror = () => transaction.abort()
    await transactionDone(transaction)
  }

  close() {
    if (this.databasePromise) {
      void this.databasePromise.then((db) => db?.close()).catch(() => undefined)
    }
    this.databasePromise = null
  }
}

export const textMessageCache = new TextMessageCache()
