/**
 * 依次发布到 Gitee 与 GitHub（任一失败不影响另一个）
 */
const { execSync } = require('child_process')
const path = require('path')

const root = path.join(__dirname, '..')

function runScript(scriptName, label) {
  console.log(`\n========== 发布到 ${label} ==========\n`)
  execSync(`node scripts/${scriptName}`, {
    cwd: root,
    stdio: 'inherit'
  })
}

function main() {
  const results = []

  for (const [script, label] of [
    ['publish-gitee.js', 'Gitee'],
    ['publish-github.js', 'GitHub']
  ]) {
    try {
      runScript(script, label)
      results.push({ label, success: true })
    } catch (err) {
      console.error(`\n[publish] ${label} 发布失败\n`)
      results.push({ label, success: false, error: err.message || String(err) })
    }
  }

  const failed = results.filter((item) => !item.success)
  if (failed.length === 0) {
    console.log('\n[publish] Gitee + GitHub 全部发布完成\n')
    return
  }

  const summary = failed.map((item) => item.label).join('、')
  console.error(`\n[publish] 部分发布失败: ${summary}\n`)
  process.exit(1)
}

main()
