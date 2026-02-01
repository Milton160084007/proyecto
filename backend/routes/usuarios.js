const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// Clave para AES (debe coincidir con la usada en el schema)
const AES_KEY = 'micromercado_key';

// =====================================================
// OBTENER TODOS LOS USUARIOS
// =====================================================
router.get('/', async (req, res) => {
    try {
        const [usuarios] = await pool.query(`
            SELECT u.usuid, u.usunombres, u.usuapellidos, u.usuemail, u.usuusuario, 
                   u.usuactivo, u.usucreacion, r.rolnombre
            FROM usuarios u
            JOIN roles r ON u.rolid = r.rolid
            WHERE u.usuactivo = TRUE
            ORDER BY u.usunombres
        `);
        res.json(usuarios);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// OBTENER UN USUARIO
// =====================================================
router.get('/:id', async (req, res) => {
    try {
        const [usuario] = await pool.query(`
            SELECT u.usuid, u.usunombres, u.usuapellidos, u.usuemail, u.usuusuario, 
                   u.usuactivo, u.rolid, r.rolnombre
            FROM usuarios u
            JOIN roles r ON u.rolid = r.rolid
            WHERE u.usuid = ?
        `, [req.params.id]);

        if (usuario.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        res.json(usuario[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// CREAR USUARIO (con AES Encrypt)
// =====================================================
router.post('/', async (req, res) => {
    try {
        const { rolid, nombres, apellidos, email, usuario, contrasena } = req.body;

        const [result] = await pool.query(`
            INSERT INTO usuarios (rolid, usunombres, usuapellidos, usuemail, usuusuario, usucontrasena)
            VALUES (?, ?, ?, ?, ?, AES_ENCRYPT(?, ?))
        `, [rolid, nombres, apellidos, email, usuario, contrasena, AES_KEY]);

        res.status(201).json({
            mensaje: 'Usuario creado exitosamente',
            usuid: result.insertId
        });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'El usuario o email ya existe' });
        }
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// LOGIN (con AES Decrypt)
// =====================================================
router.post('/login', async (req, res) => {
    try {
        const { usuario, contrasena } = req.body;

        const [result] = await pool.query(`
            SELECT u.usuid, u.usunombres, u.usuapellidos, u.usuusuario, u.rolid, r.rolnombre
            FROM usuarios u
            JOIN roles r ON u.rolid = r.rolid
            WHERE u.usuusuario = ? 
              AND AES_DECRYPT(u.usucontrasena, ?) = ?
              AND u.usuactivo = TRUE
        `, [usuario, AES_KEY, contrasena]);

        if (result.length === 0) {
            return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
        }

        res.json({
            mensaje: 'Login exitoso',
            usuario: result[0]
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// ACTUALIZAR USUARIO
// =====================================================
router.put('/:id', async (req, res) => {
    try {
        const { rolid, nombres, apellidos, email, usuario } = req.body;

        await pool.query(`
            UPDATE usuarios SET rolid = ?, usunombres = ?, usuapellidos = ?, usuemail = ?, usuusuario = ?
            WHERE usuid = ?
        `, [rolid, nombres, apellidos, email, usuario, req.params.id]);

        res.json({ mensaje: 'Usuario actualizado exitosamente' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// CAMBIAR CONTRASEÑA
// =====================================================
router.put('/:id/password', async (req, res) => {
    try {
        const { contrasena } = req.body;

        await pool.query(`
            UPDATE usuarios SET usucontrasena = AES_ENCRYPT(?, ?) WHERE usuid = ?
        `, [contrasena, AES_KEY, req.params.id]);

        res.json({ mensaje: 'Contraseña actualizada exitosamente' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// ELIMINAR USUARIO (Soft Delete)
// =====================================================
router.delete('/:id', async (req, res) => {
    try {
        await pool.query('UPDATE usuarios SET usuactivo = FALSE WHERE usuid = ?', [req.params.id]);
        res.json({ mensaje: 'Usuario eliminado exitosamente' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
