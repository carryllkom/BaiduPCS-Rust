import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'
import ElementPlus from 'element-plus'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ShareIncludeExcludeEditor from '../ShareIncludeExcludeEditor.vue'

const transfer = vi.hoisted(() => ({
  previewShareFiles: vi.fn(),
  previewShareDir: vi.fn(),
}))

vi.mock('@/api/transfer', () => ({
  previewShareFiles: transfer.previewShareFiles,
  previewShareDir: transfer.previewShareDir,
}))

// 常用规则词表来自后端配置；每个用例可改 presetRules 控制词表内容
const config = vi.hoisted(() => ({
  presetRules: [] as string[],
  updateConfig: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/api/config', () => ({
  getConfig: vi.fn(async () => ({ share_sync: { exclude_preset_rules: config.presetRules } })),
  updateConfig: config.updateConfig,
}))

const routerPush = vi.hoisted(() => vi.fn())

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush }),
}))

vi.mock('@/utils/responsive', () => ({
  useIsMobile: () => ref(false),
}))

const SHARE_INFO = {
  short_key: '1abc',
  shareid: 'sid',
  uk: 'uk-1',
  share_uk: 'share-uk',
  bdstoken: 'tok',
  kind: 'personal',
  token: 'tok',
}

function mountEditor(props: Record<string, unknown> = {}) {
  return mount(ShareIncludeExcludeEditor, {
    attachTo: document.body,
    props: {
      shareUrl: 'https://pan.baidu.com/s/1y7CluAbCdEfGh',
      password: null,
      ownerLoggedIn: true,
      includePaths: [],
      excludePatterns: [],
      excludePaths: [],
      ...props,
    },
    global: { plugins: [ElementPlus] },
  })
}

/** 某个字段区块（按标签文案定位） */
function fieldBlock(label: string): HTMLElement {
  const blocks = Array.from(document.body.querySelectorAll<HTMLElement>('.field-block'))
  const block = blocks.find((b) => b.querySelector('.field-label')?.textContent?.trim() === label)
  expect(block, `应存在「${label}」区块`).toBeTruthy()
  return block!
}

function fieldLabelTexts(): string[] {
  return Array.from(document.body.querySelectorAll<HTMLElement>('.field-block .field-label'))
      .map((el) => el.textContent?.trim() ?? '')
}

/** 区块内的「从分享浏览」按钮 */
function browseButton(label: string): HTMLElement {
  const btn = Array.from(fieldBlock(label).querySelectorAll<HTMLElement>('.path-actions button'))
      .find((b) => b.textContent?.trim() === '从分享浏览')
  expect(btn, `「${label}」区块应有浏览按钮`).toBeTruthy()
  return btn!
}

/** 区块内的「使用说明」开关（按可访问名称定位） */
function helpButton(accessibleName: string): HTMLElement {
  const btn = document.body.querySelector<HTMLElement>(`button[aria-label="${accessibleName}"]`)
  expect(btn, `应有可访问名为「${accessibleName}」的说明开关`).toBeTruthy()
  return btn!
}

/** 区块内当前展开的说明文案（未展开时为 null） */
function helpText(label: string): string | null {
  const el = fieldBlock(label).querySelector<HTMLElement>('.field-help')
  return el ? (el.textContent?.trim() ?? '') : null
}

/** 选择器里的条目（按显示名） */
function fileItem(name: string): HTMLElement {
  const items = Array.from(document.body.querySelectorAll<HTMLElement>('.file-item'))
  const item = items.find((el) => el.querySelector('.file-name')?.textContent?.trim() === name)
  expect(item, `选择器应包含条目「${name}」`).toBeTruthy()
  return item!
}

function checkboxOf(item: HTMLElement): HTMLInputElement | null {
  return item.querySelector<HTMLInputElement>('input[type="checkbox"]')
}

function confirmButton(): HTMLElement {
  const btns = Array.from(document.body.querySelectorAll<HTMLElement>('button'))
  const btn = btns.find((b) => b.textContent?.trim() === '确定')
  expect(btn, '选择器应有「确定」按钮').toBeTruthy()
  return btn!
}

beforeEach(() => {
  transfer.previewShareFiles.mockReset()
  transfer.previewShareDir.mockReset()
  transfer.previewShareFiles.mockResolvedValue({
    files: [
      { fs_id: 1, is_dir: true, path: '/剧集', size: 0, name: '剧集' },
      { fs_id: 3, is_dir: true, path: '/广告', size: 0, name: '广告' },
      { fs_id: 2, is_dir: false, path: '/说明.txt', size: 10, name: '说明.txt' },
    ],
    share_info: SHARE_INFO,
  })
  config.presetRules = []
  config.updateConfig.mockClear()
  routerPush.mockClear()
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('ShareIncludeExcludeEditor 排除目录', () => {
  it('排除目录浏览只允许选文件夹，保存的是精确路径而非 glob', async () => {
    const wrapper = mountEditor()
    await flushPromises()

    browseButton('排除目录').click()
    await flushPromises()

    // 文件不可选，文件夹可选
    expect(checkboxOf(fileItem('说明.txt')), '排除模式下文件不应可勾选').toBeNull()
    const dirCheckbox = checkboxOf(fileItem('剧集'))
    expect(dirCheckbox, '排除模式下文件夹应可勾选').toBeTruthy()

    dirCheckbox!.click()
    await flushPromises()

    confirmButton().click()
    await flushPromises()

    const emitted = wrapper.emitted('update:excludePaths')
    expect(emitted, '应发出排除目录变更').toBeTruthy()
    expect(emitted![0][0]).toEqual(['/剧集'])
    // 精确排除不带任何通配符，避免「前缀相似目录被误排除」
    expect((emitted![0][0] as string[])[0]).not.toContain('*')
    // 排除目录不影响同步内容
    expect(wrapper.emitted('update:includePaths')).toBeUndefined()
  })

  it('排除目录与已有排除目录合并去重，并裁掉被祖先覆盖的后代', async () => {
    const wrapper = mountEditor({ excludePaths: ['/剧集/S01'] })
    await flushPromises()

    browseButton('排除目录').click()
    await flushPromises()

    checkboxOf(fileItem('剧集'))!.click()
    await flushPromises()

    confirmButton().click()
    await flushPromises()

    const emitted = wrapper.emitted('update:excludePaths')!
    const value = emitted[emitted.length - 1][0] as string[]
    // /剧集 覆盖 /剧集/S01 → 后者不必单独保留
    expect(value).toEqual(['/剧集'])
  })

  it('同步内容浏览仍可选文件与文件夹，保存到 includePaths', async () => {
    const wrapper = mountEditor()
    await flushPromises()

    browseButton('同步内容').click()
    await flushPromises()

    // 同步内容模式下文件可勾选（默认全选，可逐个取消）
    const fileCheckbox = checkboxOf(fileItem('说明.txt'))
    expect(fileCheckbox, '同步内容模式下文件应可勾选').toBeTruthy()

    confirmButton().click()
    await flushPromises()

    const emitted = wrapper.emitted('update:includePaths')
    expect(emitted).toBeTruthy()
    const value = emitted![0][0] as string[]
    expect(value).toContain('/剧集')
    expect(value).toContain('/说明.txt')
    expect(wrapper.emitted('update:excludePaths')).toBeUndefined()
  })
})

describe('ShareIncludeExcludeEditor 头部与折叠说明', () => {
  it('字段标题为「同步内容」，外层「同步范围」不在此组件内', async () => {
    const wrapper = mountEditor()
    await flushPromises()

    expect(fieldLabelTexts()).toEqual(['同步内容', '排除目录', '排除规则'])
    wrapper.unmount()
  })

  it('未选同步内容时头部显示「整个分享」，且不渲染空的标签区块', async () => {
    const wrapper = mountEditor({ includePaths: [] })
    await flushPromises()

    const block = fieldBlock('同步内容')
    expect(block.querySelector('.field-state')?.textContent?.trim()).toBe('整个分享')
    expect(block.querySelector('.path-tags'), '空范围不应有标签区块').toBeNull()
    wrapper.unmount()
  })

  it('已选同步内容时不再显示「整个分享」，标签可见', async () => {
    const wrapper = mountEditor({ includePaths: ['/剧集'] })
    await flushPromises()

    const block = fieldBlock('同步内容')
    expect(block.querySelector('.field-state')).toBeNull()
    const tag = block.querySelector('.path-tags .el-tag')
    expect(tag?.textContent?.trim()).toBe('/剧集')
    wrapper.unmount()
  })

  it('三处使用说明默认全部折叠（aria-expanded=false 且无说明文案）', async () => {
    const wrapper = mountEditor()
    await flushPromises()

    for (const [name, label] of [
      ['同步内容使用说明', '同步内容'],
      ['排除目录使用说明', '排除目录'],
      ['排除规则使用说明', '排除规则'],
    ]) {
      const btn = helpButton(name)
      expect(btn.getAttribute('aria-expanded'), `${name} 默认应折叠`).toBe('false')
      expect(helpText(label), `${label} 默认不应展开说明`).toBeNull()
    }
    // 默认折叠时不应出现「使用说明」的正文段落
    expect(document.body.querySelector('.exclude-help')).toBeNull()
    wrapper.unmount()
  })

  it('三处说明各自独立开关，互不影响', async () => {
    const wrapper = mountEditor()
    await flushPromises()

    helpButton('同步内容使用说明').click()
    await flushPromises()

    expect(helpButton('同步内容使用说明').getAttribute('aria-expanded')).toBe('true')
    expect(helpText('同步内容')).toBe(
        '不选则同步整个分享。选择文件夹会包含其全部内容及后续新增内容；选择文件则只同步该文件。',
    )
    // 另两处仍是折叠状态
    expect(helpButton('排除目录使用说明').getAttribute('aria-expanded')).toBe('false')
    expect(helpText('排除目录')).toBeNull()
    expect(helpButton('排除规则使用说明').getAttribute('aria-expanded')).toBe('false')

    // 再开排除目录：两处同时展开，互不关闭
    helpButton('排除目录使用说明').click()
    await flushPromises()
    expect(helpText('排除目录')).toBe('所选目录及其全部内容均不扫描、不参与同步。')
    expect(helpText('同步内容')).toBeTruthy()

    // 关掉同步内容：排除目录说明保持展开
    helpButton('同步内容使用说明').click()
    await flushPromises()
    expect(helpButton('同步内容使用说明').getAttribute('aria-expanded')).toBe('false')
    expect(helpText('同步内容')).toBeNull()
    expect(helpText('排除目录')).toBe('所选目录及其全部内容均不扫描、不参与同步。')
    wrapper.unmount()
  })

  it('使用说明箭头随展开状态切换，按钮文案不变且图标对辅助技术隐藏', async () => {
    const wrapper = mountEditor()
    await flushPromises()

    const names = ['同步内容使用说明', '排除目录使用说明', '排除规则使用说明']
    const caretOf = (name: string) => helpButton(name).querySelector<HTMLElement>('.help-caret')!
    const closedCaret = new Map<string, string>()

    for (const name of names) {
      const caret = caretOf(name)
      expect(caret, `${name} 应有状态箭头`).toBeTruthy()
      expect(caret.getAttribute('aria-hidden'), `${name} 箭头应为装饰性`).toBe('true')
      expect(caret.querySelector('svg'), `${name} 应渲染箭头图标`).toBeTruthy()
      expect(helpButton(name).textContent?.trim(), `${name} 文案应保持不变`).toBe('使用说明')
      closedCaret.set(name, caret.innerHTML)
    }

    for (const name of names) {
      helpButton(name).click()
      await flushPromises()
      expect(helpButton(name).getAttribute('aria-expanded')).toBe('true')
      expect(caretOf(name).innerHTML, `${name} 展开后箭头应切换`).not.toBe(closedCaret.get(name))
    }
    wrapper.unmount()
  })

  it('展开排除规则说明复用既有说明组件，并可再次折叠', async () => {
    const wrapper = mountEditor()
    await flushPromises()

    helpButton('排除规则使用说明').click()
    await flushPromises()
    expect(document.body.querySelector('.exclude-help'), '应显示既有排除规则说明').toBeTruthy()

    helpButton('排除规则使用说明').click()
    await flushPromises()
    expect(document.body.querySelector('.exclude-help')).toBeNull()
    wrapper.unmount()
  })

  it('关闭已选标签会按索引发出新的路径列表', async () => {
    const wrapper = mountEditor({ includePaths: ['/剧集', '/广告'], excludePaths: ['/缓存'] })
    await flushPromises()

    const includeClose = fieldBlock('同步内容')
        .querySelector<HTMLElement>('.path-tags .el-tag .el-tag__close')
    expect(includeClose, '同步内容标签应可关闭').toBeTruthy()
    includeClose!.click()
    await flushPromises()

    expect(wrapper.emitted('update:includePaths')![0][0]).toEqual(['/广告'])

    const excludeClose = fieldBlock('排除目录')
        .querySelector<HTMLElement>('.path-tags .el-tag .el-tag__close')
    expect(excludeClose, '排除目录标签应可关闭').toBeTruthy()
    excludeClose!.click()
    await flushPromises()

    expect(wrapper.emitted('update:excludePaths')![0][0]).toEqual([])
    wrapper.unmount()
  })
})

describe('ShareIncludeExcludeEditor 排除规则与常用词表', () => {
  it('每行一条添加规则，输入法组词时不提交', async () => {
    const wrapper = mountEditor()
    await flushPromises()

    const textarea = fieldBlock('排除规则').querySelector<HTMLTextAreaElement>('textarea')!
    expect(textarea, '应有规则输入框').toBeTruthy()

    // 组词中的回车（选字确认）不提交
    textarea.value = '*.tmp'
    textarea.dispatchEvent(new Event('input'))
    await flushPromises()
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }))
    await flushPromises()
    expect(wrapper.emitted('update:excludePatterns')).toBeUndefined()

    // 正常回车提交，按行拆分
    textarea.value = '*.tmp\n*.bak'
    textarea.dispatchEvent(new Event('input'))
    await flushPromises()
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await flushPromises()

    const emitted = wrapper.emitted('update:excludePatterns')!
    expect(emitted[emitted.length - 1][0]).toEqual(['*.tmp', '*.bak'])
    wrapper.unmount()
  })

  it('规则输入框占位符为「输入规则，每行一条」，与「添加」按钮同一行', async () => {
    const wrapper = mountEditor()
    await flushPromises()

    const row = fieldBlock('排除规则').querySelector<HTMLElement>('.exclude-input-row')!
    const textarea = row.querySelector<HTMLTextAreaElement>('textarea')
    expect(textarea?.getAttribute('placeholder'), '占位符应为简短提示').toBe('输入规则，每行一条')
    expect(row.querySelector('.exclude-input')?.contains(textarea!), '输入框应在输入行内').toBe(true)

    const addBtn = Array.from(row.querySelectorAll('button')).find((b) => b.textContent?.trim() === '添加')
    expect(addBtn, '输入行内应有「添加」按钮').toBeTruthy()
    expect(fieldBlock('排除规则').querySelector('.field-label')?.textContent?.trim()).toBe('排除规则')
    wrapper.unmount()
  })

  it('点击常用词表 chip 添加规则，保存按钮在无规则时禁用', async () => {
    config.presetRules = ['*.nfo']
    const wrapper = mountEditor()
    await flushPromises()

    // el-tag 外层是过渡组件，实际可点区域是里面的 el-tag 元素
    const chip = fieldBlock('排除规则').querySelector<HTMLElement>('.preset-tag .el-tag')
    expect(chip?.textContent?.trim()).toBe('*.nfo')

    const saveBtn = Array.from(fieldBlock('排除规则').querySelectorAll<HTMLButtonElement>('button'))
        .find((b) => b.textContent?.trim() === '存为常用')
    expect(saveBtn, '应有「存为常用」按钮').toBeTruthy()
    expect(saveBtn!.disabled, '无规则时「存为常用」应禁用').toBe(true)

    chip!.click()
    await flushPromises()
    expect(wrapper.emitted('update:excludePatterns')![0][0]).toEqual(['*.nfo'])
    wrapper.unmount()
  })

  it('有规则时「存为常用」可点击并写回配置，「管理常用规则」跳转设置页', async () => {
    config.presetRules = []
    const wrapper = mountEditor({ excludePatterns: ['*.tmp'] })
    await flushPromises()

    const buttons = Array.from(fieldBlock('排除规则').querySelectorAll<HTMLButtonElement>('button'))
    const saveBtn = buttons.find((b) => b.textContent?.trim() === '存为常用')
    expect(saveBtn && !saveBtn.disabled, '有规则时「存为常用」应可用').toBe(true)

    await saveBtn!.click()
    await flushPromises()
    expect(config.updateConfig).toHaveBeenCalledTimes(1)
    const saved = config.updateConfig.mock.calls[0][0] as { share_sync: { exclude_preset_rules: string[] } }
    expect(saved.share_sync.exclude_preset_rules).toEqual(['*.tmp'])

    const manageBtn = Array.from(fieldBlock('排除规则').querySelectorAll<HTMLButtonElement>('button'))
        .find((b) => b.textContent?.trim() === '管理常用规则')
    expect(manageBtn, '应有「管理常用规则」入口').toBeTruthy()
    manageBtn!.click()
    await flushPromises()
    expect(routerPush).toHaveBeenCalledWith({ path: '/settings', query: { tab: 'sharesync' } })
    wrapper.unmount()
  })

  it('词表为空时不再渲染空态长文案，仅保留两个操作按钮', async () => {
    config.presetRules = []
    const wrapper = mountEditor()
    await flushPromises()

    const presetRow = fieldBlock('排除规则').querySelector<HTMLElement>('.preset-row')!
    expect(presetRow.querySelectorAll('.preset-tag')).toHaveLength(0)
    const labels = Array.from(presetRow.querySelectorAll('button')).map((b) => b.textContent?.trim())
    expect(labels).toEqual(['存为常用', '管理常用规则'])
    // 旧的长空态文案已移除
    expect(presetRow.textContent).not.toContain('常用规则词表为空')
    wrapper.unmount()
  })
})

describe('ShareIncludeExcludeEditor 账号未登录', () => {
  it('保留未登录提示并禁用浏览入口', async () => {
    const wrapper = mountEditor({ ownerLoggedIn: false })
    await flushPromises()

    expect(fieldBlock('同步内容').textContent).toContain('订阅所属账号未登录，目录树预览不可用')
    const browse = browseButton('同步内容') as HTMLButtonElement
    expect(browse.disabled, '账号未登录时浏览按钮应禁用').toBe(true)
    wrapper.unmount()
  })
})
