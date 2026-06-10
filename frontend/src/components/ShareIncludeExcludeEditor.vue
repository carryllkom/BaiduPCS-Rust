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
          <el-button
            size="small"
            :icon="FolderOpened"
            :loading="loadingTree"
            :disabled="!shareUrl"
            @click="openTreePicker"
          >从分享浏览</el-button>
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
  if (!props.shareUrl) {
    ElMessage.warning('请先填写分享链接')
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
      props.shareUrl,
      props.password || null,
      treeDepth.value
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
  const checked = treeRef.value?.getCheckedNodes?.(false, false) || []
  const halfChecked = treeRef.value?.getHalfCheckedNodes?.() || []
  const all = [...checked, ...halfChecked]
  // 按照树节点路径回填，先标准化再去重
  const nextInclude: string[] = []
  const uniq = new Set<string>()
  all
    .map((n) => (n as unknown as TreeNode).path)
    .map((p: string) => normalizePath(p))
    .filter((p: string) => p.length > 0)
    .forEach((p: string) => {
      if (!uniq.has(p)) {
        uniq.add(p)
        nextInclude.push(p)
      }
    })
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
