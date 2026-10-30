export const environment = {
  production: true,
  /**
   * TeaRush API baked into the APK.
   *  - ''  → on-device mode: accounts, menu, cart and cash orders are stored on the
   *          phone, so the APK works with no server at all (good for demos).
   *  - 'https://your-api.onrender.com' → use your deployed server (needed for PayMongo).
   * Testers can also switch at runtime: My Account → Server connection.
   */
  apiUrl: '',
  /**
   * EmailJS keys (https://www.emailjs.com) so on-device mode can email verification codes.
   * These are public keys, safe to ship. Admins can also enter them in Shop Settings.
   */
  emailjs: { serviceId: 'service_kz5npmo', templateId: 'template_cks9uuh', publicKey: '_9DuyVsRITBmli_Gy' },
};
