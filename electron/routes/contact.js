/**
 * 联系人/列表相关路由
 * 
 * 授权说明：
 * - 所有接口都需要授权验证
 */
const express = require('express')
const router = express.Router()
const { createAPIHandler } = require('../middleware/apiHandler')

/**
 * 获取联系人列表【外部】
 * POST /api/contact/list
 * 请求体: { 
 *   "port": 8080, 
 *   "page_num": 1,
 *   "page_size": 20
 * }
 * 返回示例：{
    "data": {
        "list": [
            {
                "add_time": "1619799671", //添加时间
                "avatar_url": "https://wework.qpic.cn/wwpic/xxx/0", //头像地址
                "corp_id": "197xxx", //公司ID
                "desc": "我是描述信息", //描述信息
                "mobile": "1380000000", //手机号码
                "nick_name": "三水君", //昵称
                "position": "CEO", //职位
                "remark": "我是备注", //备注
                "remark_phone_list": [ //备注电话列表
                    "1380000000"
                ],
                "sex": "1", //性别 0:未设置 1:男 2:女
                "unionid": "ozynxxx", //关联ID
                "user_id": "168xxx" //用户ID
            },
            ...
        ],
        "page_num": 1, //当前页数
        "page_size": 10, //每页显示数量
        "total": 5, //总数量
        "total_page": 1 //总页数
    },
    "errmsg": "OK",
    "errno": 0
}
 */
router.post('/list', createAPIHandler(2000, '获取联系人列表', (params) => {
  if (params.page_num === undefined || params.page_num === null) {
    return { valid: false, message: '缺少参数: page_num (页码)' }
  }
  if (params.page_size === undefined || params.page_size === null) {
    return { valid: false, message: '缺少参数: page_size (每页数量)' }
  }
  return {
    valid: true,
    params: {
      page_num: params.page_num,
      page_size: params.page_size
    }
  }
}))

/**
 * 获取好友列表【内部】
 * POST /api/contact/friends
 * 请求体: { 
 *   "port": 8080, 
 *   "page_num": 1,
 *   "page_size": 20
 * }
 * 返回示例：{
    "data": {
        "list": [
            {
                "avatar_url": "https://wework.qpic.cn/wwpic/xxx/0", //头像地址
                "corp_id": "197xxx", //公司ID
                "dept_list": [ //部门列表
                    {
                        "id": "168xxx", //部门ID
                        "name": "xxx打杂部" //部门名称
                    }
                ],
                "desc": "我是描述信息", //描述信息
                "mobile": "1380000000", //手机号
                "nick_name": "三水君", //昵称
                "position": "CEO", //职位
                "remark": "我是备注", //备注
                "sex": "2", //性别 0:未设置 1:男 2:女
                "unionid": "ozynxxx", //关联ID
                "user_id": "168xxx" //用户ID
            },
            ...
        ],
        "page_num": 1, //当前页数
        "page_size": 10, //每页显示数量
        "total": 204, //总数量
        "total_page": 21 //总页数
    },
    "errmsg": "OK",
    "errno": 0
}
 */
router.post('/friends', createAPIHandler(2001, '获取好友列表', (params) => {
  if (params.page_num === undefined || params.page_num === null) {
    return { valid: false, message: '缺少参数: page_num (页码)' }
  }
  if (params.page_size === undefined || params.page_size === null) {
    return { valid: false, message: '缺少参数: page_size (每页数量)' }
  }
  return {
    valid: true,
    params: {
      page_num: params.page_num,
      page_size: params.page_size
    }
  }
}))

/**
 * 获取群列表
 * POST /api/contact/groups
 * 请求体: { 
 *   "port": 8080, 
 *   "page_num": 1,
 *   "page_size": 20
 * }
 * 返回示例：{
    "data": {
        "list": [
            {
                "chat_room_id": "R:239xxx", //群ID
                "create_time": "1619799671", //创建时间
                "create_user_id": "168xxx", //创建人ID
                "is_admin": "0", //是否为管理员 0:否 1:是
                "is_external": "0", //是否为外部群 0:内部群 1:外部群
                "nick_name": "测试的内部群", //群昵称
                "notice_content": "我是群公告啊啊啊", //群公告内容
                "notice_time": "1619799671", //群公告发布时间
                "notice_user_id": "168xxx", //群公告发送者ID
                "total": "3" //群成员数量
            },
            ...
        ],
        "page_num": 1, //当前页数
        "page_size": 10, //每页显示数量
        "total": 8, //总数量
        "total_page": 1 //总页数
    },
    "errmsg": "OK",
    "errno": 0
}
 */
router.post('/groups', createAPIHandler(2002, '获取群列表', (params) => {
  if (params.page_num === undefined || params.page_num === null) {
    return { valid: false, message: '缺少参数: page_num (页码)' }
  }
  if (params.page_size === undefined || params.page_size === null) {
    return { valid: false, message: '缺少参数: page_size (每页数量)' }
  }
  return {
    valid: true,
    params: {
      page_num: params.page_num,
      page_size: params.page_size
    }
  }
}))

/**
 * 获取群成员列表
 * POST /api/contact/members
 * 请求体: { "port": 8080, "chat_room_id": "群ID" }
 * 返回示例：{
    "data": {
        "chat_room_id": "R:197xxx", //群ID
        "list": [
            {
                "avatar_url": "https://wework.qpic.cn/wwpic/xxx/0", //头像地址
                "corp_id": "197xxx", //公司ID
                "desc": "我是描述信息", //描述
                "invite_user_id": "168xxx", //邀请人ID
                "is_admin": "1", //是否为管理员 0:否 1:是
                "join_time": "1619799671", //进群时间
                "mobile": "1380000000", //手机号
                "nick_name": "三水君", //昵称
                "position": "",  //职位
                "remark": "我是备注", //备注
                "sex": "2", //性别 0:未设置 1:男 2:女
                "unionid": "ozyxxx", //关联ID
                "user_id": "168xxx" //用户ID
            },
            ...
        ]
    },
    "errmsg": "OK",
    "errno": 0
}
 */
router.post('/members', createAPIHandler(2003, '获取群成员列表', (params) => {
  if (!params.chat_room_id) {
    return { valid: false, message: '缺少参数: chat_room_id (群ID)' }
  }
  return { valid: true, params: { chat_room_id: params.chat_room_id } }
}))

/**
 * 获取公司列表
 * POST /api/contact/companies
 * 请求体: { "port": 8080 }
 * 返回示例：{
    "data": {
        "list": [
            {
                "admin_id": "168xxx", //管理员ID
                "admin_name": "三水君", //管理员名称
                "avatar_url": "https://p.qlogo.cn/bizmail/xxx/0", //头像地址
                "corp_id": "197xxx", //公司ID
                "corp_name": "xxx有限公司", //公司全称
                "corp_short_name": "xxx", //公司简称
                "create_time": "1619799671", //创建时间
                "desc": "我是描述信息" //描述
            },
            ...
        ]
    },
    "errmsg": "OK",
    "errno": 0
}
 */
router.post('/companies', createAPIHandler(2004, '获取公司列表'))

/**
 * 获取部门列表
 * POST /api/contact/departments
 * 请求体: { "port": 8080 }
 * 返回示例：{
    "data": {
        "list": [
            {
                "dept_name": "打杂部", //部门名称
                "id": "168xxx", //部门ID
                "parent_id": "16xxx" //所属公司ID
            },
            ...
        ]
    },
    "errmsg": "OK",
    "errno": 0
}
 */
router.post('/departments', createAPIHandler(2005, '获取部门列表'))

module.exports = router

