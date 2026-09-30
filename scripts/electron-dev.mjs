import { createServer } from 'vite'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import electron from 'electron'

const root = fileURLToPath(new URL('../', import.meta.url))
let server, child, stopping = false

async function stop(code = 0) {
  if (stopping) return
  stopping = true
  // Vite 与启动器在同一进程，不会留下独立的开发服务器。
  const deadline = setTimeout(() => process.exit(code), 5000)
  deadline.unref()
  if (child && child.exitCode === null && child.signalCode === null) child.kill()
  try { await server?.close() }
  finally { process.exitCode = code }
}

process.once('SIGINT', () => void stop())
process.once('SIGTERM', () => void stop())

try {
  server = await createServer({ root, server: { strictPort: false } })
  if (stopping) await server.close()
  else {
    await server.listen()
    if (stopping) await server.close()
    else {
      const url = server.resolvedUrls.local[0]
      if (!url) throw new Error('未取得开发服务地址')
      console.log(`[开发启动] 界面地址：${url}`)
      const env = { ...process.env, VWORK_DEV_SERVER_URL: url }
      delete env.ELECTRON_RUN_AS_NODE
      // Electron 是用户操作的桌面窗口，不能作为隐藏的后台辅助进程启动。
      child = spawn(electron, ['.'], { cwd: root, env, stdio: 'inherit', windowsHide: false })
      child.once('exit', code => void stop(code ?? 0))
      child.once('error', error => {
        console.error('[开发启动] Electron 启动失败：', error.message)
        void stop(1)
      })
    }
  }
} catch (error) {
  console.error('[开发启动] 启动失败：', error.message)
  await stop(1)
}
