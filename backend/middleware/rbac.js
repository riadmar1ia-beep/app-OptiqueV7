const pool = require('../config/database');

let permissionsCache = {};
let cacheTimestamp = 0;

const CACHE_DURATION = 60000;

async function loadPermissions() {

  if (
    cacheTimestamp &&
    Date.now() - cacheTimestamp < CACHE_DURATION
  ) {
    return permissionsCache;
  }

  try {

    const result = await pool.query(`
      SELECT
        r.name as role_name,
        p.resource,
        p.action
      FROM roles r
      JOIN role_permissions rp
        ON rp.role_id = r.id
      JOIN permissions p
        ON p.id = rp.permission_id
    `);

    const cache = {};

    for (const row of result.rows) {

      if (!cache[row.role_name]) {
        cache[row.role_name] = [];
      }

      cache[row.role_name].push(
        `${row.resource}.${row.action}`
      );
    }

    permissionsCache = cache;
    cacheTimestamp = Date.now();

    return cache;

  } catch (err) {

    console.error(
      'Erreur chargement permissions:',
      err.message
    );

    return {};
  }
}

async function hasPermission(
  role,
  permission
) {

  if (!role) return false;

  if (role === 'admin') {
    return true;
  }

  const permissions =
    await loadPermissions();

  return (
    permissions[role] || []
  ).includes(permission);
}

function requirePermission(permission) {

  return async (req, res, next) => {

    try {

      const allowed =
        await hasPermission(
          req.userRole,
          permission
        );

      if (!allowed) {
        return res.status(403).json({
          success: false,
          error: 'Permission refusée',
          permission
        });
      }

      next();

    } catch (err) {

      console.error(err);

      return res.status(500).json({
        success: false,
        error: 'Erreur RBAC'
      });
    }
  };
}

module.exports = {
  requirePermission,
  hasPermission
};