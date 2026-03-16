const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../../middleware/auth');
const {
  openShift,
  closeShift,
  getActiveShift,
  getShiftSummary,
  listShifts,
  cashInOut,
} = require('./shift.controller');

router.use(authenticate);

// Shift CRUD
router.post('/open', openShift);
router.post('/:id/close', closeShift);
router.get('/active', getActiveShift);
router.get('/:id/summary', getShiftSummary);
router.get('/', authorize('MANAGER', 'SUPER_ADMIN'), listShifts);

// Cash in / out manual (titipan, pengeluaran operasional, dll)
router.post('/:id/cash', cashInOut);

module.exports = router;
