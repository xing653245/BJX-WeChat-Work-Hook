/**
 * 数据模型定义
 */
const { DEFAULT_SERVER_PORT_STRING } = require('../configs/defaults')

class LoginInfo {
  constructor(data = {}) {
    this.alias = data.alias || ''
    this.avatar_url = data.avatar_url || ''
    this.corp_id = data.corp_id || ''
    this.corp_name = data.corp_name || ''
    this.corp_short_name = data.corp_short_name || ''
    this.dept_id = data.dept_id || ''
    this.dept_name = data.dept_name || ''
    this.email = data.email || ''
    this.job_name = data.job_name || ''
    this.mobile = data.mobile || ''
    this.nick_name = data.nick_name || ''
    this.position = data.position || ''
    this.real_name = data.real_name || ''
    this.sex = data.sex || ''
    this.user_id = data.user_id || ''
    this.port = data.port || ''
    this.pid = data.pid || ''
    this.expire = data.expire || '未授权'
    this.auth_active = data.auth_active === true
    this.label = data.label || ''
  }

  toJSON() {
    return {
      alias: this.alias,
      avatar_url: this.avatar_url,
      corp_id: this.corp_id,
      corp_name: this.corp_name,
      corp_short_name: this.corp_short_name,
      dept_id: this.dept_id,
      dept_name: this.dept_name,
      email: this.email,
      job_name: this.job_name,
      mobile: this.mobile,
      nick_name: this.nick_name,
      position: this.position,
      real_name: this.real_name,
      sex: this.sex,
      user_id: this.user_id,
      port: this.port,
      pid: this.pid,
      expire: this.expire,
      auth_active: this.auth_active,
      label: this.label
    }
  }
}

class ReadConfig {
  constructor(data = {}) {
    this.server_port = data.server_port || DEFAULT_SERVER_PORT_STRING
    this.callback = data.callback || ''
    this.open_log = data.open_log !== undefined ? data.open_log : true
    this.save_log = data.save_log !== undefined ? data.save_log : true
    this.login_info = (data.login_info || []).map(item => 
      item instanceof LoginInfo ? item : new LoginInfo(item)
    )
  }

  toJSON() {
    return {
      server_port: this.server_port,
      callback: this.callback,
      open_log: this.open_log,
      save_log: this.save_log,
      login_info: this.login_info.map(item => item.toJSON())
    }
  }
}

module.exports = {
  LoginInfo,
  ReadConfig
}

