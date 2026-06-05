const pool = require('../config/database');

class PermissionService {
  // Récupérer toutes les permissions disponibles
  static async getAllPermissions() {
    const result = await pool.query(
      'SELECT * FROM permissions ORDER BY resource, action'
    );
    return result.rows;
  }

  // Récupérer les permissions d'un rôle
  static async getRolePermissions(roleId) {
    const result = await pool.query(
      `SELECT p.* FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       WHERE rp.role_id = $1
       ORDER BY p.resource, p.action`,
      [roleId]
    );
    return result.rows;
  }

  // Récupérer tous les rôles
  static async getAllRoles() {
    const result = await pool.query(
      'SELECT * FROM roles ORDER BY id'
    );
    return result.rows;
  }

  // Mettre à jour les permissions d'un rôle
  static async updateRolePermissions(roleId, permissionIds) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Supprimer les anciennes permissions
      await client.query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);
      
      // Ajouter les nouvelles
      for (const permissionId of permissionIds) {
        await client.query(
          'INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)',
          [roleId, permissionId]
        );
      }
      
      await client.query('COMMIT');
      return true;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // Vérifier si un utilisateur a une permission
  static async userHasPermission(userId, resource, action) {
    const result = await pool.query(
      `SELECT EXISTS(
         SELECT 1 FROM users u
         JOIN roles r ON r.name = u.role
         JOIN role_permissions rp ON rp.role_id = r.id
         JOIN permissions p ON p.id = rp.permission_id
         WHERE u.id = $1 AND p.resource = $2 AND p.action = $3
       ) as has_permission`,
      [userId, resource, action]
    );
    return result.rows[0].has_permission;
  }
}

module.exports = PermissionService;