/**
 * el-form 原生提交回归测试（源码级）
 *
 * 背景：el-form 渲染为原生 <form>，表单里只有一个文本输入框时，浏览器会把回车当作"隐式提交"，
 * 以 GET 方式提交到当前地址 —— 整页刷新、页面状态丢失（网盘"新建文件夹/重命名"回车后回到根目录且操作未执行）。
 * Element Plus 的 el-button 是 type="button"，不会被当作提交按钮，所以每个 el-form 都必须显式处理 submit：
 * 用 `@submit.prevent`，需要回车提交的表单写成 `@submit.prevent="handler"`。
 * happy-dom 不模拟隐式提交，这里以源码断言兜底；真实回车已用无头浏览器验证。
 */
import { describe, it, expect } from 'vitest'

// Vite 在构建期把源码以字符串形式内联进来（不依赖 node:fs，vue-tsc 也无需 node 类型）
const SOURCES = import.meta.glob(['../**/*.vue', '!../**/__tests__/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

function elFormOpenTags(src: string): string[] {
  // `<el-form` 后紧跟空白或 `>`，排除 el-form-item
  return src.match(/<el-form(?=[\s>])[^>]*>/g) ?? []
}

describe('el-form submit', () => {
  it('源码收录正常', () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(10)
    expect(SOURCES['../views/FilesView.vue']).toBeTruthy()
  })

  it('每个 el-form 都处理 submit（阻止回车整页刷新）', () => {
    const missing: string[] = []
    for (const [path, src] of Object.entries(SOURCES)) {
      for (const tag of elFormOpenTags(src)) {
        if (!/@submit\.prevent\b|v-on:submit\.prevent\b/.test(tag)) {
          missing.push(`${path}: ${tag.replace(/\s+/g, ' ')}`)
        }
      }
    }
    expect(missing).toEqual([])
  })

  it('网盘新建文件夹/重命名：回车经表单 submit 提交，输入框不再挂 keyup.enter', () => {
    const src = SOURCES['../views/FilesView.vue']
    const tags = elFormOpenTags(src)
    expect(tags.some((t) => t.includes('@submit.prevent="handleCreateFolder"'))).toBe(true)
    expect(tags.some((t) => t.includes('@submit.prevent="handleRenameConfirm"'))).toBe(true)
    expect(src).not.toMatch(/@keyup\.enter="handle(CreateFolder|RenameConfirm)"/)
  })
})
