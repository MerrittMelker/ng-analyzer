import { Component } from '@angular/core';
import { WrapperService } from './wrapper.service';
import { UserService } from './user.service';

@Component({ selector: 'app-dashboard', template: '<div></div>' })
export class DashboardComponent {
  constructor(private wrapperService: WrapperService, private userService: UserService) {}
  loadAll() {
    this.wrapperService.refresh();
    this.userService.get();
    this.userService.delete();
  }
  optional() {
    // optional chaining pattern (may or may not be picked up depending on parser)
    (this as any).userService?.get();
  }
}

