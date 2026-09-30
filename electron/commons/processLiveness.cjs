// ESRCH 才能确认 PID 不存在；权限错误或无有效 PID 都属于未知。
function getProcessState(pid, probe = process.kill) {
  const value = Number(pid)
  if (!Number.isInteger(value) || value <= 0) return 'unknown'
  try {
    probe(value, 0)
    return 'alive'
  } catch (error) {
    return error.code === 'ESRCH' ? 'exited' : 'unknown'
  }
}
module.exports = { getProcessState }
