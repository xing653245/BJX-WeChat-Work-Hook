const fs = require('fs')
const path = require('path')
const { randomUUID } = require('crypto')

// 在同一目录写完整临时文件并落盘，再替换目标；失败时原文件仍可用。
function writeTextAtomic(file, text, { verify } = {}) {
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`)
  let fd
  try {
    fd = fs.openSync(temp, 'wx')
    fs.writeFileSync(fd, text, 'utf8')
    fs.fsyncSync(fd)
    fs.closeSync(fd)
    fd = undefined
    if (verify) verify(temp)
    fs.renameSync(temp, file)
  } finally {
    if (fd !== undefined) fs.closeSync(fd)
    if (fs.existsSync(temp)) fs.unlinkSync(temp)
  }
}

module.exports = { writeTextAtomic }
