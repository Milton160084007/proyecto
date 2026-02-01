const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { redondear, calcularIVA, valorarSalida } = require('../utils/calculos');

/**
 * GET - Obtener todos los movimientos
 */
router.get('/', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT 
                m.*,
                p.nombre as producto_nombre,
                p.codigo as producto_codigo,
                u.nombre as usuario_nombre
            FROM movimientos m
            JOIN productos p ON m.producto_id = p.id
            LEFT JOIN usuarios u ON m.usuario_id = u.id
            ORDER BY m.fecha DESC
            LIMIT 100
        `);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET - Kardex de un producto (historial de movimientos)
 */
router.get('/kardex/:producto_id', async (req, res) => {
    try {
        const [producto] = await pool.query(
            'SELECT * FROM productos WHERE id = ?',
            [req.params.producto_id]
        );

        if (producto.length === 0) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }

        const [movimientos] = await pool.query(`
            SELECT * FROM movimientos 
            WHERE producto_id = ?
            ORDER BY fecha ASC
        `, [req.params.producto_id]);

        // Calcular saldo acumulado
        let saldo = 0;
        const kardex = movimientos.map(mov => {
            if (mov.tipo === 'ENTRADA') {
                saldo += mov.cantidad;
            } else {
                saldo -= mov.cantidad;
            }
            return {
                ...mov,
                saldo_acumulado: saldo
            };
        });

        res.json({
            producto: producto[0],
            movimientos: kardex,
            saldo_actual: saldo
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST - Registrar ENTRADA de inventario
 */
router.post('/entrada', async (req, res) => {
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const { producto_id, cantidad, precio_unitario, usuario_id, observacion } = req.body;

        // Validar producto
        const [producto] = await connection.query(
            'SELECT * FROM productos WHERE id = ? AND activo = true',
            [producto_id]
        );

        if (producto.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Producto no encontrado' });
        }

        // Calcular montos (entrada sin IVA normalmente)
        const precioRedondeado = redondear(precio_unitario);
        const subtotal = redondear(cantidad * precioRedondeado);

        // Registrar movimiento
        const [result] = await connection.query(`
            INSERT INTO movimientos 
            (producto_id, tipo, cantidad, precio_unitario, subtotal, iva, total, usuario_id, observacion)
            VALUES (?, 'ENTRADA', ?, ?, ?, 0, ?, ?, ?)
        `, [producto_id, cantidad, precioRedondeado, subtotal, subtotal, usuario_id || null, observacion || '']);

        // Actualizar stock del producto
        await connection.query(`
            UPDATE productos 
            SET stock_actual = stock_actual + ?,
                precio_compra = ?
            WHERE id = ?
        `, [cantidad, precioRedondeado, producto_id]);

        await connection.commit();

        res.status(201).json({
            id: result.insertId,
            mensaje: 'Entrada registrada exitosamente',
            nuevo_stock: producto[0].stock_actual + cantidad
        });

    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

/**
 * POST - Registrar SALIDA de inventario (con IVA)
 */
router.post('/salida', async (req, res) => {
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const {
            producto_id,
            cantidad,
            usuario_id,
            observacion,
            metodo_valoracion = 'PROMEDIO'
        } = req.body;

        // Validar producto
        const [producto] = await connection.query(
            'SELECT * FROM productos WHERE id = ? AND activo = true',
            [producto_id]
        );

        if (producto.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Producto no encontrado' });
        }

        const prod = producto[0];

        // Validar stock disponible
        if (prod.stock_actual < cantidad) {
            await connection.rollback();
            return res.status(400).json({
                error: 'Stock insuficiente',
                stock_actual: prod.stock_actual,
                cantidad_solicitada: cantidad
            });
        }

        // Calcular precio de venta con IVA
        const precioVenta = prod.precio_venta;
        const subtotal = redondear(cantidad * precioVenta);
        const calculo = calcularIVA(subtotal);

        // Registrar movimiento
        const [result] = await connection.query(`
            INSERT INTO movimientos 
            (producto_id, tipo, cantidad, precio_unitario, subtotal, iva, total, metodo_valoracion, usuario_id, observacion)
            VALUES (?, 'SALIDA', ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            producto_id, cantidad, precioVenta,
            calculo.subtotal, calculo.iva, calculo.total,
            metodo_valoracion, usuario_id || null, observacion || ''
        ]);

        // Actualizar stock
        await connection.query(`
            UPDATE productos 
            SET stock_actual = stock_actual - ?
            WHERE id = ?
        `, [cantidad, producto_id]);

        await connection.commit();

        res.status(201).json({
            id: result.insertId,
            mensaje: 'Salida registrada exitosamente',
            detalle: {
                subtotal: calculo.subtotal,
                iva: calculo.iva,
                total: calculo.total
            },
            nuevo_stock: prod.stock_actual - cantidad
        });

    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

/**
 * POST - Ajuste de inventario (correcciones)
 */
router.post('/ajuste', async (req, res) => {
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const { producto_id, cantidad_real, usuario_id, observacion } = req.body;

        // Obtener producto actual
        const [producto] = await connection.query(
            'SELECT * FROM productos WHERE id = ?',
            [producto_id]
        );

        if (producto.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Producto no encontrado' });
        }

        const diferencia = cantidad_real - producto[0].stock_actual;
        const tipo = diferencia >= 0 ? 'ENTRADA' : 'SALIDA';
        const cantidadAbs = Math.abs(diferencia);

        if (diferencia !== 0) {
            // Registrar movimiento de ajuste
            await connection.query(`
                INSERT INTO movimientos 
                (producto_id, tipo, cantidad, precio_unitario, subtotal, iva, total, usuario_id, observacion)
                VALUES (?, ?, ?, 0, 0, 0, 0, ?, ?)
            `, [producto_id, tipo, cantidadAbs, usuario_id, `AJUSTE: ${observacion || 'Corrección de inventario'}`]);

            // Actualizar stock
            await connection.query(
                'UPDATE productos SET stock_actual = ? WHERE id = ?',
                [cantidad_real, producto_id]
            );
        }

        await connection.commit();

        res.json({
            mensaje: 'Ajuste realizado exitosamente',
            stock_anterior: producto[0].stock_actual,
            stock_nuevo: cantidad_real,
            diferencia: diferencia
        });

    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

/**
 * GET - Reporte de movimientos por fecha
 */
router.get('/reporte', async (req, res) => {
    try {
        const { fecha_inicio, fecha_fin, tipo } = req.query;

        let query = `
            SELECT 
                m.*,
                p.nombre as producto_nombre,
                p.codigo as producto_codigo
            FROM movimientos m
            JOIN productos p ON m.producto_id = p.id
            WHERE 1=1
        `;
        const params = [];

        if (fecha_inicio) {
            query += ' AND DATE(m.fecha) >= ?';
            params.push(fecha_inicio);
        }
        if (fecha_fin) {
            query += ' AND DATE(m.fecha) <= ?';
            params.push(fecha_fin);
        }
        if (tipo) {
            query += ' AND m.tipo = ?';
            params.push(tipo);
        }

        query += ' ORDER BY m.fecha DESC';

        const [rows] = await pool.query(query, params);

        // Calcular totales
        const totales = rows.reduce((acc, mov) => {
            if (mov.tipo === 'ENTRADA') {
                acc.total_entradas += mov.total;
                acc.cantidad_entradas += mov.cantidad;
            } else {
                acc.total_salidas += mov.total;
                acc.cantidad_salidas += mov.cantidad;
                acc.iva_total += mov.iva;
            }
            return acc;
        }, {
            total_entradas: 0,
            total_salidas: 0,
            cantidad_entradas: 0,
            cantidad_salidas: 0,
            iva_total: 0
        });

        res.json({
            movimientos: rows,
            totales: {
                ...totales,
                total_entradas: redondear(totales.total_entradas),
                total_salidas: redondear(totales.total_salidas),
                iva_total: redondear(totales.iva_total)
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
