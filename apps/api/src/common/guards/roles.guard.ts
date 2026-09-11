import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // No @Roles() on the route: authentication alone is enough.
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    // Fail closed: a @Roles() route reached without an authenticated user is a
    // wiring mistake (JwtAuthGuard missing), not an anonymous pass.
    if (!user?.role) {
      throw new ForbiddenException('Authenticated user required for this operation');
    }
    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException(
        `Requires role: ${requiredRoles.join(' or ')} (current role: ${user.role})`,
      );
    }
    return true;
  }
}
