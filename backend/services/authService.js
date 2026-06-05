const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');

class AuthService {
  static async hashPassword(password) {
    const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_ROUNDS || 10));
    return bcrypt.hash(password, salt);
  }

  static async verifyPassword(password, hash) {
    return bcrypt.compare(password, hash);
  }

  static generateAccessToken(userId, tenantId, role) {
  const expiresIn = process.env.JWT_ACCESS_EXPIRY || '2h';
  console.log('🔑 Génération token avec expiresIn:', expiresIn);
  
  return jwt.sign(
    { userId, tenantId, role, type: 'access' },
    process.env.JWT_SECRET,
    { expiresIn: expiresIn }
  );
}

  static generateRefreshToken(userId, tenantId, role) {
    return jwt.sign(
      { userId, tenantId, role, type: 'refresh' },
      process.env.REFRESH_TOKEN_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d' }
    );
  }

  static async login(email, password, res) {
    const result = await pool.query(
      `SELECT id, email, password_hash, tenant_id, role, first_name, last_name 
       FROM users WHERE email = $1 AND is_active = true`,
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      throw new Error('Email ou mot de passe incorrect');
    }

    const user = result.rows[0];
    const isValid = await this.verifyPassword(password, user.password_hash);

    if (!isValid) {
      throw new Error('Email ou mot de passe incorrect');
    }

    await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    const accessToken = this.generateAccessToken(user.id, user.tenant_id, user.role);
    const refreshToken = this.generateRefreshToken(user.id, user.tenant_id, user.role);

    // Hasher le refresh token AVANT stockage
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    
    await pool.query(
      'UPDATE users SET refresh_token_hash = $1 WHERE id = $2',
      [refreshTokenHash, user.id]
    );

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 jours
    });

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        tenantId: user.tenant_id,
        role: user.role
      }
    };
  }

  static async refreshToken(refreshToken) {
  try {
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);

    if (decoded.type !== 'refresh') {
      throw new Error('Type invalide');
    }

    const result = await pool.query(
      `SELECT id, role, tenant_id, refresh_token_hash 
       FROM users 
       WHERE id = $1 AND is_active = true`,
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      throw new Error('Utilisateur introuvable');
    }

    const user = result.rows[0];

    // Vérifier le refresh token avec bcrypt.compare
    const valid = await bcrypt.compare(refreshToken, user.refresh_token_hash);

    if (!valid) {
      throw new Error('Refresh token révoqué');
    }

    const newAccessToken = this.generateAccessToken(user.id, user.tenant_id, user.role);

    // ✅ Retourner un objet avec accessToken
    return { accessToken: newAccessToken };
  } catch (err) {
    throw new Error('Session expirée');
  }
}

  static async logout(refreshToken, res) {
    try {
      const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
      
      await pool.query(
        'UPDATE users SET refresh_token_hash = NULL WHERE id = $1',
        [decoded.userId]
      );
    } catch (err) {
      // Token invalide, on ignore
    }
    
    res.clearCookie('refreshToken');
    return { success: true };
  }
}

module.exports = AuthService;