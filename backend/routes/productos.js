const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// =====================================================
// OBTENER TODOS LOS PRODUCTOS
// =====================================================
router.get('/', async (req, res) => {
    try {
        const [productos] = await pool.query(`
            SELECT p.*, 
                   c.catnombre AS categoria_nombre,
                   pr.provnombre AS proveedor_nombre
            FROM productos p
            LEFT JOIN categorias c ON p.catid = c.catid
            LEFT JOIN proveedores pr ON p.provid = pr.provid
            WHERE p.prodactivo = TRUE
            ORDER BY p.prodnombre
        `);
        res.json(productos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// OBTENER UN PRODUCTO POR ID
// =====================================================
router.get('/:id', async (req, res) => {
    try {
        const [producto] = await pool.query(`
            SELECT p.*, 
                   c.catnombre AS categoria_nombre,
                   pr.provnombre AS proveedor_nombre
            FROM productos p
            LEFT JOIN categorias c ON p.catid = c.catid
            LEFT JOIN proveedores pr ON p.provid = pr.provid
            WHERE p.prodid = ?
        `, [req.params.id]);

        if (producto.length === 0) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }
        res.json(producto[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// BUSCAR PRODUCTOS
// =====================================================
router.get('/buscar/:termino', async (req, res) => {
    try {
        const termino = `%${req.params.termino}%`;
        const [productos] = await pool.query(`
            SELECT p.*, c.catnombre AS categoria_nombre
            FROM productos p
            LEFT JOIN categorias c ON p.catid = c.catid
            WHERE p.prodactivo = TRUE 
              AND (p.prodnombre LIKE ? OR p.prodcodigo LIKE ?)
            ORDER BY p.prodnombre
        `, [termino, termino]);
        res.json(productos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// PRODUCTOS CON STOCK BAJO
// =====================================================
router.get('/alertas/stock-bajo', async (req, res) => {
    try {
        const [productos] = await pool.query(`
            SELECT p.*, c.catnombre AS categoria_nombre
            FROM productos p
            LEFT JOIN categorias c ON p.catid = c.catid
            WHERE p.prodstock <= p.prodstockminimo 
              AND p.prodactivo = TRUE
            ORDER BY p.prodstock ASC
        `);
        res.json(productos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// PRODUCTOS PRÓXIMOS A VENCER (30 días)
// =====================================================
router.get('/alertas/proximos-vencer', async (req, res) => {
    try {
        const [productos] = await pool.query(`
            SELECT p.*, 
                   c.catnombre AS categoria_nombre,
                   DATEDIFF(p.prodfechavencimiento, CURDATE()) AS dias_restantes
            FROM productos p
            LEFT JOIN categorias c ON p.catid = c.catid
            WHERE p.prodfechavencimiento IS NOT NULL
              AND p.prodfechavencimiento <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
              AND p.prodfechavencimiento >= CURDATE()
              AND p.prodactivo = TRUE
            ORDER BY dias_restantes ASC
        `);
        res.json(productos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// CREAR PRODUCTO
// =====================================================
router.post('/', async (req, res) => {
    try {
        const {
            catid, provid, codigo, nombre, descripcion,
            precio_compra, precio_venta, stock, stock_minimo, fecha_vencimiento
        } = req.body;

        const [result] = await pool.query(`
            INSERT INTO productos 
            (catid, provid, prodcodigo, prodnombre, proddescripcion, 
             prodpreciocompra, prodprecioventa, prodstock, prodstockminimo, prodfechavencimiento)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [catid, provid, codigo, nombre, descripcion,
            precio_compra || 0, precio_venta, stock || 0, stock_minimo || 5, fecha_vencimiento]);

        res.status(201).json({
            mensaje: 'Producto creado exitosamente',
            prodid: result.insertId
        });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'El código de producto ya existe' });
        }
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// ACTUALIZAR PRODUCTO
// =====================================================
router.put('/:id', async (req, res) => {
    try {
        const {
            catid, provid, codigo, nombre, descripcion,
            precio_compra, precio_venta, stock_minimo, fecha_vencimiento
        } = req.body;

        await pool.query(`
            UPDATE productos SET
                catid = ?, provid = ?, prodcodigo = ?, prodnombre = ?, 
                proddescripcion = ?, prodpreciocompra = ?, prodprecioventa = ?,
                prodstockminimo = ?, prodfechavencimiento = ?
            WHERE prodid = ?
        `, [catid, provid, codigo, nombre, descripcion,
            precio_compra, precio_venta, stock_minimo, fecha_vencimiento, req.params.id]);

        res.json({ mensaje: 'Producto actualizado exitosamente' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// ELIMINAR PRODUCTO (Soft Delete)
// =====================================================
router.delete('/:id', async (req, res) => {
    try {
        await pool.query('UPDATE productos SET prodactivo = FALSE WHERE prodid = ?', [req.params.id]);
        res.json({ mensaje: 'Producto eliminado exitosamente' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
