/* =================================================================
   auth.js — Token storage, auth state, and route guards
   ================================================================= */

const Auth = {
  TOKEN_KEY: 'pfb_token',
  USER_KEY:  'pfb_user',

  setSession(token, user) {
    localStorage.setItem(this.TOKEN_KEY, token);
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
  },

  clearSession() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
  },

  getToken() {
    return localStorage.getItem(this.TOKEN_KEY);
  },

  getUser() {
    try {
      return JSON.parse(localStorage.getItem(this.USER_KEY));
    } catch { return null; }
  },

  isLoggedIn() {
    return !!this.getToken() && !!this.getUser();
  },

  isAdmin() {
    return this.getUser()?.role === 'admin';
  },

  hasPermission(perm) {
    const user = this.getUser();
    if (!user) return false;
    if (user.role === 'admin') return true;
    return (user.permissions || []).includes(perm);
  },

  /**
   * Guard: redirect to login if not authenticated.
   * Returns true if authenticated.
   */
  requireAuth() {
    if (!this.isLoggedIn()) {
      App.navigate('login');
      return false;
    }
    return true;
  },

  /**
   * Guard: redirect to dashboard if already logged in.
   */
  requireGuest() {
    if (this.isLoggedIn()) {
      App.navigate('dashboard');
      return false;
    }
    return true;
  },
};

window.Auth = Auth;
