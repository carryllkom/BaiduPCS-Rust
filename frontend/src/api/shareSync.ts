/**
 * 分享同步 API 客户端
 */

import { rawApiClient } from './client'

// ==================== 类型定义 ====================

export type ConflictStrategy = 'overwrite' | 'versioned' | 'skip'
export type PollMode = 'disabled' | 'interval' | 'scheduled'
export type TargetKind = 'netdisk' | 'local'

export interface NetdiskTarget {
  kind: 'netdisk'
  remote_path: string
  save_fs_id: number
  conflict_strategy?: ConflictStrategy | null
}

export interface LocalTarget {
  kind: 'local'
  local_path: string
  conflict_strategy?: ConflictStrategy | null
}

export type SyncTarget = NetdiskTarget | LocalTarget

export interface PollConfig {
  enabled: boolean
  mode: PollMode
  interval_secs: number
  schedule_hour?: number | null
  schedule_minute?: number | null
}

export interface ShareSubscription {
  id: string
  name: string
  share_url: string
  password?: string | null
  include_paths: string[]
  exclude_patterns: string[]
  targets: SyncTarget[]
  conflict_strategy: ConflictStrategy
  delete_missing: boolean
  poll_config: PollConfig
  enabled: boolean
  created_at: string
  updated_at: string
  /** 订阅所属账号 uid；前端据此渲染账号徽章 / 按账号过滤 */
  owner_uid: number
}

export interface CreateShareSubscriptionRequest {
  name: string
  share_url: string
  password?: string | null
  include_paths?: string[]
  exclude_patterns?: string[]
  targets: SyncTarget[]
  conflict_strategy?: ConflictStrategy
  delete_missing?: boolean
  poll_config?: PollConfig
  /** 显式指定归属账号；缺省由后端回退到当前活跃账号 */
  owner_uid?: number
}

export interface UpdateShareSubscriptionRequest {
  name?: string
  share_url?: string
  password?: string | null
  include_paths?: string[]
  exclude_patterns?: string[]
  targets?: SyncTarget[]
  conflict_strategy?: ConflictStrategy
  delete_missing?: boolean
  poll_config?: PollConfig
  enabled?: boolean
}

export interface RunRecord {
  id: string
  started_at: number
  finished_at: number | null
  status: string
  total_count: number
  added_count: number
  modified_count: number
  removed_count: number
  unchanged_count: number
  failed_count: number
  skipped_count: number
  overwritten_count: number
  error: string | null
}

export interface RunItemRecord {
  id: number
  path: string
  action: string
  target: string
  transfer_task_id: string | null
  download_task_id: string | null
  status: string
  versioned_old_path: string | null
  error: string | null
  reason?: string | null
}

export interface RunDetail {
  id: string
  started_at: number
  finished_at: number | null
  status: string
  total_count: number
  added_count: number
  modified_count: number
  removed_count: number
  unchanged_count: number
  failed_count: number
  skipped_count: number
  overwritten_count: number
  error: string | null
  items: RunItemRecord[]
}

export interface ShareSnapshotItem {
  path: string
  raw_path?: string
  fs_id: number
  size: number
  name: string
  is_dir: boolean
}

export interface ShareSnapshot {
  id: string
  subscription_id: string
  captured_at: string
  items: ShareSnapshotItem[]
}

/**
 * 分享同步 WS 事件载荷（与后端 ShareSyncEvent 对齐）
 */
export type ShareSyncWsEvent =
  | { type: 'subscription_created'; subscription_id: string; name: string; owner_uid?: number }
  | { type: 'subscription_updated'; subscription_id: string; owner_uid?: number }
  | { type: 'subscription_deleted'; subscription_id: string; owner_uid?: number }
  | { type: 'status_changed'; subscription_id: string; enabled: boolean; owner_uid?: number }
  | { type: 'diff_detected'; run_id: string; subscription_id: string; added: number; modified: number; removed: number; owner_uid?: number }
  | { type: 'run_started'; run_id: string; subscription_id: string; owner_uid?: number }
  | { type: 'run_completed'; run_id: string; subscription_id: string; added: number; modified: number; removed: number; failed: number; owner_uid?: number }
  | { type: 'run_failed'; run_id: string; subscription_id: string; error: string; owner_uid?: number }

// ==================== API ====================

const BASE = '/share-sync'

export async function listSubscriptions(uid?: number | null): Promise<ShareSubscription[]> {
  // 缺省返回全部账号（与 transfer/autobackup 一致）；传 uid 时按账号过滤。
  const params = typeof uid === 'number' ? { uid } : undefined
  const r = await rawApiClient.get<{ success: boolean; data: ShareSubscription[] }>(`${BASE}/subscriptions`, { params })
  return r.data.data
}

export async function getSubscription(id: string): Promise<ShareSubscription> {
  const r = await rawApiClient.get<{ success: boolean; data: ShareSubscription }>(`${BASE}/subscriptions/${id}`)
  return r.data.data
}

export async function createSubscription(req: CreateShareSubscriptionRequest): Promise<ShareSubscription> {
  const r = await rawApiClient.post<{ success: boolean; data: ShareSubscription }>(`${BASE}/subscriptions`, req)
  return r.data.data
}

export async function updateSubscription(id: string, req: UpdateShareSubscriptionRequest): Promise<ShareSubscription> {
  const r = await rawApiClient.put<{ success: boolean; data: ShareSubscription }>(`${BASE}/subscriptions/${id}`, req)
  return r.data.data
}

export async function deleteSubscription(id: string): Promise<void> {
  await rawApiClient.delete(`${BASE}/subscriptions/${id}`)
}

export async function setSubscriptionEnabled(id: string, enabled: boolean): Promise<void> {
  const path = enabled ? 'enable' : 'disable'
  await rawApiClient.post(`${BASE}/subscriptions/${id}/${path}`)
}

export async function triggerSubscription(id: string): Promise<void> {
  await rawApiClient.post(`${BASE}/subscriptions/${id}/trigger`)
}

export async function listRuns(id: string, page = 1, pageSize = 20): Promise<RunRecord[]> {
  const r = await rawApiClient.get<{ success: boolean; data: RunRecord[] }>(`${BASE}/subscriptions/${id}/runs`, {
    params: { page, page_size: pageSize }
  })
  return r.data.data
}

export async function getRun(runId: string): Promise<RunDetail> {
  const r = await rawApiClient.get<{ success: boolean; data: RunDetail }>(`${BASE}/runs/${runId}`)
  return r.data.data
}

export async function getLatestSnapshot(id: string): Promise<ShareSnapshot> {
  const r = await rawApiClient.get<{ success: boolean; data: ShareSnapshot }>(`${BASE}/subscriptions/${id}/snapshots/latest`)
  return r.data.data
}

// ==================== 目录树预览 ====================

export interface TreeNode {
  path: string
  name: string
  is_dir: boolean
  size: number
  fs_id: number
  children?: TreeNode[] | null
}

export interface PreviewTreeResponse {
  root: TreeNode[]
  short_key: string
  shareid: string
}

/**
 * 预览分享的目录树（用于前端勾选 include_paths）
 */
export async function previewTree(
  share_url: string,
  password?: string | null,
  depth = 2,
  ownerUid?: number | null
): Promise<PreviewTreeResponse> {
  const r = await rawApiClient.post<{ success: boolean; data: PreviewTreeResponse }>(
    `${BASE}/preview-tree`,
    {
      share_url,
      password: password || null,
      depth,
      // 按订阅所属账号路由网盘 client（编辑非当前账号订阅时必需）；不传则后端回退 active 账号
      owner_uid: ownerUid ?? undefined,
    }
  )
  return r.data.data
}
