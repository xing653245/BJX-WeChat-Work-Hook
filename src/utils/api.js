/**
 * API 接口封装
 * 保留原项目的接口定义，为后续修改做预留
 */

import { ElMessage } from 'element-plus'
import { ensureAuthorizedByPort } from './authGuard'

/**
 * 基础URL生成
 */
export const baseUrl = (port) => `http://127.0.0.1:${port}/api`

// 登录/退出登录相关的 type 列表，这些接口允许在未授权时调用
// 按需求：getPersonalInfo(1002) 和 inputLoginCaptcha(1005) 也需要校验授权，因此不再豁免
const LOGIN_RELATED_TYPES = new Set([1000, 1001, 1002, 1003, 1005])

/**
 * 调用API
 * port: 企微的HTTP端口（不是FastAPI服务器端口）
 */
export const callAPI = async (port, jsonData) => {
  try {
    if (!window.electronAPI) {
      throw new Error('Electron API不可用')
    }

    const type = jsonData && jsonData.type

    // 除登录/退出登录等接口外，其它所有接口调用前先检查授权
    if (!LOGIN_RELATED_TYPES.has(type)) {
      ensureAuthorizedByPort(port)
    }

    // 直接调用企微的HTTP端口
    const url = baseUrl(port)
    const result = await window.electronAPI.callAPI({
      url,
      method: 'POST',
      data: jsonData
    })

    if (!result.success) {
      throw new Error(result.msg || 'API调用失败')
    }

    return result.data
  } catch (error) {
    // 授权失败统一提示
    if (error && error.code === 'NO_AUTH') {
      ElMessage.error(error.message || '当前账号未授权或授权已到期，请重新购买授权')
    }
    throw error
  }
}

/**
 * VWork API 类 - 保留原项目接口定义
 */
export class VWorkApi {
  // 1000: 获取登录状态
  static async getLoginStatus(port, type = 1000) {
    return await callAPI(port, { type })
  }

  // 1001: 刷新并获取登录二维码
  static async refreshAndGetLoginQrCode(port, type = 1001, path = '') {
    return await callAPI(port, { type, path })
  }

  // 1002: 获取个人信息
  static async getPersonalInfo(port, type = 1002) {
    return await callAPI(port, { type })
  }

  // 1003: 退出登录
  static async logout(port, type = 1003) {
    return await callAPI(port, { type })
  }

  // 1004: 获取个人二维码
  static async getPersonalQrCode(port, type = 1004) {
    return await callAPI(port, { type })
  }

  // 1005: 输入登录验证码
  static async inputLoginCaptcha(port, captcha, type = 1005) {
    return await callAPI(port, { type, code: captcha })
  }

  // 2000: 获取联系人列表【外部】
  static async getContactList(port, pageNum, pageSize, type = 2000) {
    return await callAPI(port, { type, page_num: pageNum, page_size: pageSize })
  }

  // 2001: 获取好友列表【内部】
  static async getFriendList(port, pageNum, pageSize, type = 2001) {
    return await callAPI(port, { type, page_num: pageNum, page_size: pageSize })
  }

  // 2002: 获取群列表
  static async getGroupList(port, pageNum, pageSize, type = 2002) {
    return await callAPI(port, { type, page_num: pageNum, page_size: pageSize })
  }

  // 2003: 获取群成员列表
  static async getGroupMemberList(port, groupId, type = 2003) {
    return await callAPI(port, { type, chat_room_id: groupId })
  }

  // 2004: 获取公司列表
  static async getCompanyList(port, type = 2004) {
    return await callAPI(port, { type })
  }

  // 2005: 获取部门列表
  static async getDepartmentList(port, type = 2005) {
    return await callAPI(port, { type })
  }

  // 3000: 发送文本消息
  static async sendTextMessage(port, userId, msg, type = 3000) {
    return await callAPI(port, { type, user_id: userId, msg })
  }

  // 3001: 发送图片消息
  static async sendImageMessage(port, userId, path, type = 3001) {
    return await callAPI(port, { type, user_id: userId, path })
  }

  // 3002: 发送GIF表情
  static async sendGifMessage(port, userId, path, type = 3002) {
    return await callAPI(port, { type, user_id: userId, path })
  }

  // 3003: 发送文件消息
  static async sendFileMessage(port, userId, path, type = 3003) {
    return await callAPI(port, { type, user_id: userId, path })
  }

  // 3004: 发送视频消息
  static async sendVideoMessage(port, userId, path, type = 3004) {
    return await callAPI(port, { type, user_id: userId, path })
  }

  // 3005: 发送名片
  static async sendCard(port, userId, friendUserId, type = 3005) {
    return await callAPI(port, { type, user_id: userId, friend_user_id: friendUserId })
  }

  // 3006: 发送小程序
  static async sendApplet(port, userId, title, desc, coverPath, wechatId, pagePath, type = 3006, avatarUrl = '', appId = '') {
    return await callAPI(port, {
      type,
      user_id: userId,
      title,
      desc,
      avatar_url: avatarUrl,
      cover_path: coverPath,
      app_id: appId,
      wechat_id: wechatId,
      page_path: pagePath
    })
  }

  // 3007: 发送视频号
  static async sendVideoNumber(port, userId, nickName, desc, coverUrl, videoUrl, extras = '', type = 3007, avatarUrl = '', thumbUrl = '') {
    return await callAPI(port, {
      type,
      user_id: userId,
      cover_url: coverUrl,
      thumb_url: thumbUrl,
      avatar_url: avatarUrl,
      nick_name: nickName,
      desc,
      video_url: videoUrl,
      extras,
    })
  }

  // 3008: 发送卡片链接
  static async sendCardLink(port, userId, title, desc, targetUrl, coverUrl, type = 3008) {
    return await callAPI(port, {
      type,
      user_id: userId,
      title,
      desc,
      target_url: targetUrl,
      cover_url: coverUrl
    })
  }

  // 3009: 群聊发送消息并且@指定群成员
  static async sendAtMessage(port, chatRoomId, atList, msg, type = 3009) {
    const atArray = Array.isArray(atList) ? atList : [atList]
    return await callAPI(port, {
      type,
      chat_room_id: chatRoomId,
      at_list: atArray,
      msg
    })
  }

  // 3010: 发送位置消息
  static async sendLocationMessage(port, userId, lon, lat, address, detail_address, type = 3010) {
    return await callAPI(port, {
      type,
      user_id: userId,
      lon,
      lat,
      address,
      detail_address
    })
  }

  // 3011: 发送语音消息
  static async sendVoiceMessage(port, user_id, cdn_key, aes_key, md5, size, voice_time, type = 3011) {
    return await callAPI(port, {
      type,
      user_id,
      cdn_key,
      aes_key,
      md5,
      size,
      voice_time
    })
  }

  // 4000: 添加好友【群成员】
  static async addFriend(port, userId, chatRoomId, msg, type = 4000) {
    return await callAPI(port, { type, user_id: userId, chat_room_id: chatRoomId, msg })
  }

  // 4001: 删除好友
  static async deleteFriend(port, userId, type = 4001) {
    return await callAPI(port, { type, user_id: userId })
  }

  // 4002: 同意好友请求
  static async agreeFriendRequest(port, userId, corp_id, type = 4002) {
    return await callAPI(port, { type, user_id: userId, corp_id })
  }

  // 4003: 设置好友备注
  static async setFriendRemark(port, userId, remark, type = 4003) {
    return await callAPI(port, { type, user_id: userId, remark })
  }

  // 4004: 设置好友描述
  static async setFriendDescription(port, userId, desc, type = 4004) {
    return await callAPI(port, { type, user_id: userId, desc })
  }

  // 4005: 设置好友公司
  static async setFriendCompany(port, userId, corp_name, type = 4005) {
    return await callAPI(port, { type, user_id: userId, corp_name })
  }

  // 4006: 设置好友手机号
  static async setFriendPhone(port, userId, mobile_list, type = 4006) {
    const atArray = Array.isArray(mobile_list) ? mobile_list : [mobile_list]
    return await callAPI(port, { type, user_id: userId, mobile_list: atArray })
  }

  // 4007: 本地查询好友信息
  static async localQueryFriendInfo(port, userId, type = 4007) {
    return await callAPI(port, { type, user_id: userId })
  }

  // 4008: 网络查询陌生人信息
  static async networkQueryStrangerInfo(port, key, type = 4008) {
    return await callAPI(port, { type, key })
  }

  // 4009: 添加好友【网络查询】
  static async addFriendNetwork(port, add_type, corp_id = null, userId, openid_or_ticket, msg, type = 4009) {
    const requestData = {
      type,
      add_type,
      user_id: userId,
      openid_or_ticket,
      msg
    }
    
    // 只有在 add_type=1 时才需要 corp_id
    if (add_type === 1) {
      if (!corp_id) {
        throw new Error('当 add_type=1 时，corp_id 为必填参数')
      }
      requestData.corp_id = corp_id
    } else if (corp_id) {
      // 如果 add_type 不是 1 但传入了 corp_id，也包含在请求中
      requestData.corp_id = corp_id
    }
    
    return await callAPI(port, requestData)
  }

  // 5000: 创建群聊【外部】
  static async createGroup(port, name, user_id_list, type = 5000) {
    const userIdArray = Array.isArray(user_id_list) ? user_id_list : [user_id_list]
    return await callAPI(port, { type, name, user_id_list: userIdArray })
  }

  // 5001: 创建群聊【内部】
  static async createGroupInternal(port, name, user_id_list, type = 5001) {
    const userIdArray = Array.isArray(user_id_list) ? user_id_list : [user_id_list]
    return await callAPI(port, { type, name, user_id_list: userIdArray })
  }

  // 5002: 修改群名称
  static async setGroupName(port, chat_room_id, name, type = 5002) {
    return await callAPI(port, { type, chat_room_id, name })
  }

  // 5003: 发送群公告
  static async sendGroupNotice(port, chat_room_id, content, type = 5003) {
    return await callAPI(port, { type, chat_room_id, content })
  }

  // 5004: 邀请好友进群（40人以下）
  static async inviteFriendToGroup(port, chat_room_id, user_id_list, type = 5004) {
    const userIdArray = Array.isArray(user_id_list) ? user_id_list : [user_id_list]
    return await callAPI(port, { type, chat_room_id, user_id_list: userIdArray })
  }

  // 5005: 邀请好友进群（40人以上）
  static async inviteFriendToGroupLarge(port, chat_room_id, user_id_list, type = 5005) {
    const userIdArray = Array.isArray(user_id_list) ? user_id_list : [user_id_list]
    return await callAPI(port, { type, chat_room_id, user_id_list: userIdArray })
  }

  // 5006: 移除群成员
  static async removeGroupMember(port, chat_room_id, user_id_list, type = 5006) {
    const userIdArray = Array.isArray(user_id_list) ? user_id_list : [user_id_list]
    return await callAPI(port, { type, chat_room_id, user_id_list: userIdArray })
  }

  // 5007: 获取群二维码
  static async getGroupQrCode(port, chat_room_id, path, type = 5007) {
    return await callAPI(port, { type, chat_room_id, path })
  }

  // 5008: 获取群信息
  static async getGroupInfo(port, chat_room_id, type = 5008) {
    return await callAPI(port, { type, chat_room_id })
  }

  // 5009: 获取欢迎语列表
  static async getWelcomeMessageList(port, type = 5009) {
    return await callAPI(port, { type })
  }

  // 5010: 获取欢迎语
  static async getWelcomeMessage(port, content, card_link = null, type = 5010) {
    const requestData = {
      type,
      content
    }
    
    if (card_link) {
      requestData.card_link = {
        title: card_link.title,
        desc: card_link.desc,
        target_url: card_link.target_url,
        cover_url: card_link.cover_url
      }
    }
    
    return await callAPI(port, requestData)
  }

  // 5011: 设置欢迎语
  static async setWelcomeMessage(port, chat_room_id, welcome_id, type = 5011) {
    return await callAPI(port, { type, chat_room_id, welcome_id })
  }

  // 5012: 删除欢迎语
  static async deleteWelcomeMessage(port, chat_room_id, type = 5012) {
    return await callAPI(port, { type, chat_room_id })
  }

  // 5013: 添加管理员
  static async addAdmin(port, chat_room_id, user_id_list, type = 5013) {
    const userIdArray = Array.isArray(user_id_list) ? user_id_list : [user_id_list]
    return await callAPI(port, { type, chat_room_id, user_id_list: userIdArray })
  }

  // 5014: 删除管理员
  static async deleteAdmin(port, chat_room_id, user_id_list, type = 5014) {
    const userIdArray = Array.isArray(user_id_list) ? user_id_list : [user_id_list]
    return await callAPI(port, { type, chat_room_id, user_id_list: userIdArray })
  }

  // 5015: 转让群主
  static async transferGroupOwner(port, chat_room_id, user_id, type = 5015) {
    return await callAPI(port, { type, chat_room_id, user_id })
  }

  // 5016: 退出群聊
  static async quitGroup(port, chat_room_id, type = 5016) {
    return await callAPI(port, { type, chat_room_id })
  }

  // 5017: 解散群聊
  static async dismissGroup(port, chat_room_id, type = 5017) {
    return await callAPI(port, { type, chat_room_id })
  }

  // 5018: 允许/禁止修改群名
  static async allowOrDisallowModifyGroupName(port, chat_room_id, allow, type = 5018) {
    return await callAPI(port, { type, chat_room_id, allow })
  }

  // 5019: 开启/关闭邀请确认
  static async openOrCloseInviteConfirm(port, chat_room_id, state, type = 5019) {
    return await callAPI(port, { type, chat_room_id, state })
  }

  // 6000: 获取标签组列表
  static async getTagGroupList(port, type = 6000) {
    return await callAPI(port, { type })
  }

  // 6001: 添加标签
  static async addTag(port, group_id, label_name, type = 6001) {
    return await callAPI(port, { type, group_id, label_name })
  }

  // 6002: 修改标签
  static async modifyTag(port, group_id, label_id, label_name, type = 6002) {
    return await callAPI(port, { type, group_id, label_id, label_name })
  }

  // 6003: 删除标签
  static async deleteTag(port, group_id, label_id, type = 6003) {
    return await callAPI(port, { type, group_id, label_id })
  }

  // 6004: 一个好友打多个标签
  static async addTagsToFriend(port, user_id, label_id_list, type = 6004) {
    const labelIdArray = Array.isArray(label_id_list) ? label_id_list : [label_id_list]
    return await callAPI(port, { type, user_id, label_id_list: labelIdArray })
  }

  // 6005: 一个标签打多个好友
  static async addFriendsToTag(port, label_id, user_id_list, type = 6005) {
    const userIdArray = Array.isArray(user_id_list) ? user_id_list : [user_id_list]
    return await callAPI(port, { type, label_id, user_id_list: userIdArray })
  }

  // 6006: 获取标签下的联系人
  static async getFriendsByTag(port, label_id, type = 6006) {
    return await callAPI(port, { type, label_id })
  }

  // 6007: 删除标签下的联系人
  static async deleteFriendsFromTag(port, label_id, user_id_list, type = 6007) {
    const userIdArray = Array.isArray(user_id_list) ? user_id_list : [user_id_list]
    return await callAPI(port, { type, label_id, user_id_list: userIdArray })
  }

  // 7000: 开启/关闭自动更新
  static async openOrCloseAutoUpdate(port, state, type = 7000) {
    return await callAPI(port, { type, state })
  }

  // 7001: 开启/关闭自动登录
  static async openOrCloseAutoLogin(port, state, type = 7001) {
    return await callAPI(port, { type, state })
  }

  // 7002: 开启/关闭消息免打扰
  static async openOrCloseMessageDnd(port, user_id, state, type = 7002) {
    return await callAPI(port, { type, user_id, state })
  }

  // 7003: 开启/关闭自动下载
  static async openOrCloseAutoDownload(port, state, type = 7003) {
    return await callAPI(port, { type, state })
  }

  // 8000: 企业用户ID转开放平台ID
  static async corpUserIdToOpenPlatformId(port, user_id, type = 8000) {
    return await callAPI(port, { type, user_id })
  }

  // 8001: 企业群ID转开放平台ID
  static async corpChatRoomIdToOpenPlatformId(port, chat_room_id, type = 8001) {
    return await callAPI(port, { type, chat_room_id })
  }

  // 8002: 开放平台ID转企业用户ID
  static async openPlatformIdToCorpUserId(port, open_id, type = 8002) {
    return await callAPI(port, { type, open_id })
  }

  // 8003: 开放平台ID转企业群ID
  static async openPlatformIdToCorpChatRoomId(port, open_id, type = 8003) {
    return await callAPI(port, { type, open_id })
  }

  // 9000: CDN上传文件
  static async cdnUploadFile(port, path, type = 9000) {
    return await callAPI(port, { type, path })
  }

  // 9001: CDN下载图片
  static async cdnDownloadImage(port, cdnKey, aesKey, size, imgType, savePath, type = 9001) {
    return await callAPI(port, {
      type,
      cdn_key: cdnKey,
      aes_key: aesKey,
      size,
      img_type: imgType,
      save_path: savePath
    })
  }

  // 9002: CDN下载视频
  static async cdnDownloadVideo(port, cdnKey, aesKey, size, savePath, type = 9002) {
    return await callAPI(port, {
      type,
      cdn_key: cdnKey,
      aes_key: aesKey,
      size,
      save_path: savePath
    })
  }

  // 9003: CDN下载文件
  static async cdnDownloadFile(port, cdnKey, aesKey, size, savePath, type = 9003) {
    return await callAPI(port, {
      type,
      cdn_key: cdnKey,
      aes_key: aesKey,
      size,
      save_path: savePath
    })
  }

  // 9004: CDN下载个微图片/视频/文件
  static async cdnDownloadVPersonImage(port, url, authKey, aesKey, size, savePath, type = 9004) {
    return await callAPI(port, {
      type,
      url,
      auth_key: authKey,
      aes_key: aesKey,
      size,
      save_path: savePath
    })
  }

  // 10000: 清空聊天记录
  static async clearChatHistory(port, user_id, type = 10000) {
    return await callAPI(port, { type, user_id })
  }

  // 10003: 语音转文字
  static async voiceToText(port, msg_id, type = 10003) {
    return await callAPI(port, { type, msg_id })
  }

  // 10004: 获取当前微信进程的PID
  static async getCurrentWxPid(port, type = 10004) {
    return await callAPI(port, { type })
  }

  // 10005: 获取当前聊天窗口信息
  static async getCurrentChatWindowInfo(port, type = 10005) {
    return await callAPI(port, { type })
  }
}

export default VWorkApi

