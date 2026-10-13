const { createDiagnostics } = require('../electron/commons/diagnostics.cjs')
const diagnostics = createDiagnostics('convert-icon.js')
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const toIco = require('to-ico');

const pngPath = path.join(__dirname, '../public/bg.png');
const icoPath = path.join(__dirname, '../build/icon.ico');

// 确保 build 目录存在
const buildDir = path.join(__dirname, '../build');
if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

// 使用 sharp 读取 PNG 并生成多个尺寸，然后转换为 ICO
async function convertPngToIco() {
  try {
    // 读取原始 PNG
    const input = sharp(pngPath);
    
    // 生成多个尺寸的 PNG 缓冲区（ICO 需要多个尺寸）
    const sizes = [256, 128, 64, 48, 32, 16];
    const buffers = await Promise.all(
      sizes.map(size => 
        input.clone()
          .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer()
      )
    );
    
    // 转换为 ICO
    const icoBuffer = await toIco(buffers);
    
    // 写入 ICO 文件
    fs.writeFileSync(icoPath, icoBuffer);
    diagnostics.info('L001', '图标转换成功:', icoPath);
    
    // 同时保留 PNG 文件
    fs.copyFileSync(pngPath, path.join(buildDir, 'icon.png'));
    diagnostics.info('L002', 'PNG 文件已复制:', path.join(buildDir, 'icon.png'));
  } catch (err) {
    diagnostics.error('L003', '转换 ICO 失败:', err);
    process.exit(1);
  }
}

convertPngToIco();

