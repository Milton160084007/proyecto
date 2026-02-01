const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// =====================================================
// OBTENER TODAS LAS ENTRADAS (con detalles)
// =====================================================
router.get('/', async (req, res) => {
    try {
        const [entradas] = await pool.query(`
            SELECT e.*, 
                   p.provnombre AS proveedor_nombre,
                   u.usunombres AS usuario_nombre,
                   (SELECT COUNT(*) FROM detalle_entradas WHERE entid = e.entid) AS total_items
            FROM entradas e
            LEFT JOIN proveedores p ON e.provid = p.provid
            LEFT JOIN usuarios u ON e.usuid = u.usuid
            ORDER BY e.entfecha DESC
        `);
        res.json(entradas);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// OBTENER UNA ENTRADA CON SUS DETALLES
// =====================================================
router.get('/:id', async (req, res) => {
    try {
        const [entrada] = await pool.query(`
            SELECT e.*, 
                   p.provnombre AS proveedor_nombre,
                   u.usunombres AS usuario_nombre
            FROM entradas e
            LEFT JOIN proveedores p ON e.provid = p.provid
            LEFT JOIN usuarios u ON e.usuid = u.usuid
            WHERE e.entid = ?
        `, [req.params.id]);

        if (entrada.length === 0) {
            return res.status(404).json({ error: 'Entrada no encontrada' });
        }

        const [detalles] = await pool.query(`
            SELECT de.*, pr.prodnombre, pr.prodcodigo
            FROM detalle_entradas de
            JOIN productos pr ON de.prodid = pr.prodid
            WHERE de.entid = ?
        `, [req.params.id]);

        res.json({
            ...entrada[0],
            detalles
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// CREAR ENTRADA CON DETALLES
// Recibe: { provid, observaciones, detalles: [{prodid, cantidad, precio_compra}] }
// =====================================================
router.post('/', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { provid, observaciones, detalles } = req.body;
        const usuid = req.body.usuid || 1; // Usuario por defecto

        // Calcular totales
        let subtotal = 0;
        detalles.forEach(d => {
            subtotal += d.cantidad * d.precio_compra;
        });
        const iva = subtotal * 0.15;
        const total = subtotal + iva;

        // Generar número de entrada
        const [countResult] = await connection.query('SELECT COUNT(*) as count FROM entradas');
        const numero = `ENT-${String(countResult[0].count + 1).padStart(6, '0')}`;

        // Insertar encabezado
        const [entradaResult] = await connection.query(`
            INSERT INTO entradas (provid, usuid, entnumero, entsubtotal, entiva, enttotal, entobservaciones)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [provid, usuid, numero, subtotal, iva, total, observaciones]);

        const entid = entradaResult.insertId;

        // Insertar detalles (el trigger actualiza stock automáticamente)
        for (const detalle of detalles) {
            await connection.query(`
                INSERT INTO detalle_entradas (entid, prodid, dentcantidad, dentpreciocompra)
                VALUES (?, ?, ?, ?)
            `, [entid, detalle.prodid, detalle.cantidad, detalle.precio_compra]);
        }

        await connection.commit();

        res.status(201).json({
            mensaje: 'Entrada registrada exitosamente',
            entid,
            numero,
            subtotal,
            iva,
            total,
            items: detalles.length
        });

    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

module.exports = router;
