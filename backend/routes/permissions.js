const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const PermissionService = require('../services/permissionService');
const { requirePermission } = require('../middleware/rbac');

// GET /api/permissions - Liste toutes les permissions
router.get('/', requirePermission('settings.read'), async (req, res) => {
  try {
    const permissions = await PermissionService.getAllPermissions();
    res.json({ success: true, data: permissions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/permissions/roles - Liste tous les rôles
router.get('/roles', requirePermission('settings.read'), async (req, res) => {
  try {
    const roles = await PermissionService.getAllRoles();
    res.json({ success: true, data: roles });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/permissions/roles/:id - Permissions d'un rôle
router.get('/roles/:id', requirePermission('settings.read'), async (req, res) => {
  try {
    const permissions = await PermissionService.getRolePermissions(req.params.id);
    res.json({ success: true, data: permissions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/permissions/roles/:id - Mettre à jour les permissions d'un rôle
router.put('/roles/:id', requirePermission('settings.write'), async (req, res) => {
  try {
    const { permissionIds } = req.body;
    await PermissionService.updateRolePermissions(req.params.id, permissionIds);
    res.json({ success: true, message: 'Permissions mises à jour' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;