import type { InitialChatMessage } from '@/stores/chat'

const databaseName = 'wetalk-web-text-cache'
const databaseVersion = 3
const messageStoreName = 'messages'
const pendingMessageStoreName = 'pending_messages'
const messageOrderIndexName = 'byAccountSessionMessageId'

interface CachedTextMessage extends InitialChatMessage {
  accountId: string
}

export interface PendingTextMessage {
  clientMessageId: string
  sessionId: string
  contactId: string
  messageContent: string
  createdAt: number
}

interface StoredPendingTextMessage extends PendingTextMessage {
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
        const messageStore = db.objectStoreNames.contains(messageStoreName)
          ? request.transaction!.objectStore(messageStoreName)
          : db.createObjectStore(messageStoreName, {
            keyPath: ['accountId', 'sessionId', 'messageId'],
          })
        if (!messageStore.indexNames.contains('byAccount')) {
          messageStore.createIndex('byAccount', 'accountId', { unique: false })
        }
        if (!messageStore.indexNames.contains('byAccountSessionTime')) {
          messageStore.createIndex('byAccountSessionTime', ['accountId', 'sessionId', 'sendTime'], { unique: false })
        }
        if (!messageStore.indexNames.contains(messageOrderIndexName)) {
          messageStore.createIndex(messageOrderIndexName, ['accountId', 'sessionId', 'messageId'], { unique: false })
        }
        if (!db.objectStoreNames.contains(pendingMessageStoreName)) {
          const store = db.createObjectStore(pendingMessageStoreName, {
            keyPath: ['accountId', 'clientMessageId'],
          })
          store.createIndex('byAccount', 'accountId', { unique: false })
        }
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
    const index = transaction.objectStore(messageStoreName).index(messageOrderIndexName)
    const range = IDBKeyRange.bound([accountId, sessionId, 0], [accountId, sessionId, Number.MAX_SAFE_INTEGER])
    const rows: CachedTextMessage[] = []

    return new Promise((resolve, reject) => {
      const request = index.openCursor(range, 'prev')
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor || rows.length >= limit) return
        const row = cursor.value as CachedTextMessage
        if (row.messageType === 2 || (row.messageType === 14 && Boolean(row.messageContent))) rows.push(row)
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
    const textMessages = messages.filter((message) =>
      (message.messageType === 2 || (message.messageType === 14 && Boolean(message.messageContent))) &&
      message.sessionId &&
      message.messageId,
    )
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
        messageType: message.messageType,
        messageContent: message.messageContent,
        sendUserId: message.sendUserId,
        sendUserNickName: message.sendUserNickName,
        sendTime: message.sendTime,
        contactId: message.contactId,
        ...(message.messageType === 14 ? {
          aiStatus: message.aiStatus || 'complete',
          status: message.status,
        } : {}),
      }
      store.put(record)
    }
    await transactionDone(transaction)
  }

  async getPendingTextMessages(accountId: string): Promise<PendingTextMessage[]> {
    const db = await this.openDatabase()
    if (!db) return []

    const transaction = db.transaction(pendingMessageStoreName, 'readonly')
    const done = transactionDone(transaction)
    const request = transaction.objectStore(pendingMessageStoreName).index('byAccount').getAll(accountId)
    const rows = await new Promise<StoredPendingTextMessage[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as StoredPendingTextMessage[])
      request.onerror = () => reject(request.error || new Error('无法读取待发送消息'))
    })
    await done
    return rows
      .sort((left, right) => left.createdAt - right.createdAt || left.clientMessageId.localeCompare(right.clientMessageId))
      .map(({ accountId: _accountId, ...message }) => message)
  }

  async savePendingTextMessage(accountId: string, message: PendingTextMessage): Promise<boolean> {
    if (!accountId) return false
    const db = await this.openDatabase()
    if (!db) return false

    const transaction = db.transaction(pendingMessageStoreName, 'readwrite')
    transaction.objectStore(pendingMessageStoreName).put({ accountId, ...message } satisfies StoredPendingTextMessage)
    await transactionDone(transaction)
    return true
  }

  async deletePendingTextMessage(accountId: string, clientMessageId: string): Promise<void> {
    const db = await this.openDatabase()
    if (!db) return
    const transaction = db.transaction(pendingMessageStoreName, 'readwrite')
    transaction.objectStore(pendingMessageStoreName).delete([accountId, clientMessageId])
    await transactionDone(transaction)
  }

  async clearAccount(accountId: string): Promise<void> {
    const db = await this.openDatabase()
    if (!db) return
    const transaction = db.transaction([messageStoreName, pendingMessageStoreName], 'readwrite')
    for (const storeName of [messageStoreName, pendingMessageStoreName]) {
      const request = transaction.objectStore(storeName).index('byAccount').openCursor(IDBKeyRange.only(accountId))
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) return
        cursor.delete()
        cursor.continue()
      }
      request.onerror = () => transaction.abort()
    }
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
