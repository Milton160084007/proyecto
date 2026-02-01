const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { calcularIVA, redondeoJusto } = require('../utils/calculos');

// =====================================================
// OBTENER TODAS LAS SALIDAS (con detalles)
// =====================================================
router.get('/', async (req, res) => {
    try {
        const [salidas] = await pool.query(`
            SELECT s.*, 
                   u.usunombres AS usuario_nombre,
                   (SELECT COUNT(*) FROM detalle_salidas WHERE salid = s.salid) AS total_items
            FROM salidas s
            LEFT JOIN usuarios u ON s.usuid = u.usuid
            ORDER BY s.salfecha DESC
        `);
        res.json(salidas);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// OBTENER UNA SALIDA CON SUS DETALLES
// =====================================================
router.get('/:id', async (req, res) => {
    try {
        const [salida] = await pool.query(`
            SELECT s.*, u.usunombres AS usuario_nombre
            FROM salidas s
            LEFT JOIN usuarios u ON s.usuid = u.usuid
            WHERE s.salid = ?
        `, [req.params.id]);

        if (salida.length === 0) {
            return res.status(404).json({ error: 'Salida no encontrada' });
        }

        const [detalles] = await pool.query(`
            SELECT ds.*, pr.prodnombre, pr.prodcodigo
            FROM detalle_salidas ds
            JOIN productos pr ON ds.prodid = pr.prodid
            WHERE ds.salid = ?
        `, [req.params.id]);

        res.json({
            ...salida[0],
            detalles
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// CREAR SALIDA CON DETALLES (Venta)
// Recibe: { metodo_valoracion, observaciones, detalles: [{prodid, cantidad, descid?}] }
// =====================================================
router.post('/', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { metodo_valoracion = 'PROMEDIO', observaciones, detalles } = req.body;
        const usuid = req.body.usuid || 1;

        // Generar número de salida
        const [countResult] = await connection.query('SELECT COUNT(*) as count FROM salidas');
        const numero = `SAL-${String(countResult[0].count + 1).padStart(6, '0')}`;

        // Insertar encabezado (totales se actualizarán después)
        const [salidaResult] = await connection.query(`
            INSERT INTO salidas (usuid, salnumero, salmetodovaloracion, salobservaciones)
            VALUES (?, ?, ?, ?)
        `, [usuid, numero, metodo_valoracion, observaciones]);

        const salid = salidaResult.insertId;
        let subtotalGeneral = 0;
        const detallesInsertados = [];

        // Procesar cada detalle
        for (const detalle of detalles) {
            // Obtener producto
            const [producto] = await connection.query(
                'SELECT prodid, prodnombre, prodprecioventa, prodstock FROM productos WHERE prodid = ?',
                [detalle.prodid]
            );

            if (producto.length === 0) {
                throw new Error(`Producto ${detalle.prodid} no encontrado`);
            }

            if (producto[0].prodstock < detalle.cantidad) {
                throw new Error(`Stock insuficiente para ${producto[0].prodnombre}. Disponible: ${producto[0].prodstock}`);
            }

            // Obtener precio según método de valoración
            let precioVenta = producto[0].prodprecioventa;

            if (metodo_valoracion === 'FIFO') {
                precioVenta = await obtenerPrecioFIFO(connection, detalle.prodid);
            } else if (metodo_valoracion === 'LIFO') {
                precioVenta = await obtenerPrecioLIFO(connection, detalle.prodid);
            }

            // Obtener descuento si aplica
            let descuentoPorcentaje = 0;
            if (detalle.descid) {
                const [descuento] = await connection.query(
                    'SELECT descporcentaje FROM descuentos WHERE descid = ? AND descactivo = TRUE',
                    [detalle.descid]
                );
                if (descuento.length > 0) {
                    descuentoPorcentaje = parseFloat(descuento[0].descporcentaje);
                }
            }

            // Insertar detalle (campos calculados se generan automáticamente)
            await connection.query(`
                INSERT INTO detalle_salidas (salid, prodid, descid, dsalcantidad, dsalprecioventa, dsaldescuento)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [salid, detalle.prodid, detalle.descid || null, detalle.cantidad, precioVenta, descuentoPorcentaje]);

            const subtotalItem = detalle.cantidad * precioVenta * (1 - descuentoPorcentaje / 100);
            subtotalGeneral += subtotalItem;

            detallesInsertados.push({
                producto: producto[0].prodnombre,
                cantidad: detalle.cantidad,
                precio_unitario: precioVenta,
                descuento: descuentoPorcentaje,
                subtotal: redondeoJusto(subtotalItem)
            });
        }

        // Calcular IVA y total
        const iva = calcularIVA(subtotalGeneral);
        const total = redondeoJusto(subtotalGeneral + iva);

        // Actualizar encabezado con totales
        await connection.query(`
            UPDATE salidas SET salsubtotal = ?, saliva = ?, saltotal = ? WHERE salid = ?
        `, [redondeoJusto(subtotalGeneral), redondeoJusto(iva), total, salid]);

        await connection.commit();

        res.status(201).json({
            mensaje: 'Venta registrada exitosamente',
            salid,
            numero,
            metodo_valoracion,
            subtotal: redondeoJusto(subtotalGeneral),
            iva: redondeoJusto(iva),
            total,
            detalles: detallesInsertados
        });

    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

// =====================================================
// FUNCIÓN: Obtener precio FIFO (First In, First Out)
// =====================================================
async function obtenerPrecioFIFO(connection, prodid) {
    const [lotes] = await connection.query(`
        SELECT lotpreciocompra FROM lotes 
        WHERE prodid = ? AND lotcantidaddisponible > 0
        ORDER BY lotfechaingreso ASC
        LIMIT 1
    `, [prodid]);

    if (lotes.length > 0) {
        return parseFloat(lotes[0].lotpreciocompra);
    }

    // Fallback: precio de venta del producto
    const [producto] = await connection.query('SELECT prodprecioventa FROM productos WHERE prodid = ?', [prodid]);
    return parseFloat(producto[0].prodprecioventa);
}

// =====================================================
// FUNCIÓN: Obtener precio LIFO (Last In, First Out)
// =====================================================
async function obtenerPrecioLIFO(connection, prodid) {
    const [lotes] = await connection.query(`
        SELECT lotpreciocompra FROM lotes 
        WHERE prodid = ? AND lotcantidaddisponible > 0
        ORDER BY lotfechaingreso DESC
        LIMIT 1
    `, [prodid]);

    if (lotes.length > 0) {
        return parseFloat(lotes[0].lotpreciocompra);
    }

    const [producto] = await connection.query('SELECT prodprecioventa FROM productos WHERE prodid = ?', [prodid]);
    return parseFloat(producto[0].prodprecioventa);
}

module.exports = router;
