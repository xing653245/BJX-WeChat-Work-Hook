const assert = require('node:assert/strict')
const { mkdtemp, readFile, rm } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { stageRemoteFile } = require('../services/remoteFileStaging')

test('stages a base64 encoded remote file with a safe filename', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'vwork-stage-test-'))

  try {
    const filePath = await stageRemoteFile({
      fileName: '../customer-contract.docx',
      contentBase64: Buffer.from('contract-bytes').toString('base64'),
      directory
    })

    assert.equal(path.dirname(filePath), directory)
    assert.match(path.basename(filePath), /customer-contract\.docx$/u)
    assert.equal(await readFile(filePath, 'utf8'), 'contract-bytes')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('rejects malformed and oversized remote files', async () => {
  await assert.rejects(
    () => stageRemoteFile({ fileName: 'bad.docx', contentBase64: 'not-base64!' }),
    /Base64/u
  )
  await assert.rejects(
    () => stageRemoteFile({
      fileName: 'large.docx',
      contentBase64: Buffer.from('too-large').toString('base64'),
      maxBytes: 3
    }),
    /过大/u
  )
})
