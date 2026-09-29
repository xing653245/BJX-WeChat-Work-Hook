/** 企微调用统一使用 POST /api，请求体 type 指定操作。 */
const express = require('express')
const { createDocumentedApi } = require('../middleware/documentedApi')
const router = express.Router()
router.post('/', createDocumentedApi())
module.exports = router
