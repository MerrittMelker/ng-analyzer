import { UserService } from './user.service';
export class WrapperService {
  constructor(private userService: UserService) {}
  refresh() { this.userService.get(); }
}

