import { afterEach, describe, expect, it, vi } from 'vitest'
import { prepareFileDestination, type DirectoryHandleLike, type FileHandleLike } from '@/storage/downloadPreferences'

afterEach(() => {
  delete window.showSaveFilePicker
  delete window.showDirectoryPicker
})

describe('browser download destinations', () => {
  it('opens a save picker before writing a downloaded blob', async () => {
    const writable = { write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) }
    const handle: FileHandleLike = { createWritable: vi.fn().mockResolvedValue(writable) }
    const picker = vi.fn().mockResolvedValue(handle)
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: picker })

    const save = await prepareFileDestination('ask', 'report.txt', null)
    expect(picker).toHaveBeenCalledWith({ suggestedName: 'report.txt' })
    await save?.(new Blob(['download']))

    expect(handle.createWritable).toHaveBeenCalledOnce()
    expect(writable.write).toHaveBeenCalledOnce()
    expect(writable.close).toHaveBeenCalledOnce()
  })

  it('writes into a previously selected directory after permission is granted', async () => {
    const writable = { write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) }
    const fileHandle: FileHandleLike = { createWritable: vi.fn().mockResolvedValue(writable) }
    const directory: DirectoryHandleLike = {
      name: 'Downloads',
      requestPermission: vi.fn().mockResolvedValue('granted'),
      getFileHandle: vi.fn().mockResolvedValue(fileHandle),
    }

    const save = await prepareFileDestination('folder', 'report.txt', directory)
    await save?.(new Blob(['download']))

    expect(directory.requestPermission).toHaveBeenCalledWith({ mode: 'readwrite' })
    expect(directory.getFileHandle).toHaveBeenCalledWith('report.txt', { create: true })
    expect(writable.write).toHaveBeenCalledOnce()
  })

  it('rejects folder writes if the browser does not grant permission', async () => {
    const directory: DirectoryHandleLike = {
      name: 'Downloads',
      requestPermission: vi.fn().mockResolvedValue('denied'),
      getFileHandle: vi.fn(),
    }

    await expect(prepareFileDestination('folder', 'report.txt', directory)).rejects.toThrow('没有获得所选文件夹的写入权限')
    expect(directory.getFileHandle).not.toHaveBeenCalled()
  })

  it('uses the browser-managed download flow when no custom destination is selected', async () => {
    await expect(prepareFileDestination('browser', 'report.txt', null)).resolves.toBeNull()
  })
})
