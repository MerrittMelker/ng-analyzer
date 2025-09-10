import { ServiceB } from './service-b.service';

export class ServiceA {
  constructor(private bSvc: ServiceB) {}
  a() { return this.bSvc.b(); }
}

