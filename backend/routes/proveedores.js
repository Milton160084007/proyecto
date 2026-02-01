const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// =====================================================
// OBTENER TODOS LOS PROVEEDORES
// =====================================================
router.get('/', async (req, res) => {
    try {
        const [proveedores] = await pool.query(`
            SELECT p.*, 
                   (SELECT COUNT(*) FROM productos WHERE provid = p.provid AND prodactivo = TRUE) AS total_productos
            FROM proveedores p
            WHERE p.provactivo = TRUE
            ORDER BY p.provnombre
        `);
        res.json(proveedores);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// OBTENER UN PROVEEDOR
// =====================================================
router.get('/:id', async (req, res) => {
    try {
        const [proveedor] = await pool.query(
            'SELECT * FROM proveedores WHERE provid = ?',
            [req.params.id]
        );
        if (proveedor.length === 0) {
            return res.status(404).json({ error: 'Proveedor no encontrado' });
        }
        res.json(proveedor[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// CREAR PROVEEDOR
// =====================================================
router.post('/', async (req, res) => {
    try {
        const { nombre, contacto, telefono, email, direccion, empresa } = req.body;
        const [result] = await pool.query(
            `INSERT INTO proveedores (provnombre, provcontacto, provtelefono, provemail, provdireccion, provempresa)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [nombre, contacto, telefono, email, direccion, empresa]
        );
        res.status(201).json({
            mensaje: 'Proveedor creado exitosamente',
            provid: result.insertId
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// ACTUALIZAR PROVEEDOR
// =====================================================
router.put('/:id', async (req, res) => {
    try {
        const { nombre, contacto, telefono, email, direccion, empresa } = req.body;
        await pool.query(
            `UPDATE proveedores SET 
             provnombre = ?, provcontacto = ?, provtelefono = ?, 
             provemail = ?, provdireccion = ?, provempresa = ?
             WHERE provid = ?`,
            [nombre, contacto, telefono, email, direccion, empresa, req.params.id]
        );
        res.json({ mensaje: 'Proveedor actualizado exitosamente' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// ELIMINAR PROVEEDOR (Soft Delete)
// =====================================================
router.delete('/:id', async (req, res) => {
    try {
        await pool.query('UPDATE proveedores SET provactivo = FALSE WHERE provid = ?', [req.params.id]);
        res.json({ mensaje: 'Proveedor eliminado exitosamente' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
