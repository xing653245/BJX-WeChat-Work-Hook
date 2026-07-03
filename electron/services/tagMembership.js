/**
 * 通过组合 6000（标签组）与 6006（标签下联系人）推断用户所属标签
 */
const { callVWorkAPI } = require('../middleware/apiHandler')

/** 同端口最多排队多少个 user-tags 组合查询（含正在执行的） */
const MAX_USER_TAGS_QUEUE_DEPTH = 2

const portUserTagsQueues = new Map()

function unwrapHookData(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return raw
  }
  if (raw.data != null && typeof raw.data === 'object' && !Array.isArray(raw.data)) {
    const inner = raw.data
    if (inner.data != null && typeof inner.data === 'object' && !Array.isArray(inner.data)) {
      return inner.data
    }
    return inner
  }
  return raw
}

function isHookSuccess(raw) {
  if (!raw || typeof raw !== 'object') {
    return false
  }
  if (raw.errno != null) {
    return Number(raw.errno) === 0
  }
  if (raw.code != null) {
    return Number(raw.code) === 0
  }
  if (raw.errcode != null) {
    return Number(raw.errcode) === 0
  }
  return true
}

function hookErrorMessage(raw, fallback) {
  return raw?.errmsg || raw?.msg || raw?.message || raw?.err_msg || fallback
}

function extractGroups(raw) {
  const data = unwrapHookData(raw)
  if (Array.isArray(data)) {
    return data
  }
  if (Array.isArray(data?.group_list)) {
    return data.group_list
  }
  if (Array.isArray(data?.groupList)) {
    return data.groupList
  }
  if (Array.isArray(data?.list)) {
    return data.list
  }
  return []
}

function collectAllLabels(groupsRaw) {
  const data = unwrapHookData(groupsRaw)
  const flatList = data?.label_list ?? data?.labelList
  if (Array.isArray(flatList) && flatList.length > 0) {
    return flatList
      .map((label) => ({
        group_id: label.group_id ?? label.groupId ?? '',
        group_name: label.group_name ?? label.groupName ?? '',
        label_id: label.label_id ?? label.labelId ?? label.id,
        label_name: label.label_name ?? label.labelName ?? label.name ?? ''
      }))
      .filter((label) => label.label_id != null && label.label_id !== '')
  }

  const labels = []
  for (const group of extractGroups(groupsRaw)) {
    const groupId = group.group_id ?? group.groupId ?? ''
    const groupName = group.group_name ?? group.groupName ?? group.name ?? ''
    const labelList = group.label_list ?? group.labelList ?? group.labels ?? []
    if (!Array.isArray(labelList)) {
      continue
    }
    for (const label of labelList) {
      labels.push({
        group_id: groupId,
        group_name: groupName,
        label_id: label.label_id ?? label.labelId ?? label.id,
        label_name: label.label_name ?? label.labelName ?? label.name ?? ''
      })
    }
  }
  return labels.filter((label) => label.label_id != null && label.label_id !== '')
}

function extractUserIds(raw) {
  const data = unwrapHookData(raw)
  const list = data?.user_list ?? data?.userList ?? data?.list ?? data?.friends
  if (Array.isArray(list)) {
    return list
      .map((item) => {
        if (typeof item === 'string') {
          return item
        }
        return item?.user_id ?? item?.userId ?? item?.id ?? ''
      })
      .filter(Boolean)
  }
  if (Array.isArray(data?.user_id_list)) {
    return data.user_id_list.filter(Boolean)
  }
  if (Array.isArray(data)) {
    return data
      .map((item) => {
        if (typeof item === 'string') {
          return item
        }
        return item?.user_id ?? item?.userId ?? item?.id ?? ''
      })
      .filter(Boolean)
  }
  return []
}

function userInTag(userId, memberUserIds) {
  const target = String(userId)
  return memberUserIds.some((id) => String(id) === target)
}

function getPortUserTagsQueue(port) {
  const key = String(port)
  if (!portUserTagsQueues.has(key)) {
    portUserTagsQueues.set(key, {
      tail: Promise.resolve(),
      pending: 0
    })
  }
  return portUserTagsQueues.get(key)
}

/**
 * 同端口 user-tags 串行执行，防止多个组合查询叠加数百次 Hook 调用
 */
function enqueueUserTagsTask(port, taskFn) {
  const q = getPortUserTagsQueue(port)
  if (q.pending >= MAX_USER_TAGS_QUEUE_DEPTH) {
    const err = new Error(
      `获取用户标签队列已满（同端口最多 ${MAX_USER_TAGS_QUEUE_DEPTH} 个），请等待当前查询完成后再试`
    )
    err.code = 'USER_TAGS_QUEUE_FULL'
    return Promise.reject(err)
  }

  q.pending++
  const run = async () => {
    try {
      return await taskFn()
    } finally {
      q.pending = Math.max(0, q.pending - 1)
    }
  }

  const result = q.tail.then(run, run)
  q.tail = result.catch(() => {})
  return result
}

async function resolveUserTags(port, userId) {
  const groupsRaw = await callVWorkAPI(port, 6000)
  if (!isHookSuccess(groupsRaw)) {
    const err = new Error(hookErrorMessage(groupsRaw, '获取标签组列表失败'))
    err.hookResponse = groupsRaw
    throw err
  }

  const allLabels = collectAllLabels(groupsRaw)
  const matchedTags = []

  for (const label of allLabels) {
    const friendsRaw = await callVWorkAPI(port, 6006, { label_id: label.label_id })
    if (!isHookSuccess(friendsRaw)) {
      const err = new Error(
        hookErrorMessage(friendsRaw, `获取标签(${label.label_id})下的联系人失败`)
      )
      err.hookResponse = friendsRaw
      err.label_id = label.label_id
      throw err
    }

    const memberUserIds = extractUserIds(friendsRaw)
    if (userInTag(userId, memberUserIds)) {
      matchedTags.push({
        group_id: label.group_id,
        group_name: label.group_name,
        label_id: label.label_id,
        label_name: label.label_name
      })
    }
  }

  return {
    user_id: userId,
    label_list: matchedTags,
    label_id_list: matchedTags.map((tag) => tag.label_id)
  }
}

/**
 * 获取指定用户所属的标签列表
 * @param {number|string} port 企微 HTTP 端口
 * @param {string} userId 用户 ID
 */
function getUserTags(port, userId) {
  return enqueueUserTagsTask(port, () => resolveUserTags(port, userId))
}

module.exports = {
  getUserTags,
  MAX_USER_TAGS_QUEUE_DEPTH
}
