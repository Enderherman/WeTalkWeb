export type DownloadLocationMode = 'browser' | 'ask' | 'folder'
export type FileSystemPermission = 'granted' | 'denied' | 'prompt'

export interface FileWritableLike {
  write(data: Blob): Promise<void>
  close(): Promise<void>
}

export interface FileHandleLike {
  createWritable(): Promise<FileWritableLike>
}

export interface DirectoryHandleLike {
  readonly name: string
  requestPermission?(options: { mode: 'readwrite' }): Promise<FileSystemPermission>
  getFileHandle(name: string, options: { create: boolean }): Promise<FileHandleLike>
}

export interface SavedDownloadPreference {
  accountId: string
  mode: DownloadLocationMode
  directoryHandle?: DirectoryHandleLike | null
}

declare global {
  interface Window {
    showSaveFilePicker?: (options: { suggestedName: string }) => Promise<FileHandleLike>
    showDirectoryPicker?: (options: { mode: 'readwrite' }) => Promise<DirectoryHandleLike>
  }
}

const databaseName = 'wetalk-web-download-preferences'
const objectStoreName = 'account-preferences'
const databaseVersion = 1

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('浏览器不支持本机下载偏好存储'))
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(objectStoreName)) {
        request.result.createObjectStore(objectStoreName, { keyPath: 'accountId' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('无法打开本机下载偏好存储'))
  })
}

export async function loadDownloadPreference(accountId: string): Promise<SavedDownloadPreference | null> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(objectStoreName, 'readonly')
    const request = transaction.objectStore(objectStoreName).get(accountId)
    request.onsuccess = () => resolve((request.result as SavedDownloadPreference | undefined) || null)
    request.onerror = () => reject(request.error || new Error('无法读取本机下载偏好'))
    transaction.oncomplete = () => database.close()
    transaction.onerror = () => {
      database.close()
      reject(transaction.error || new Error('无法读取本机下载偏好'))
    }
  })
}

export async function saveDownloadPreference(preference: SavedDownloadPreference): Promise<void> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(objectStoreName, 'readwrite')
    const storedPreference = { ...preference }
    if (!storedPreference.directoryHandle) delete storedPreference.directoryHandle
    transaction.objectStore(objectStoreName).put(storedPreference)
    transaction.oncomplete = () => {
      database.close()
      resolve()
    }
    transaction.onerror = () => {
      database.close()
      reject(transaction.error || new Error('无法保存本机下载偏好'))
    }
    transaction.onabort = () => {
      database.close()
      reject(transaction.error || new Error('无法保存本机下载偏好'))
    }
  })
}

export async function clearDownloadPreference(accountId: string): Promise<void> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(objectStoreName, 'readwrite')
    transaction.objectStore(objectStoreName).delete(accountId)
    transaction.oncomplete = () => {
      database.close()
      resolve()
    }
    transaction.onerror = () => {
      database.close()
      reject(transaction.error || new Error('无法清除本机下载偏好'))
    }
  })
}

function safeSuggestedName(fileName: string) {
  const cleaned = fileName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim()
  return cleaned || 'WeTalk-attachment'
}

async function writeToFileHandle(handle: FileHandleLike, blob: Blob) {
  const writable = await handle.createWritable()
  await writable.write(blob)
  await writable.close()
}

export async function prepareFileDestination(
  mode: DownloadLocationMode,
  fileName: string,
  directoryHandle: DirectoryHandleLike | null,
): Promise<((blob: Blob) => Promise<void>) | null> {
  const suggestedName = safeSuggestedName(fileName)
  if (mode === 'ask') {
    if (typeof window.showSaveFilePicker !== 'function') return null
    const handle = await window.showSaveFilePicker({ suggestedName })
    return (blob) => writeToFileHandle(handle, blob)
  }
  if (mode === 'folder') {
    if (!directoryHandle) return null
    const permission = await directoryHandle.requestPermission?.({ mode: 'readwrite' })
    if (permission !== 'granted') throw new Error('没有获得所选文件夹的写入权限')
    return async (blob) => {
      const handle = await directoryHandle.getFileHandle(suggestedName, { create: true })
      await writeToFileHandle(handle, blob)
    }
  }
  return null
}

export async function chooseDownloadDirectory(): Promise<DirectoryHandleLike> {
  if (typeof window.showDirectoryPicker !== 'function') throw new Error('当前浏览器不支持选择下载文件夹')
  return window.showDirectoryPicker({ mode: 'readwrite' })
}
