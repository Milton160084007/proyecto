import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';

@Component({
    selector: 'app-movimientos',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './movimientos.html',
    styleUrl: './movimientos.css'
})
export class Movimientos implements OnInit {
    movimientos: any[] = [];
    productos: any[] = [];

    // Arrays temporales para unir datos
    entradas: any[] = [];
    salidas: any[] = [];

    modalOpen = false;
    tipoMovimiento: 'ENTRADA' | 'SALIDA' = 'ENTRADA';

    movimientoActual = {
        producto_id: null as number | null,
        cantidad: 1,
        precio_unitario: 0,
        observacion: '',
        metodo_valoracion: 'PROMEDIO'
    };

    productoSeleccionado: any = null;
    resultado: any = null;
    loading = false;

    constructor(private api: ApiService, private cd: ChangeDetectorRef) { }

    ngOnInit() {
        this.cargarDatos();
    }

    cargarDatos() {
        this.loading = true;
        this.entradas = [];
        this.salidas = [];
        this.movimientos = [];

        this.api.getProductos().subscribe({
            next: (data) => {
                this.productos = data;
                this.cd.detectChanges();
            },
            error: (err) => console.error('Error cargando productos', err)
        });

        // Cargar Entradas
        this.api.getEntradas().subscribe({
            next: (data) => {
                this.entradas = data.map((e: any) => ({
                    tipo: 'ENTRADA',
                    fecha: e.entfecha,
                    producto_nombre: 'Varios', // Se podría mejorar si el backend enviara detalle principal
                    producto_codigo: e.entnumero,
                    cantidad: e.total_items + ' items',
                    subtotal: e.entsubtotal,
                    iva: e.entiva,
                    total: e.enttotal,
                    observacion: e.entobservaciones
                }));
                this.combinarMovimientos();
                this.cd.detectChanges();
            },
            error: (err) => console.error('Error cargando entradas', err)
        });

        // Cargar Salidas
        this.api.getSalidas().subscribe({
            next: (data) => {
                this.salidas = data.map((s: any) => ({
                    tipo: 'SALIDA',
                    fecha: s.salfecha,
                    producto_nombre: 'Venta',
                    producto_codigo: s.salnumero,
                    cantidad: s.total_items + ' items',
                    subtotal: s.salsubtotal,
                    iva: s.saliva,
                    total: s.saltotal,
                    observacion: s.salobservaciones
                }));
                this.combinarMovimientos();
                this.cd.detectChanges();
            },
            error: (err) => console.error('Error cargando salidas', err)
        });

        // Timeout seguridad para quitar loading
        setTimeout(() => {
            this.loading = false;
        }, 1000);
    }

    combinarMovimientos() {
        this.movimientos = [...this.entradas, ...this.salidas]
            .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
    }

    abrirModal(tipo: 'ENTRADA' | 'SALIDA') {
        this.tipoMovimiento = tipo;
        this.movimientoActual = {
            producto_id: null,
            cantidad: 1,
            precio_unitario: 0,
            observacion: '',
            metodo_valoracion: 'PROMEDIO'
        };
        this.productoSeleccionado = null;
        this.resultado = null;
        this.modalOpen = true;
    }

    cerrarModal() {
        this.modalOpen = false;
        this.resultado = null;
    }

    onProductoChange() {
        if (this.movimientoActual.producto_id) {
            this.productoSeleccionado = this.productos.find(
                p => p.prodid == this.movimientoActual.producto_id
            );
            if (this.tipoMovimiento === 'ENTRADA') {
                this.movimientoActual.precio_unitario = this.productoSeleccionado?.prodpreciocompra || 0;
            }
        } else {
            this.productoSeleccionado = null;
        }
    }

    registrar() {
        if (!this.movimientoActual.producto_id || this.movimientoActual.cantidad < 1) {
            alert('Selecciona un producto y cantidad válida');
            return;
        }

        this.loading = true;

        if (this.tipoMovimiento === 'ENTRADA') {
            const data = {
                provid: 1, // Proveedor por defecto
                observaciones: this.movimientoActual.observacion,
                detalles: [{
                    prodid: this.movimientoActual.producto_id,
                    cantidad: this.movimientoActual.cantidad,
                    precio_compra: this.movimientoActual.precio_unitario
                }]
            };

            this.api.createEntrada(data).subscribe({
                next: (res: any) => {
                    this.resultado = res;
                    this.loading = false;
                    this.cargarDatos();
                    // No cerramos modal para ver el resultado
                },
                error: (err: any) => {
                    alert('Error: ' + (err.error?.error || 'Error desconocido'));
                    this.loading = false;
                }
            });
        } else {
            const data = {
                metodo_valoracion: this.movimientoActual.metodo_valoracion,
                observaciones: this.movimientoActual.observacion,
                detalles: [{
                    prodid: this.movimientoActual.producto_id,
                    cantidad: this.movimientoActual.cantidad,
                    precio_compra: 0 // No se usa en salida pero para evitar errores
                }]
            };

            // Ajuste para salida
            // El backend espera: { metodo_valoracion, observaciones, detalles: [{prodid, cantidad}] }
            const salidaData = {
                metodo_valoracion: this.movimientoActual.metodo_valoracion,
                observaciones: this.movimientoActual.observacion,
                detalles: [{
                    prodid: this.movimientoActual.producto_id,
                    cantidad: this.movimientoActual.cantidad
                }]
            };


            this.api.createSalida(salidaData).subscribe({
                next: (res: any) => {
                    this.resultado = res;
                    this.loading = false;
                    this.cargarDatos();
                },
                error: (err: any) => {
                    alert('Error: ' + (err.error?.error || 'Stock insuficiente'));
                    this.loading = false;
                }
            });
        }
    }

    getIVA(): number {
        if (!this.productoSeleccionado || this.tipoMovimiento === 'ENTRADA') return 0;
        const subtotal = this.productoSeleccionado.prodprecioventa * this.movimientoActual.cantidad;
        return Math.round(subtotal * 0.15 * 100) / 100;
    }

    getTotal(): number {
        if (!this.productoSeleccionado) return 0;
        if (this.tipoMovimiento === 'ENTRADA') {
            return Math.round(this.movimientoActual.precio_unitario * this.movimientoActual.cantidad * 100) / 100;
        }
        const subtotal = this.productoSeleccionado.prodprecioventa * this.movimientoActual.cantidad;
        return Math.round((subtotal + this.getIVA()) * 100) / 100;
    }
}
