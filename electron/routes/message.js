/**
 * 消息发送相关路由
 * 
 * 授权说明：
 * - 所有接口都需要授权验证
 */
const express = require('express')
const router = express.Router()
const { createAPIHandler } = require('../middleware/apiHandler')

/**
 * 发送文本消息
 * POST /api/message/text
 * 请求体: { "port": 8080, "user_id": "用户ID", "msg": "消息内容" }
 */
router.post('/text', createAPIHandler(3000, '发送文本消息', (params) => {
  if (!params.user_id) {
    return { valid: false, message: '缺少参数: user_id (用户ID)' }
  }
  if (!params.msg) {
    return { valid: false, message: '缺少参数: msg (消息内容)' }
  }
  return { valid: true, params: { user_id: params.user_id, msg: params.msg } }
}))

/**
 * 发送图片消息
 * POST /api/message/image
 * 请求体: { "port": 8080, "user_id": "用户ID", "path": "图片路径" }
 */
router.post('/image', createAPIHandler(3001, '发送图片消息', (params) => {
  if (!params.user_id) {
    return { valid: false, message: '缺少参数: user_id (用户ID)' }
  }
  if (!params.path) {
    return { valid: false, message: '缺少参数: path (图片路径)' }
  }
  return { valid: true, params: { user_id: params.user_id, path: params.path } }
}))

/**
 * 发送小程序
 * POST /api/message/applet
 * 请求体: { 
 *   "port": 8080, 
 *   "user_id": "用户ID", 
 *   "title": "标题",
 *   "desc": "描述",
 *   "cover_path": "封面路径",
 *   "wechat_id": "微信ID",
 *   "page_path": "页面路径",
 *   "avatar_url": "头像地址(URL，必填)",
 *   "app_id": "小程序ID"
 * }
 * 群发：可并发 POST，框架按端口自动串行（约 5s 间隔 + 5s 冷却）；队列超过 30 条返回 503，请勿超时重试。
 */
router.post('/applet', createAPIHandler(3006, '发送小程序', (params) => {
  if (!params.user_id) {
    return { valid: false, message: '缺少参数: user_id (用户ID/群ID)' }
  }
  if (!params.title) {
    return { valid: false, message: '缺少参数: title (标题)' }
  }
  if (!params.desc) {
    return { valid: false, message: '缺少参数: desc (描述)' }
  }
  if (!params.cover_path) {
    return { valid: false, message: '缺少参数: cover_path (封面路径，本机可读)' }
  }
  if (!params.wechat_id) {
    return { valid: false, message: '缺少参数: wechat_id (微信ID)' }
  }
  if (!params.page_path) {
    return { valid: false, message: '缺少参数: page_path (页面路径)' }
  }
  if (!params.avatar_url) {
    return { valid: false, message: '缺少参数: avatar_url (头像地址)' }
  }
  return {
    valid: true,
    params: {
      user_id: params.user_id,
      title: params.title,
      desc: params.desc,
      avatar_url: params.avatar_url,
      cover_path: params.cover_path,
      app_id: params.app_id || '',
      wechat_id: params.wechat_id,
      page_path: params.page_path
    }
  }
}))

/**
 * 发送GIF表情
 * POST /api/message/gif
 * 请求体: { "port": 8080, "user_id": "用户ID", "path": "GIF路径" }
 */
router.post('/gif', createAPIHandler(3002, '发送GIF表情', (params) => {
  if (!params.user_id) {
    return { valid: false, message: '缺少参数: user_id (用户ID)' }
  }
  if (!params.path) {
    return { valid: false, message: '缺少参数: path (GIF路径)' }
  }
  return { valid: true, params: { user_id: params.user_id, path: params.path } }
}))

/**
 * 发送文件消息
 * POST /api/message/file
 * 请求体: { "port": 8080, "user_id": "用户ID", "path": "文件路径" }
 */
router.post('/file', createAPIHandler(3003, '发送文件消息', (params) => {
  if (!params.user_id) {
    return { valid: false, message: '缺少参数: user_id (用户ID)' }
  }
  if (!params.path) {
    return { valid: false, message: '缺少参数: path (文件路径)' }
  }
  return { valid: true, params: { user_id: params.user_id, path: params.path } }
}))

/**
 * 发送视频消息
 * POST /api/message/video
 * 请求体: { "port": 8080, "user_id": "用户ID", "path": "视频路径" }
 */
router.post('/video', createAPIHandler(3004, '发送视频消息', (params) => {
  if (!params.user_id) {
    return { valid: false, message: '缺少参数: user_id (用户ID)' }
  }
  if (!params.path) {
    return { valid: false, message: '缺少参数: path (视频路径)' }
  }
  return { valid: true, params: { user_id: params.user_id, path: params.path } }
}))

/**
 * 发送名片
 * POST /api/message/card
 * 请求体: { "port": 8080, "user_id": "用户ID", "friend_user_id": "好友用户ID" }
 */
router.post('/card', createAPIHandler(3005, '发送名片', (params) => {
  if (!params.user_id) {
    return { valid: false, message: '缺少参数: user_id (用户ID)' }
  }
  if (!params.friend_user_id) {
    return { valid: false, message: '缺少参数: friend_user_id (好友用户ID)' }
  }
  return {
    valid: true,
    params: {
      user_id: params.user_id,
      friend_user_id: params.friend_user_id
    }
  }
}))

/**
 * 发送视频号
 * POST /api/message/video-number
 * 请求体: { 
 *   "port": 8080, 
 *   "user_id": "用户ID",
 *   "nick_name": "昵称",
 *   "desc": "描述",
 *   "cover_url": "封面URL",
 *   "video_url": "视频URL",
 *   "extras": "扩展信息",
 *   "avatar_url": "头像URL",
 *   "thumb_url": "缩略图URL"
 * }
 */
router.post('/video-number', createAPIHandler(3007, '发送视频号', (params) => {
  if (!params.user_id) {
    return { valid: false, message: '缺少参数: user_id (用户ID)' }
  }
  if (!params.nick_name) {
    return { valid: false, message: '缺少参数: nick_name (昵称)' }
  }
  if (!params.desc) {
    return { valid: false, message: '缺少参数: desc (描述)' }
  }
  if (!params.cover_url) {
    return { valid: false, message: '缺少参数: cover_url (封面URL)' }
  }
  if (!params.video_url) {
    return { valid: false, message: '缺少参数: video_url (视频URL)' }
  }
  if (!params.thumb_url) {
    return { valid: false, message: '缺少参数: thumb_url (缩略图URL)' }
  }
  if (!params.avatar_url) {
    return { valid: false, message: '缺少参数: avatar_url (头像URL)' }
  }
  if (!params.extras) {
    return { valid: false, message: '缺少参数: extras (视频标识)' }
  }
  return {
    valid: true,
    params: {
      user_id: params.user_id,
      cover_url: params.cover_url,
      thumb_url: params.thumb_url || '',
      avatar_url: params.avatar_url || '',
      nick_name: params.nick_name,
      desc: params.desc,
      video_url: params.video_url,
      extras: params.extras || ''
    }
  }
}))

/**
 * 发送卡片链接
 * POST /api/message/card-link
 * 请求体: { 
 *   "port": 8080, 
 *   "user_id": "用户ID",
 *   "title": "标题",
 *   "desc": "描述",
 *   "target_url": "目标URL",
 *   "cover_url": "封面URL"
 * }
 */
router.post('/card-link', createAPIHandler(3008, '发送卡片链接', (params) => {
  if (!params.user_id) {
    return { valid: false, message: '缺少参数: user_id (用户ID)' }
  }
  if (!params.title) {
    return { valid: false, message: '缺少参数: title (标题)' }
  }
  if (!params.desc) {
    return { valid: false, message: '缺少参数: desc (描述)' }
  }
  if (!params.target_url) {
    return { valid: false, message: '缺少参数: target_url (目标URL)' }
  }
  if (!params.cover_url) {
    return { valid: false, message: '缺少参数: cover_url (封面URL)' }
  }
  return {
    valid: true,
    params: {
      user_id: params.user_id,
      title: params.title,
      desc: params.desc,
      target_url: params.target_url,
      cover_url: params.cover_url
    }
  }
}))

/**
 * 发送群@消息
 * POST /api/message/at
 * 请求体: { 
 *   "port": 8080, 
 *   "chat_room_id": "群ID", 
 *   "at_list": ["用户ID1", "用户ID2"] 或 "用户ID",
 *   "msg": "消息内容" 
 * }
 */
router.post('/at', createAPIHandler(3009, '发送群@消息', (params) => {
  if (!params.chat_room_id) {
    return { valid: false, message: '缺少参数: chat_room_id (群ID)' }
  }
  if (!params.at_list) {
    return { valid: false, message: '缺少参数: at_list (@的用户列表)' }
  }
  if (!params.msg) {
    return { valid: false, message: '缺少参数: msg (消息内容)' }
  }
  const atArray = Array.isArray(params.at_list) ? params.at_list : [params.at_list]
  return {
    valid: true,
    params: {
      chat_room_id: params.chat_room_id,
      at_list: atArray,
      msg: params.msg
    }
  }
}))

/**
 * 发送位置消息
 * POST /api/message/location
 * 请求体: { 
 *   "port": 8080, 
 *   "user_id": "用户ID",
 *   "lon": "经度",
 *   "lat": "纬度",
 *   "address": "地址",
 *   "detail_address": "详细地址"
 * }
 */
router.post('/location', createAPIHandler(3010, '发送位置消息', (params) => {
  if (!params.user_id) {
    return { valid: false, message: '缺少参数: user_id (用户ID)' }
  }
  if (params.lon === undefined || params.lon === null) {
    return { valid: false, message: '缺少参数: lon (经度)' }
  }
  if (params.lat === undefined || params.lat === null) {
    return { valid: false, message: '缺少参数: lat (纬度)' }
  }
  if (!params.address) {
    return { valid: false, message: '缺少参数: address (地址)' }
  }
  if (!params.detail_address) {
    return { valid: false, message: '缺少参数: detail_address (详细地址)' }
  }
  return {
    valid: true,
    params: {
      user_id: params.user_id,
      lon: params.lon,
      lat: params.lat,
      address: params.address,
      detail_address: params.detail_address
    }
  }
}))

/**
 * 发送语音消息
 * POST /api/message/voice
 * 请求体: { 
 *   "port": 8080, 
 *   "user_id": "用户ID",
 *   "cdn_key": "CDN密钥",
 *   "aes_key": "AES密钥",
 *   "md5": "MD5值",
 *   "size": "大小",
 *   "voice_time": "语音时长"
 * }
 */
router.post('/voice', createAPIHandler(3011, '发送语音消息', (params) => {
  if (!params.user_id) {
    return { valid: false, message: '缺少参数: user_id (用户ID)' }
  }
  if (!params.cdn_key) {
    return { valid: false, message: '缺少参数: cdn_key (CDN密钥)' }
  }
  if (!params.aes_key) {
    return { valid: false, message: '缺少参数: aes_key (AES密钥)' }
  }
  if (!params.md5) {
    return { valid: false, message: '缺少参数: md5 (MD5值)' }
  }
  if (params.size === undefined || params.size === null) {
    return { valid: false, message: '缺少参数: size (大小)' }
  }
  if (params.voice_time === undefined || params.voice_time === null) {
    return { valid: false, message: '缺少参数: voice_time (语音时长)' }
  }
  return {
    valid: true,
    params: {
      user_id: params.user_id,
      cdn_key: params.cdn_key,
      aes_key: params.aes_key,
      md5: params.md5,
      size: params.size,
      voice_time: params.voice_time
    }
  }
}))

module.exports = router

