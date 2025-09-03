const express = require('express');
const router = express.Router();
const EmsClientsService = require('../services/emsClientsService');

// POST /api/emarsys/ems-clients/sync
router.post('/sync', async (req, res) => {
  try {
    const { hours } = req.body || {};
    const service = new EmsClientsService();
    const result = await service.syncAndSendBatch({ hours });
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/emarsys/ems-clients/send
router.post('/send', async (req, res) => {
  try {
    const service = new EmsClientsService();
    const result = await service.sendSingleContact(req.body || {});
    if (result.success) {
      return res.status(201).json({ success: true, data: result.data });
    }
    return res.status(result.status || 500).json({ success: false, error: result.error });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

module.exports = router;

