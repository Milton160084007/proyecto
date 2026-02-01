/**
 * Utilidades para cálculos financieros
 * - IVA (15% Ecuador)
 * - Redondeo justo (2 decimales)
 * - Métodos de valoración: FIFO, LIFO, Promedio
 */

const IVA_RATE = parseFloat(process.env.IVA_RATE) || 0.15;

/**
 * Redondeo justo a 2 decimales (redondeo bancario/matemático)
 * @param {number} valor - Valor a redondear
 * @returns {number} - Valor redondeado
 */
const redondear = (valor) => {
    return Math.round((valor + Number.EPSILON) * 100) / 100;
};

/**
 * Calcula el IVA de un subtotal
 * @param {number} subtotal - Monto sin IVA
 * @returns {object} - { subtotal, iva, total }
 */
const calcularIVA = (subtotal) => {
    const subRedondeado = redondear(subtotal);
    const iva = redondear(subRedondeado * IVA_RATE);
    const total = redondear(subRedondeado + iva);

    return {
        subtotal: subRedondeado,
        iva: iva,
        total: total
    };
};

/**
 * Calcula el precio de venta con IVA incluido
 * @param {number} precioBase - Precio sin IVA
 * @param {number} cantidad - Cantidad de productos
 * @returns {object} - Desglose completo
 */
const calcularVenta = (precioBase, cantidad) => {
    const subtotal = redondear(precioBase * cantidad);
    return calcularIVA(subtotal);
};

/**
 * Valoración FIFO (First In, First Out)
 * Las primeras unidades que entraron son las primeras en salir
 * @param {Array} lotes - Array de { cantidad, costo }
 * @param {number} cantidadSalida - Unidades a retirar
 * @returns {object} - { costoTotal, loteRestante }
 */
const calcularFIFO = (lotes, cantidadSalida) => {
    let costoTotal = 0;
    let pendiente = cantidadSalida;
    const lotesRestantes = [];

    for (const lote of lotes) {
        if (pendiente <= 0) {
            lotesRestantes.push({ ...lote });
            continue;
        }

        if (lote.cantidad <= pendiente) {
            costoTotal += lote.cantidad * lote.costo;
            pendiente -= lote.cantidad;
        } else {
            costoTotal += pendiente * lote.costo;
            lotesRestantes.push({
                cantidad: lote.cantidad - pendiente,
                costo: lote.costo
            });
            pendiente = 0;
        }
    }

    return {
        costoTotal: redondear(costoTotal),
        costoPromedio: redondear(costoTotal / cantidadSalida),
        lotesRestantes
    };
};

/**
 * Valoración LIFO (Last In, First Out)
 * Las últimas unidades que entraron son las primeras en salir
 * @param {Array} lotes - Array de { cantidad, costo }
 * @param {number} cantidadSalida - Unidades a retirar
 * @returns {object} - { costoTotal, loteRestante }
 */
const calcularLIFO = (lotes, cantidadSalida) => {
    const lotesInvertidos = [...lotes].reverse();
    const resultado = calcularFIFO(lotesInvertidos, cantidadSalida);
    resultado.lotesRestantes = resultado.lotesRestantes.reverse();
    return resultado;
};

/**
 * Valoración por Promedio Ponderado
 * Costo promedio de todas las unidades en inventario
 * @param {Array} lotes - Array de { cantidad, costo }
 * @param {number} cantidadSalida - Unidades a retirar
 * @returns {object} - { costoTotal, costoPromedio }
 */
const calcularPromedio = (lotes, cantidadSalida) => {
    const totalUnidades = lotes.reduce((sum, l) => sum + l.cantidad, 0);
    const valorTotal = lotes.reduce((sum, l) => sum + (l.cantidad * l.costo), 0);
    const costoPromedio = totalUnidades > 0 ? valorTotal / totalUnidades : 0;

    return {
        costoTotal: redondear(cantidadSalida * costoPromedio),
        costoPromedio: redondear(costoPromedio),
        unidadesRestantes: totalUnidades - cantidadSalida
    };
};

/**
 * Selector de método de valoración
 * @param {string} metodo - 'FIFO', 'LIFO' o 'PROMEDIO'
 * @param {Array} lotes - Lotes de inventario
 * @param {number} cantidad - Cantidad a retirar
 * @returns {object} - Resultado del cálculo
 */
const valorarSalida = (metodo, lotes, cantidad) => {
    switch (metodo.toUpperCase()) {
        case 'FIFO':
            return calcularFIFO(lotes, cantidad);
        case 'LIFO':
            return calcularLIFO(lotes, cantidad);
        case 'PROMEDIO':
        default:
            return calcularPromedio(lotes, cantidad);
    }
};

module.exports = {
    redondear,
    calcularIVA,
    calcularVenta,
    calcularFIFO,
    calcularLIFO,
    calcularPromedio,
    valorarSalida,
    IVA_RATE
};
