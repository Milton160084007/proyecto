import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';

@Component({
    selector: 'app-productos',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './productos.html',
    styleUrl: './productos.css'
})
export class Productos implements OnInit {
    productos: any[] = [];
    categorias: any[] = [];
    proveedores: any[] = [];

    filtro = '';
    loading = false;

    // Modal
    modalOpen = false;
    editando = false;
    productoActual: any = this.nuevoProducto();

    constructor(private api: ApiService) { }

    ngOnInit() {
        this.cargarDatos();
    }

    nuevoProducto() {
        return {
            prodid: null,
            prodcodigo: '',
            prodnombre: '',
            proddescripcion: '',
            prodpreciocompra: 0,
            prodprecioventa: 0,
            prodstock: 0,
            prodstockminimo: 5,
            prodfechavencimiento: null,
            catid: null,
            provid: null
        };
    }

    cargarDatos() {
        this.loading = true;

        this.api.getProductos().subscribe({
            next: (data) => {
                this.productos = data;
                this.loading = false;
            },
            error: (err) => {
                console.error('Error:', err);
                this.loading = false;
            }
        });

        this.api.getCategorias().subscribe(data => this.categorias = data);
        this.api.getProveedores().subscribe(data => this.proveedores = data);
    }

    buscar() {
        if (this.filtro.trim()) {
            this.api.buscarProductos(this.filtro).subscribe(data => this.productos = data);
        } else {
            this.cargarDatos();
        }
    }

    abrirModal(producto?: any) {
        if (producto) {
            this.editando = true;
            this.productoActual = { ...producto };
        } else {
            this.editando = false;
            this.productoActual = this.nuevoProducto();
        }
        this.modalOpen = true;
    }

    cerrarModal() {
        this.modalOpen = false;
        this.productoActual = this.nuevoProducto();
    }

    guardar() {
        const dataToSend = {
            catid: this.productoActual.catid,
            provid: this.productoActual.provid,
            codigo: this.productoActual.prodcodigo,
            nombre: this.productoActual.prodnombre,
            descripcion: this.productoActual.proddescripcion,
            precio_compra: this.productoActual.prodpreciocompra,
            precio_venta: this.productoActual.prodprecioventa,
            stock: this.productoActual.prodstock,
            stock_minimo: this.productoActual.prodstockminimo,
            fecha_vencimiento: this.productoActual.prodfechavencimiento
        };

        if (this.editando) {
            this.api.updateProducto(this.productoActual.prodid, dataToSend).subscribe({
                next: () => {
                    this.cargarDatos();
                    this.cerrarModal();
                },
                error: (err) => alert('Error: ' + err.error?.error)
            });
        } else {
            this.api.createProducto(dataToSend).subscribe({
                next: () => {
                    this.cargarDatos();
                    this.cerrarModal();
                },
                error: (err) => alert('Error: ' + err.error?.error)
            });
        }
    }

    eliminar(producto: any) {
        if (confirm(`¿Eliminar "${producto.prodnombre}"?`)) {
            this.api.deleteProducto(producto.prodid).subscribe(() => this.cargarDatos());
        }
    }

    get productosFiltrados() {
        if (!this.filtro) return this.productos;
        const term = this.filtro.toLowerCase();
        return this.productos.filter(p =>
            p.prodnombre.toLowerCase().includes(term) ||
            p.prodcodigo.toLowerCase().includes(term)
        );
    }
}
