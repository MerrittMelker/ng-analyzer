import { Component } from '@angular/core';
import { ServiceA } from './service-a.service';

@Component({
  selector: 'root-comp',
  template: `<child-comp></child-comp>`
})
export class RootComponent {
  constructor(private aService: ServiceA) {}
  callA() { this.aService.a(); }
}

