/** 同一任务执行中复用结果，失败后允许下一轮重试。 */
export function singleFlight(task) {
  let pending = null
  return function (...args) {
    if (pending) return pending
    pending = Promise.resolve().then(() => task.apply(this, args)).finally(() => { pending = null })
    return pending
  }
}
