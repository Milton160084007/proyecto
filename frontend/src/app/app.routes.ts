import { Routes } from '@angular/router';

export const routes: Routes = [
    {
        path: '',
        loadComponent: () => import('./pages/dashboard/dashboard').then(m => m.Dashboard)
    },
    {
        path: 'productos',
        loadComponent: () => import('./pages/productos/productos').then(m => m.Productos)
    },
    {
        path: 'categorias',
        loadComponent: () => import('./pages/categorias/categorias').then(m => m.Categorias)
    },
    {
        path: 'movimientos',
        loadComponent: () => import('./pages/movimientos/movimientos').then(m => m.Movimientos)
    },
    {
        path: '**',
        redirectTo: ''
    }
];
