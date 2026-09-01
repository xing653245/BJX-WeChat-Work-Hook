const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createWecomAgentAdapter,
  normalizeAgentEvent
} = require('../services/wecomAgentCompat')

test('登录状态通过 Agent 查询并保持旧页面需要的 status 结构', async () => {
  const calls = []
  const adapter = createWecomAgentAdapter({
    request: async (options) => {
      calls.push(options)
      return {
        code: 0,
        data: {
          connected: true,
          wx_connected: true,
          account: { user_id: 'wxid_1' }
        }
      }
    }
  })

  const result = await adapter.call({ type: 1000 })

  assert.deepEqual(calls, [{ method: 'GET', path: '/api/v1/status' }])
  assert.equal(result.data.status, 1)
  assert.equal(result.data.user_id, 'wxid_1')
})

test('个人信息映射为现有企微管理页面使用的字段', async () => {
  const adapter = createWecomAgentAdapter({
    request: async (options) => {
      assert.deepEqual(options, { method: 'GET', path: '/api/v1/account' })
      return {
        code: 0,
        data: {
          user_id: 'wxid_2',
          username: '张三',
          nickname: '小张',
          acctid: 'zhangsan'
        }
      }
    }
  })

  const result = await adapter.call({ type: 1002 })

  assert.deepEqual(result.data, {
    user_id: 'wxid_2',
    username: '张三',
    nickname: '小张',
    acctid: 'zhangsan',
    real_name: '张三',
    nick_name: '小张',
    alias: 'zhangsan'
  })
})

test('旧页面发送文本消息时转换为 Agent V1 请求', async () => {
  const calls = []
  const adapter = createWecomAgentAdapter({
    request: async (options) => {
      calls.push(options)
      return { code: 0, message: '指令已提交', data: { payload: {} } }
    }
  })

  const result = await adapter.call({
    type: 3000,
    user_id: 'R:room_1',
    msg: '你好'
  })

  assert.deepEqual(calls, [{
    method: 'POST',
    path: '/api/v1/messages/text',
    data: { conversation_id: 'R:room_1', content: '你好' }
  }])
  assert.equal(result.message, '指令已提交')
})

test('Agent 文本回调转换为现有页面和客户回调使用的扁平消息', () => {
  const result = normalizeAgentEvent({
    event_id: 'evt_1',
    event: 'message.text',
    timestamp: 1700000000,
    msg_type: 11041,
    data: {
      conversation_id: 'R:room_1',
      sender: 'wxid_sender',
      receiver: 'wxid_bot',
      server_id: 'msg_1',
      send_time: 1700000001,
      content: '收到消息',
      at_list: [{ user_id: 'wxid_bot' }]
    }
  }, ['wxid_bot'])

  assert.deepEqual(result, {
    type: 11041,
    self_user_id: 'wxid_bot',
    user_id: 'R:room_1',
    sender: 'wxid_sender',
    at_list: ['wxid_bot'],
    msg_id: 'msg_1',
    time_stamp: 1700000001,
    event_id: 'evt_1',
    msg_type: 2,
    content: '收到消息'
  })
})

test('群列表和群成员查询转换为 Agent 的分页查询', async () => {
  const calls = []
  const adapter = createWecomAgentAdapter({
    request: async (options) => {
      calls.push(options)
      return { code: 0, data: { list: [] } }
    }
  })

  await adapter.call({ type: 2002, page_num: 2, page_size: 50 })
  await adapter.call({ type: 2003, chat_room_id: 'room/1', page_num: 3, page_size: 20 })

  assert.deepEqual(calls, [
    {
      method: 'GET',
      path: '/api/v1/groups',
      params: { page_num: 2, page_size: 50 }
    },
    {
      method: 'GET',
      path: '/api/v1/groups/R%3Aroom%2F1/members',
      params: { page_num: 3, page_size: 20 }
    }
  ])
})

test('图片、群艾特和群公告保持现有页面参数并转换为 Agent 请求', async () => {
  const calls = []
  const adapter = createWecomAgentAdapter({
    request: async (options) => {
      calls.push(options)
      return { code: 0, data: {} }
    }
  })

  await adapter.call({ type: 3001, user_id: 'S:user_1', path: 'C:\\tmp\\a.jpg' })
  await adapter.call({ type: 3009, chat_room_id: 'R:room_1', msg: '请看', at_list: ['u1'] })
  await adapter.call({ type: 5003, chat_room_id: 'room_1', content: '公告' })

  assert.deepEqual(calls, [
    {
      method: 'POST',
      path: '/api/v1/messages/image',
      data: { conversation_id: 'S:user_1', local_path: 'C:\\tmp\\a.jpg' }
    },
    {
      method: 'POST',
      path: '/api/v1/messages/at',
      data: { conversation_id: 'R:room_1', content: '请看', at_list: ['u1'] }
    },
    {
      method: 'PUT',
      path: '/api/v1/groups/R%3Aroom_1/notice',
      data: { notice: '公告' }
    }
  ])
})

test('发送小程序时由兼容层先上传封面再提交小程序消息', async () => {
  const calls = []
  const adapter = createWecomAgentAdapter({
    request: async (options) => {
      calls.push(options)
      if (options.path === '/api/v1/cdn/upload') {
        return {
          code: 0,
          data: {
            file_id: 'file_1',
            file_aes_key: 'aes_1',
            file_md5: 'md5_1',
            file_size: 123
          }
        }
      }
      return { code: 0, message: '指令已提交', data: {} }
    }
  })

  await adapter.call({
    type: 3006,
    user_id: 'R:room_1',
    title: '标题',
    desc: '应用名',
    cover_path: 'C:\\tmp\\cover.jpg',
    wechat_id: 'gh_xxx',
    page_path: 'pages/index',
    avatar_url: 'https://example.com/icon.png',
    app_id: 'wx123'
  })

  assert.deepEqual(calls, [
    {
      method: 'POST',
      path: '/api/v1/cdn/upload',
      data: { file_path: 'C:\\tmp\\cover.jpg', file_type: 1 }
    },
    {
      method: 'POST',
      path: '/api/v1/messages/miniprogram',
      data: {
        conversation_id: 'R:room_1',
        username: 'gh_xxx',
        appid: 'wx123',
        appname: '应用名',
        appicon: 'https://example.com/icon.png',
        title: '标题',
        page_path: 'pages/index',
        file_id: 'file_1',
        aes_key: 'aes_1',
        md5: 'md5_1',
        size: 123
      }
    }
  ])
})

test('CDN 上传和下载接口转换为 Agent V1 字段', async () => {
  const calls = []
  const adapter = createWecomAgentAdapter({
    request: async (options) => {
      calls.push(options)
      return { code: 0, data: {} }
    }
  })

  await adapter.call({ type: 9000, path: 'C:\\tmp\\a.jpg', file_type: 1 })
  await adapter.call({
    type: 9001,
    cdn_key: 'file_1',
    aes_key: 'aes_1',
    size: 100,
    img_type: 2,
    save_path: 'C:\\tmp\\out.jpg'
  })
  await adapter.call({
    type: 9004,
    url: 'https://example.com/file',
    auth_key: 'auth_1',
    aes_key: 'aes_2',
    size: 200,
    save_path: 'C:\\tmp\\out.bin'
  })

  assert.deepEqual(calls, [
    {
      method: 'POST',
      path: '/api/v1/cdn/upload',
      data: { file_path: 'C:\\tmp\\a.jpg', file_type: 1 }
    },
    {
      method: 'POST',
      path: '/api/v1/cdn/download/c2c',
      data: {
        file_id: 'file_1',
        aes_key: 'aes_1',
        file_size: 100,
        file_type: 2,
        save_path: 'C:\\tmp\\out.jpg'
      }
    },
    {
      method: 'POST',
      path: '/api/v1/cdn/download/wx',
      data: {
        url: 'https://example.com/file',
        auth_key: 'auth_1',
        aes_key: 'aes_2',
        size: 200,
        save_path: 'C:\\tmp\\out.bin'
      }
    }
  ])
})

test('Agent 登录和退出事件保持现有页面识别的 type', () => {
  const login = normalizeAgentEvent({
    event_id: 'evt_login',
    msg_type: 11026,
    data: { user_id: 'wxid_1', nickname: '小张' }
  })
  const logout = normalizeAgentEvent({
    event_id: 'evt_logout',
    msg_type: 11027,
    data: { user_id: 'wxid_1' }
  })

  assert.deepEqual(login, {
    user_id: 'wxid_1',
    nickname: '小张',
    type: 0,
    event_id: 'evt_login'
  })
  assert.deepEqual(logout, {
    type: 900,
    user_id: 'wxid_1',
    event_id: 'evt_logout'
  })
})

test('Agent 图片回调转换为现有下载流程使用的 CDN 字段', () => {
  const result = normalizeAgentEvent({
    event_id: 'evt_img',
    timestamp: 1700000000,
    msg_type: 11042,
    data: {
      conversation_id: 'R:room_1',
      sender: 'wxid_sender',
      receiver: 'wxid_bot',
      server_id: 'msg_img',
      cdn_type: 2,
      cdn: {
        file_id: 'file_1',
        aes_key: 'aes_1',
        size: 123,
        file_type: 2
      }
    }
  }, ['wxid_bot'])

  assert.equal(result.msg_type, 14)
  assert.equal(result.self_user_id, 'wxid_bot')
  assert.deepEqual(result.content, {
    file_id: 'file_1',
    aes_key: 'aes_1',
    size: 123,
    file_type: 2,
    source_type: 2,
    cdn_type: 2,
    cdn_key: 'file_1',
    img_type: 2,
    url: '',
    auth_key: '',
    _size_multiplier: 1
  })
})
