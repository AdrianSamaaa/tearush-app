import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/** Sends guests to the login page, then back to where they were going. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  if (auth.isLoggedIn()) return true;
  return inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** Logged in AND email verified (needed to place orders). */
export const verifiedGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isLoggedIn()) return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  if (auth.needsVerification()) return router.createUrlTree(['/verify-email'], { queryParams: { returnUrl: state.url } });
  return true;
};

export const adminGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isLoggedIn()) return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  return auth.isAdmin() ? true : router.createUrlTree(['/dashboard']);
};

/** Keeps logged-in users off the login/register pages. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isLoggedIn() ? inject(Router).createUrlTree(['/dashboard']) : true;
};
