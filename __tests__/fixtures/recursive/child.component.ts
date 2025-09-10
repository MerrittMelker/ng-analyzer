import { Component } from '@angular/core';
import { ServiceB } from './service-b.service';

@Component({
  selector: 'child-comp',
  template: `<p>Child</p>`
})
export class ChildComponent {
  constructor(private serviceB: ServiceB) {}
  useB() { this.serviceB.b(); }
}

