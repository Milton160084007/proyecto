import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';

@Component({
    selector: 'app-categorias',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './categorias.html',
    styleUrl: './categorias.css'
})
export class Categorias implements OnInit {
    categorias: any[] = [];
    modalOpen = false;
    editando = false;
    categoriaActual = { catid: null, catnombre: '', catdescripcion: '' };

    constructor(private api: ApiService) { }

    ngOnInit() {
        this.cargarCategorias();
    }

    cargarCategorias() {
        this.api.getCategorias().subscribe(data => this.categorias = data);
    }

    abrirModal(cat?: any) {
        if (cat) {
            this.editando = true;
            this.categoriaActual = { ...cat };
        } else {
            this.editando = false;
            this.categoriaActual = { catid: null, catnombre: '', catdescripcion: '' };
        }
        this.modalOpen = true;
    }

    cerrarModal() {
        this.modalOpen = false;
    }

    guardar() {
        const dataToSend = {
            nombre: this.categoriaActual.catnombre,
            descripcion: this.categoriaActual.catdescripcion
        };

        if (this.editando) {
            this.api.updateCategoria(this.categoriaActual.catid!, dataToSend).subscribe(() => {
                this.cargarCategorias();
                this.cerrarModal();
            });
        } else {
            this.api.createCategoria(dataToSend).subscribe(() => {
                this.cargarCategorias();
                this.cerrarModal();
            });
        }
    }

    eliminar(cat: any) {
        if (confirm(`¿Eliminar categoría "${cat.catnombre}"?`)) {
            this.api.deleteCategoria(cat.catid).subscribe(() => this.cargarCategorias());
        }
    }
}
