import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { shareReplay, tap } from 'rxjs/operators';

@Injectable({
    providedIn: 'root'
})
export class ApiService {
    private baseUrl = 'http://localhost:3000/api';

    // Caché Observables
    private categorias$: Observable<any> | null = null;
    private proveedores$: Observable<any> | null = null;
    private productos$: Observable<any> | null = null;

    constructor(private http: HttpClient) { }

    // =====================================================
    // HEALTH CHECK
    // =====================================================
    checkHealth(): Observable<any> {
        return this.http.get('http://localhost:3000/health');
    }

    // =====================================================
    // DASHBOARD
    // =====================================================
    getDashboard(): Observable<any> {
        return this.http.get(`${this.baseUrl}/dashboard`);
    }

    // =====================================================
    // CATEGORÍAS
    // =====================================================
    getCategorias(): Observable<any> {
        if (!this.categorias$) {
            this.categorias$ = this.http.get(`${this.baseUrl}/categorias`).pipe(
                shareReplay(1)
            );
        }
        return this.categorias$;
    }

    getCategoria(id: number): Observable<any> {
        return this.http.get(`${this.baseUrl}/categorias/${id}`);
    }

    createCategoria(data: any): Observable<any> {
        return this.http.post(`${this.baseUrl}/categorias`, data).pipe(
            tap(() => this.categorias$ = null) // Invalidar caché
        );
    }

    updateCategoria(id: number, data: any): Observable<any> {
        return this.http.put(`${this.baseUrl}/categorias/${id}`, data).pipe(
            tap(() => this.categorias$ = null) // Invalidar caché
        );
    }

    deleteCategoria(id: number): Observable<any> {
        return this.http.delete(`${this.baseUrl}/categorias/${id}`).pipe(
            tap(() => this.categorias$ = null) // Invalidar caché
        );
    }

    // =====================================================
    // PROVEEDORES
    // =====================================================
    getProveedores(): Observable<any> {
        if (!this.proveedores$) {
            this.proveedores$ = this.http.get(`${this.baseUrl}/proveedores`).pipe(
                shareReplay(1)
            );
        }
        return this.proveedores$;
    }

    getProveedor(id: number): Observable<any> {
        return this.http.get(`${this.baseUrl}/proveedores/${id}`);
    }

    createProveedor(data: any): Observable<any> {
        return this.http.post(`${this.baseUrl}/proveedores`, data).pipe(
            tap(() => this.proveedores$ = null)
        );
    }

    updateProveedor(id: number, data: any): Observable<any> {
        return this.http.put(`${this.baseUrl}/proveedores/${id}`, data).pipe(
            tap(() => this.proveedores$ = null)
        );
    }

    deleteProveedor(id: number): Observable<any> {
        return this.http.delete(`${this.baseUrl}/proveedores/${id}`).pipe(
            tap(() => this.proveedores$ = null)
        );
    }

    // =====================================================
    // PRODUCTOS
    // =====================================================
    getProductos(fuerzaRecarga = false): Observable<any> {
        if (!this.productos$ || fuerzaRecarga) {
            this.productos$ = this.http.get(`${this.baseUrl}/productos`).pipe(
                shareReplay(1)
            );
        }
        return this.productos$;
    }

    getProducto(id: number): Observable<any> {
        return this.http.get(`${this.baseUrl}/productos/${id}`);
    }

    buscarProductos(termino: string): Observable<any> {
        return this.http.get(`${this.baseUrl}/productos/buscar/${termino}`);
    }

    getProductosStockBajo(): Observable<any> {
        return this.http.get(`${this.baseUrl}/productos/alertas/stock-bajo`);
    }

    getProductosProximosVencer(): Observable<any> {
        return this.http.get(`${this.baseUrl}/productos/alertas/proximos-vencer`);
    }

    createProducto(data: any): Observable<any> {
        return this.http.post(`${this.baseUrl}/productos`, data).pipe(
            tap(() => this.productos$ = null)
        );
    }

    updateProducto(id: number, data: any): Observable<any> {
        return this.http.put(`${this.baseUrl}/productos/${id}`, data).pipe(
            tap(() => this.productos$ = null)
        );
    }

    deleteProducto(id: number): Observable<any> {
        return this.http.delete(`${this.baseUrl}/productos/${id}`).pipe(
            tap(() => this.productos$ = null)
        );
    }

    // =====================================================
    // ENTRADAS (Compras)
    // =====================================================
    getEntradas(): Observable<any> {
        return this.http.get(`${this.baseUrl}/entradas`);
    }

    getEntrada(id: number): Observable<any> {
        return this.http.get(`${this.baseUrl}/entradas/${id}`);
    }

    createEntrada(data: any): Observable<any> {
        return this.http.post(`${this.baseUrl}/entradas`, data).pipe(
            tap(() => this.productos$ = null) // Inventario cambia
        );
    }

    // =====================================================
    // SALIDAS (Ventas)
    // =====================================================
    getSalidas(): Observable<any> {
        return this.http.get(`${this.baseUrl}/salidas`);
    }

    getSalida(id: number): Observable<any> {
        return this.http.get(`${this.baseUrl}/salidas/${id}`);
    }

    createSalida(data: any): Observable<any> {
        return this.http.post(`${this.baseUrl}/salidas`, data).pipe(
            tap(() => this.productos$ = null) // Inventario cambia
        );
    }

    // =====================================================
    // KARDEX
    // =====================================================
    getKardex(prodid: number): Observable<any> {
        return this.http.get(`${this.baseUrl}/kardex/${prodid}`);
    }

    // =====================================================
    // ROLES
    // =====================================================
    getRoles(): Observable<any> {
        return this.http.get(`${this.baseUrl}/roles`);
    }

    // =====================================================
    // DESCUENTOS
    // =====================================================
    getDescuentos(): Observable<any> {
        return this.http.get(`${this.baseUrl}/descuentos`);
    }
}
