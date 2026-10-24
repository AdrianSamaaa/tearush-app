import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ApiService } from '../services/api.service';
import { AuthService, SessionStore } from '../services/auth.service';

/** Adds the login token to API requests and signs the user out if the server rejects it. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const api = inject(ApiService);
  const session = inject(SessionStore);
  const auth = inject(AuthService);

  if (!api.isApiUrl(req.url)) return next(req);

  const token = session.token();
  const authed = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(authed).pipe(
    catchError((err: unknown) => {
      const isLoginAttempt = req.url.endsWith('/auth/login') || req.url.endsWith('/auth/register');
      if (err instanceof HttpErrorResponse && err.status === 401 && token && !isLoginAttempt) {
        void auth.handleExpiredSession();
      }
      return throwError(() => err);
    })
  );
};
