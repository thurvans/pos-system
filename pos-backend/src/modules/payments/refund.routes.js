const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../../middleware/auth');
const { createRefund, getOneRefund, pollRefundStatus, listRefundsByOrder } = require('./refund.controller');

// Semua refund endpoint butuh auth + minimal MANAGER
router.use(authenticate);
router.use(authorize('MANAGER', 'SUPER_ADMIN'));

router.post('/', createRefund);
router.get('/:id', getOneRefund);
router.get('/:id/status', pollRefundStatus);

module.exports = router;
