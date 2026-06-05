const express = require('express');
const router = express.Router();
const AlertService = require('../services/alertService');
const { requirePermission } = require('../middleware/rbac');

// GET /api/alerts - Liste des alertes
router.get('/', requirePermission('accounting.read'), async (req, res) => {
  try {
    const { unread_only } = req.query;
    
    let alerts;
    if (unread_only === 'true') {
      alerts = await AlertService.getUnreadAlerts(req.tenantId, req.userId);
    } else {
      alerts = await AlertService.getAllAlerts(req.tenantId);
    }
    
    res.json({ success: true, data: alerts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/alerts/unread/count - Nombre d'alertes non lues
router.get('/unread/count', requirePermission('accounting.read'), async (req, res) => {
  try {
    const alerts = await AlertService.getUnreadAlerts(req.tenantId, req.userId);
    res.json({ success: true, data: { count: alerts.length } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/alerts/:id/read - Marquer comme lue
router.put('/:id/read', requirePermission('accounting.read'), async (req, res) => {
  try {
    const alert = await AlertService.markAsRead(req.params.id, req.tenantId);
    res.json({ success: true, data: alert });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/alerts/:id/acknowledge - Acquitter une alerte
router.put('/:id/acknowledge', requirePermission('accounting.read'), async (req, res) => {
  try {
    const alert = await AlertService.acknowledgeAlert(req.params.id, req.tenantId);
    res.json({ success: true, data: alert });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/alerts/:id - Supprimer une alerte
router.delete('/:id', requirePermission('accounting.write'), async (req, res) => {
  try {
    await AlertService.deleteAlert(req.params.id, req.tenantId);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/alerts/check - Lancer les vérifications
router.post('/check', requirePermission('accounting.write'), async (req, res) => {
  try {
    const result = await AlertService.runAllChecks(req.tenantId);
    res.json({ success: true, data: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;