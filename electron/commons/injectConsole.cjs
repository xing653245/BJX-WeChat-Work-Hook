function formatInjectSummary({ port, reason, success, callbackUrl }) {
  return success
    ? `[企微] 端口 ${port} 注入完成，等待登录`
    : `[企微] 端口 ${port} 注入失败（${reason}），详情见下方`
}
module.exports = { formatInjectSummary }
