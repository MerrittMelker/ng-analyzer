import { ISingleSelectSettings } from 'obf-lib';
import { ITarget, ITargetTypeSummary } from 'target-module'; 
import { Component, OnDestroy, ViewChild } from '@angular/core';
import { ActivatedRoute, ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { NgForm } from '@angular/forms';
import { Guarded } from 'obf-lib';
import { combineLatest, Observable, Observer, Subscription } from 'rxjs';
import { tap } from 'rxjs/operators';
import { ModalService } from 'obf-lib';
import { TargetService } from 'target-module';  
import { TargetTypesService, HelperService } from 'target-module';  
import { UiConfig } from 'obf-lib';
import { DataContextService } from 'obf-lib';
import { SessionService } from 'obf-lib';
import { EntityModel } from 'obf-lib';
import { BaseEditComponent } from 'obf-lib';
import { NotificationService } from 'obf-lib';

@Component({
    selector: 'app-target-edit',
    templateUrl: './target-edit.component.html',
    styleUrls: ['./target-edit.component.scss']
})
export class TargetEditComponent extends BaseEditComponent<ITarget> implements Guarded, OnDestroy {
    targetTypeSummaries: ITargetTypeSummary[];
    targetLoaded = false;
    model: EntityModel;
    settingsForSingle: ISingleSelectSettings;
    @ViewChild('editForm') editForm: NgForm;
    paramSnapshotSubscription: Subscription;

    constructor(private route: ActivatedRoute,
                private router: Router,
                private title: Title,
                private targetService: TargetService,
                private targetTypesService: TargetTypesService,
                private modalService: ModalService,
                public dataContextService: DataContextService,
                sessionService: SessionService,
                notificationService: NotificationService,
                public uiConfig: UiConfig,
                helperService: HelperService) {
        super(sessionService, notificationService, route);
        helperService.bark('I wuff you');        
        this.settingsForSingle = {
            modelIsIdProperty: false,
            canSelectInactiveItems: false
        };
    }

    onInit() {
        this.paramSnapshotSubscription = combineLatest([this.route.params, this.dataContextService.snapshot$]).subscribe(async ([params, dataContextSnapshot]) => {
            await this.onSnapshotOrParamChange(params, dataContextSnapshot);
            try {
                if (this.entity.Id === -999) {
                    this.model = this.constructModel(this.entity);
                    this.title.setTitle('Constituents - Targets - Adding');
                } else {
                    this.entity = await this.targetService.Get(this.entity.Id).toPromise();
                    this.model = this.constructModel(this.entity);
                    this.title.setTitle(`Constituents - Targets - ${this.getEditingOrViewing()} ${this.model.fullTargetName}`);
                }
                if (!this.isEntityConstituentAffiliated()) {
                    this.router.navigate(['.'], {relativeTo: this.route.parent}).then();
                    return;
                }
                this.targetLoaded = true;
            } catch (error) {
                this.notificationService.error(error);
            }
        }, error => {
            this.notificationService.error(error);
        });

        this.targetTypesService.GetSummaries().subscribe((targetTypeSummaries: ITargetTypeSummary[]) => {
            this.targetTypeSummaries = targetTypeSummaries;
        }, errors => {
            this.notificationService.error(errors);
        });
    }

    ngOnDestroy(): void {
        if (this.paramSnapshotSubscription) {
            this.paramSnapshotSubscription.unsubscribe();
        }
    }

    get() {
        this.targetService.Get(this.model.target.Id).subscribe((target: ITarget) => {
            this.model = this.constructModel(target);
            this.title.setTitle(`Constituents - Targets - ${this.getEditingOrViewing()} ${this.model.fullTargetName}`);
            this.targetLoaded = true;
        }, errors => {
            this.notificationService.error(errors);
        });
    }

    cancel(reload: boolean) {
        if (reload) {
            this.router.navigate([`/crm/constituents/${this.dataContextSnapshot.Id}/targets`], {state: {reload: true}}).then();
        } else {
            this.router.navigate([`/crm/constituents/${this.dataContextSnapshot.Id}/targets`]).then();
        }
    }

    saveConfirmed(observer: Observer<boolean> = null, isNavToGrid: boolean = false) {
        if (!this.editForm.valid) {
            this.notificationService.error('Please provide values for all the required properties.');
            if (observer) {
                observer.next(false);
            }
            return;
        }

        this.createOrUpdate().subscribe(() => {
            if (observer) {
                if (isNavToGrid) {
                    observer.next(false);
                    this.cancel(true);
                } else {
                    observer.next(true);
                }
            } else {
                this.cancel(true);
            }
        }, error => {
            this.notificationService.error(error);
            if (observer) {
                observer.next(false);
            }
        });
    }

    canDeactivate(currentRoute: ActivatedRouteSnapshot, nextState?: RouterStateSnapshot): boolean | Observable<boolean> | Promise<boolean> {
        if (!this.editForm || this.editForm.submitted || !this.editForm.dirty) {
            return true;
        }
        const isNavToGrid = nextState && nextState.url.endsWith('targets');

        return new Observable((observer: Observer<boolean>) => {
            this.modalService.navigate('Target ' + this.model.fullTargetName).subscribe(action => {
                if (action === 'confirmed') {
                    this.saveConfirmed(observer, isNavToGrid);
                } else if (action === 'rejected') {
                    observer.next(true);
                } else if (action === 'canceled') {
                    observer.next(false);
                }
            });
        });
    }

    deleteTarget() {
        this.modalService.delete('Target ' + this.model.fullTargetName).subscribe(confirmed => {
            if (confirmed) {
                this.targetService.Delete(this.model.target.Id).subscribe(() => {
                    this.notificationService.success('Target has been deleted.');
                    this.editForm.form.markAsPristine();
                    this.cancel(true);
                }, errors => {
                    this.notificationService.error(errors);
                });
            }
        });
    }

    private constructModel(target: ITarget): EntityModel {
        return new EntityModel(target, this.getEntityConstituentDisplayName());
    }

    private createOrUpdate(): Observable<ITarget> {
        const shouldCreate = this.model.target.Id === -999;
        const saveObs = shouldCreate
            ? this.targetService.Create(this.model.target)
            : this.targetService.Update(this.model.target.Id, this.model.target);

        return saveObs.pipe(
            tap(updatedTarget => {
                this.editForm.form.markAsPristine();
                this.entity = updatedTarget;
                this.model = this.constructModel(updatedTarget);
                this.notificationService.success(`Target ${this.model.fullTargetName} successfully ${shouldCreate ? 'created' : 'updated'}.`);
                return updatedTarget;
            })
        );
    }
}
