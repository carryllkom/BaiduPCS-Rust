<template>
  <div class="share-include-exclude-editor">
    <!-- 同步路径（include_paths） -->
    <div class="field-block">
      <div class="field-label">同步路径</div>
      <div class="path-editor">
        <div v-if="includePaths.length === 0" class="path-empty">
          不填则同步整个分享；填写后只同步勾选的子路径（前缀匹配）。
        </div>
        <div v-else class="path-tags">
          <el-tag
            v-for="(p, i) in includePaths"
            :key="p + i"
            closable
            @close="removeInclude(i)"
            style="margin: 2px 4px 2px 0"
          >{{ p }}</el-tag>
        </div>
        <div class="path-actions">
          <el-input
            v-model="pathInput"
            size="small"
            placeholder="手动输入路径，如 /剧集"
            style="width: 220px; margin-right: 8px"
            @keyup.enter="addPath"
          >
            <template #append>
              <el-button :icon="Plus" @click="addPath" />
            </template>
          </el-input>
          <el-tooltip
            :disabled="ownerLoggedIn !== false"
            content="订阅所属账号未登录，请先登录该账号再预览目录树"
            placement="top"
          >
            <span>
              <el-button
                size="small"
                :icon="FolderOpened"
                :loading="loadingTree"
                :disabled="!shareUrl || ownerLoggedIn === false"
                @click="openTreePicker"
              >从分享浏览</el-button>
            </span>
          </el-tooltip>
        </div>
        <div v-if="ownerLoggedIn === false" class="owner-offline-hint">
          订阅所属账号未登录，目录树预览不可用，请先登录该账号
        </div>
      </div>
    </div>

    <!-- 排除规则（exclude_patterns） -->
    <div class="field-block">
      <div class="field-label">排除规则</div>
      <div class="path-editor">
        <div class="path-tags">
          <el-tag
            v-for="(p, i) in excludePatterns"
            :key="p + i"
            closable
            type="info"
            @close="removeExclude(i)"
            style="margin: 2px 4px 2px 0"
          >{{ p }}</el-tag>
          <span v-if="excludePatterns.length === 0" class="path-empty-inline">
            支持 glob：*.tmp、sample.*、*广告* 等
          </span>
        </div>
        <el-input
          v-model="excludeInput"
          size="small"
          placeholder="添加排除规则，按回车确认"
          style="width: 280px; margin-top: 4px"
          @keyup.enter="addExclude"
        />
      </div>
    </div>

    <!-- 目录树选择对话框 -->
    <el-dialog
      v-model="treePickerVisible"
      title="从分享中选择要同步的子路径"
      width="640px"
      :close-on-click-modal="false"
      append-to-body
      @open="loadTree"
    >
      <div class="tree-picker-toolbar">
        <el-input
          v-model="treeFilterText"
          placeholder="搜索路径/文件名"
          clearable
          size="small"
          style="width: 240px"
        />
        <el-checkbox v-model="treeCheckStrictly" style="margin-left: 12px">
          父子独立选择
        </el-checkbox>
        <el-radio-group v-model="treeDepth" size="small" style="margin-left: 12px">
          <el-radio-button :value="1">仅根</el-radio-button>
          <el-radio-button :value="2">2 层</el-radio-button>
          <el-radio-button :value="3">3 层</el-radio-button>
        </el-radio-group>
        <el-button size="small" :loading="loadingTree" :icon="Refresh" style="margin-left: 12px" @click="loadTree">刷新</el-button>
      </div>
      <el-alert
        v-if="treeError"
        :title="treeError"
        type="error"
        :closable="false"
        show-icon
        style="margin-bottom: 8px"
      />
      <el-tree
        ref="treeRef"
        :data="treeData"
        :props="treeProps"
        node-key="path"
        show-checkbox
        :check-strictly="treeCheckStrictly"
        :default-checked-keys="includePaths"
        :filter-node-method="filterTreeNode"
        :default-expand-all="false"
        v-loading="loadingTree"
        empty-text="暂无内容或分享已失效"
        style="max-height: 420px; overflow: auto"
      >
        <template #default="{ data }">
          <span class="tree-node">
            <el-icon v-if="data.is_dir"><FolderOpened /></el-icon>
            <el-icon v-else><Document /></el-icon>
            <span style="margin-left: 4px">{{ data.name }}</span>
            <span v-if="!data.is_dir" class="tree-size">{{ formatSize(data.size) }}</span>
          </span>
        </template>
      </el-tree>
      <template #footer>
        <span class="tree-picker-hint">已选 {{ includePaths.length }} 个路径</span>
        <el-button @click="treePickerVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmTreePicker">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { ElMessage, type ElTree } from 'element-plus'
import type { AxiosError } from 'axios'
import { Plus, Refresh, FolderOpened, Document } from '@element-plus/icons-vue'
import { previewTree, type TreeNode } from '@/api/shareSync'

const props = defineProps<{
  shareUrl: string
  password?: string | null
  includePaths: string[]
  excludePatterns: string[]
  // 订阅所属账号：编辑订阅时传订阅自己的 owner_uid，预览目录树按该账号路由 client
  // （不传则后端回退当前 active 账号——转存对话框创建场景 owner=active）
  ownerUid?: number | null
  // 订阅所属账号是否已登录：显式 false 时禁用目录树预览并提示登录该账号。
  // undefined（创建场景）= 默认按已登录处理。
  ownerLoggedIn?: boolean
}>()

const emit = defineEmits<{
  'update:includePaths': [value: string[]]
  'update:excludePatterns': [value: string[]]
}>()

const pathInput = ref('')
const excludeInput = ref('')

// 目录树选择
const treePickerVisible = ref(false)
const treeData = ref<TreeNode[]>([])
const treeRef = ref<InstanceType<typeof ElTree>>()
const treeProps = {
  children: 'children',
  label: 'name',
  isLeaf: (d: TreeNode) => !d.is_dir,
} as const
const treeFilterText = ref('')
const treeCheckStrictly = ref(false)
const treeDepth = ref<number>(2)
const loadingTree = ref(false)
const treeError = ref('')

watch(treeFilterText, (v) => {
  treeRef.value?.filter(v)
})

function normalizePath(v: string): string {
  const s = v.trim().replace(/\/+/g, '/')
  if (!s) return ''
  const prefixed = s.startsWith('/') ? s : `/${s}`
  if (prefixed.length === 1) return '/'
  return prefixed.endsWith('/') ? prefixed.slice(0, -1) : prefixed
}

function addPath() {
  const v = normalizePath(pathInput.value)
  if (!v) return
  if (!props.includePaths.includes(v)) {
    emit('update:includePaths', [...props.includePaths, v])
  }
  pathInput.value = ''
}

function removeInclude(i: number) {
  const next = [...props.includePaths]
  next.splice(i, 1)
  emit('update:includePaths', next)
}

function addExclude() {
  const v = excludeInput.value.trim()
  if (!v) return
  if (!props.excludePatterns.includes(v)) {
    emit('update:excludePatterns', [...props.excludePatterns, v])
  }
  excludeInput.value = ''
}

function removeExclude(i: number) {
  const next = [...props.excludePatterns]
  next.splice(i, 1)
  emit('update:excludePatterns', next)
}

function openTreePicker() {
  if (!props.shareUrl || !props.shareUrl.trim()) {
    ElMessage.warning('请先填写分享链接')
    return
  }
  if (props.ownerLoggedIn === false) {
    ElMessage.warning('订阅所属账号未登录，请先登录该账号再预览目录树')
    return
  }
  treeError.value = ''
  treePickerVisible.value = true
}

async function loadTree() {
  loadingTree.value = true
  treeError.value = ''
  try {
    const resp = await previewTree(
      props.shareUrl.trim(),
      props.password || null,
      treeDepth.value,
      props.ownerUid ?? null
    )
    treeData.value = resp.root || []
    // 重新设置已选
    await nextTick()
    props.includePaths.forEach((p: string) => {
      treeRef.value?.setChecked?.(p, true, false)
    })
  } catch (e) {
    const ax = e as AxiosError<{ message?: string; error?: string }>
    treeError.value =
      ax?.response?.data?.message ||
      ax?.response?.data?.error ||
      (e as Error)?.message ||
      '加载目录树失败'
  } finally {
    loadingTree.value = false
  }
}

function confirmTreePicker() {
  // 只取“完全勾选”的节点。半选(getHalfCheckedNodes)是因子节点部分选中而处于
  // 中间态的祖先目录——若把它们也写进 include_paths，后端按“include_path = 整棵
  // 子树（前缀匹配）”的语义会把未勾选的兄弟节点一并纳入，造成过度同步
  // （例：只勾 /A/B/1.txt 却把整个 /A 都同步）。祖先目录用于下钻遍历的需求，
  // 后端已通过 build_include_index 自动补齐，无需前端再加。
  const checked = treeRef.value?.getCheckedNodes?.(false, false) || []
  const paths = checked
    .map((n) => normalizePath((n as unknown as TreeNode).path))
    .filter((p: string) => p.length > 0)
  // 去重 + 裁剪被已勾选祖先覆盖的冗余后代（勾选目录即代表整棵子树）
  const nextInclude: string[] = []
  const seen = new Set<string>()
  for (const p of paths) {
    if (seen.has(p)) continue
    seen.add(p)
    const coveredByAncestor = paths.some((a) => a !== p && p.startsWith(`${a}/`))
    if (coveredByAncestor) continue
    nextInclude.push(p)
  }
  emit('update:includePaths', nextInclude)
  treePickerVisible.value = false
}

function filterTreeNode(query: string, data: TreeNode) {
  if (!query) return true
  return (data.name as string)?.toLowerCase?.().includes(query.toLowerCase())
}

function formatSize(n: number): string {
  if (!n) return ''
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = n
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024
    i++
  }
  return v.toFixed(v >= 100 || i === 0 ? 0 : 1) + ' ' + u[i]
}
</script>

<style scoped lang="scss">
.field-block {
  margin-bottom: 12px;
}

.field-label {
  font-size: 13px;
  color: var(--el-text-color-regular);
  margin-bottom: 6px;
}

.path-editor {
  width: 100%;
}

.path-empty {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 6px;
}

.owner-offline-hint {
  font-size: 12px;
  color: var(--el-color-warning);
  margin-top: 6px;
}

.path-empty-inline {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.path-tags {
  margin-bottom: 6px;
}

.path-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

.tree-picker-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.tree-node {
  display: flex;
  align-items: center;
}

.tree-size {
  margin-left: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.tree-picker-hint {
  margin-right: auto;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
