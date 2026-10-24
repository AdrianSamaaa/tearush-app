import { Routes } from '@angular/router';
import { adminGuard, authGuard, guestGuard, verifiedGuard } from './core/guards';

export const routes: Routes = [
  // The app opens straight onto the Home screen with the product list.
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    // Welcome slides — reachable from About the App.
    path: 'onboarding',
    loadComponent: () =>
      import('./pages/onboarding/onboarding.page').then((m) => m.OnboardingPage),
  },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/auth/register.page').then((m) => m.RegisterPage),
  },
  {
    path: 'verify-email',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/auth/verify-email.page').then((m) => m.VerifyEmailPage),
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./pages/dashboard/dashboard.page').then((m) => m.DashboardPage),
  },
  {
    path: 'products',
    loadComponent: () =>
      import('./pages/products/product-list/product-list.page').then(
        (m) => m.ProductListPage
      ),
  },
  {
    path: 'products/:id',
    loadComponent: () =>
      import('./pages/products/product-detail/product-detail.page').then(
        (m) => m.ProductDetailPage
      ),
  },
  {
    path: 'customize',
    loadComponent: () =>
      import('./pages/customize/customize.page').then((m) => m.CustomizePage),
  },
  {
    path: 'cart',
    loadComponent: () => import('./pages/cart/cart.page').then((m) => m.CartPage),
  },
  {
    path: 'checkout',
    canActivate: [verifiedGuard],
    loadComponent: () => import('./pages/checkout/checkout.page').then((m) => m.CheckoutPage),
  },
  {
    path: 'orders',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/orders/orders.page').then((m) => m.OrdersPage),
  },
  {
    path: 'orders/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/order-detail/order-detail.page').then((m) => m.OrderDetailPage),
  },
  {
    path: 'promotions',
    loadComponent: () =>
      import('./pages/promotions/promotions.page').then((m) => m.PromotionsPage),
  },
  {
    path: 'account',
    loadComponent: () => import('./pages/account/account.page').then((m) => m.AccountPage),
  },
  {
    path: 'account/profile',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/profile/profile.page').then((m) => m.ProfilePage),
  },
  {
    path: 'account/addresses',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/addresses/addresses.page').then((m) => m.AddressesPage),
  },
  {
    path: 'help',
    loadComponent: () => import('./pages/help/help.page').then((m) => m.HelpPage),
  },
  {
    path: 'manage-products',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./pages/manage-products/manage-products.page').then(
        (m) => m.ManageProductsPage
      ),
  },
  {
    path: 'manage-orders',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./pages/manage-orders/manage-orders.page').then((m) => m.ManageOrdersPage),
  },
  {
    path: 'manage-messages',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./pages/manage-messages/manage-messages.page').then((m) => m.ManageMessagesPage),
  },
  {
    path: 'shop-settings',
    canActivate: [adminGuard],
    loadComponent: () => import('./pages/shop-settings/shop-settings.page').then((m) => m.ShopSettingsPage),
  },
  {
    path: 'company-history',
    loadComponent: () =>
      import('./pages/company-history/company-history.page').then((m) => m.CompanyHistoryPage),
  },
  {
    path: 'about-products',
    loadComponent: () =>
      import('./pages/about-products/about-products.page').then((m) => m.AboutProductsPage),
  },
  {
    path: 'contact',
    loadComponent: () => import('./pages/contact/contact.page').then((m) => m.ContactPage),
  },
  {
    path: 'about',
    loadComponent: () => import('./pages/about/about.page').then((m) => m.AboutPage),
  },
  {
    path: 'developers',
    loadComponent: () =>
      import('./pages/developers/developers.page').then((m) => m.DevelopersPage),
  },
  { path: '**', redirectTo: 'dashboard' },
];
