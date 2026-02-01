require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./config/db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =====================================================
// IMPORTAR RUTAS
// =====================================================
const categoriasRoutes = require('./routes/categorias');
const proveedoresRoutes = require('./routes/proveedores');
const productosRoutes = require('./routes/productos');
const entradasRoutes = require('./routes/entradas');
const salidasRoutes = require('./routes/salidas');
const usuariosRoutes = require('./routes/usuarios');

// =====================================================
// USAR RUTAS
// =====================================================
app.use('/api/categorias', categoriasRoutes);
app.use('/api/proveedores', proveedoresRoutes);
app.use('/api/productos', productosRoutes);
app.use('/api/entradas', entradasRoutes);
app.use('/api/salidas', salidasRoutes);
app.use('/api/usuarios', usuariosRoutes);

// =====================================================
// RUTA: Health Check
// =====================================================
app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({
            status: 'OK',
            database: 'Connected',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            status: 'ERROR',
            database: 'Disconnected',
            error: error.message
        });
    }
});

// =====================================================
// RUTA: Dashboard - Resumen General
// =====================================================
app.get('/api/dashboard', async (req, res) => {
    try {
        // Total de productos
        const [totalProductos] = await pool.query(
            'SELECT COUNT(*) as total FROM productos WHERE prodactivo = TRUE'
        );

        // Valor del inventario
        const [valorInventario] = await pool.query(
            'SELECT COALESCE(SUM(prodstock * prodprecioventa), 0) as valor FROM productos WHERE prodactivo = TRUE'
        );

        // Productos con stock bajo
        const [stockBajo] = await pool.query(
            'SELECT COUNT(*) as total FROM productos WHERE prodstock <= prodstockminimo AND prodactivo = TRUE'
        );

        // Productos próximos a vencer
        const [porVencer] = await pool.query(`
            SELECT COUNT(*) as total FROM productos 
            WHERE prodfechavencimiento IS NOT NULL 
              AND prodfechavencimiento <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
              AND prodfechavencimiento >= CURDATE()
              AND prodactivo = TRUE
        `);

        // Productos con stock bajo (lista)
        const [stockBajoLista] = await pool.query(`
            SELECT p.prodnombre as nombre, p.prodstock as stock_actual 
            FROM productos p 
            WHERE p.prodstock <= p.prodstockminimo AND p.prodactivo = TRUE
            LIMIT 5
        `);

        // Productos próximos a vencer (lista)
        const [porVencerLista] = await pool.query(`
            SELECT p.prodnombre as nombre, p.prodfechavencimiento as fecha_vencimiento
            FROM productos p 
            WHERE p.prodfechavencimiento IS NOT NULL 
              AND p.prodfechavencimiento <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
              AND p.prodfechavencimiento >= CURDATE()
              AND p.prodactivo = TRUE
            LIMIT 5
        `);

        // Últimas 5 entradas
        const [ultimasEntradas] = await pool.query(`
            SELECT e.entid, e.entnumero, e.entfecha, e.enttotal, p.provnombre
            FROM entradas e
            LEFT JOIN proveedores p ON e.provid = p.provid
            ORDER BY e.entfecha DESC LIMIT 5
        `);

        // Últimas 5 salidas
        const [ultimasSalidas] = await pool.query(`
            SELECT s.salid, s.salnumero, s.salfecha, s.saltotal
            FROM salidas s
            ORDER BY s.salfecha DESC LIMIT 5
        `);

        res.json({
            totalProductos: totalProductos[0].total,
            valorInventario: parseFloat(valorInventario[0].valor) || 0,
            alertasStockBajo: stockBajo[0].total,
            productosProximosVencer: porVencer[0].total,
            stockBajoLista,
            proximosVencerLista: porVencerLista,
            ultimasEntradas,
            ultimasSalidas
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// RUTA: Kardex de un producto
// =====================================================
app.get('/api/kardex/:prodid', async (req, res) => {
    try {
        const prodid = req.params.prodid;

        // Info del producto
        const [producto] = await pool.query(
            'SELECT prodid, prodcodigo, prodnombre, prodstock FROM productos WHERE prodid = ?',
            [prodid]
        );

        if (producto.length === 0) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }

        // Movimientos de entrada
        const [entradas] = await pool.query(`
            SELECT 'ENTRADA' as tipo, e.entfecha as fecha, de.dentcantidad as cantidad,
                   de.dentpreciocompra as precio, de.dentsubtotal as total, e.entobservaciones as observacion
            FROM detalle_entradas de
            JOIN entradas e ON de.entid = e.entid
            WHERE de.prodid = ?
        `, [prodid]);

        // Movimientos de salida
        const [salidas] = await pool.query(`
            SELECT 'SALIDA' as tipo, s.salfecha as fecha, ds.dsalcantidad as cantidad,
                   ds.dsalprecioventa as precio, ds.dsaltotal as total, s.salobservaciones as observacion
            FROM detalle_salidas ds
            JOIN salidas s ON ds.salid = s.salid
            WHERE ds.prodid = ?
        `, [prodid]);

        // Combinar y ordenar por fecha
        const movimientos = [...entradas, ...salidas].sort((a, b) =>
            new Date(b.fecha) - new Date(a.fecha)
        );

        res.json({
            producto: producto[0],
            movimientos
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// RUTA: Roles
// =====================================================
app.get('/api/roles', async (req, res) => {
    try {
        const [roles] = await pool.query('SELECT * FROM roles');
        res.json(roles);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// RUTA: Descuentos activos
// =====================================================
app.get('/api/descuentos', async (req, res) => {
    try {
        const [descuentos] = await pool.query(`
            SELECT d.*, c.catnombre, p.prodnombre
            FROM descuentos d
            LEFT JOIN categorias c ON d.catid = c.catid
            LEFT JOIN productos p ON d.prodid = p.prodid
            WHERE d.descactivo = TRUE 
              AND CURDATE() BETWEEN d.descfechainicio AND d.descfechafin
        `);
        res.json(descuentos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// MANEJO DE ERRORES
// =====================================================
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Error interno del servidor' });
});

// =====================================================
// INICIAR SERVIDOR
// =====================================================
app.listen(PORT, () => {
    console.log(`
    ╔═══════════════════════════════════════════════════╗
    ║   SISTEMA DE INVENTARIO - MICROMERCADO MUÑOZ      ║
    ║───────────────────────────────────────────────────║
    ║   Servidor corriendo en: http://localhost:${PORT}    ║
    ║   Base de datos: ${process.env.DB_NAME || 'micromercado_munoz'}                  ║
    ╚═══════════════════════════════════════════════════╝
    `);
});
