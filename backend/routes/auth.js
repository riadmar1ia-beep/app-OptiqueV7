const express = require('express');
const router = express.Router();
const AuthService = require('../services/authService');
const pool = require('../config/database');  
const { z } = require('zod');

// Schéma de validation
const loginSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(6, 'Le mot de passe doit contenir au moins 6 caractères')
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    // Validation
    const validation = loginSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        error: 'Données invalides', 
        details: validation.error.errors 
      });
    }

    const { email, password } = validation.data;
    const result = await AuthService.login(email, password, res);

    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    console.error('Erreur login:', err.message);
    res.status(401).json({ error: err.message });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) {
      return res.status(401).json({ error: 'Token manquant' });
    }

    const result = await AuthService.refreshToken(refreshToken);
    
    // ✅ Format de réponse attendu par le frontend
    res.json({ 
      success: true, 
      data: { 
        accessToken: result.accessToken 
      } 
    });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});
// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  await AuthService.logout(refreshToken, res);
  res.json({ success: true, message: 'Déconnecté' });
});

// GET /api/auth/me (protégé)
router.get('/me', require('../middleware/auth'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, first_name, last_name, role, tenant_id FROM users WHERE id = $1',
      [req.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;