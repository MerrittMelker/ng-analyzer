import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { UsersComponent } from './users/users.component';
import { AdminComponent } from './admin/admin.component';

const routes: Routes = [
  {
    path: '',
    redirectTo: '/home',
    pathMatch: 'full'
  },
  {
    path: 'home',
    component: HomeComponent,
    data: { menuId: 'main-home' }
  },
  {
    path: 'users',
    component: UsersComponent,
    data: { 
      menuId: 'user-management',
      title: 'User Management'
    }
  },
  {
    path: 'admin',
    component: AdminComponent,
    data: { menuId: 'admin-panel' },
    children: [
      {
        path: 'settings',
        component: AdminComponent,
        data: { menuId: 'admin-settings' }
      }
    ]
  },
  {
    path: 'about',
    component: HomeComponent
    // No menuId here
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
