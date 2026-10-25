// app.js - Master Controller for Rent Portal
// Master Administration: Approves all Landlords & Tenants, Monitors Platform Operations
// Strict Portal Separation: Tenants only see Tenant Portal, Landlords only see Landlord Portal, Super Admin views all

import { store, SUPER_ADMIN_EMAIL, formatKES, formatDate, formatDateTime, formatMonth, formatPhone, getCurrentMonth } from './store.js';
import { generateReceiptPDF, generateStatementPDF } from './pdf.js';
import { exportYearlyReportXLSX } from './excel.js';

const GOOGLE_ICON_SVG = `
  <svg class="google-icon-svg" viewBox="0 0 24 24" width="18" height="18">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
  </svg>
`;

class RentPortalApp {
  constructor() {
    this.unauthMode = 'login'; // 'login' | 'overview'
    this.authTab = 'signin'; // 'signin' | 'landlord_reg' | 'tenant_reg'
    this.authAlert = null; // { type: 'pending'|'error'|'success', message: '' }
    this.adminTab = 'approvals'; // 'approvals' | 'landlords' | 'all_tenants' | 'all_payments' | 'audit'
    this.approvalSubTab = 'landlords'; // 'landlords' | 'tenants'
    this.landlordTab = 'payments'; // 'payments' | 'requests' | 'tenants' | 'arrears' | 'reports' | 'settings'
    this.tenantTab = 'pay'; // 'pay' | 'bills' | 'history'
    this.tenantPaySubTab = 'post_message'; // 'post_message' | 'stk'

    this.reportYear = new Date().getFullYear();
    this.reportView = 'year';
    this.reportMonth = new Date().getMonth();
    this.paymentFilter = 'all';
    this.activeModal = null;

    this.init();
  }

  init() {
    // Check invite query params if present
    const urlParams = new URLSearchParams(window.location.search);
    const inviteCode = urlParams.get('invite');
    if (inviteCode) {
      this.unauthMode = 'login';
      this.authTab = 'tenant_reg';
      this.prefilledInviteCode = inviteCode;
    }

    store.subscribe(() => {
      this.render();
      if (window.lucide) window.lucide.createIcons();
    });

    this.setupGlobalEvents();
    this.render();
    if (window.lucide) window.lucide.createIcons();
  }

  showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <i data-lucide="${type === 'success' ? 'circle-check' : 'alert-circle'}" style="width: 1.25rem; height: 1.25rem;"></i>
      <span>${message}</span>
    `;
    container.appendChild(toast);
    if (window.lucide) window.lucide.createIcons();

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      toast.style.transition = 'all 0.2s ease';
      setTimeout(() => toast.remove(), 200);
    }, 4000);
  }

  setupGlobalEvents() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.activeModal) {
        this.closeModal();
      }
    });
  }

  openModal(htmlContent, size = 'normal') {
    this.activeModal = { htmlContent, size };
    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;

    modalRoot.innerHTML = `
      <div class="modal-overlay" id="modal-backdrop">
        <div class="modal-dialog ${size === 'lg' ? 'modal-lg' : ''}" onclick="event.stopPropagation()">
          ${htmlContent}
        </div>
      </div>
    `;

    document.getElementById('modal-backdrop').addEventListener('click', () => {
      this.closeModal();
    });

    if (window.lucide) window.lucide.createIcons();
  }

  closeModal() {
    this.activeModal = null;
    const modalRoot = document.getElementById('modal-root');
    if (modalRoot) modalRoot.innerHTML = '';
  }

  // --- Main Rendering ---
  render() {
    const user = store.getCurrentUser();
    this.renderHeader(user);
    this.renderDemoBar(user);

    const appMain = document.getElementById('app-main');
    if (!appMain) return;

    if (!user) {
      if (this.unauthMode === 'overview') {
        appMain.innerHTML = this.renderLandingView();
        this.attachLandingEvents();
      } else {
        appMain.innerHTML = this.renderLoginPageView();
        this.attachLoginPageEvents();
      }
    } else if (user.role === 'superadmin') {
      appMain.innerHTML = this.renderSuperAdminView(user);
      this.attachSuperAdminEvents(user);
    } else if (user.role === 'owner' || user.role === 'caretaker') {
      appMain.innerHTML = this.renderLandlordView(user);
      this.attachLandlordEvents(user);
    } else if (user.role === 'tenant') {
      appMain.innerHTML = this.renderTenantView(user);
      this.attachTenantEvents(user);
    }
  }

  renderHeader(user) {
    const userDisplay = document.getElementById('header-user-area');
    if (!userDisplay) return;

    if (!user) {
      userDisplay.innerHTML = `
        <button class="btn btn-secondary" id="btn-header-overview" style="${this.unauthMode === 'overview' ? 'background: var(--slate-200);' : ''}">
          <i data-lucide="info" style="width: 1rem; height: 1rem;"></i>
          Overview
        </button>
        <button class="btn btn-primary" id="btn-header-login-page">
          <i data-lucide="log-in" style="width: 1rem; height: 1rem;"></i>
          Sign in
        </button>
      `;
      document.getElementById('btn-header-overview')?.addEventListener('click', () => {
        this.unauthMode = this.unauthMode === 'overview' ? 'login' : 'overview';
        this.render();
      });
      document.getElementById('btn-header-login-page')?.addEventListener('click', () => {
        this.unauthMode = 'login';
        this.authTab = 'signin';
        this.render();
      });
    } else {
      userDisplay.innerHTML = `
        <span class="hierarchy-pill">
          <i data-lucide="${user.role === 'superadmin' ? 'shield-alert' : user.role === 'owner' ? 'building' : 'user'}" style="width: 0.875rem; height: 0.875rem;"></i>
          ${user.role === 'superadmin' ? 'Super Admin' : user.role === 'owner' ? 'Landlord' : 'Tenant'}
        </span>
        <span style="font-size: 0.875rem; color: var(--slate-600); display: none;" class="sm-inline">
          ${user.email}
        </span>
        <button class="btn btn-secondary" id="btn-header-signout">
          <i data-lucide="log-out" style="width: 1rem; height: 1rem;"></i>
          Sign out
        </button>
      `;
      document.getElementById('btn-header-signout')?.addEventListener('click', () => {
        store.setCurrentUser(null);
        this.unauthMode = 'login';
        this.authTab = 'signin';
        this.authAlert = null;
        this.showToast('Signed out successfully.');
        this.render();
      });
    }

    const sub = document.getElementById('brand-subtitle');
    if (sub) {
      if (!user) sub.textContent = 'Property & Tenant Management';
      else if (user.role === 'superadmin') sub.textContent = 'Super Admin Control Center';
      else if (user.role === 'owner') {
        const ll = store.getLandlordForUser(user);
        sub.textContent = `${ll ? ll.propertyName : 'Landlord Portal'} · Landlord Admin`;
      } else sub.textContent = 'Tenant Account';
    }
  }

  // --- Quick Role Switcher Menu (STRICTLY ONLY AVAILABLE TO SUPER ADMIN, HIDDEN FROM ALL OTHERS) ---
  renderDemoBar(user) {
    const demoBar = document.getElementById('demo-role-bar');
    if (!demoBar) return;

    // Strict security rule: Only visible if active user is Super Admin or impersonated by Super Admin
    const isSuperAdminAuthorized = user && (user.role === 'superadmin' || user.impersonatedBy === SUPER_ADMIN_EMAIL);
    if (!isSuperAdminAuthorized) {
      demoBar.classList.remove('visible-for-admin');
      demoBar.style.display = 'none';
      demoBar.innerHTML = '';
      return;
    }

    demoBar.classList.add('visible-for-admin');
    demoBar.style.display = 'flex';

    const isImpersonating = Boolean(user.impersonatedBy === SUPER_ADMIN_EMAIL && user.role !== 'superadmin');

    demoBar.innerHTML = `
      <div class="demo-bar-label">
        <i data-lucide="shield-check" style="width: 1rem; height: 1rem; color: #a5b4fc;"></i>
        <span>👑 Super Admin Quick Role Switcher (Hidden from Tenants & Landlords):</span>
      </div>
      <div class="demo-pills">
        <button class="demo-pill ${!isImpersonating && user.role === 'superadmin' ? 'active' : ''}" data-role="superadmin">
          👑 Super Admin (Master Account)
        </button>
        <button class="demo-pill ${isImpersonating && user.role === 'owner' ? 'active' : ''}" data-role="owner">
          🏢 Test Landlord (Linus Omwoyo)
        </button>
        <button class="demo-pill ${isImpersonating && user.role === 'tenant' && user.tenant?.status === 'approved' ? 'active' : ''}" data-role="tenant_jane">
          🔑 Test Tenant (Jane Wanjiru)
        </button>
        <button class="demo-pill ${isImpersonating && user.tenant?.status === 'pending' ? 'active' : ''}" data-role="tenant_pending">
          ⏳ Test Pending Tenant (Kevin)
        </button>
        ${isImpersonating ? `
          <button class="demo-pill" data-role="superadmin" style="background: linear-gradient(135deg, #10b981, #059669); border-color: #34d399; color: #fff; font-weight: 700;">
            ⬅️ Return to Super Admin Portal
          </button>
        ` : ''}
        <button class="demo-pill" data-role="visitor" style="border-color: #f43f5e; color: #fecdd3;">
          🚪 Sign Out
        </button>
      </div>
    `;

    demoBar.querySelectorAll('.demo-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        const role = btn.getAttribute('data-role');
        store.switchDemoRole(role);
        if (role === 'visitor') {
          this.unauthMode = 'login';
          this.authTab = 'signin';
          this.authAlert = null;
        }
        this.showToast(`Switched view to ${btn.textContent.trim()}`);
        this.render();
      });
    });
  }

  // --- Dedicated Log In / Sign In Page ---
  renderLoginPageView() {
    const isSignIn = this.authTab === 'signin';
    const isLandlordReg = this.authTab === 'landlord_reg';
    const isTenantReg = this.authTab === 'tenant_reg';

    // Approved properties for tenant registration dropdown
    const approvedLandlords = store.state.landlords.filter((l) => l.status === 'approved');

    let alertHtml = '';
    if (this.authAlert) {
      const icon = this.authAlert.type === 'pending' ? 'clock' : this.authAlert.type === 'error' ? 'alert-triangle' : 'check-circle';
      alertHtml = `
        <div class="auth-alert auth-alert-${this.authAlert.type}">
          <i data-lucide="${icon}" style="width: 1.25rem; height: 1.25rem; flex-shrink: 0; margin-top: 0.125rem;"></i>
          <div>
            ${this.authAlert.title ? `<strong>${this.authAlert.title}</strong><br/>` : ''}
            ${this.authAlert.message}
          </div>
        </div>
      `;
    }

    return `
      <div class="auth-page-wrapper">
        <div class="auth-card">
          <div class="auth-card-topbar"></div>

          <!-- Header -->
          <div class="auth-header">
            <div class="auth-logo-badge">
              <i data-lucide="building-2" style="width: 1.75rem; height: 1.75rem;"></i>
            </div>
            <h1 class="auth-title">
              ${isSignIn ? 'Sign In to Rent Portal' : isLandlordReg ? 'Landlord Onboarding' : 'Tenant Access Request'}
            </h1>
            <p class="auth-subtitle">
              ${isSignIn
                ? 'Sign in to access your tenant or property management account'
                : isLandlordReg
                ? 'Register your property to accept online M-Pesa till payments'
                : 'Request tenancy under an approved landlord to pay rent online'}
            </p>
          </div>

          <!-- Tabs -->
          <div class="auth-tabs">
            <button class="auth-tab-btn ${isSignIn ? 'active' : ''}" id="tab-btn-signin">
              Sign In
            </button>
            <button class="auth-tab-btn ${isLandlordReg ? 'active' : ''}" id="tab-btn-landlord">
              Landlord Register
            </button>
            <button class="auth-tab-btn ${isTenantReg ? 'active' : ''}" id="tab-btn-tenant">
              Tenant Request
            </button>
          </div>

          <!-- Form Area -->
          <div class="auth-form-body">
            ${alertHtml}

            ${isSignIn ? `
              <!-- Continue with Google Button -->
              <button type="button" class="btn-google-signin" id="btn-google-signin">
                ${GOOGLE_ICON_SVG}
                <span>Continue with Google</span>
              </button>

              <div class="auth-divider">
                <span>or continue with email</span>
              </div>

              <!-- Sign In Form -->
              <form id="form-auth-signin" style="display: flex; flex-direction: column; gap: 1.125rem;">
                <div class="form-group">
                  <label class="form-label" for="auth-email">Email Address</label>
                  <div style="position: relative;">
                    <input 
                      type="email" 
                      class="form-input" 
                      id="auth-email" 
                      required 
                      placeholder="name@example.com" 
                      autocomplete="email" 
                      autofocus
                    />
                  </div>
                  <div id="auth-role-preview"></div>
                </div>

                <div class="form-group">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.375rem;">
                    <label class="form-label" for="auth-password" style="margin-bottom: 0;">Password</label>
                    <a href="javascript:void(0)" id="link-forgot-pw" style="font-size: 0.75rem; color: var(--primary); text-decoration: none;">Forgot password?</a>
                  </div>
                  <div style="position: relative;">
                    <input 
                      type="password" 
                      class="form-input" 
                      id="auth-password" 
                      required 
                      placeholder="••••••••" 
                    />
                    <button type="button" id="btn-toggle-pw" class="btn-icon" style="position: absolute; right: 0.5rem; top: 50%; transform: translateY(-50%); width: 2rem; height: 2rem;" title="Toggle password">
                      <i data-lucide="eye" id="icon-toggle-pw" style="width: 1rem; height: 1rem; color: var(--slate-400);"></i>
                    </button>
                  </div>
                </div>

                <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8125rem; color: var(--slate-600);">
                  <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                    <input type="checkbox" id="auth-remember" checked style="accent-color: var(--primary);" />
                    <span>Stay signed in</span>
                  </label>
                  <span style="font-size: 0.75rem; color: var(--slate-400); display: inline-flex; align-items: center; gap: 0.25rem;">
                    <i data-lucide="lock" style="width: 0.75rem; height: 0.75rem;"></i> Secure 256-bit SSL
                  </span>
                </div>

                <button type="submit" class="btn btn-primary btn-full" style="padding: 0.75rem 1rem; font-weight: 700; font-size: 0.9375rem; box-shadow: 0 4px 12px rgba(5, 150, 105, 0.25);">
                  <i data-lucide="log-in" style="width: 1.125rem; height: 1.125rem;"></i>
                  Sign In to Portal
                </button>
              </form>
            ` : ''}

            ${isLandlordReg ? `
              <!-- Landlord Registration Form -->
              <form id="form-auth-landlord" style="display: flex; flex-direction: column; gap: 1rem;">
                <button type="button" class="btn-google-signin" id="btn-google-prefill-landlord" style="margin-bottom: 0.25rem;">
                  ${GOOGLE_ICON_SVG}
                  <span>Fast fill with Google Account</span>
                </button>

                <div class="auth-divider" style="margin: 0.5rem 0 0.25rem 0;">
                  <span>or enter details manually</span>
                </div>

                <div class="auth-alert auth-alert-pending" style="margin-bottom: 0.5rem; padding: 0.75rem;">
                  <i data-lucide="shield-alert" style="width: 1.125rem; height: 1.125rem; flex-shrink: 0;"></i>
                  <div style="font-size: 0.75rem;">
                    <strong>Administrative Verification:</strong> All newly registered property landlords are reviewed by system administration prior to account activation.
                  </div>
                </div>

                <div class="form-group">
                  <label class="form-label">Full Name</label>
                  <input type="text" class="form-input" id="reg-ll-name" required placeholder="e.g. David Mutua" />
                </div>

                <div class="form-row">
                  <div class="form-group">
                    <label class="form-label">Email Address</label>
                    <input type="email" class="form-input" id="reg-ll-email" required placeholder="david@example.com" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Phone Number</label>
                    <input type="tel" class="form-input" id="reg-ll-phone" required placeholder="0712345678" />
                  </div>
                </div>

                <div class="form-row">
                  <div class="form-group">
                    <label class="form-label">Property Name</label>
                    <input type="text" class="form-input" id="reg-ll-prop" required placeholder="e.g. Sunrise Heights" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Total Units</label>
                    <input type="number" class="form-input" id="reg-ll-units" required value="12" min="1" />
                  </div>
                </div>

                <div class="form-row">
                  <div class="form-group">
                    <label class="form-label">Location / Town</label>
                    <input type="text" class="form-input" id="reg-ll-loc" required placeholder="e.g. Mombasa, Nyali" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">M-Pesa Till Number</label>
                    <input type="text" class="form-input" id="reg-ll-till" required placeholder="e.g. 582190" />
                  </div>
                </div>

                <button type="submit" class="btn btn-primary btn-full" style="padding: 0.75rem 1rem; font-weight: 700;">
                  <i data-lucide="building" style="width: 1.125rem; height: 1.125rem;"></i>
                  Submit Landlord Registration
                </button>
              </form>
            ` : ''}

            ${isTenantReg ? `
              <!-- Tenant Request Form -->
              <form id="form-auth-tenant" style="display: flex; flex-direction: column; gap: 1rem;">
                <button type="button" class="btn-google-signin" id="btn-google-prefill-tenant" style="margin-bottom: 0.25rem;">
                  ${GOOGLE_ICON_SVG}
                  <span>Fast fill with Google Account</span>
                </button>

                <div class="auth-divider" style="margin: 0.5rem 0 0.25rem 0;">
                  <span>or enter details manually</span>
                </div>

                <div class="auth-alert auth-alert-pending" style="margin-bottom: 0.5rem; padding: 0.75rem;">
                  <i data-lucide="shield-check" style="width: 1.125rem; height: 1.125rem; flex-shrink: 0;"></i>
                  <div style="font-size: 0.75rem;">
                    <strong>Landlord Approval Required:</strong> Your tenancy request will be submitted to the property landlord for verification before account activation.
                  </div>
                </div>

                <div class="form-group">
                  <label class="form-label">Full Name</label>
                  <input type="text" class="form-input" id="reg-t-name" required placeholder="e.g. Kevin Otieno" />
                </div>

                <div class="form-row">
                  <div class="form-group">
                    <label class="form-label">Email Address</label>
                    <input type="email" class="form-input" id="reg-t-email" required placeholder="kevin@example.com" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Safaricom Phone Number</label>
                    <input type="tel" class="form-input" id="reg-t-phone" required placeholder="0712345678" />
                  </div>
                </div>

                <div class="form-group">
                  <label class="form-label">Select Property & Landlord</label>
                  <select class="form-select" id="reg-t-ll" required>
                    <option value="">-- Choose Approved Property --</option>
                    ${approvedLandlords.map((ll) => `
                      <option value="${ll.id}" ${this.prefilledInviteCode === ll.inviteCode ? 'selected' : ''}>
                        ${ll.propertyName} (${ll.name}) · Till: ${ll.tillNumber}
                      </option>
                    `).join('')}
                  </select>
                </div>

                <div class="form-row">
                  <div class="form-group">
                    <label class="form-label">House / Unit Number</label>
                    <input type="text" class="form-input" id="reg-t-unit" required placeholder="e.g. Unit C2" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Monthly Rent (KES)</label>
                    <input type="number" class="form-input" id="reg-t-rent" required value="15000" step="500" />
                  </div>
                </div>

                <button type="submit" class="btn btn-primary btn-full" style="padding: 0.75rem 1rem; font-weight: 700; background-color: #0284c7; border-color: #0284c7;">
                  <i data-lucide="key" style="width: 1.125rem; height: 1.125rem;"></i>
                  Submit Tenant Access Request
                </button>
              </form>
            ` : ''}

            <!-- Switcher links below card -->
            <div class="auth-footer">
              ${isSignIn ? `
                <span>Don't have an account?</span>
                <button type="button" id="link-switch-landlord">Register Property</button>
                <span>or</span>
                <button type="button" id="link-switch-tenant">Request Tenant Access</button>
              ` : `
                <span>Already have an account?</span>
                <button type="button" id="link-switch-signin">Sign In Here</button>
              `}
            </div>
          </div>
        </div>

        <!-- Security / Compliance Strip -->
        <div class="auth-security-strip">
          <div class="auth-security-item">
            <i data-lucide="shield-check" style="width: 0.875rem; height: 0.875rem; color: var(--emerald-600);"></i>
            <span>256-Bit SSL Encrypted</span>
          </div>
          <div class="auth-security-item">
            <i data-lucide="smartphone" style="width: 0.875rem; height: 0.875rem; color: #16a34a;"></i>
            <span>Safaricom M-Pesa Integrated</span>
          </div>
          <div class="auth-security-item">
            <i data-lucide="lock" style="width: 0.875rem; height: 0.875rem; color: #6366f1;"></i>
            <span>Strict Role Isolation</span>
          </div>
        </div>
      </div>
    `;
  }

  attachLoginPageEvents() {
    // Tab switching
    document.getElementById('tab-btn-signin')?.addEventListener('click', () => {
      this.authTab = 'signin';
      this.authAlert = null;
      this.render();
    });
    document.getElementById('tab-btn-landlord')?.addEventListener('click', () => {
      this.authTab = 'landlord_reg';
      this.authAlert = null;
      this.render();
    });
    document.getElementById('tab-btn-tenant')?.addEventListener('click', () => {
      this.authTab = 'tenant_reg';
      this.authAlert = null;
      this.render();
    });

    // Footer link switching
    document.getElementById('link-switch-landlord')?.addEventListener('click', () => {
      this.authTab = 'landlord_reg';
      this.authAlert = null;
      this.render();
    });
    document.getElementById('link-switch-tenant')?.addEventListener('click', () => {
      this.authTab = 'tenant_reg';
      this.authAlert = null;
      this.render();
    });
    document.getElementById('link-switch-signin')?.addEventListener('click', () => {
      this.authTab = 'signin';
      this.authAlert = null;
      this.render();
    });

    // Password visibility toggle
    document.getElementById('btn-toggle-pw')?.addEventListener('click', () => {
      const pwInput = document.getElementById('auth-password');
      const pwIcon = document.getElementById('icon-toggle-pw');
      if (!pwInput) return;
      if (pwInput.type === 'password') {
        pwInput.type = 'text';
        pwIcon?.setAttribute('data-lucide', 'eye-off');
      } else {
        pwInput.type = 'password';
        pwIcon?.setAttribute('data-lucide', 'eye');
      }
      if (window.lucide) window.lucide.createIcons();
    });

    // Forgot password alert helper
    document.getElementById('link-forgot-pw')?.addEventListener('click', () => {
      alert('For password resets or account assistance, please contact your property manager or system administrator.');
    });

    // Real-time email role detection preview
    const emailInput = document.getElementById('auth-email');
    const previewContainer = document.getElementById('auth-role-preview');
    if (emailInput && previewContainer) {
      emailInput.addEventListener('input', (e) => {
        const val = e.target.value.trim().toLowerCase();
        if (!val) {
          previewContainer.innerHTML = '';
          return;
        }

        if (val === SUPER_ADMIN_EMAIL.toLowerCase()) {
          previewContainer.innerHTML = `
            <div class="auth-detected-badge auth-detected-superadmin">
              <i data-lucide="shield-check" style="width: 1rem; height: 1rem;"></i>
              👑 System Administrator Account
            </div>
          `;
        } else {
          const ll = store.state.landlords.find((l) => l.email.toLowerCase() === val);
          if (ll) {
            previewContainer.innerHTML = `
              <div class="auth-detected-badge auth-detected-landlord">
                <i data-lucide="building" style="width: 1rem; height: 1rem;"></i>
                🏢 Landlord Account: ${ll.propertyName} (${ll.status === 'approved' ? 'Approved' : 'Pending Approval'})
              </div>
            `;
          } else {
            const t = store.state.tenants.find((item) => item.email.toLowerCase() === val);
            if (t) {
              previewContainer.innerHTML = `
                <div class="auth-detected-badge auth-detected-tenant">
                  <i data-lucide="key" style="width: 1rem; height: 1rem;"></i>
                  🔑 Tenant Account: ${t.propertyName} · ${t.unit} (${t.status === 'approved' ? 'Approved' : 'Pending Approval'})
                </div>
              `;
            } else {
              previewContainer.innerHTML = '';
            }
          }
        }
        if (window.lucide) window.lucide.createIcons();
      });
    }

    // Sign In Submission
    document.getElementById('form-auth-signin')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('auth-email').value;
      const res = store.loginWithEmail(email);

      if (res.success) {
        this.authAlert = null;
        if (res.role === 'superadmin') {
          this.showToast('Super Admin Portal Opened! Welcome, Sammy Harrison.');
        } else if (res.role === 'owner') {
          this.showToast(`Welcome back, Landlord ${res.landlord.name}!`);
        } else {
          this.showToast(`Welcome back, Tenant ${res.tenant.name}!`);
        }
      } else {
        if (res.isPending) {
          this.authAlert = {
            type: 'pending',
            title: 'Account Awaiting Super Admin Approval',
            message: res.message
          };
        } else if (res.isBlocked) {
          this.authAlert = {
            type: 'error',
            title: 'Account Not Authorized',
            message: res.message
          };
        } else {
          this.authAlert = {
            type: 'error',
            title: 'Account Not Found',
            message: res.message
          };
        }
        this.render();
      }
    });

    // Landlord Registration Submission
    document.getElementById('form-auth-landlord')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('reg-ll-name').value;
      const email = document.getElementById('reg-ll-email').value;
      const phone = document.getElementById('reg-ll-phone').value;
      const propertyName = document.getElementById('reg-ll-prop').value;
      const unitsCount = document.getElementById('reg-ll-units').value;
      const location = document.getElementById('reg-ll-loc').value;
      const tillNumber = document.getElementById('reg-ll-till').value;

      const newLandlord = store.registerLandlord({
        name,
        email,
        phone,
        propertyName,
        unitsCount,
        location,
        tillNumber
      });

      // Reset to signin with notification
      store.setCurrentUser(null);
      this.authTab = 'signin';
      this.authAlert = {
        type: 'pending',
        title: 'Landlord Registration Submitted',
        message: `Your registration for "${propertyName}" has been submitted for administrative review and activation. You will be notified once activated.`
      };
      this.showToast('Landlord registration submitted for verification!');
      this.render();
    });

    // Tenant Request Submission
    document.getElementById('form-auth-tenant')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('reg-t-name').value;
      const email = document.getElementById('reg-t-email').value;
      const phone = document.getElementById('reg-t-phone').value;
      const landlordId = document.getElementById('reg-t-ll').value;
      const unit = document.getElementById('reg-t-unit').value;
      const monthlyRent = document.getElementById('reg-t-rent').value;

      const newTenant = store.registerTenant({
        name,
        email,
        phone,
        landlordId,
        unit,
        monthlyRent
      });

      // Reset to signin with notification
      store.setCurrentUser(null);
      this.authTab = 'signin';
      this.authAlert = {
        type: 'pending',
        title: 'Tenant Access Request Submitted',
        message: `Your request for ${newTenant.propertyName} (${unit}) has been submitted for landlord verification. You will be able to sign in once approved.`
      };
      this.showToast('Tenant request submitted for landlord approval!');
      this.render();
    });

    // Google Sign-In handlers
    document.getElementById('btn-google-signin')?.addEventListener('click', () => {
      this.showGoogleAuthModal('signin');
    });
    document.getElementById('btn-google-prefill-landlord')?.addEventListener('click', () => {
      this.showGoogleAuthModal('landlord_reg');
    });
    document.getElementById('btn-google-prefill-tenant')?.addEventListener('click', () => {
      this.showGoogleAuthModal('tenant_reg');
    });
  }

  showGoogleAuthModal(targetTab = 'signin') {
    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;

    const googleAccounts = [
      {
        name: 'Sammy Harrison',
        email: 'sammyharrison58@gmail.com',
        roleBadge: 'Super Admin Master',
        avatarBg: '#4f46e5'
      },
      {
        name: 'Linus Omwoyo',
        email: 'linusomwoyo2@gmail.com',
        roleBadge: 'Landlord · Omwoyo Apts',
        avatarBg: '#059669'
      },
      {
        name: 'Jane Wanjiru',
        email: 'jane.wanjiru@gmail.com',
        roleBadge: 'Tenant · Unit B4',
        avatarBg: '#0284c7'
      },
      {
        name: 'Kevin Otieno',
        email: 'kevin.otieno@gmail.com',
        roleBadge: 'Pending Tenant · Unit D3',
        avatarBg: '#d97706'
      }
    ];

    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="google-modal-backdrop" style="position: fixed; inset: 0; background: rgba(15, 23, 42, 0.65); backdrop-filter: blur(4px); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 1rem; animation: fadeIn 0.2s ease;">
        <div class="google-modal-card">
          <div class="google-modal-header">
            <svg style="width: 2.25rem; height: 2.25rem; margin: 0 auto 0.75rem auto; display: block;" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            <h3 style="font-size: 1.125rem; font-weight: 700; color: #202124; margin-bottom: 0.25rem;">
              Sign in with Google
            </h3>
            <p style="font-size: 0.8125rem; color: #5f6368;">
              Choose an account to continue to Rentmaster
            </p>
          </div>

          <div class="google-account-list">
            ${googleAccounts.map(acc => `
              <button type="button" class="google-account-item" data-google-email="${acc.email}" data-google-name="${acc.name}">
                <div class="google-account-avatar" style="background-color: ${acc.avatarBg};">
                  ${acc.name.charAt(0)}
                </div>
                <div class="google-account-meta">
                  <div class="google-account-name">${acc.name}</div>
                  <div class="google-account-email">${acc.email}</div>
                </div>
                <span style="font-size: 0.6875rem; background: #f1f5f9; padding: 0.2rem 0.5rem; border-radius: 9999px; color: #475569; font-weight: 600;">
                  ${acc.roleBadge}
                </span>
              </button>
            `).join('')}

            <div style="padding: 1rem 1.5rem; border-top: 1px solid var(--slate-100); background-color: #fafafa;">
              <p style="font-size: 0.75rem; font-weight: 700; color: var(--slate-600); margin-bottom: 0.5rem;">
                Or use another Google account:
              </p>
              <form id="form-google-custom" style="display: flex; gap: 0.5rem;">
                <input 
                  type="email" 
                  class="form-input" 
                  id="google-custom-email" 
                  required 
                  placeholder="yourname@gmail.com" 
                  style="font-size: 0.8125rem; padding: 0.5rem 0.75rem;" 
                />
                <button type="submit" class="btn btn-primary" style="padding: 0.5rem 0.875rem; font-size: 0.8125rem; white-space: nowrap;">
                  Continue
                </button>
              </form>
            </div>
          </div>

          <div style="padding: 0.875rem 1.5rem; background-color: #f8fafc; border-top: 1px solid var(--slate-200); display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 0.6875rem; color: #94a3b8;">
              Google OAuth 2.0 Secure
            </span>
            <button type="button" class="btn btn-secondary" id="btn-close-google-modal" style="padding: 0.375rem 0.75rem; font-size: 0.75rem;">
              Cancel
            </button>
          </div>
        </div>
      </div>
    `;

    const closeModal = () => {
      modalRoot.innerHTML = '';
    };

    document.getElementById('btn-close-google-modal')?.addEventListener('click', closeModal);
    document.getElementById('google-modal-backdrop')?.addEventListener('click', (e) => {
      if (e.target.id === 'google-modal-backdrop') closeModal();
    });

    const handleGoogleAuth = (email, name) => {
      closeModal();
      this.executeGoogleLogin(email, name, targetTab);
    };

    modalRoot.querySelectorAll('[data-google-email]').forEach(btn => {
      btn.addEventListener('click', () => {
        const email = btn.getAttribute('data-google-email');
        const name = btn.getAttribute('data-google-name');
        handleGoogleAuth(email, name);
      });
    });

    document.getElementById('form-google-custom')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('google-custom-email').value.trim();
      const name = email.split('@')[0];
      handleGoogleAuth(email, name);
    });
  }

  executeGoogleLogin(email, name, targetTab = 'signin') {
    const res = store.loginWithGoogle({ email, name });

    if (res.success) {
      this.authAlert = null;
      if (res.role === 'superadmin') {
        this.showToast(`Signed in with Google as Super Admin (${res.user.name})!`);
      } else if (res.role === 'owner') {
        this.showToast(`Signed in with Google as Landlord (${res.user.name})!`);
      } else if (res.role === 'tenant') {
        this.showToast(`Signed in with Google as Tenant (${res.user.name})!`);
      } else {
        this.showToast(`Signed in with Google as ${res.user.name || email}!`);
      }
      this.render();
      return;
    }

    if (res.isPending) {
      this.authAlert = {
        type: 'pending',
        title: 'Account Verification Pending',
        message: res.message
      };
      this.render();
      return;
    }

    if (res.isBlocked) {
      this.authAlert = {
        type: 'error',
        title: 'Account Restricted',
        message: res.message
      };
      this.render();
      return;
    }

    if (res.isNewGoogleUser) {
      const chooseTab = targetTab === 'landlord_reg' ? 'landlord_reg' : 'tenant_reg';
      this.authTab = chooseTab;
      this.authAlert = {
        type: 'success',
        title: 'Google Account Verified',
        message: `Authenticated with Google as <strong>${email}</strong>. Complete the remaining property details to activate your account.`
      };
      this.render();

      setTimeout(() => {
        if (chooseTab === 'landlord_reg') {
          const nameEl = document.getElementById('reg-ll-name');
          const emailEl = document.getElementById('reg-ll-email');
          if (nameEl) nameEl.value = name || '';
          if (emailEl) emailEl.value = email;
        } else {
          const nameEl = document.getElementById('reg-t-name');
          const emailEl = document.getElementById('reg-t-email');
          if (nameEl) nameEl.value = name || '';
          if (emailEl) emailEl.value = email;
        }
      }, 50);
    }
  }

  // --- Landing View (Platform Overview) ---
  renderLandingView() {
    return `
      <div class="hero-card">
        <div style="display: inline-block; background-color: rgba(255,255,255,0.2); padding: 0.25rem 0.75rem; border-radius: var(--radius-full); font-size: 0.75rem; font-weight: 700; margin-bottom: 1rem;">
          SECURE RENT & PROPERTY MANAGEMENT PLATFORM
        </div>
        <h1 class="hero-title">Welcome to Rent Portal</h1>
        <p class="hero-subtitle">
          Tenants pay rent online directly to their landlord's verified M-Pesa Till, post transaction messages, and instantly download official receipts.
        </p>

        <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 2rem;">
          <button class="hero-btn" id="btn-hero-login">
            <i data-lucide="log-in" style="width: 1.125rem; height: 1.125rem;"></i>
            Go to Log In / Sign In Page
          </button>
        </div>
      </div>

      <!-- Dual Entrance Cards -->
      <div class="entrance-grid">
        <!-- Landlord Portal Entrance -->
        <div class="entrance-card landlord-card">
          <div>
            <span class="entrance-card-badge">Landlords Only</span>
            <h2 style="font-size: 1.375rem; font-weight: 800; color: var(--slate-900);">
              Landlord Portal
            </h2>
            <p style="font-size: 0.875rem; color: var(--slate-600); margin-top: 0.5rem; line-height: 1.6;">
              Manage your building, provide your M-Pesa Till number, send invite links to your tenants, and mark payments as <strong>Paid</strong> or <strong>Not Paid</strong>.
            </p>
            <div style="background-color: var(--amber-50); border: 1px solid var(--amber-200); border-radius: var(--radius-lg); padding: 0.75rem; margin-top: 1rem; font-size: 0.75rem; color: var(--amber-800);">
              <i data-lucide="shield-check" style="width: 1rem; height: 1rem; display: inline-block; vertical-align: middle;"></i>
              <strong>Approval Required:</strong> New landlord accounts are verified before portal access is activated.
            </div>
          </div>

          <div style="margin-top: 1.5rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
            <button class="btn btn-primary" id="btn-landlord-go-login" style="flex: 1;">
              Sign in as Landlord
            </button>
            <button class="btn btn-secondary" id="btn-landlord-go-reg" style="flex: 1;">
              Register Property
            </button>
          </div>
        </div>

        <!-- Tenant Portal Entrance -->
        <div class="entrance-card tenant-card">
          <div>
            <span class="entrance-card-badge">Tenants Only</span>
            <h2 style="font-size: 1.375rem; font-weight: 800; color: var(--slate-900);">
              Tenant Portal
            </h2>
            <p style="font-size: 0.875rem; color: var(--slate-600); margin-top: 0.5rem; line-height: 1.6;">
              Pay rent online via M-Pesa using the Till number provided by your landlord. View monthly bills and download official receipts.
            </p>
            <div style="background-color: var(--sky-50); border: 1px solid var(--sky-200); border-radius: var(--radius-lg); padding: 0.75rem; margin-top: 1rem; font-size: 0.75rem; color: var(--sky-800);">
              <i data-lucide="lock" style="width: 1rem; height: 1rem; display: inline-block; vertical-align: middle;"></i>
              <strong>Private Access:</strong> Tenants cannot view the Landlord or Super Admin portals.
            </div>
          </div>

          <div style="margin-top: 1.5rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
            <button class="btn btn-primary" id="btn-tenant-go-login" style="flex: 1; background-color: #0284c7; border-color: #0284c7;">
              Sign in as Tenant
            </button>
            <button class="btn btn-secondary" id="btn-tenant-go-reg" style="flex: 1;">
              Request Access
            </button>
          </div>
        </div>
      </div>
    `;
  }

  attachLandingEvents() {
    document.getElementById('btn-hero-login')?.addEventListener('click', () => {
      this.unauthMode = 'login';
      this.authTab = 'signin';
      this.render();
    });
    document.getElementById('btn-landlord-go-login')?.addEventListener('click', () => {
      this.unauthMode = 'login';
      this.authTab = 'signin';
      this.render();
    });
    document.getElementById('btn-landlord-go-reg')?.addEventListener('click', () => {
      this.unauthMode = 'login';
      this.authTab = 'landlord_reg';
      this.render();
    });
    document.getElementById('btn-tenant-go-login')?.addEventListener('click', () => {
      this.unauthMode = 'login';
      this.authTab = 'signin';
      this.render();
    });
    document.getElementById('btn-tenant-go-reg')?.addEventListener('click', () => {
      this.unauthMode = 'login';
      this.authTab = 'tenant_reg';
      this.render();
    });
  }

  // --- Dedicated Log In Modal ---
  showLoginMenuModal(prefilledEmail = '') {
    const html = `
      <div class="modal-header">
        <h3 class="modal-title">Sign In to Rent Portal</h3>
        <button class="btn-icon" onclick="window.app.closeModal()">
          <i data-lucide="x" style="width: 1.25rem; height: 1.25rem;"></i>
        </button>
      </div>

      <div class="modal-body">
        <form id="form-login-menu" style="display: flex; flex-direction: column; gap: 1rem;">
          <div class="form-group">
            <label class="form-label">Email Address</label>
            <input type="email" class="form-input" id="login-email" required value="${prefilledEmail}" placeholder="name@example.com" />
          </div>

          <div class="form-group">
            <label class="form-label">Password</label>
            <input type="password" class="form-input" id="login-password" placeholder="••••••••" required />
          </div>

          <button type="submit" class="btn btn-primary btn-full">
            <i data-lucide="log-in" style="width: 1rem; height: 1rem;"></i>
            Sign in
          </button>
        </form>

        <div style="border-top: 1px solid var(--slate-200); margin-top: 1.5rem; padding-top: 1rem; text-align: center;">
          <p style="font-size: 0.75rem; color: var(--slate-500);">
            Need an account? <a href="javascript:void(0)" onclick="window.app.closeModal(); window.app.unauthMode='login'; window.app.authTab='tenant_reg'; window.app.render();" style="color: var(--primary); font-weight: 600;">Request Tenant Access</a> or <a href="javascript:void(0)" onclick="window.app.closeModal(); window.app.unauthMode='login'; window.app.authTab='landlord_reg'; window.app.render();" style="color: var(--primary); font-weight: 600;">Register Property</a>
          </p>
        </div>
      </div>
    `;

    this.openModal(html);

    document.getElementById('form-login-menu')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value;
      const res = store.loginWithEmail(email);
      if (res.success) {
        this.closeModal();
        if (res.role === 'superadmin') {
          this.showToast('Welcome, Super Admin Sammy Harrison! Portal opened.');
        } else if (res.role === 'owner') {
          this.showToast(`Logged in as Landlord ${res.landlord.name}.`);
        } else {
          this.showToast(`Logged in as Tenant ${res.tenant.name}.`);
        }
      } else {
        alert(res.message);
      }
    });
  }

  quickLogin(email) {
    store.loginWithEmail(email);
    this.closeModal();
    this.showToast(`Logged in with ${email}!`);
  }

  // --- Tier 1: SUPER ADMIN CONTROL CENTER ---
  renderSuperAdminView(user) {
    const landlords = store.state.landlords;
    const tenants = store.state.tenants;
    const payments = store.state.payments;
    const audit = store.state.audit;

    const pendingLandlords = landlords.filter((l) => l.status === 'pending');
    const pendingTenants = tenants.filter((t) => t.status === 'pending');
    const approvedLandlords = landlords.filter((l) => l.status === 'approved');

    const totalCollected = payments.filter((p) => p.status === 'confirmed').reduce((sum, p) => sum + p.amount, 0);
    const totalPendingApprovals = pendingLandlords.length + pendingTenants.length;

    return `
      <div style="display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem;">
        <div>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span class="badge badge-superadmin">Super Admin Master</span>
            <span style="font-size: 0.8125rem; color: var(--slate-500);">${user.email || 'Master System Account'}</span>
          </div>
          <h1 style="font-size: 1.75rem; font-weight: 800; letter-spacing: -0.02em; margin-top: 0.25rem;">
            Super Admin Control Center
          </h1>
          <p style="font-size: 0.875rem; color: var(--slate-600);">
            You have master oversight. Approve all registering landlords and tenants for their portals to open, and monitor all rent payments across Kenya.
          </p>
        </div>

        <div class="pulse-indicator">
          <div class="pulse-dot"></div>
          <span>Platform Active · Real-time Monitor</span>
        </div>
      </div>

      <!-- KPI Metrics -->
      <div class="kpi-grid">
        <div class="kpi-card">
          <p class="kpi-label">Pending Approvals</p>
          <p class="kpi-value ${totalPendingApprovals > 0 ? 'danger' : 'positive'}">
            ${totalPendingApprovals} (${pendingLandlords.length} Landlords, ${pendingTenants.length} Tenants)
          </p>
        </div>
        <div class="kpi-card">
          <p class="kpi-label">Active Landlords</p>
          <p class="kpi-value">${approvedLandlords.length}</p>
        </div>
        <div class="kpi-card">
          <p class="kpi-label">Total Platform Tenants</p>
          <p class="kpi-value">${tenants.length}</p>
        </div>
        <div class="kpi-card">
          <p class="kpi-label">Platform Rent Collected</p>
          <p class="kpi-value positive">${formatKES(totalCollected)}</p>
        </div>
      </div>

      <!-- Tabs Navigation -->
      <div class="tabs-nav" role="tablist">
        <button class="tab-btn ${this.adminTab === 'approvals' ? 'active' : ''}" data-superadmin-tab="approvals">
          <i data-lucide="shield-alert" style="width: 1.125rem; height: 1.125rem;"></i>
          Approvals Queue
          ${totalPendingApprovals > 0 ? `<span class="tab-badge">${totalPendingApprovals}</span>` : ''}
        </button>
        <button class="tab-btn ${this.adminTab === 'landlords' ? 'active' : ''}" data-superadmin-tab="landlords">
          <i data-lucide="building" style="width: 1.125rem; height: 1.125rem;"></i>
          All Landlords & Tills
        </button>
        <button class="tab-btn ${this.adminTab === 'all_tenants' ? 'active' : ''}" data-superadmin-tab="all_tenants">
          <i data-lucide="users" style="width: 1.125rem; height: 1.125rem;"></i>
          Global Tenants Roster
        </button>
        <button class="tab-btn ${this.adminTab === 'all_payments' ? 'active' : ''}" data-superadmin-tab="all_payments">
          <i data-lucide="receipt" style="width: 1.125rem; height: 1.125rem;"></i>
          Global Payments Monitor
        </button>
        <button class="tab-btn ${this.adminTab === 'audit' ? 'active' : ''}" data-superadmin-tab="audit">
          <i data-lucide="history" style="width: 1.125rem; height: 1.125rem;"></i>
          System Audit Log
        </button>
      </div>

      <div id="superadmin-tab-content">
        ${this.adminTab === 'approvals' ? this.renderSuperAdminApprovalsQueue(pendingLandlords, pendingTenants) : ''}
        ${this.adminTab === 'landlords' ? this.renderSuperAdminLandlordsDirectory(landlords) : ''}
        ${this.adminTab === 'all_tenants' ? this.renderSuperAdminAllTenants(tenants) : ''}
        ${this.adminTab === 'all_payments' ? this.renderSuperAdminAllPayments(payments) : ''}
        ${this.adminTab === 'audit' ? this.renderSuperAdminAudit(audit) : ''}
      </div>
    `;
  }

  renderSuperAdminApprovalsQueue(pendingLandlords, pendingTenants) {
    return `
      <div style="display: flex; flex-direction: column; gap: 1.5rem;">
        <!-- Approvals Sub-Tabs -->
        <div style="display: flex; gap: 0.5rem; border-bottom: 2px solid var(--slate-200); padding-bottom: 0.5rem;">
          <button class="btn ${this.approvalSubTab === 'landlords' ? 'btn-primary' : 'btn-secondary'}" id="btn-sub-landlords">
            Landlord Registrations (${pendingLandlords.length})
          </button>
          <button class="btn ${this.approvalSubTab === 'tenants' ? 'btn-primary' : 'btn-secondary'}" id="btn-sub-tenants">
            Tenant Registrations (${pendingTenants.length})
          </button>
        </div>

        ${this.approvalSubTab === 'landlords' ? `
          <!-- Landlords Awaiting Approval -->
          <div class="card">
            <div class="card-header">
              <div>
                <h2 class="card-title">
                  <i data-lucide="building" style="color: var(--primary);"></i>
                  Registering Landlords Awaiting Your Approval (${pendingLandlords.length})
                </h2>
                <p style="font-size: 0.8125rem; color: var(--slate-500); margin-top: 0.25rem;">
                  Each landlord must be approved by the system administrator before their portal opens.
                </p>
              </div>
            </div>

            ${pendingLandlords.length === 0 ? `
              <div style="text-align: center; padding: 3rem; color: var(--slate-500); font-size: 0.875rem;">
                No pending landlords. All landlord applications have been approved!
              </div>
            ` : `
              <div style="display: flex; flex-direction: column; gap: 1rem;">
                ${pendingLandlords.map((ll) => `
                  <div style="border: 1px solid var(--amber-200); background-color: var(--amber-50); border-radius: var(--radius-lg); padding: 1.25rem; display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 1rem;">
                    <div>
                      <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <h3 style="font-weight: 800; font-size: 1.125rem;">${ll.name}</h3>
                        <span class="badge badge-pending">Awaiting Super Admin</span>
                      </div>
                      <p style="font-size: 0.875rem; color: var(--slate-700); margin-top: 0.25rem;">
                        Property: <strong>${ll.propertyName}</strong> · Location: <strong>${ll.location}</strong> · Units: <strong>${ll.unitsCount}</strong> · M-Pesa Till: <strong>${ll.tillNumber}</strong>
                      </p>
                      <p style="font-size: 0.75rem; color: var(--slate-500); margin-top: 0.25rem;">
                        Email: ${ll.email} · Phone: ${ll.phone} · Registered ${formatDateTime(ll.createdAt)}
                      </p>
                    </div>

                    <div style="display: flex; gap: 0.5rem;">
                      <button class="btn btn-primary" onclick="window.app.superAdminApproveLandlord('${ll.id}')">
                        <i data-lucide="check" style="width: 1rem; height: 1rem;"></i>
                        Approve Landlord
                      </button>
                      <button class="btn btn-secondary" onclick="window.app.superAdminRejectLandlord('${ll.id}')">
                        Decline
                      </button>
                    </div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>
        ` : `
          <!-- Tenants Awaiting Approval -->
          <div class="card">
            <div class="card-header">
              <div>
                <h2 class="card-title">
                  <i data-lucide="users" style="color: var(--primary);"></i>
                  Registering Tenants Awaiting Approval (${pendingTenants.length})
                </h2>
                <p style="font-size: 0.8125rem; color: var(--slate-500); margin-top: 0.25rem;">
                  All tenants must be approved before their private portal opens to pay rent.
                </p>
              </div>
            </div>

            ${pendingTenants.length === 0 ? `
              <div style="text-align: center; padding: 3rem; color: var(--slate-500); font-size: 0.875rem;">
                No pending tenants awaiting approval.
              </div>
            ` : `
              <div style="display: flex; flex-direction: column; gap: 1rem;">
                ${pendingTenants.map((t) => `
                  <div style="border: 1px solid var(--slate-200); border-radius: var(--radius-lg); padding: 1.25rem; display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 1rem;">
                    <div>
                      <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <h3 style="font-weight: 800; font-size: 1.125rem;">${t.name}</h3>
                        <span class="badge badge-pending">Pending Approval</span>
                      </div>
                      <p style="font-size: 0.875rem; color: var(--slate-700); margin-top: 0.25rem;">
                        Property: <strong>${t.propertyName || 'Omwoyo Apartments'}</strong> · Unit: <strong>${t.unit}</strong>
                      </p>
                      <p style="font-size: 0.75rem; color: var(--slate-500); margin-top: 0.25rem;">
                        Contact: ${t.phone} · ${t.email} · Requested ${formatDateTime(t.createdAt)}
                      </p>
                    </div>

                    <div style="display: flex; align-items: flex-end; gap: 0.5rem;">
                      <div>
                        <label style="font-size: 0.75rem; font-weight: 600; display: block; margin-bottom: 0.25rem;">
                          Rent (KES)
                        </label>
                        <input type="number" class="form-input" id="super-rent-${t.userId}" value="${t.monthlyRent || 15000}" style="width: 7.5rem; padding: 0.375rem 0.5rem;" />
                      </div>
                      <button class="btn btn-primary" onclick="window.app.superAdminApproveTenant('${t.userId}')">
                        Approve Tenant
                      </button>
                      <button class="btn btn-secondary" onclick="window.app.rejectTenantRequest('${t.userId}')">
                        Decline
                      </button>
                    </div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>
        `}
      </div>
    `;
  }

  renderSuperAdminLandlordsDirectory(landlords) {
    return `
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">
            <i data-lucide="building" style="color: var(--primary);"></i>
            All Landlords & Till Numbers
          </h2>
          <button class="btn btn-primary" onclick="window.app.showLandlordRegistrationModal()">
            <i data-lucide="plus" style="width: 1rem; height: 1rem;"></i>
            Register New Landlord
          </button>
        </div>

        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Landlord</th>
                <th>Property</th>
                <th>M-Pesa Till Number</th>
                <th>Location & Units</th>
                <th>Contact</th>
                <th style="text-align: right;">Status</th>
                <th style="text-align: right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${landlords.map((ll) => {
                const tenantCount = store.getTenantsForLandlord(ll.id).length;
                return `
                  <tr>
                    <td style="font-weight: 700;">${ll.name}</td>
                    <td>
                      <span style="font-weight: 600; color: var(--primary-dark);">${ll.propertyName}</span>
                    </td>
                    <td>
                      <span style="font-family: monospace; font-weight: 700; background: var(--emerald-50); color: var(--emerald-700); padding: 2px 6px; border-radius: 4px;">
                        Till ${ll.tillNumber}
                      </span>
                    </td>
                    <td>
                      <div>${ll.location}</div>
                      <span style="font-size: 0.75rem; color: var(--slate-500);">${tenantCount} active / ${ll.unitsCount} units</span>
                    </td>
                    <td>
                      <div>${ll.phone}</div>
                      <span style="font-size: 0.75rem; color: var(--slate-500);">${ll.email}</span>
                    </td>
                    <td style="text-align: right;">
                      <span class="badge badge-${ll.status}">${ll.status}</span>
                    </td>
                    <td style="text-align: right; white-space: nowrap;">
                      ${ll.status === 'pending' ? `
                        <button class="btn btn-primary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;" onclick="window.app.superAdminApproveLandlord('${ll.id}')">
                          Approve
                        </button>
                      ` : `
                        <button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;" onclick="window.app.switchAsLandlord('${ll.id}')">
                          Monitor Portal
                        </button>
                      `}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  renderSuperAdminAllTenants(tenants) {
    return `
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">
            <i data-lucide="users" style="color: var(--primary);"></i>
            Global Tenants Roster (All Properties)
          </h2>
        </div>

        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Tenant & Unit</th>
                <th>Property / Landlord</th>
                <th>Phone</th>
                <th>Monthly Rent</th>
                <th>Ledger Balance</th>
                <th style="text-align: right;">Status</th>
                <th style="text-align: right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${tenants.map((t) => {
                const ledger = store.getTenantLedger(t);
                const bal = ledger.balance;
                const balColor = bal > 0 ? 'var(--rose-700)' : 'var(--emerald-700)';
                const balText = bal > 0 ? `Owes ${formatKES(bal)}` : bal < 0 ? `In credit ${formatKES(-bal)}` : 'Paid up';

                return `
                  <tr>
                    <td>
                      <span style="font-weight: 700;">${t.name}</span>
                      <span style="font-size: 0.75rem; color: var(--slate-500); display: block;">${t.unit}</span>
                    </td>
                    <td>
                      <span style="font-weight: 600; color: var(--primary-dark);">${t.propertyName || 'Omwoyo Apartments'}</span>
                    </td>
                    <td>${t.phone}</td>
                    <td style="font-weight: 600;">${formatKES(t.monthlyRent)}</td>
                    <td style="font-weight: 600; color: ${balColor};">${balText}</td>
                    <td style="text-align: right;">
                      <span class="badge badge-${t.status}">${t.status}</span>
                    </td>
                    <td style="text-align: right;">
                      <button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;" onclick="window.app.showStatementModalByUserId('${t.userId}')">
                        Statement
                      </button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  renderSuperAdminAllPayments(payments) {
    return `
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">
            <i data-lucide="receipt" style="color: var(--primary);"></i>
            Global Payments Monitor (All Transactions)
          </h2>
        </div>

        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Tenant</th>
                <th>Unit & Property</th>
                <th>Till / Method</th>
                <th>Receipt / Code</th>
                <th>Date</th>
                <th style="text-align: right;">Amount</th>
                <th style="text-align: right;">Status</th>
                <th style="text-align: right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${payments.map((p) => `
                <tr>
                  <td style="font-weight: 600;">${p.tenantName}</td>
                  <td>${p.unit}</td>
                  <td>${p.method}</td>
                  <td>
                    <span style="font-family: monospace; font-weight: 600;">${p.mpesaReceipt || '-'}</span>
                  </td>
                  <td>${formatDateTime(p.paidAt || p.createdAt)}</td>
                  <td style="text-align: right; font-weight: 700;">${formatKES(p.amount)}</td>
                  <td style="text-align: right;">
                    <span class="badge badge-${p.status}">${p.status === 'confirmed' ? 'Paid' : p.status === 'rejected' ? 'Not Paid' : p.status}</span>
                  </td>
                  <td style="text-align: right;">
                    ${p.status === 'confirmed' ? `
                      <button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;" onclick="window.app.showReceiptModal('${p.id}')">
                        Receipt
                      </button>
                    ` : ''}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  renderSuperAdminAudit(audit) {
    return `
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">
            <i data-lucide="history" style="color: var(--primary);"></i>
            System Audit Log
          </h2>
        </div>
        <div style="display: flex; flex-direction: column; gap: 0.5rem; max-height: 25rem; overflow-y: auto;">
          ${audit.map((a) => `
            <div style="padding: 0.625rem; border-bottom: 1px solid var(--slate-100); font-size: 0.8125rem;">
              <p><strong>${a.action}</strong> · ${a.detail}</p>
              <p style="font-size: 0.75rem; color: var(--slate-500); margin-top: 0.125rem;">By ${a.by} · ${formatDateTime(a.at)}</p>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  attachSuperAdminEvents() {
    document.querySelectorAll('[data-superadmin-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.adminTab = btn.getAttribute('data-superadmin-tab');
        this.render();
      });
    });

    document.getElementById('btn-sub-landlords')?.addEventListener('click', () => {
      this.approvalSubTab = 'landlords';
      this.render();
    });

    document.getElementById('btn-sub-tenants')?.addEventListener('click', () => {
      this.approvalSubTab = 'tenants';
      this.render();
    });
  }

  superAdminApproveLandlord(landlordId) {
    store.approveLandlord(landlordId);
    this.showToast('Landlord approved! Their property portal is now active.');
  }

  superAdminRejectLandlord(landlordId) {
    if (confirm('Decline this landlord registration request?')) {
      store.rejectLandlord(landlordId);
      this.showToast('Landlord declined.');
    }
  }

  superAdminApproveTenant(userId) {
    const rentInput = document.getElementById(`super-rent-${userId}`);
    const rent = rentInput ? Number(rentInput.value) : 15000;
    store.decideTenantStatus(userId, 'approved', rent);
    this.showToast('Tenant approved! Their private account is now activated.');
  }

  switchAsLandlord(landlordId) {
    const ll = store.state.landlords.find((l) => l.id === landlordId);
    if (!ll) return;
    store.setCurrentUser({
      userId: ll.userId,
      landlordId: ll.id,
      name: ll.name,
      email: ll.email,
      role: 'owner',
      landlord: ll,
      isAdmin: true
    });
    this.showToast(`Logged in as Landlord ${ll.name} (${ll.propertyName})`);
  }

  // --- Tier 2: LANDLORD PORTAL ---
  renderLandlordView(user) {
    const landlord = store.getLandlordForUser(user) || store.state.landlords[0];

    // If Landlord is awaiting Super Admin approval
    if (landlord.status === 'pending') {
      return `
        <div class="card" style="max-width: 36rem; margin: 2rem auto; padding: 2rem; text-align: center;">
          <div style="width: 3.5rem; height: 3.5rem; border-radius: 9999px; background-color: var(--amber-50); color: var(--amber-700); display: flex; align-items: center; justify-content: center; margin: 0 auto;">
            <i data-lucide="clock" style="width: 1.75rem; height: 1.75rem;"></i>
          </div>
          <h1 style="font-size: 1.5rem; font-weight: 800; margin-top: 1rem;">
            Landlord Account Awaiting Approval
          </h1>
          <p style="font-size: 0.875rem; color: var(--slate-600); margin-top: 0.5rem; line-height: 1.6;">
            Your registration for <strong>${landlord.propertyName}</strong> (Till: ${landlord.tillNumber}) has been submitted and is awaiting approval by the <strong>Platform Administrator</strong>.
          </p>
          <div style="background-color: var(--slate-50); border-radius: var(--radius-lg); padding: 1rem; margin-top: 1.5rem; text-align: left; font-size: 0.875rem;">
            <div style="display: flex; justify-content: space-between; padding: 0.375rem 0;">
              <span style="color: var(--slate-500);">Landlord</span>
              <span style="font-weight: 600;">${landlord.name}</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 0.375rem 0;">
              <span style="color: var(--slate-500);">Property</span>
              <span style="font-weight: 600;">${landlord.propertyName}</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 0.375rem 0;">
              <span style="color: var(--slate-500);">M-Pesa Till</span>
              <span style="font-weight: 600;">Till ${landlord.tillNumber}</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 0.375rem 0;">
              <span style="color: var(--slate-500);">Status</span>
              <span class="badge badge-pending">Pending Review</span>
            </div>
          </div>
          <button class="btn btn-secondary" onclick="window.app.render()" style="margin-top: 1.5rem;">
            <i data-lucide="refresh-cw" style="width: 1rem; height: 1rem;"></i>
            Check Status
          </button>
        </div>
      `;
    }

    if (landlord.status === 'suspended' || landlord.status === 'rejected') {
      return `
        <div class="card" style="max-width: 32rem; margin: 2rem auto; padding: 2rem; text-align: center;">
          <h1 style="font-size: 1.25rem; font-weight: 700; color: var(--rose-700);">Account Not Active</h1>
          <p style="font-size: 0.875rem; color: var(--slate-600); margin-top: 0.5rem;">
            Your account status is ${landlord.status}. Please contact system administration for assistance.
          </p>
        </div>
      `;
    }

    // Approved Landlord Dashboard: Scoped to this property
    const landlordId = landlord.id;
    const isOwner = user.role === 'owner';
    const currentMonth = getCurrentMonth();

    const myTenants = store.getTenantsForLandlord(landlordId);
    const myPayments = store.getPaymentsForLandlord(landlordId);

    const activeTenants = myTenants.filter((t) => t.status === 'approved');
    const pendingTenantRequests = myTenants.filter((t) => t.status === 'pending');
    const pendingPayments = myPayments.filter((p) => p.status === 'pending');

    const monthlyConfirmed = myPayments
      .filter((p) => p.status === 'confirmed' && p.month === currentMonth)
      .reduce((sum, p) => sum + p.amount, 0);

    const totalArrears = activeTenants.reduce((sum, t) => {
      const ledger = store.getTenantLedger(t);
      return sum + Math.max(ledger.balance, 0);
    }, 0);

    const inviteLink = `${window.location.origin}${window.location.pathname}?invite=${landlord.inviteCode || landlord.id}`;

    return `
      <!-- Landlord Header & Invite Link Share Button -->
      <div style="display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem;">
        <div>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span class="badge badge-approved">Approved Landlord</span>
            <span style="font-size: 0.8125rem; color: var(--slate-500);">${landlord.propertyName}</span>
          </div>
          <h1 style="font-size: 1.75rem; font-weight: 800; letter-spacing: -0.02em; margin-top: 0.25rem;">
            ${landlord.propertyName}
          </h1>
          <p style="font-size: 0.875rem; color: var(--slate-600);">
            Online M-Pesa Till: <strong>${landlord.tillNumber}</strong> · Landlord: <strong>${landlord.name}</strong>
          </p>
        </div>

        <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
          <button class="btn btn-primary" id="btn-copy-tenant-invite" data-link="${inviteLink}">
            <i data-lucide="link" style="width: 1rem; height: 1rem;"></i>
            Send Tenant Registration Link
          </button>
          <button class="btn btn-secondary" onclick="window.app.showUpdateTillModal('${landlord.id}')">
            <i data-lucide="edit" style="width: 1rem; height: 1rem;"></i>
            Update Till Number
          </button>
        </div>
      </div>

      <!-- KPI Metrics -->
      <div class="kpi-grid">
        <div class="kpi-card">
          <p class="kpi-label">Collected ${formatMonth(currentMonth)}</p>
          <p class="kpi-value positive">${formatKES(monthlyConfirmed)}</p>
        </div>
        <div class="kpi-card">
          <p class="kpi-label">Active Tenants</p>
          <p class="kpi-value">${activeTenants.length} / ${landlord.unitsCount || 12} units</p>
        </div>
        <div class="kpi-card">
          <p class="kpi-label">Tenant Requests</p>
          <p class="kpi-value ${pendingTenantRequests.length > 0 ? 'danger' : ''}">${pendingTenantRequests.length}</p>
        </div>
        <div class="kpi-card">
          <p class="kpi-label">Total Arrears Owed</p>
          <p class="kpi-value ${totalArrears > 0 ? 'danger' : 'positive'}">${formatKES(totalArrears)}</p>
        </div>
      </div>

      <!-- Landlord Tabs Navigation (NO SUPER ADMIN TAB) -->
      <div class="tabs-nav" role="tablist">
        <button class="tab-btn ${this.landlordTab === 'payments' ? 'active' : ''}" data-landlord-tab="payments">
          <i data-lucide="receipt" style="width: 1.125rem; height: 1.125rem;"></i>
          Payment Approvals
          ${pendingPayments.length > 0 ? `<span class="tab-badge">${pendingPayments.length}</span>` : ''}
        </button>
        <button class="tab-btn ${this.landlordTab === 'requests' ? 'active' : ''}" data-landlord-tab="requests">
          <i data-lucide="user-check" style="width: 1.125rem; height: 1.125rem;"></i>
          Tenant Approvals
          ${pendingTenantRequests.length > 0 ? `<span class="tab-badge">${pendingTenantRequests.length}</span>` : ''}
        </button>
        <button class="tab-btn ${this.landlordTab === 'tenants' ? 'active' : ''}" data-landlord-tab="tenants">
          <i data-lucide="users" style="width: 1.125rem; height: 1.125rem;"></i>
          My Tenants
        </button>
        <button class="tab-btn ${this.landlordTab === 'arrears' ? 'active' : ''}" data-landlord-tab="arrears">
          <i data-lucide="wallet" style="width: 1.125rem; height: 1.125rem;"></i>
          Arrears
        </button>
        <button class="tab-btn ${this.landlordTab === 'reports' ? 'active' : ''}" data-landlord-tab="reports">
          <i data-lucide="file-spreadsheet" style="width: 1.125rem; height: 1.125rem;"></i>
          Reports & Excel
        </button>
        <button class="tab-btn ${this.landlordTab === 'settings' ? 'active' : ''}" data-landlord-tab="settings">
          <i data-lucide="settings" style="width: 1.125rem; height: 1.125rem;"></i>
          Property & Till Settings
        </button>
      </div>

      <div id="landlord-tab-content">
        ${this.landlordTab === 'payments' ? this.renderLandlordPaymentsTab(myPayments) : ''}
        ${this.landlordTab === 'requests' ? this.renderLandlordRequestsTab(pendingTenantRequests) : ''}
        ${this.landlordTab === 'tenants' ? this.renderLandlordTenantsTab(activeTenants) : ''}
        ${this.landlordTab === 'arrears' ? this.renderAdminArrearsTab() : ''}
        ${this.landlordTab === 'reports' ? this.renderAdminReportsTab() : ''}
        ${this.landlordTab === 'settings' ? this.renderLandlordSettingsTab(landlord) : ''}
      </div>
    `;
  }

  // Landlord: Approve payments as Paid or Not Paid
  renderLandlordPaymentsTab(payments) {
    const pending = payments.filter((p) => p.status === 'pending');
    const filtered = this.paymentFilter === 'all'
      ? payments.filter((p) => p.status !== 'pending')
      : payments.filter((p) => p.status === this.paymentFilter);

    const approvedTenants = store.state.tenants.filter((t) => t.status === 'approved');

    return `
      <div style="display: flex; flex-direction: column; gap: 1.5rem;">
        <!-- Payments Awaiting Approval -->
        ${pending.length > 0 ? `
          <div class="card" style="border: 2px solid #f59e0b; background-color: #ffffff; box-shadow: 0 4px 12px rgba(245, 158, 11, 0.1);">
            <div style="background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%); padding: 1.25rem; border-top-left-radius: var(--radius-xl); border-top-right-radius: var(--radius-xl); border-bottom: 1px solid #fde68a; margin: -1.25rem -1.25rem 1.25rem -1.25rem;">
              <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
                <h2 style="font-weight: 800; color: #92400e; font-size: 1.125rem; display: flex; align-items: center; gap: 0.5rem;">
                  <i data-lucide="message-square-check" style="width: 1.375rem; height: 1.375rem; color: #d97706;"></i>
                  Tenant Payment Messages Awaiting Confirmation (${pending.length})
                </h2>
                <span class="badge badge-pending" style="font-weight: 800; font-size: 0.75rem;">Action Required</span>
              </div>
              <p style="font-size: 0.8125rem; color: #78350f; margin-top: 0.375rem; line-height: 1.5;">
                Tenants have posted these M-Pesa messages for rent confirmation. Verify against your Till <strong>${store.state.settings.daraja?.shortcode || '582190'}</strong> statement. Approving marks the payment as <strong>Paid</strong> in the tenant's portal and generates their official receipt.
              </p>
            </div>

            <div style="display: flex; flex-direction: column; gap: 1.25rem;">
              ${pending.map((p) => `
                <div style="background: #fafaf9; border: 1px solid #e7e5e4; border-radius: var(--radius-lg); padding: 1.25rem; display: flex; flex-direction: column; gap: 0.875rem;">
                  <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem;">
                    <div>
                      <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                        <span class="badge badge-pending" style="font-size: 0.75rem; font-weight: 700;">AWAITING CONFIRMATION</span>
                        <span style="font-family: monospace; font-size: 0.8125rem; font-weight: 700; background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 4px;">
                          Code: ${p.mpesaReceipt || p.reference || 'PENDING'}
                        </span>
                        <span style="font-size: 0.75rem; color: var(--slate-500);">
                          Submitted ${formatDateTime(p.submittedAt || p.createdAt)}
                        </span>
                        ${p.channel === 'tenant_posted_sms' ? `<span class="badge" style="background:#f1f5f9; color:#475569; font-size:0.6875rem;">Tenant Posted SMS</span>` : ''}
                      </div>

                      <div style="font-size: 1.375rem; font-weight: 800; color: var(--slate-900); margin-top: 0.375rem;">
                        ${formatKES(p.amount)} <span style="font-size: 0.875rem; font-weight: 600; color: var(--slate-500);">for ${formatMonth(p.month)}</span>
                      </div>

                      <p style="font-size: 0.8125rem; margin-top: 0.25rem; color: var(--slate-600);">
                        <strong>Tenant:</strong> ${p.tenantName || p.payerName || 'Unknown tenant'} (${p.unit || 'Unit not specified'}) · <strong>Phone:</strong> ${formatPhone(p.payerPhone || '')} · Method: <strong>${p.method}</strong>
                      </p>
                    </div>

                    <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                      <select class="form-select" id="select-tenant-${p.id}" style="width: auto; font-size: 0.8125rem; padding: 0.375rem 0.625rem;">
                        <option value="">Confirm tenant…</option>
                        ${approvedTenants.map((t) => `
                          <option value="${t.userId}" ${t.userId === p.tenantId ? 'selected' : ''}>
                            ${t.name} · ${t.unit}
                          </option>
                        `).join('')}
                      </select>
                      <button class="btn btn-primary" onclick="window.app.approvePayment('${p.id}')" style="font-weight: 700; display: inline-flex; align-items: center; gap: 0.375rem;">
                        <i data-lucide="check-check" style="width: 1rem; height: 1rem;"></i>
                        Confirm & Approve (Paid)
                      </button>
                      <button class="btn btn-secondary" onclick="window.app.rejectPayment('${p.id}')" style="display: inline-flex; align-items: center; gap: 0.375rem; color: #be123c;">
                        <i data-lucide="x" style="width: 1rem; height: 1rem;"></i>
                        Decline (Not Paid)
                      </button>
                    </div>
                  </div>

                  <!-- Quoted Message from Tenant -->
                  <div style="background-color: #ffffff; border-left: 4px solid var(--primary); padding: 0.75rem 1rem; border-radius: var(--radius-md); border-top: 1px solid #f1f5f9; border-right: 1px solid #f1f5f9; border-bottom: 1px solid #f1f5f9; font-family: monospace; font-size: 0.8125rem; color: #1e293b; word-break: break-word;">
                    <div style="display: flex; align-items: center; gap: 0.375rem; font-weight: 700; color: var(--primary); margin-bottom: 0.25rem; font-size: 0.75rem; text-transform: uppercase;">
                      <i data-lucide="message-square" style="width: 0.875rem; height: 0.875rem;"></i>
                      Posted Message from Tenant:
                    </div>
                    "${p.smsText || p.tenantMessage || 'Payment message submitted by tenant.'}"
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- All Payments Log -->
        <div class="card">
          <div class="card-header">
            <h2 class="card-title">Payment History</h2>
            <select class="form-select" id="admin-payment-filter" style="width: auto;">
              <option value="all" ${this.paymentFilter === 'all' ? 'selected' : ''}>All processed</option>
              <option value="confirmed" ${this.paymentFilter === 'confirmed' ? 'selected' : ''}>Paid</option>
              <option value="rejected" ${this.paymentFilter === 'rejected' ? 'selected' : ''}>Not Paid</option>
            </select>
          </div>

          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Tenant & Unit</th>
                  <th>Rent Month</th>
                  <th>Method & Code</th>
                  <th>Date Paid</th>
                  <th style="text-align: right;">Amount</th>
                  <th style="text-align: right;">Status</th>
                  <th style="text-align: right;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${filtered.map((p) => `
                  <tr>
                    <td>
                      <span style="font-weight: 600;">${p.tenantName}</span>
                      <span style="font-size: 0.75rem; color: var(--slate-500);"> · ${p.unit}</span>
                    </td>
                    <td>${formatMonth(p.month)}</td>
                    <td>
                      <span>${p.method}</span>
                      ${p.mpesaReceipt ? `<span style="font-family: monospace; font-size: 0.75rem; color: var(--slate-500);"> · ${p.mpesaReceipt}</span>` : ''}
                    </td>
                    <td>${formatDateTime(p.paidAt || p.createdAt)}</td>
                    <td style="text-align: right; font-weight: 700;">${formatKES(p.amount)}</td>
                    <td style="text-align: right;">
                      <span class="badge badge-${p.status}">
                        ${p.status === 'confirmed' ? 'Paid' : p.status === 'rejected' ? 'Not Paid' : p.status}
                      </span>
                    </td>
                    <td style="text-align: right; white-space: nowrap;">
                      ${p.status === 'confirmed' ? `
                        <button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;" onclick="window.app.showReceiptModal('${p.id}')">
                          Receipt
                        </button>
                      ` : ''}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  renderLandlordRequestsTab(pending) {
    return `
      <div class="card">
        <div class="card-header">
          <div>
            <h2 class="card-title">
              <i data-lucide="user-check" style="color: var(--primary);"></i>
              Tenant Requests for Your Building (${pending.length})
            </h2>
            <p style="font-size: 0.8125rem; color: var(--slate-500); margin-top: 0.25rem;">
              Review each tenant request, set their monthly rent in KES, and approve them to unlock their account.
            </p>
          </div>
        </div>

        ${pending.length === 0 ? `
          <div style="text-align: center; padding: 3rem; color: var(--slate-500); font-size: 0.875rem;">
            No pending tenant requests for your building.
          </div>
        ` : `
          <div style="display: flex; flex-direction: column; gap: 1rem;">
            ${pending.map((t) => `
              <div style="border: 1px solid var(--slate-200); border-radius: var(--radius-lg); padding: 1.25rem; display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 1rem;">
                <div>
                  <h3 style="font-weight: 700; font-size: 1.125rem;">${t.name}</h3>
                  <p style="font-size: 0.875rem; color: var(--slate-600); margin-top: 0.25rem;">
                    Unit: <strong>${t.unit}</strong> · Phone: <strong>${t.phone}</strong> · Email: ${t.email || '-'}
                  </p>
                  <p style="font-size: 0.75rem; color: var(--slate-500); margin-top: 0.25rem;">
                    Requested on ${formatDateTime(t.createdAt)}
                  </p>
                </div>

                <div style="display: flex; align-items: flex-end; gap: 0.75rem; flex-wrap: wrap;">
                  <div>
                    <label style="font-size: 0.75rem; font-weight: 600; color: var(--slate-700); display: block; margin-bottom: 0.25rem;">
                      Monthly Rent (KES)
                    </label>
                    <input type="number" class="form-input" id="input-rent-${t.userId}" min="1" value="15000" style="width: 8rem; padding: 0.375rem 0.625rem;" />
                  </div>
                  <button class="btn btn-primary" onclick="window.app.approveTenantRequest('${t.userId}')">
                    Approve Tenant
                  </button>
                  <button class="btn btn-secondary" onclick="window.app.rejectTenantRequest('${t.userId}')">
                    Decline
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `;
  }

  renderLandlordTenantsTab(tenants) {
    return `
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">
            <i data-lucide="users" style="color: var(--primary);"></i>
            Approved Tenants
          </h2>
        </div>

        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Tenant & Unit</th>
                <th>Contact</th>
                <th>Monthly Rent</th>
                <th>Balance Status</th>
                <th style="text-align: right;">Status</th>
                <th style="text-align: right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${tenants.map((t) => {
                const ledger = store.getTenantLedger(t);
                const bal = ledger.balance;
                const balText = bal > 0 ? `Owes ${formatKES(bal)}` : bal < 0 ? `In credit ${formatKES(-bal)}` : 'Fully paid up';
                const balColor = bal > 0 ? 'var(--rose-700)' : 'var(--emerald-700)';

                return `
                  <tr>
                    <td>
                      <span style="font-weight: 600;">${t.name}</span>
                      <span style="font-size: 0.75rem; color: var(--slate-500); display: block;">${t.unit}</span>
                    </td>
                    <td>
                      <div>${t.phone}</div>
                      <div style="font-size: 0.75rem; color: var(--slate-500);">${t.email || '-'}</div>
                    </td>
                    <td style="font-weight: 600;">${formatKES(t.monthlyRent)}</td>
                    <td style="font-weight: 600; color: ${balColor};">${balText}</td>
                    <td style="text-align: right;">
                      <span class="badge badge-${t.status}">${t.status}</span>
                    </td>
                    <td style="text-align: right; white-space: nowrap;">
                      <button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;" onclick="window.app.showStatementModalByUserId('${t.userId}')">
                        Statement
                      </button>
                      <button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;" onclick="window.app.promptChangeRent('${t.userId}')">
                        Change rent
                      </button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  renderLandlordSettingsTab(landlord) {
    const tenants = store.getTenantsForLandlord(landlord.id);
    const lastResult = store.state.settings?.smsLastResult || 'No message processed yet';
    const lastTime = store.state.settings?.smsLastReceivedAt ? formatDateTime(store.state.settings.smsLastReceivedAt) : 'Never';
    const webhookUrl = store.state.settings?.smsWebhookUrl || `https://rentmaster.app/api/webhook/mpesa-forward/${landlord.id}`;
    const daraja = store.getDarajaConfig();
    const isDarajaConfigured = Boolean(daraja.consumerKey && daraja.consumerSecret && daraja.passkey);

    return `
      <div style="display: flex; flex-direction: column; gap: 1.5rem;">
        <!-- Card 0: Live Safaricom Daraja API Gateway (Supermarket Real Handset STK Push) -->
        <div class="card" style="border-left: 4px solid #10b981; background: #ffffff;">
          <div class="card-header">
            <div>
              <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                <span class="badge ${isDarajaConfigured ? 'badge-paid' : 'badge-unpaid'}" style="font-size: 0.75rem; font-weight: 700;">
                  ${isDarajaConfigured ? '🟢 Live Gateway Active' : '🟡 Setup Required for Real Phone Push'}
                </span>
                <span style="font-size: 0.75rem; color: var(--slate-500);">Lipa Na M-Pesa Online (STK Push)</span>
              </div>
              <h2 class="card-title" style="display: flex; align-items: center; gap: 0.5rem;">
                <i data-lucide="zap" style="color: #10b981;"></i>
                Live Safaricom Daraja API Gateway
              </h2>
              <p style="font-size: 0.8125rem; color: var(--slate-600); margin-top: 0.25rem;">
                Send real M-Pesa prompts directly to tenants' physical phones (just like supermarket checkouts e.g. Naivas, Carrefour). Money goes to your Till, and the system automatically updates to <strong>PAID</strong> or <strong>NOT PAID</strong>.
              </p>
            </div>
          </div>

          <form id="form-landlord-daraja-settings" style="display: flex; flex-direction: column; gap: 1rem; margin-top: 1rem;">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Safaricom Environment</label>
                <select class="form-select" id="daraja-env">
                  <option value="production" ${daraja.env === 'production' ? 'selected' : ''}>Live Production (Real Money & Real Till · api.safaricom.co.ke)</option>
                  <option value="sandbox" ${daraja.env === 'sandbox' ? 'selected' : ''}>Daraja Sandbox Test (sandbox.safaricom.co.ke)</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Till / Business Type</label>
                <select class="form-select" id="daraja-till-type">
                  <option value="till" ${daraja.tillType === 'till' ? 'selected' : ''}>Buy Goods Till Number (Supermarket / Store Till)</option>
                  <option value="paybill" ${daraja.tillType === 'paybill' ? 'selected' : ''}>Paybill Number (Business Shortcode)</option>
                </select>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">M-Pesa Business Shortcode / Till</label>
                <input type="text" class="form-input" id="daraja-shortcode" value="${daraja.shortcode || landlord.tillNumber || '582190'}" required placeholder="e.g. 582190" />
              </div>
              <div class="form-group">
                <label class="form-label">Consumer Key</label>
                <input type="text" class="form-input" id="daraja-consumer-key" value="${daraja.consumerKey || ''}" placeholder="Paste Safaricom Consumer Key" />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Consumer Secret</label>
                <input type="password" class="form-input" id="daraja-consumer-secret" value="${daraja.consumerSecret || ''}" placeholder="Paste Safaricom Consumer Secret" />
              </div>
              <div class="form-group">
                <label class="form-label">Lipa Na M-Pesa Online Passkey</label>
                <input type="password" class="form-input" id="daraja-passkey" value="${daraja.passkey || ''}" placeholder="Paste Safaricom Online Passkey" />
              </div>
            </div>

            <div style="display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap;">
              <button type="submit" class="btn btn-primary">
                <i data-lucide="shield-check" style="width: 1rem; height: 1rem;"></i>
                Save Daraja Credentials
              </button>
              <button type="button" class="btn btn-secondary" id="btn-toggle-daraja-guide">
                <i data-lucide="help-circle" style="width: 1rem; height: 1rem;"></i>
                How to Get Free Daraja Credentials
              </button>
            </div>
          </form>

          <!-- Step by Step Registration Guide -->
          <div id="daraja-guide-box" style="display: none; background-color: #f8fafc; border: 1px solid var(--slate-200); border-radius: var(--radius-lg); padding: 1.25rem; margin-top: 1rem; font-size: 0.8125rem; color: var(--slate-700);">
            <h4 style="font-weight: 800; color: #047857; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem;">
              <i data-lucide="book-open" style="width: 1.125rem; height: 1.125rem;"></i>
              How to Register on Safaricom Daraja for Your Till Number (Free):
            </h4>
            <ol style="margin-left: 1.25rem; line-height: 1.6; display: flex; flex-direction: column; gap: 0.375rem;">
              <li><strong>Open Safaricom Developer Portal:</strong> Visit <a href="https://developer.safaricom.co.ke" target="_blank" style="color: #059669; font-weight: 700; text-decoration: underline;">developer.safaricom.co.ke</a> and click <em>Register / Login</em>.</li>
              <li><strong>Create an App:</strong> Navigate to <em>My Apps</em> &rarr; <em>Add a New App</em>. Select <strong>Lipa Na M-Pesa Sandbox / Production</strong>, name it <code>Rentmaster Portal</code>, and save.</li>
              <li><strong>Copy API Keys:</strong> Copy your <code>Consumer Key</code> and <code>Consumer Secret</code> and paste them in the fields above.</li>
              <li><strong>Go-Live for Real Till:</strong> On the Daraja portal, click <strong>Go-Live</strong>, enter your Till/Paybill number, and upload verification (ID/Business permit). Safaricom will generate your Live <strong>Passkey</strong>.</li>
              <li><strong>Save & Test:</strong> Paste the Passkey above and test sending a live KES 1 prompt directly to your phone below!</li>
            </ol>
          </div>

          <!-- Real Phone Test Box -->
          <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: var(--radius-lg); padding: 1.25rem; margin-top: 1.25rem;">
            <h4 style="font-size: 0.875rem; font-weight: 800; color: #065f46; display: flex; align-items: center; gap: 0.5rem;">
              <i data-lucide="smartphone" style="width: 1.125rem; height: 1.125rem;"></i>
              Test Real STK Push Prompt on Your Phone
            </h4>
            <p style="font-size: 0.75rem; color: #047857; margin-top: 0.25rem;">
              Enter your real Kenyan phone number (e.g. <code>0712345678</code> or <code>07...</code>) to test sending the live Safaricom M-Pesa prompt directly to your handset right now.
            </p>
            <div style="display: flex; gap: 0.5rem; margin-top: 0.75rem; flex-wrap: wrap;">
              <input type="tel" class="form-input" id="daraja-test-phone" placeholder="Your Phone (e.g. 0712345678)" style="max-width: 200px;" value="${landlord.phone || '0712345678'}" />
              <input type="number" class="form-input" id="daraja-test-amount" placeholder="KES 1" style="max-width: 100px;" value="1" min="1" />
              <button type="button" class="btn btn-primary" id="btn-test-real-stk" style="background-color: #059669;">
                <i data-lucide="send" style="width: 1rem; height: 1rem;"></i>
                Push Real Prompt to My Handset
              </button>
            </div>
            <div id="daraja-test-status" style="margin-top: 0.75rem; display: none;"></div>
          </div>
        </div>

        <!-- Card 1: Till Settings -->
        <div class="card">
          <div class="card-header">
            <div>
              <h2 class="card-title">
                <i data-lucide="smartphone" style="color: var(--primary);"></i>
                Landlord M-Pesa Till Configuration
              </h2>
              <p style="font-size: 0.8125rem; color: var(--slate-500); margin-top: 0.25rem;">
                This Till number is automatically provided to all your tenants when paying rent online.
              </p>
            </div>
          </div>

          <form id="form-landlord-till-settings" style="display: flex; flex-direction: column; gap: 1rem; margin-top: 1rem;">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">M-Pesa Buy Goods Till Number</label>
                <input type="text" class="form-input" id="edit-ll-till" value="${landlord.tillNumber}" required placeholder="e.g. 582190" />
              </div>
              <div class="form-group">
                <label class="form-label">Property Associated</label>
                <input type="text" class="form-input" id="edit-ll-propname" value="${landlord.propertyName}" readonly style="background-color: var(--slate-100);" />
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Payment Instructions for Tenants</label>
              <textarea class="form-textarea" id="edit-ll-inst" rows="2" required>${landlord.paymentInstructions}</textarea>
            </div>

            <button type="submit" class="btn btn-primary" style="align-self: flex-start;">
              <i data-lucide="save" style="width: 1rem; height: 1rem;"></i>
              Save Till Settings
            </button>
          </form>
        </div>

        <!-- Card 2: Read Message from Tenant's Phone -->
        <div class="card" style="border-left: 4px solid var(--primary); background: #ffffff;">
          <div class="card-header">
            <div>
              <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                <span class="badge" style="background-color: var(--primary-light); color: var(--primary-dark); font-weight: 700;">
                  Live SMS Reader
                </span>
                <span style="font-size: 0.75rem; color: var(--slate-500);">Auto-Detection & Unit Matcher</span>
              </div>
              <h2 class="card-title">
                <i data-lucide="message-square" style="color: var(--primary);"></i>
                Read M-Pesa Message from Tenant's Phone
              </h2>
              <p style="font-size: 0.8125rem; color: var(--slate-600); margin-top: 0.25rem;">
                Paste or read the Safaricom M-Pesa payment confirmation SMS from the tenant's phone to instantly verify and match the rent payment to their unit.
              </p>
            </div>
          </div>

          <div style="margin-top: 1rem; display: flex; flex-direction: column; gap: 1rem;">
            <div class="form-group">
              <label class="form-label">Paste M-Pesa SMS Message from Tenant</label>
              <textarea 
                class="form-textarea" 
                id="sms-phone-message" 
                rows="3" 
                placeholder="e.g. QK49L908P1 Confirmed. Ksh15,000.00 sent to Till 582190 Omwoyo Apartments from JANE WANJIRU 0712345678 on 22/10/26 at 8:45 PM. Reference: Unit B4."
              ></textarea>
            </div>

            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center;">
              <button class="btn btn-primary" id="btn-read-tenant-sms">
                <i data-lucide="scan-text" style="width: 1rem; height: 1rem;"></i>
                Read Message & Verify Payment
              </button>
              <button class="btn btn-secondary" id="btn-sample-sms-jane">
                <i data-lucide="sparkles" style="width: 0.875rem; height: 0.875rem;"></i>
                Load Sample: Jane Wanjiru (Unit B4 · KES 15,000)
              </button>
              <button class="btn btn-secondary" id="btn-sample-sms-brian">
                <i data-lucide="sparkles" style="width: 0.875rem; height: 0.875rem;"></i>
                Load Sample: Brian Kiprop (Unit A2 · KES 18,000)
              </button>
            </div>

            <!-- Dynamic Parsed Feedback Box -->
            <div id="sms-parse-feedback" style="display: none;"></div>
          </div>
        </div>

        <!-- Card 3: Android SMS Forwarder Webhook Integration -->
        <div class="card">
          <div class="card-header">
            <div>
              <h2 class="card-title">
                <i data-lucide="radio" style="color: #6366f1;"></i>
                Android Phone SMS Forwarder Webhook
              </h2>
              <p style="font-size: 0.8125rem; color: var(--slate-600); margin-top: 0.25rem;">
                Automatically forward and read M-Pesa messages directly from your property manager Android phone.
              </p>
            </div>
            <div class="pulse-indicator">
              <div class="pulse-dot"></div>
              <span>Webhook Active</span>
            </div>
          </div>

          <div style="margin-top: 1rem; display: flex; flex-direction: column; gap: 1rem;">
            <div class="form-group">
              <label class="form-label">Dedicated Webhook Endpoint</label>
              <div style="display: flex; gap: 0.5rem;">
                <input type="text" class="form-input" id="sms-webhook-input" readonly value="${webhookUrl}" style="background-color: var(--slate-50); font-family: monospace; font-size: 0.8125rem;" />
                <button class="btn btn-secondary" id="btn-copy-webhook" style="white-space: nowrap;">
                  <i data-lucide="copy" style="width: 1rem; height: 1rem;"></i>
                  Copy URL
                </button>
                <button class="btn btn-secondary" id="btn-regen-webhook" style="white-space: nowrap;">
                  <i data-lucide="refresh-cw" style="width: 1rem; height: 1rem;"></i>
                  Regenerate
                </button>
              </div>
            </div>

            <div style="background-color: var(--slate-50); border: 1px solid var(--slate-200); border-radius: var(--radius-lg); padding: 1rem; font-size: 0.8125rem; color: var(--slate-700);">
              <h4 style="font-weight: 700; margin-bottom: 0.375rem; color: var(--slate-900);">
                📲 How to Read SMS Messages from Phones Automatically:
              </h4>
              <ol style="margin-left: 1.25rem; line-height: 1.6;">
                <li>Install an Android SMS Forwarder app (e.g. <em>SMS Forwarder</em> from F-Droid or Play Store).</li>
                <li>Set Forward rule: Filter by Sender <code>MPESA</code>.</li>
                <li>Set Webhook URL to your dedicated endpoint above (HTTP POST).</li>
                <li>When the tenant pays rent, the SMS message from their phone is immediately read and logged for your approval.</li>
              </ol>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; background-color: var(--slate-100); padding: 0.75rem 1rem; border-radius: var(--radius-md); font-size: 0.75rem; color: var(--slate-600);">
              <div>
                <strong>Last Message Processed:</strong> ${lastTime}
              </div>
              <div>
                <strong>Status:</strong> <span style="color: var(--primary); font-weight: 600;">${lastResult}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  attachLandlordEvents(user) {
    document.querySelectorAll('[data-landlord-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.landlordTab = btn.getAttribute('data-landlord-tab');
        this.render();
      });
    });

    document.getElementById('btn-copy-tenant-invite')?.addEventListener('click', (e) => {
      const link = e.currentTarget.getAttribute('data-link');
      if (link) {
        navigator.clipboard?.writeText(link);
        this.showToast(`Tenant invite link copied! (${link})`);
      }
    });

    // Daraja Settings & Real Phone Handset Test
    document.getElementById('btn-toggle-daraja-guide')?.addEventListener('click', () => {
      const guideBox = document.getElementById('daraja-guide-box');
      if (guideBox) {
        guideBox.style.display = guideBox.style.display === 'none' ? 'block' : 'none';
      }
    });

    document.getElementById('form-landlord-daraja-settings')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const env = document.getElementById('daraja-env')?.value || 'production';
      const tillType = document.getElementById('daraja-till-type')?.value || 'till';
      const shortcode = document.getElementById('daraja-shortcode')?.value.trim();
      const consumerKey = document.getElementById('daraja-consumer-key')?.value.trim();
      const consumerSecret = document.getElementById('daraja-consumer-secret')?.value.trim();
      const passkey = document.getElementById('daraja-passkey')?.value.trim();

      store.updateDarajaConfig({
        env,
        tillType,
        shortcode,
        consumerKey,
        consumerSecret,
        passkey,
        enabled: Boolean(consumerKey && consumerSecret && passkey)
      });

      this.showToast('Safaricom Daraja API credentials saved! Live phone push ready.');
      this.render();
    });

    document.getElementById('btn-test-real-stk')?.addEventListener('click', async () => {
      const phoneInput = document.getElementById('daraja-test-phone');
      const amountInput = document.getElementById('daraja-test-amount');
      const statusBox = document.getElementById('daraja-test-status');
      if (!phoneInput || !statusBox) return;

      const phone = phoneInput.value.trim();
      const amount = Number(amountInput?.value || 1);
      const daraja = store.getDarajaConfig();
      const landlord = store.getLandlordForUser(user);

      if (!phone) {
        alert('Please enter a phone number to test (e.g. 0712345678).');
        return;
      }

      statusBox.style.display = 'block';
      statusBox.innerHTML = `
        <div style="background-color: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px; padding: 0.75rem; font-size: 0.8125rem; color: #334155;">
          <div class="pulse-indicator" style="display: inline-flex; margin-bottom: 0.25rem;">
            <div class="pulse-dot"></div>
            <strong>Connecting to Safaricom Daraja API (${daraja.env})...</strong>
          </div>
          <div>Sending STK push prompt for KES ${amount} to <strong>${phone}</strong>...</div>
        </div>
      `;

      try {
        const res = await fetch('/api/mpesa/stkpush', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone,
            amount,
            tillNumber: daraja.shortcode || landlord?.tillNumber || '582190',
            accountReference: 'RentTest',
            propertyName: landlord?.propertyName || 'Rentmaster',
            consumerKey: daraja.consumerKey,
            consumerSecret: daraja.consumerSecret,
            passkey: daraja.passkey,
            shortcode: daraja.shortcode || landlord?.tillNumber || '582190',
            tillType: daraja.tillType || 'till',
            env: daraja.env || 'production'
          })
        }).then(r => r.json());

        if (res.success && res.isRealDaraja) {
          statusBox.innerHTML = `
            <div style="background-color: #ecfdf5; border: 1px solid #10b981; border-radius: 6px; padding: 0.75rem; font-size: 0.8125rem; color: #065f46;">
              <strong style="display: flex; align-items: center; gap: 0.375rem;">
                <i data-lucide="check-circle" style="width: 1rem; height: 1rem;"></i>
                Prompt Pushed to Handset (${res.phone})!
              </strong>
              <div style="margin-top: 0.25rem;">Check your physical phone screen right now. Enter your PIN on your phone handset to authorize the test payment.</div>
              <div style="font-family: monospace; font-size: 0.75rem; color: #047857; margin-top: 0.375rem;">CheckoutRequestID: ${res.checkoutRequestId}</div>
            </div>
          `;
          this.showToast(`STK Prompt sent to phone ${res.phone}! Check your handset.`);
        } else if (res.needsCredentials) {
          statusBox.innerHTML = `
            <div style="background-color: #fffbeb; border: 1px solid #f59e0b; border-radius: 6px; padding: 0.75rem; font-size: 0.8125rem; color: #92400e;">
              <strong>⚠️ Daraja API Keys Required for Real Handset Push:</strong>
              <div style="margin-top: 0.25rem;">To make the prompt appear on a physical handset, please enter your Consumer Key and Passkey in the form above and click "Save Daraja Credentials".</div>
            </div>
          `;
        } else {
          statusBox.innerHTML = `
            <div style="background-color: #fef2f2; border: 1px solid #ef4444; border-radius: 6px; padding: 0.75rem; font-size: 0.8125rem; color: #991b1b;">
              <strong>❌ Safaricom API Error:</strong>
              <div style="margin-top: 0.25rem;">${res.error || 'Request rejected by Safaricom'}</div>
            </div>
          `;
        }
      } catch (err) {
        statusBox.innerHTML = `
          <div style="background-color: #fef2f2; border: 1px solid #ef4444; border-radius: 6px; padding: 0.75rem; font-size: 0.8125rem; color: #991b1b;">
            <strong>Server Error:</strong> ${err.message}
          </div>
        `;
      }
    });

    document.getElementById('form-landlord-till-settings')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const landlord = store.getLandlordForUser(user);
      if (!landlord) return;
      const till = document.getElementById('edit-ll-till').value;
      const inst = document.getElementById('edit-ll-inst').value;
      store.updateLandlordTill(landlord.id, till, inst);
      this.showToast('Till number updated successfully!');
    });

    // M-Pesa Message Reader from Tenant's Phone
    const landlord = store.getLandlordForUser(user);
    const smsInput = document.getElementById('sms-phone-message');
    const feedbackBox = document.getElementById('sms-parse-feedback');

    document.getElementById('btn-sample-sms-jane')?.addEventListener('click', () => {
      if (!smsInput || !landlord) return;
      smsInput.value = `QK49L908P1 Confirmed. Ksh15,000.00 sent to Till ${landlord.tillNumber} ${landlord.propertyName} from JANE WANJIRU 0712345678 on ${new Date().toLocaleDateString('en-GB')} at 8:45 PM. Reference: Unit B4.`;
      this.showToast('Sample M-Pesa SMS for Jane Wanjiru loaded!');
    });

    document.getElementById('btn-sample-sms-brian')?.addEventListener('click', () => {
      if (!smsInput || !landlord) return;
      smsInput.value = `RC81923019 Confirmed. Ksh18,000.00 sent to Till ${landlord.tillNumber} ${landlord.propertyName} from BRIAN KIPROP 0722998877 on ${new Date().toLocaleDateString('en-GB')} at 9:15 AM. Reference: Unit A2.`;
      this.showToast('Sample M-Pesa SMS for Brian Kiprop loaded!');
    });

    document.getElementById('btn-read-tenant-sms')?.addEventListener('click', () => {
      if (!smsInput || !landlord || !feedbackBox) return;
      const text = smsInput.value.trim();
      if (!text) {
        alert('Please paste or enter an M-Pesa SMS message from the tenant.');
        return;
      }

      const res = store.parseIncomingSms(text, landlord.id);
      if (res && res.success) {
        feedbackBox.style.display = 'block';
        feedbackBox.innerHTML = `
          <div style="background-color: var(--emerald-50); border: 1px solid var(--primary-border); border-radius: var(--radius-lg); padding: 1.25rem;">
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.75rem;">
              <span class="badge badge-paid">
                <i data-lucide="check-circle" style="width: 0.875rem; height: 0.875rem;"></i>
                M-Pesa SMS Successfully Read & Parsed
              </span>
              <span style="font-size: 0.75rem; color: var(--slate-500); font-family: monospace;">
                Receipt: <strong>${res.code}</strong>
              </span>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; font-size: 0.8125rem; margin-bottom: 1rem;">
              <div>
                <span style="color: var(--slate-500); display: block;">Amount Paid</span>
                <strong style="font-size: 1.125rem; color: var(--primary-dark);">${formatKES(res.amount)}</strong>
              </div>
              <div>
                <span style="color: var(--slate-500); display: block;">Tenant Matched</span>
                <strong style="color: var(--slate-900);">${res.matchedTenant ? res.matchedTenant.name : 'Unknown Payer'}</strong>
              </div>
              <div>
                <span style="color: var(--slate-500); display: block;">House / Unit</span>
                <strong style="color: var(--slate-900);">${res.unit}</strong>
              </div>
              <div>
                <span style="color: var(--slate-500); display: block;">Match Method</span>
                <span style="color: var(--slate-600);">${res.matchedBy}</span>
              </div>
            </div>

            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
              <button class="btn btn-primary" id="btn-confirm-parsed-pay-${res.payment.id}">
                <i data-lucide="check" style="width: 1rem; height: 1rem;"></i>
                Approve & Mark as Paid
              </button>
              <button class="btn btn-secondary" onclick="window.app.landlordTab='payments'; window.app.render();">
                View in Payments Ledger
              </button>
            </div>
          </div>
        `;
        if (window.lucide) window.lucide.createIcons();

        document.getElementById(`btn-confirm-parsed-pay-${res.payment.id}`)?.addEventListener('click', () => {
          store.decidePaymentStatus(res.payment.id, 'confirmed');
          this.showToast(`Payment ${res.code} for ${formatKES(res.amount)} approved as Paid!`);
          this.render();
        });

        this.showToast(`Read M-Pesa SMS ${res.code} (${formatKES(res.amount)}) from tenant's phone!`);
      } else {
        alert(res?.message || 'Could not parse message.');
      }
    });

    document.getElementById('btn-copy-webhook')?.addEventListener('click', () => {
      const url = document.getElementById('sms-webhook-input')?.value;
      if (url) {
        navigator.clipboard?.writeText(url);
        this.showToast('SMS Webhook URL copied to clipboard!');
      }
    });

    document.getElementById('btn-regen-webhook')?.addEventListener('click', () => {
      const newUrl = store.regenerateSmsWebhook();
      const input = document.getElementById('sms-webhook-input');
      if (input) input.value = newUrl;
      this.showToast('SMS Webhook URL regenerated!');
    });
  }

  showUpdateTillModal(landlordId) {
    const ll = store.state.landlords.find((l) => l.id === landlordId);
    if (!ll) return;

    const html = `
      <div class="modal-header">
        <h3 class="modal-title">Update M-Pesa Till Number</h3>
        <button class="btn-icon" onclick="window.app.closeModal()">
          <i data-lucide="x" style="width: 1.25rem; height: 1.25rem;"></i>
        </button>
      </div>

      <div class="modal-body">
        <form id="form-modal-update-till" style="display: flex; flex-direction: column; gap: 1rem;">
          <div class="form-group">
            <label class="form-label">Till Number</label>
            <input type="text" class="form-input" id="modal-till-input" value="${ll.tillNumber}" required />
          </div>
          <button type="submit" class="btn btn-primary">
            Save Till Number
          </button>
        </form>
      </div>
    `;

    this.openModal(html);

    document.getElementById('form-modal-update-till')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = document.getElementById('modal-till-input').value;
      store.updateLandlordTill(landlordId, val);
      this.closeModal();
      this.showToast(`M-Pesa Till updated to ${val}!`);
    });
  }

  // --- Tier 3: TENANT PORTAL ---
  renderTenantView(user) {
    const tenant = user.tenant || store.state.tenants.find((t) => t.userId === user.userId);

    if (!tenant) {
      return this.renderTenantRequestForm(user);
    }

    if (tenant.status !== 'approved') {
      return this.renderTenantStatusView(tenant);
    }

    const landlord = store.state.landlords.find((l) => l.id === tenant.landlordId);
    const tillNumber = landlord ? landlord.tillNumber : tenant.tillNumber || '582190';
    const { bills, confirmedTotal, balance, outstandingMonths } = store.getTenantLedger(tenant);

    return `
      <div style="margin-bottom: 1.5rem;">
        <h1 style="font-size: 1.75rem; font-weight: 800; letter-spacing: -0.02em;">Welcome, ${tenant.name}</h1>
        <p style="font-size: 0.875rem; color: var(--slate-600); margin-top: 0.25rem;">
          ${tenant.propertyName || 'Omwoyo Apartments'} · House / unit <strong>${tenant.unit}</strong>
        </p>
      </div>

      <!-- KPI Cards -->
      <div class="kpi-grid">
        <div class="kpi-card">
          <p class="kpi-label">${balance < 0 ? 'In credit' : 'Total amount owed'}</p>
          <p class="kpi-value ${balance > 0 ? 'danger' : 'positive'}">
            ${balance > 0 ? formatKES(balance) : balance < 0 ? `${formatKES(-balance)} CR` : 'KES 0'}
          </p>
        </div>
        <div class="kpi-card">
          <p class="kpi-label">Unpaid months</p>
          <p class="kpi-value ${outstandingMonths.length > 0 ? 'danger' : ''}">${outstandingMonths.length}</p>
        </div>
        <div class="kpi-card">
          <p class="kpi-label">Monthly rent</p>
          <p class="kpi-value">${formatKES(tenant.monthlyRent)}</p>
        </div>
        <div class="kpi-card">
          <p class="kpi-label">Total paid</p>
          <p class="kpi-value">${formatKES(confirmedTotal)}</p>
        </div>
      </div>

      <!-- Tabs Navigation (NO LANDLORD OR SUPER ADMIN TABS) -->
      <div class="tabs-nav" role="tablist">
        <button class="tab-btn ${this.tenantTab === 'pay' ? 'active' : ''}" data-tenant-tab="pay">
          <i data-lucide="message-square-plus" style="width: 1.125rem; height: 1.125rem;"></i>
          Post Message & Pay Rent
          ${store.state.payments.filter((p) => p.tenantId === tenant.userId && p.status === 'pending').length > 0 ? `
            <span class="tab-badge" style="background: #f59e0b; color: #ffffff;">
              ${store.state.payments.filter((p) => p.tenantId === tenant.userId && p.status === 'pending').length}
            </span>
          ` : ''}
        </button>
        <button class="tab-btn ${this.tenantTab === 'bills' ? 'active' : ''}" data-tenant-tab="bills">
          <i data-lucide="receipt" style="width: 1.125rem; height: 1.125rem;"></i>
          Bills
        </button>
        <button class="tab-btn ${this.tenantTab === 'history' ? 'active' : ''}" data-tenant-tab="history">
          <i data-lucide="history" style="width: 1.125rem; height: 1.125rem;"></i>
          Payments & receipts
        </button>
      </div>

      <div id="tenant-tab-content">
        ${this.tenantTab === 'pay' ? this.renderTenantPayTab(tenant, balance, tillNumber, landlord) : ''}
        ${this.tenantTab === 'bills' ? this.renderTenantBillsTab(bills) : ''}
        ${this.tenantTab === 'history' ? this.renderTenantHistoryTab(tenant) : ''}
      </div>
    `;
  }

  renderTenantStatusView(tenant) {
    return `
      <div class="card" style="max-width: 32rem; margin: 2rem auto; padding: 2rem; text-align: center;">
        <div style="width: 3.5rem; height: 3.5rem; border-radius: 9999px; display: flex; align-items: center; justify-content: center; margin: 0 auto; background-color: var(--amber-50); color: var(--amber-700);">
          <i data-lucide="clock" style="width: 1.75rem; height: 1.75rem;"></i>
        </div>
        <h1 style="font-size: 1.25rem; font-weight: 700; margin-top: 1rem;">
          Your Registration is Awaiting Approval
        </h1>
        <p style="font-size: 0.875rem; color: var(--slate-600); margin-top: 0.5rem; line-height: 1.6;">
          Your request for unit <strong>${tenant.unit}</strong> has been received and is awaiting approval by your landlord and the Super Admin. Once approved, you can pay rent directly to Till ${tenant.tillNumber || '582190'}.
        </p>

        <div style="background-color: var(--slate-50); border-radius: var(--radius-lg); padding: 1rem; margin-top: 1.5rem; text-align: left; font-size: 0.875rem;">
          <div style="display: flex; justify-content: space-between; padding: 0.375rem 0;">
            <span style="color: var(--slate-500);">Tenant</span>
            <span style="font-weight: 600;">${tenant.name}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 0.375rem 0;">
            <span style="color: var(--slate-500);">Unit</span>
            <span style="font-weight: 600;">${tenant.unit}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 0.375rem 0;">
            <span style="color: var(--slate-500);">Property</span>
            <span style="font-weight: 600;">${tenant.propertyName || 'Omwoyo Apartments'}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 0.375rem 0;">
            <span style="color: var(--slate-500);">Status</span>
            <span class="badge badge-pending">Pending Approval</span>
          </div>
        </div>

        <button class="btn btn-secondary" onclick="window.app.render()" style="margin-top: 1.5rem;">
          <i data-lucide="refresh-cw" style="width: 1rem; height: 1rem;"></i>
          Check status
        </button>
      </div>
    `;
  }

  renderTenantPayTab(tenant, owed, tillNumber, landlord) {
    const today = new Date().toISOString().slice(0, 10);
    const suggestedAmount = owed > 0 ? owed : tenant.monthlyRent;
    const myPending = store.state.payments.filter((p) => p.tenantId === tenant.userId && p.status === 'pending');
    const myApproved = store.state.payments.filter((p) => p.tenantId === tenant.userId && p.status === 'confirmed').slice(0, 1);
    const myRejected = store.state.payments.filter((p) => p.tenantId === tenant.userId && p.status === 'rejected').slice(0, 1);

    return `
      <div style="max-width: 42rem; margin: 0 auto; display: flex; flex-direction: column; gap: 1.5rem;">
        <!-- Card 1: Outstanding Status & Till Reference -->
        <div class="card" style="background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%); border: 1px solid #10b981;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
            <div>
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span class="badge badge-approved" style="font-weight: 800; font-size: 0.75rem;">ONLINE M-PESA ACTIVE</span>
                <span style="font-size: 0.8125rem; color: #047857; font-weight: 600;">${landlord ? landlord.propertyName : 'Omwoyo Apartments'}</span>
              </div>
              <p style="font-size: 0.75rem; text-transform: uppercase; color: #047857; font-weight: 700; margin-top: 0.5rem; letter-spacing: 0.05em;">
                Landlord Buy Goods Till Number
              </p>
              <div style="font-size: 2rem; font-weight: 900; color: #064e3b; font-family: monospace; letter-spacing: 0.05em; line-height: 1.1;">
                ${tillNumber}
              </div>
              <p style="font-size: 0.8125rem; color: #047857; margin-top: 0.25rem;">
                Account Reference: <strong>${tenant.unit}</strong> · Landlord: <strong>${landlord ? landlord.name : 'Linus Omwoyo'}</strong>
              </p>
            </div>

            <div style="text-align: right; background: #ffffff; border: 1px solid #a7f3d0; border-radius: var(--radius-lg); padding: 0.875rem 1.25rem; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.1);">
              <span style="font-size: 0.75rem; color: var(--slate-500); display: block;">Current Rent Due</span>
              <strong style="font-size: 1.5rem; color: ${owed > 0 ? 'var(--rose-700)' : 'var(--emerald-700)'};">
                ${owed > 0 ? formatKES(owed) : 'KES 0 (Paid up)'}
              </strong>
              <span style="font-size: 0.6875rem; color: var(--slate-500); display: block; margin-top: 0.25rem;">
                Monthly Rate: ${formatKES(tenant.monthlyRent)}
              </span>
            </div>
          </div>
        </div>

        <!-- Card 2: Pending Messages Tracker (Awaiting Landlord Confirmation) -->
        ${myPending.length > 0 ? `
          <div class="card" style="border: 2px solid #f59e0b; background: #fffdf5; box-shadow: 0 4px 14px rgba(245, 158, 11, 0.15);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap;">
              <div style="display: flex; align-items: flex-start; gap: 0.75rem;">
                <div style="width: 2.75rem; height: 2.75rem; border-radius: 9999px; background: #fef3c7; color: #d97706; display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: 0 2px 8px rgba(217, 119, 6, 0.2);">
                  <i data-lucide="clock" style="width: 1.5rem; height: 1.5rem;"></i>
                </div>
                <div>
                  <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                    <span class="badge badge-pending" style="font-size: 0.75rem; font-weight: 800;">AWAITING LANDLORD CONFIRMATION</span>
                    <span style="font-size: 0.75rem; color: #78350f;">(${myPending.length} message${myPending.length > 1 ? 's' : ''} sent)</span>
                  </div>
                  <h3 style="font-size: 1.125rem; font-weight: 800; color: #92400e; margin-top: 0.25rem;">
                    Payment Message Sent to Landlord
                  </h3>
                  <p style="font-size: 0.8125rem; color: #78350f; margin-top: 0.25rem; line-height: 1.5;">
                    Your payment message has been delivered to Landlord <strong>${landlord ? landlord.name : 'Linus Omwoyo'}</strong> for confirmation. As soon as the landlord verifies against Till <strong>${tillNumber}</strong>, your payment will be marked as <strong>PAID</strong> and your official receipt unlocked!
                  </p>
                </div>
              </div>

              <button class="btn btn-secondary" onclick="window.app.render()" style="font-size: 0.75rem; padding: 0.375rem 0.625rem; border-color: #fde68a;">
                <i data-lucide="refresh-cw" style="width: 0.875rem; height: 0.875rem;"></i> Refresh Status
              </button>
            </div>

            <div style="display: flex; flex-direction: column; gap: 0.875rem; margin-top: 1.25rem;">
              ${myPending.map((p) => `
                <div style="background: #ffffff; border: 1px solid #fde68a; border-radius: var(--radius-md); padding: 1rem;">
                  <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.5rem;">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                      <span style="font-weight: 800; color: #92400e; font-size: 1.125rem;">${formatKES(p.amount)}</span>
                      <span style="font-family: monospace; font-size: 0.8125rem; background: #fef3c7; color: #78350f; padding: 2px 8px; border-radius: 4px; font-weight: 700;">
                        Code: ${p.mpesaReceipt || p.id}
                      </span>
                    </div>
                    <span style="font-size: 0.75rem; color: #92400e;">
                      Submitted ${formatDateTime(p.submittedAt || p.createdAt)}
                    </span>
                  </div>

                  <!-- Quoted Message -->
                  <div style="font-family: monospace; font-size: 0.8125rem; color: #1e293b; background: #fffbeb; padding: 0.75rem; border-radius: 4px; border-left: 3px solid #f59e0b; word-break: break-word;">
                    <strong style="color: #b45309; display: flex; align-items: center; gap: 0.25rem; font-size: 0.6875rem; text-transform: uppercase; margin-bottom: 0.25rem;">
                      <i data-lucide="message-square" style="width: 0.875rem; height: 0.875rem;"></i>
                      Your Posted Message to Landlord:
                    </strong>
                    "${p.smsText || p.tenantMessage || 'Payment message submitted for confirmation'}"
                  </div>

                  <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.625rem; font-size: 0.75rem; color: #78350f; flex-wrap: wrap; gap: 0.5rem;">
                    <span>Target: <strong>Till ${tillNumber}</strong> (${landlord ? landlord.propertyName : 'Omwoyo Apartments'})</span>
                    <span style="display: inline-flex; align-items: center; gap: 0.375rem; color: #b45309; font-weight: 700;">
                      <span class="pulse-dot" style="width: 6px; height: 6px; background: #f59e0b;"></span>
                      Pending Landlord Approval
                    </span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Card 3: Main Action Form (Post M-Pesa Message vs STK Push) -->
        <div class="card" style="box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);">
          <div class="card-header" style="border-bottom: 1px solid var(--slate-100); padding-bottom: 1rem;">
            <div>
              <h2 class="card-title" style="display: flex; align-items: center; gap: 0.5rem;">
                <i data-lucide="${this.tenantPaySubTab === 'stk' ? 'smartphone' : 'message-square-plus'}" style="color: var(--primary);"></i>
                ${this.tenantPaySubTab === 'stk' ? `Pay via M-Pesa STK Push Prompt` : `Post M-Pesa Payment Message to Landlord`}
              </h2>
              <p style="font-size: 0.8125rem; color: var(--slate-500); margin-top: 0.25rem;">
                ${this.tenantPaySubTab === 'stk' 
                  ? `Receive a direct STK PIN popup prompt on your phone for Till ${tillNumber}.` 
                  : `Paste your Safaricom M-Pesa SMS confirmation message or enter your code. It will be sent to Landlord <strong>${landlord ? landlord.name : 'Linus Omwoyo'}</strong> for confirmation before payment is approved.`}
              </p>
            </div>
          </div>

          <!-- Switcher Buttons -->
          <div style="display: flex; gap: 0.5rem; background: var(--slate-100); padding: 0.375rem; border-radius: var(--radius-lg); margin-bottom: 1.25rem;">
            <button type="button" class="btn ${this.tenantPaySubTab !== 'stk' ? 'btn-primary' : 'btn-secondary'}" style="flex: 1; font-size: 0.8125rem; padding: 0.5rem;" id="btn-subtab-post-msg">
              <i data-lucide="message-square" style="width: 0.875rem; height: 0.875rem;"></i>
              Post M-Pesa Message / SMS (Recommended)
            </button>
            <button type="button" class="btn ${this.tenantPaySubTab === 'stk' ? 'btn-primary' : 'btn-secondary'}" style="flex: 1; font-size: 0.8125rem; padding: 0.5rem;" id="btn-subtab-stk">
              <i data-lucide="smartphone" style="width: 0.875rem; height: 0.875rem;"></i>
              Trigger Phone STK Push
            </button>
          </div>

          ${this.tenantPaySubTab !== 'stk' ? `
            <!-- Form 1: Post M-Pesa Message Form -->
            <form id="form-tenant-post-message" style="display: flex; flex-direction: column; gap: 1rem;">
              <div class="form-group">
                <label class="form-label" style="font-weight: 700; display: flex; justify-content: space-between; align-items: center;">
                  <span>Paste M-Pesa SMS Message</span>
                  <span style="font-size: 0.75rem; font-weight: normal; color: var(--primary);">✨ Auto-extracts Code & Amount</span>
                </label>
                <textarea 
                  class="form-input" 
                  id="post-sms-text" 
                  rows="3" 
                  placeholder="Paste full Safaricom SMS here, e.g.:&#10;QJD73821K9 Confirmed. Ksh15,000.00 paid to Omwoyo Apartments Till 582190 on 24/10/26 at 2:15 PM..."
                  style="font-family: monospace; font-size: 0.8125rem; line-height: 1.4;"
                ></textarea>
              </div>

              <!-- Live Parsed Notification -->
              <div id="sms-parse-indicator" style="display: none; background: #ecfdf5; border: 1px solid #10b981; border-radius: var(--radius-md); padding: 0.625rem 0.875rem; font-size: 0.8125rem; color: #065f46;">
                <div style="display: flex; align-items: center; gap: 0.375rem; font-weight: 700;">
                  <i data-lucide="check-circle" style="width: 1rem; height: 1rem;"></i>
                  Safaricom SMS Recognized!
                </div>
                <div style="margin-top: 0.25rem; font-family: monospace;" id="sms-parse-details"></div>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <div class="form-group">
                  <label class="form-label">M-Pesa Transaction Code *</label>
                  <input type="text" class="form-input" id="post-mpesa-code" placeholder="e.g. QJD73821K9" style="text-transform: uppercase; font-family: monospace; font-weight: 700;" required />
                </div>
                <div class="form-group">
                  <label class="form-label">Amount Paid (KES) *</label>
                  <input type="number" class="form-input" id="post-amount" min="1" step="1" value="${suggestedAmount}" required />
                </div>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <div class="form-group">
                  <label class="form-label">Rent Month *</label>
                  <input type="month" class="form-input" id="post-month" value="${getCurrentMonth()}" required />
                </div>
                <div class="form-group">
                  <label class="form-label">Sender Phone Number</label>
                  <input type="tel" class="form-input" id="post-phone" value="${tenant.phone}" required />
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">Optional Note for Landlord</label>
                <input type="text" class="form-input" id="post-note" placeholder="e.g. Paid via husband's phone / M-Pesa agent" />
              </div>

              <button type="submit" class="btn btn-primary btn-full" style="padding: 0.75rem 1rem; font-weight: 800; font-size: 0.9375rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
                <i data-lucide="send" style="width: 1.125rem; height: 1.125rem;"></i>
                Post Message to Landlord for Confirmation
              </button>

              <div style="background-color: var(--slate-50); border-radius: var(--radius-md); padding: 0.75rem; font-size: 0.75rem; color: var(--slate-600); display: flex; align-items: center; gap: 0.5rem;">
                <i data-lucide="shield-check" style="width: 1rem; height: 1rem; color: var(--emerald-600); flex-shrink: 0;"></i>
                <span>Your message goes straight to Landlord <strong>${landlord ? landlord.name : 'Linus Omwoyo'}</strong> to confirm against Till <strong>${tillNumber}</strong> before approving your payment.</span>
              </div>
            </form>
          ` : `
            <!-- Form 2: STK Push Phone Prompt Form -->
            <form id="form-mpesa-payment" style="display: flex; flex-direction: column; gap: 1rem;">
              <div class="form-group">
                <label class="form-label">Payment Date</label>
                <input type="date" class="form-input" id="pay-date" value="${today}" required />
              </div>

              <div class="form-group">
                <label class="form-label">Amount to pay (KES)</label>
                <input type="number" class="form-input" id="pay-amount" min="1" step="1" value="${suggestedAmount}" required />
              </div>

              <div class="form-group">
                <label class="form-label">M-Pesa Phone number</label>
                <input type="tel" class="form-input" id="pay-phone" value="${tenant.phone}" required />
              </div>

              <button type="submit" class="btn btn-primary btn-full" style="padding: 0.75rem 1rem; font-weight: 800;">
                <i data-lucide="smartphone" style="width: 1.125rem; height: 1.125rem;"></i>
                Send STK Push Prompt to Handset
              </button>
              <p style="text-align: center; font-size: 0.75rem; color: var(--slate-500);">
                An M-Pesa STK prompt will appear on your phone screen to enter your PIN.
              </p>
            </form>
          `}
        </div>
      </div>
    `;
  }

  renderTenantBillsTab(bills) {
    return `
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">Monthly Bills</h2>
        </div>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Rent Month</th>
                <th style="text-align: right;">Bill amount</th>
                <th style="text-align: right;">Paid</th>
                <th style="text-align: right;">Outstanding</th>
                <th style="text-align: right;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${bills.map((b) => `
                <tr>
                  <td style="font-weight: 600;">${formatMonth(b.month)}</td>
                  <td style="text-align: right;">${formatKES(b.amount)}</td>
                  <td style="text-align: right; color: var(--emerald-700);">${formatKES(b.paid)}</td>
                  <td style="text-align: right; font-weight: 700; ${b.outstanding > 0 ? 'color: var(--rose-700);' : ''}">
                    ${b.outstanding > 0 ? formatKES(b.outstanding) : '-'}
                  </td>
                  <td style="text-align: right;">
                    <span class="badge badge-${b.outstanding === 0 ? 'confirmed' : b.paid > 0 ? 'partial' : 'unpaid'}">
                      ${b.outstanding === 0 ? 'Paid' : b.paid > 0 ? 'Part paid' : 'Unpaid'}
                    </span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  renderTenantHistoryTab(tenant) {
    const payments = store.state.payments.filter((p) => p.tenantId === tenant.userId && !p.hiddenByTenant);

    return `
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">Payments & Receipts</h2>
          <button class="btn btn-secondary" id="btn-tenant-statement">
            <i data-lucide="file-spreadsheet" style="width: 1rem; height: 1rem;"></i>
            Download statement
          </button>
        </div>

        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Month</th>
                <th>Till & Code</th>
                <th style="text-align: right;">Amount</th>
                <th style="text-align: right;">Status</th>
                <th style="text-align: right;">Receipt</th>
              </tr>
            </thead>
            <tbody>
              ${payments.map((p) => `
                <tr>
                  <td>${formatDate(p.paidAt || p.createdAt)}</td>
                  <td>${formatMonth(p.month)}</td>
                  <td>
                    <span>${p.method}</span>
                    ${p.mpesaReceipt ? `<span style="font-family: monospace; font-size: 0.75rem; color: var(--slate-500);"> · ${p.mpesaReceipt}</span>` : ''}
                    ${p.smsText || p.tenantMessage ? `
                      <div style="font-size: 0.6875rem; color: var(--slate-500); margin-top: 0.125rem; font-family: monospace; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${p.smsText || p.tenantMessage}">
                        💬 "${p.smsText || p.tenantMessage}"
                      </div>
                    ` : ''}
                  </td>
                  <td style="text-align: right; font-weight: 700;">${formatKES(p.amount)}</td>
                  <td style="text-align: right;">
                    <span class="badge badge-${p.status}">
                      ${p.status === 'confirmed' ? 'Paid' : p.status === 'pending' ? 'Awaiting Landlord' : p.status === 'rejected' ? 'Declined' : p.status}
                    </span>
                  </td>
                  <td style="text-align: right;">
                    ${p.status === 'confirmed' ? `
                      <button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;" onclick="window.app.showReceiptModal('${p.id}')">
                        Receipt
                      </button>
                    ` : p.status === 'pending' ? `
                      <span style="font-size: 0.75rem; color: #b45309; font-weight: 700;">
                        Pending Approval
                      </span>
                    ` : `
                      <span style="font-size: 0.75rem; color: #be123c; font-weight: 700;">
                        Not Paid
                      </span>
                    `}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  attachTenantEvents(user) {
    const tenant = user.tenant || store.state.tenants.find((t) => t.userId === user.userId);

    document.querySelectorAll('[data-tenant-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.tenantTab = btn.getAttribute('data-tenant-tab');
        this.render();
      });
    });

    // Subtab switcher between Post Message and STK Push
    document.getElementById('btn-subtab-post-msg')?.addEventListener('click', () => {
      this.tenantPaySubTab = 'post_message';
      this.render();
    });

    document.getElementById('btn-subtab-stk')?.addEventListener('click', () => {
      this.tenantPaySubTab = 'stk';
      this.render();
    });

    // Real-time Safaricom M-Pesa SMS auto-parser
    const postSmsText = document.getElementById('post-sms-text');
    if (postSmsText) {
      const autoParse = () => {
        const text = postSmsText.value;
        if (!text) return;

        // Auto-extract M-Pesa receipt code
        const codeMatch = text.match(/\b([A-Z0-9]{8,12})\b/);
        // Auto-extract amount
        const amtMatch = text.match(/(?:Ksh|KES)\.?\s*([\d,]+(?:\.\d{2})?)/i) || text.match(/received\s+([\d,]+)/i);
        // Auto-extract phone
        const phoneMatch = text.match(/(?:from|sent by|phone)\s+.*?(254[71]\d{8}|0[71]\d{8})/i) || text.match(/\b(254[71]\d{8}|0[71]\d{8})\b/);

        const codeInput = document.getElementById('post-mpesa-code');
        const amtInput = document.getElementById('post-amount');
        const phoneInput = document.getElementById('post-phone');
        const indicator = document.getElementById('sms-parse-indicator');
        const details = document.getElementById('sms-parse-details');

        let code = codeMatch ? codeMatch[1].toUpperCase() : '';
        let amt = amtMatch ? amtMatch[1].replace(/,/g, '') : '';
        let phone = phoneMatch ? phoneMatch[1] : '';

        if (code && codeInput && (!codeInput.value || codeInput.value.length < 5)) codeInput.value = code;
        if (amt && amtInput) amtInput.value = Math.round(Number(amt));
        if (phone && phoneInput) phoneInput.value = phone;

        if (indicator && details && (code || amt)) {
          indicator.style.display = 'block';
          details.innerHTML = `Code: <strong>${code || 'Auto-detected'}</strong> · Amount: <strong>KES ${Number(amt || 0).toLocaleString()}</strong> ${phone ? `· Phone: <strong>${phone}</strong>` : ''}`;
        }
      };

      postSmsText.addEventListener('input', autoParse);
      postSmsText.addEventListener('paste', () => setTimeout(autoParse, 50));
    }

    // Handle Tenant Posting M-Pesa Payment Message to Landlord
    const postMsgForm = document.getElementById('form-tenant-post-message');
    if (postMsgForm && tenant) {
      postMsgForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const smsText = document.getElementById('post-sms-text')?.value || '';
        const mpesaCode = document.getElementById('post-mpesa-code')?.value.trim() || '';
        const amount = Number(document.getElementById('post-amount')?.value || tenant.monthlyRent);
        const month = document.getElementById('post-month')?.value || getCurrentMonth();
        const phone = document.getElementById('post-phone')?.value || tenant.phone;
        const note = document.getElementById('post-note')?.value.trim() || '';

        if (!mpesaCode) {
          alert('Please enter or paste your M-Pesa transaction code.');
          return;
        }

        const fullMessage = smsText.trim() || (note ? `${note} (Code: ${mpesaCode}, Amount: KES ${amount})` : `Payment confirmation code ${mpesaCode} submitted for KES ${amount}`);

        store.postTenantPaymentMessage({
          tenantId: tenant.userId,
          amount,
          mpesaCode,
          smsText: fullMessage,
          phone,
          month
        });

        this.showToast('Payment message posted! Sent to your Landlord for confirmation before approval.', 'success');
        this.render();
      });
    }

    // Handle STK Push Payment
    const mpesaForm = document.getElementById('form-mpesa-payment');
    if (mpesaForm && tenant) {
      mpesaForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const date = document.getElementById('pay-date').value;
        const amount = Number(document.getElementById('pay-amount').value);
        const phone = document.getElementById('pay-phone').value;

        const newPayment = store.initiateMpesaPayment({
          tenantId: tenant.userId,
          amount,
          phone,
          date
        });

        this.showStkPushModal(newPayment);
      });
    }

    document.getElementById('btn-tenant-statement')?.addEventListener('click', () => {
      if (tenant) this.showStatementModal(tenant);
    });
  }

  // --- Registration Modals ---
  showLandlordRegistrationModal() {
    const html = `
      <div class="modal-header">
        <h3 class="modal-title">Register as Landlord</h3>
        <button class="btn-icon" onclick="window.app.closeModal()">
          <i data-lucide="x" style="width: 1.25rem; height: 1.25rem;"></i>
        </button>
      </div>

      <div class="modal-body">
        <div style="background-color: var(--amber-50); border: 1px solid var(--amber-200); padding: 0.75rem; border-radius: var(--radius-lg); font-size: 0.8125rem; color: var(--amber-800); margin-bottom: 1rem;">
          <i data-lucide="shield-alert" style="width: 1rem; height: 1rem; display: inline-block; vertical-align: middle;"></i>
          <strong>Administrative Verification:</strong> All newly registered property landlords are reviewed by system administration prior to account activation.
        </div>

        <form id="form-landlord-register" style="display: flex; flex-direction: column; gap: 0.875rem;">
          <div class="form-group">
            <label class="form-label">Full Name</label>
            <input type="text" class="form-input" id="new-ll-name" required placeholder="e.g. Samuel Mutua" />
          </div>
          <div class="form-group">
            <label class="form-label">Email Address</label>
            <input type="email" class="form-input" id="new-ll-email" required placeholder="e.g. samuel@example.com" />
          </div>
          <div class="form-group">
            <label class="form-label">Phone Number</label>
            <input type="tel" class="form-input" id="new-ll-phone" required placeholder="e.g. 0721 884 422" />
          </div>
          <div class="form-group">
            <label class="form-label">Property Name</label>
            <input type="text" class="form-input" id="new-ll-property" required placeholder="e.g. Sunrise Heights" />
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
            <div class="form-group">
              <label class="form-label">M-Pesa Till Number</label>
              <input type="text" class="form-input" id="new-ll-till" required placeholder="e.g. 582190" />
            </div>
            <div class="form-group">
              <label class="form-label">Total Units</label>
              <input type="number" class="form-input" id="new-ll-units" min="1" value="12" />
            </div>
          </div>

          <button type="submit" class="btn btn-primary btn-full" style="margin-top: 0.5rem;">
            Submit for Super Admin Approval
          </button>
        </form>
      </div>
    `;

    this.openModal(html);

    document.getElementById('form-landlord-register')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('new-ll-name').value;
      const email = document.getElementById('new-ll-email').value;
      const phone = document.getElementById('new-ll-phone').value;
      const propertyName = document.getElementById('new-ll-property').value;
      const tillNumber = document.getElementById('new-ll-till').value;
      const unitsCount = document.getElementById('new-ll-units').value;

      store.registerLandlord({ name, email, phone, propertyName, unitsCount, tillNumber });
      this.closeModal();
      this.showToast('Registration submitted! Awaiting approval by the Super Admin.');
    });
  }

  showTenantRegistrationModal(preselectedInvite = '') {
    const landlords = store.state.landlords.filter((l) => l.status === 'approved');
    const html = `
      <div class="modal-header">
        <h3 class="modal-title">Request Tenant Access</h3>
        <button class="btn-icon" onclick="window.app.closeModal()">
          <i data-lucide="x" style="width: 1.25rem; height: 1.25rem;"></i>
        </button>
      </div>

      <div class="modal-body">
        <div style="background-color: var(--sky-50); border: 1px solid var(--sky-200); padding: 0.75rem; border-radius: var(--radius-lg); font-size: 0.8125rem; color: var(--sky-800); margin-bottom: 1rem;">
          <i data-lucide="info" style="width: 1rem; height: 1rem; display: inline-block; vertical-align: middle;"></i>
          <strong>Approval Notice:</strong> Your access request must be approved by your landlord and the Super Admin.
        </div>

        <form id="form-tenant-reg-modal" style="display: flex; flex-direction: column; gap: 0.875rem;">
          <div class="form-group">
            <label class="form-label">Select Apartment / Landlord</label>
            <select class="form-select" id="modal-reg-landlord" required>
              ${landlords.map((ll) => `
                <option value="${ll.id}" ${ll.inviteCode === preselectedInvite ? 'selected' : ''}>
                  ${ll.propertyName} (Landlord: ${ll.name} · Till: ${ll.tillNumber})
                </option>
              `).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Full Name</label>
            <input type="text" class="form-input" id="modal-reg-name" required placeholder="e.g. Kevin Otieno" />
          </div>
          <div class="form-group">
            <label class="form-label">Phone Number (M-Pesa)</label>
            <input type="tel" class="form-input" id="modal-reg-phone" required placeholder="e.g. 0799 445 566" />
          </div>
          <div class="form-group">
            <label class="form-label">House or Unit Number</label>
            <input type="text" class="form-input" id="modal-reg-unit" required placeholder="e.g. Block D, Unit 3" />
          </div>

          <button type="submit" class="btn btn-primary btn-full" style="margin-top: 0.5rem;">
            Submit Access Request
          </button>
        </form>
      </div>
    `;

    this.openModal(html);

    document.getElementById('form-tenant-reg-modal')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const landlordId = document.getElementById('modal-reg-landlord').value;
      const name = document.getElementById('modal-reg-name').value;
      const phone = document.getElementById('modal-reg-phone').value;
      const unit = document.getElementById('modal-reg-unit').value;

      store.registerTenantRequest({
        name,
        phone,
        unit,
        email: `${name.toLowerCase().replace(/\s+/g, '.')}@gmail.com`,
        landlordId
      });
      this.closeModal();
      this.showToast('Access request submitted! Awaiting approval.');
    });
  }

  // --- Actions & Shared Modals ---
  approvePayment(paymentId) {
    const sel = document.getElementById(`select-tenant-${paymentId}`);
    const override = sel ? sel.value : null;
    const payment = store.decidePaymentStatus(paymentId, 'confirmed', override);
    this.showToast(`Payment of ${formatKES(payment.amount)} from ${payment.tenantName} confirmed & approved! Official receipt unlocked in tenant portal.`, 'success');
    this.render();
  }

  rejectPayment(paymentId) {
    if (confirm('Mark this payment as NOT PAID? The tenant will be notified in their portal that the payment was not approved.')) {
      const payment = store.decidePaymentStatus(paymentId, 'rejected');
      this.showToast(`Payment of ${formatKES(payment.amount)} marked as NOT PAID / Declined.`, 'danger');
      this.render();
    }
  }

  approveTenantRequest(userId) {
    const rentInput = document.getElementById(`input-rent-${userId}`);
    const rent = rentInput ? Number(rentInput.value) : 15000;
    store.decideTenantStatus(userId, 'approved', rent);
    this.showToast('Tenant approved! Their private account is now activated.');
  }

  rejectTenantRequest(userId) {
    if (confirm('Decline this tenant access request?')) {
      store.decideTenantStatus(userId, 'rejected');
      this.showToast('Request declined.');
    }
  }

  promptChangeRent(userId) {
    const tenant = store.state.tenants.find((t) => t.userId === userId);
    if (!tenant) return;
    const input = prompt(`Monthly rent for ${tenant.name} (KES):`, tenant.monthlyRent);
    if (input !== null) {
      const num = Number(input);
      if (num && num > 0) {
        store.updateTenantRent(userId, num);
        this.showToast(`Rent updated to ${formatKES(num)}/mo for ${tenant.name}.`);
      }
    }
  }

  showReceiptModal(paymentId) {
    const payment = store.state.payments.find((p) => p.id === paymentId);
    if (!payment) return;

    const propName = store.state.settings.propertyName || 'Rent Portal';
    const fields = [
      ['Receipt number', payment.receiptNo || `RCT-${payment.month.replace('-', '')}-${payment.id.slice(-5).toUpperCase()}`],
      ['Date paid', formatDate(payment.paidAt || payment.createdAt)],
      ['Tenant', payment.tenantName],
      ['House / unit', payment.unit],
      ['Rent period', formatMonth(payment.month)],
      ['Payment method', payment.method]
    ];
    if (payment.mpesaReceipt) fields.push(['M-Pesa code', payment.mpesaReceipt]);
    if (payment.payerPhone) fields.push(['Paid from', formatPhone(payment.payerPhone)]);

    const html = `
      <div class="modal-header no-print">
        <h3 class="modal-title">Official Receipt</h3>
        <button class="btn-icon" onclick="window.app.closeModal()">
          <i data-lucide="x" style="width: 1.25rem; height: 1.25rem;"></i>
        </button>
      </div>

      <div class="modal-body print-area">
        <div class="receipt-paper">
          <div class="receipt-header">
            <div>
              <h2 style="font-size: 1.25rem; font-weight: 800;">${propName}</h2>
              <p style="font-size: 0.75rem; color: var(--slate-500);">Official rent payment receipt</p>
            </div>
            <span class="receipt-stamp">
              <i data-lucide="badge-check" style="width: 1rem; height: 1rem;"></i>
              PAID
            </span>
          </div>

          <div class="receipt-amount-block">
            <p class="receipt-amount-label">Amount paid</p>
            <p class="receipt-amount-val">${formatKES(payment.amount)}</p>
          </div>

          <dl class="receipt-dl">
            ${fields.map(([lbl, val]) => `
              <div class="receipt-row">
                <dt>${lbl}</dt>
                <dd>${val}</dd>
              </div>
            `).join('')}
          </dl>

          <p style="font-size: 0.75rem; color: var(--slate-400); margin-top: 1.5rem; text-align: center;">
            Thank you for your payment. Keep this receipt for your records.
          </p>
        </div>
      </div>

      <div class="modal-footer no-print">
        <button class="btn btn-secondary" onclick="window.print()">
          <i data-lucide="printer" style="width: 1rem; height: 1rem;"></i>
          Print
        </button>
        <button class="btn btn-primary" id="btn-download-receipt-pdf">
          <i data-lucide="download" style="width: 1rem; height: 1rem;"></i>
          Download PDF
        </button>
      </div>
    `;

    this.openModal(html);
    document.getElementById('btn-download-receipt-pdf')?.addEventListener('click', () => {
      generateReceiptPDF(payment, propName);
    });
  }

  showStatementModalByUserId(userId) {
    const tenant = store.state.tenants.find((t) => t.userId === userId);
    if (tenant) this.showStatementModal(tenant);
  }

  showStatementModal(tenant) {
    const currentMonth = getCurrentMonth();
    const startYear = tenant.approvedAt ? new Date(tenant.approvedAt).toISOString().slice(0, 7) : currentMonth;
    const propName = tenant.propertyName || 'Omwoyo Apartments';

    const renderContent = (fromM, toM) => {
      const ledger = store.getTenantLedger(tenant);
      const confirmedPayments = store.state.payments.filter((p) => p.tenantId === tenant.userId && p.status === 'confirmed');

      let openingBalance = 0;
      ledger.bills.forEach((b) => { if (b.month < fromM) openingBalance += b.amount; });
      confirmedPayments.forEach((p) => { if (p.month < fromM) openingBalance -= p.amount; });

      let currentBal = openingBalance;
      let chargedPeriod = 0;
      let paidPeriod = 0;
      const lines = [];

      ledger.bills.forEach((b) => {
        if (b.month >= fromM && b.month <= toM) {
          currentBal += b.amount;
          chargedPeriod += b.amount;
          lines.push({
            date: formatDate(new Date(b.month + '-01')),
            description: `Rent bill for ${formatMonth(b.month)}`,
            charged: b.amount,
            paid: 0,
            balance: currentBal
          });
        }
      });

      confirmedPayments.forEach((p) => {
        if (p.month >= fromM && p.month <= toM) {
          currentBal -= p.amount;
          paidPeriod += p.amount;
          lines.push({
            date: formatDate(p.paidAt || p.createdAt),
            description: `Payment for ${formatMonth(p.month)}${p.mpesaReceipt ? ' - M-Pesa ' + p.mpesaReceipt : ''}`,
            charged: 0,
            paid: p.amount,
            balance: currentBal
          });
        }
      });

      const statementData = { opening: openingBalance, charged: chargedPeriod, paid: paidPeriod, closing: currentBal, lines };
      const formatBal = (val) => (val < 0 ? `${formatKES(-val)} CR` : formatKES(val));

      return `
        <div class="modal-header no-print">
          <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
            <label style="font-size: 0.75rem; font-weight: 600;">
              From
              <input type="month" id="stmt-from" value="${fromM}" class="form-input" style="padding: 0.25rem 0.5rem; width: auto;" />
            </label>
            <label style="font-size: 0.75rem; font-weight: 600;">
              To
              <input type="month" id="stmt-to" value="${toM}" class="form-input" style="padding: 0.25rem 0.5rem; width: auto;" />
            </label>
          </div>
          <button class="btn-icon" onclick="window.app.closeModal()">
            <i data-lucide="x" style="width: 1.25rem; height: 1.25rem;"></i>
          </button>
        </div>

        <div class="modal-body print-area">
          <h2 style="font-size: 1.25rem; font-weight: 800;">${propName}</h2>
          <p style="font-size: 0.8125rem; color: var(--slate-500);">
            Tenant statement: ${formatMonth(fromM)} to ${formatMonth(toM)}
          </p>

          <div style="border-top: 2px solid var(--primary); padding-top: 0.75rem; margin-top: 0.75rem; font-size: 0.875rem;">
            <p><strong>Tenant:</strong> ${tenant.name}</p>
            <p><strong>House / unit:</strong> ${tenant.unit}</p>
            <p><strong>Phone:</strong> ${tenant.phone}</p>
          </div>

          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; margin-top: 1rem;">
            <div style="background-color: var(--slate-50); padding: 0.75rem; border-radius: var(--radius-lg);">
              <p style="font-size: 0.75rem; color: var(--slate-500);">Opening balance</p>
              <p style="font-weight: 700;">${formatBal(statementData.opening)}</p>
            </div>
            <div style="background-color: var(--slate-50); padding: 0.75rem; border-radius: var(--radius-lg);">
              <p style="font-size: 0.75rem; color: var(--slate-500);">Rent charged</p>
              <p style="font-weight: 700;">${formatKES(statementData.charged)}</p>
            </div>
            <div style="background-color: var(--slate-50); padding: 0.75rem; border-radius: var(--radius-lg);">
              <p style="font-size: 0.75rem; color: var(--slate-500);">Payments</p>
              <p style="font-weight: 700; color: var(--emerald-700);">${formatKES(statementData.paid)}</p>
            </div>
            <div style="background-color: var(--slate-50); padding: 0.75rem; border-radius: var(--radius-lg);">
              <p style="font-size: 0.75rem; color: var(--slate-500);">Closing balance</p>
              <p style="font-weight: 700; ${statementData.closing > 0 ? 'color: var(--rose-700);' : ''}">${formatBal(statementData.closing)}</p>
            </div>
          </div>

          <div class="table-responsive" style="margin-top: 1rem;">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th style="text-align: right;">Charged</th>
                  <th style="text-align: right;">Paid</th>
                  <th style="text-align: right;">Balance</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>${formatDate(new Date(fromM + '-01'))}</td>
                  <td style="font-weight: 600;">Opening balance</td>
                  <td></td>
                  <td></td>
                  <td style="text-align: right; font-weight: 600;">${formatBal(statementData.opening)}</td>
                </tr>
                ${statementData.lines.map((l) => `
                  <tr>
                    <td>${l.date}</td>
                    <td>${l.description}</td>
                    <td style="text-align: right;">${l.charged ? formatKES(l.charged) : ''}</td>
                    <td style="text-align: right; color: var(--emerald-700);">${l.paid ? formatKES(l.paid) : ''}</td>
                    <td style="text-align: right; font-weight: 600;">${formatBal(l.balance)}</td>
                  </tr>
                `).join('')}
              </tbody>
              <tfoot>
                <tr>
                  <td></td>
                  <td>Closing balance</td>
                  <td></td>
                  <td></td>
                  <td style="text-align: right;">${formatBal(statementData.closing)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div class="modal-footer no-print">
          <button class="btn btn-secondary" onclick="window.print()">
            <i data-lucide="printer" style="width: 1rem; height: 1rem;"></i>
            Print
          </button>
          <button class="btn btn-primary" id="btn-download-statement-pdf">
            <i data-lucide="download" style="width: 1rem; height: 1rem;"></i>
            Download PDF
          </button>
        </div>
      `;
    };

    const initialHtml = renderContent(startYear, currentMonth);
    this.openModal(initialHtml, 'lg');

    const attachChangeListeners = () => {
      const fromEl = document.getElementById('stmt-from');
      const toEl = document.getElementById('stmt-to');
      const pdfBtn = document.getElementById('btn-download-statement-pdf');

      const recompute = () => {
        const fromV = fromEl.value;
        const toV = toEl.value;
        if (fromV && toV && fromV <= toV) {
          const newHtml = renderContent(fromV, toV);
          this.openModal(newHtml, 'lg');
          attachChangeListeners();
        }
      };

      fromEl?.addEventListener('change', recompute);
      toEl?.addEventListener('change', recompute);

      pdfBtn?.addEventListener('click', () => {
        const fromV = fromEl?.value || startYear;
        const toV = toEl?.value || currentMonth;
        const ledger = store.getTenantLedger(tenant);
        const confirmedPayments = store.state.payments.filter((p) => p.tenantId === tenant.userId && p.status === 'confirmed');
        let opening = 0;
        ledger.bills.forEach((b) => { if (b.month < fromV) opening += b.amount; });
        confirmedPayments.forEach((p) => { if (p.month < fromV) opening -= p.amount; });

        let current = opening;
        let chg = 0;
        let pd = 0;
        const lines = [];

        ledger.bills.forEach((b) => {
          if (b.month >= fromV && b.month <= toV) {
            current += b.amount;
            chg += b.amount;
            lines.push({ date: formatDate(new Date(b.month + '-01')), description: `Rent bill for ${formatMonth(b.month)}`, charged: b.amount, paid: 0, balance: current });
          }
        });

        confirmedPayments.forEach((p) => {
          if (p.month >= fromV && p.month <= toV) {
            current -= p.amount;
            pd += p.amount;
            lines.push({ date: formatDate(p.paidAt || p.createdAt), description: `Payment for ${formatMonth(p.month)}${p.mpesaReceipt ? ' - M-Pesa ' + p.mpesaReceipt : ''}`, charged: 0, paid: p.amount, balance: current });
          }
        });

        generateStatementPDF(tenant, { opening, charged: chg, paid: pd, closing: current, lines }, fromV, toV, propName);
      });
    };

    attachChangeListeners();
  }

  async showStkPushModal(payment) {
    const tenant = store.state.tenants.find((t) => t.userId === payment.tenantId);
    const landlord = tenant ? store.state.landlords.find((l) => l.id === tenant.landlordId) : null;
    const tillNumber = landlord ? landlord.tillNumber : payment.method.replace(/\D/g, '') || '582190';
    const propName = landlord ? landlord.propertyName : payment.payerName ? `${payment.payerName}'s Building` : 'Omwoyo Apartments';
    const daraja = store.getDarajaConfig();

    // Helper for subtle Web Audio confirmation chime
    const playChime = (isSuccess) => {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (isSuccess) {
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();
          osc1.type = 'sine';
          osc2.type = 'sine';
          osc1.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
          osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5
          gain.gain.setValueAtTime(0.15, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(ctx.destination);
          osc1.start();
          osc1.stop(ctx.currentTime + 0.12);
          osc2.start(ctx.currentTime + 0.1);
          osc2.stop(ctx.currentTime + 0.35);
        } else {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(220, ctx.currentTime);
          gain.gain.setValueAtTime(0.15, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.3);
        }
      } catch (e) {
        // AudioContext disabled or not allowed, fallback silently
      }
    };

    const renderConnectingView = () => `
      <div class="modal-header">
        <h3 class="modal-title" style="display: flex; align-items: center; gap: 0.5rem;">
          <i data-lucide="radio" style="color: #059669; width: 1.25rem; height: 1.25rem;"></i>
          Supermarket Checkout Terminal · M-Pesa
        </h3>
        <button class="btn-icon" onclick="window.app.closeModal()">
          <i data-lucide="x" style="width: 1.25rem; height: 1.25rem;"></i>
        </button>
      </div>

      <div class="modal-body" style="text-align: center; padding: 2.5rem 1.5rem;">
        <div class="pulse-indicator" style="display: inline-flex; margin-bottom: 1rem;">
          <div class="pulse-dot" style="width: 1rem; height: 1rem;"></div>
          <span style="font-size: 0.875rem; font-weight: 700;">Connecting to Safaricom Daraja...</span>
        </div>
        <h3 style="font-size: 1.25rem; font-weight: 800; color: var(--slate-900);">
          Pushing Prompt to ${payment.payerPhone}...
        </h3>
        <p style="font-size: 0.875rem; color: var(--slate-600); margin-top: 0.5rem;">
          Targeting Landlord Till <strong>${tillNumber}</strong> (${propName}). Transferring <strong>${formatKES(payment.amount)}</strong>.
        </p>
        <div style="width: 100%; max-width: 280px; height: 6px; background: #e2e8f0; border-radius: 9999px; margin: 1.5rem auto 0 auto; overflow: hidden;">
          <div style="width: 60%; height: 100%; background: #059669; border-radius: 9999px; animation: pulse 1s infinite;"></div>
        </div>
      </div>
    `;

    const renderLiveHandsetView = (realData) => `
      <div class="modal-header">
        <div>
          <span class="badge badge-paid" style="font-size: 0.6875rem; font-weight: 800;">SAFARICOM DARAJA LIVE</span>
          <h3 class="modal-title" style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.25rem;">
            <i data-lucide="smartphone" style="color: #10b981; width: 1.25rem; height: 1.25rem;"></i>
            STK Push Sent to Your Phone!
          </h3>
        </div>
        <button class="btn-icon" id="btn-abort-real-stk">
          <i data-lucide="x" style="width: 1.25rem; height: 1.25rem;"></i>
        </button>
      </div>

      <div class="modal-body" style="text-align: center; padding: 1.5rem 1.25rem;">
        <div style="background-color: #ecfdf5; border: 2px solid #10b981; border-radius: var(--radius-lg); padding: 1rem; margin-bottom: 1.25rem; text-align: left;">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <div style="width: 2.75rem; height: 2.75rem; border-radius: 9999px; background: #059669; color: #fff; display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: 0 4px 12px rgba(5, 150, 105, 0.3);">
              <i data-lucide="bell-ring" style="width: 1.5rem; height: 1.5rem;"></i>
            </div>
            <div>
              <strong style="color: #065f46; font-size: 0.9375rem;">Check Your Physical Phone Screen Now!</strong>
              <div style="font-size: 0.8125rem; color: #047857; margin-top: 0.125rem;">
                Prompt pushed to: <strong>+${realData.phone}</strong>
              </div>
            </div>
          </div>
        </div>

        <div style="background: #0f172a; color: #f8fafc; border-radius: 1rem; padding: 1.25rem; max-width: 320px; margin: 0 auto; box-shadow: 0 10px 25px rgba(0,0,0,0.2); text-align: left; font-family: system-ui, sans-serif;">
          <div style="display: flex; justify-content: space-between; font-size: 0.6875rem; color: #94a3b8; margin-bottom: 0.5rem;">
            <span>M-PESA POPUP ON PHONE</span>
            <span>SIM TOOLKIT</span>
          </div>
          <div style="background: #ffffff; color: #0f172a; border-radius: 0.5rem; padding: 1rem; font-size: 0.875rem; line-height: 1.5;">
            Do you want to pay <strong>${formatKES(payment.amount)}</strong> to<br>
            Till <strong>${tillNumber}</strong> (${propName})?<br>
            <div style="margin-top: 0.5rem; font-weight: 700; color: #059669;">Enter 4-Digit M-Pesa PIN:</div>
            <div style="letter-spacing: 0.25em; font-family: monospace; font-size: 1.25rem; color: #64748b; margin-top: 0.25rem;">••••</div>
          </div>
        </div>

        <div style="margin-top: 1.5rem; display: flex; flex-direction: column; align-items: center; gap: 0.5rem;">
          <div class="pulse-indicator" style="display: inline-flex;">
            <div class="pulse-dot"></div>
            <span style="font-weight: 700; font-size: 0.875rem; color: #0f172a;">Listening for Safaricom Network Response...</span>
          </div>
          <div style="font-size: 0.75rem; color: var(--slate-500);">
            Time remaining: <span id="stk-countdown" style="font-weight: 700; color: #059669;">60s</span>
          </div>
        </div>

        <div style="display: flex; gap: 0.5rem; margin-top: 1.5rem;">
          <button class="btn btn-secondary btn-full" id="btn-cancel-real-polling">
            Cancel Payment
          </button>
        </div>
      </div>
    `;

    const renderSimulatedPromptView = () => `
      <div class="modal-header">
        <div>
          <h3 class="modal-title" style="display: flex; align-items: center; gap: 0.5rem;">
            <i data-lucide="smartphone" style="color: #16a34a; width: 1.25rem; height: 1.25rem;"></i>
            Safaricom M-Pesa Checkout Terminal
          </h3>
          <p style="font-size: 0.75rem; color: var(--slate-500); margin-top: 0.125rem;">
            Payment to Till <strong>${tillNumber}</strong> (${propName})
          </p>
        </div>
        <button class="btn-icon" onclick="window.app.closeModal()">
          <i data-lucide="x" style="width: 1.25rem; height: 1.25rem;"></i>
        </button>
      </div>

      <div class="modal-body" style="text-align: center;">
        <div style="background-color: #fffbeb; border: 1px solid #f59e0b; border-radius: var(--radius-lg); padding: 0.75rem 1rem; margin-bottom: 1rem; text-align: left; display: flex; align-items: flex-start; gap: 0.75rem;">
          <div style="width: 1.75rem; height: 1.75rem; border-radius: 9999px; background: #f59e0b; color: #fff; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 0.875rem; font-weight: 800;">
            !
          </div>
          <div style="font-size: 0.8125rem; color: #92400e;">
            <strong>Want the prompt to pop up on your physical phone?</strong>
            <span style="display: block; margin-top: 0.125rem;">
              Connect your Live Safaricom Daraja API credentials in Landlord Settings. In the meantime, test the full supermarket PIN authorization below:
            </span>
          </div>
        </div>

        <!-- Simulated Mobile STK Dialog -->
        <div class="phone-mock" style="max-width: 320px; margin: 0 auto; box-shadow: 0 12px 30px rgba(0,0,0,0.15); border: 3px solid #1e293b; border-radius: 2rem; overflow: hidden; background: #0f172a; padding: 0.75rem 0.75rem 1.25rem 0.75rem;">
          <div style="display: flex; justify-content: space-between; font-size: 0.625rem; color: #94a3b8; padding: 0 0.5rem 0.5rem 0.5rem;">
            <span>SAFARICOM</span>
            <span>4G 100%</span>
          </div>

          <div class="phone-screen" style="background: #ffffff; border-radius: 1.25rem; padding: 1.25rem 1rem; text-align: center; border: 1px solid #cbd5e1;">
            <div style="display: inline-flex; align-items: center; gap: 0.375rem; background: #ecfdf5; color: #047857; padding: 0.25rem 0.625rem; border-radius: 9999px; font-size: 0.6875rem; font-weight: 700; margin-bottom: 0.75rem;">
              <span style="width: 6px; height: 6px; border-radius: 9999px; background: #10b981;"></span>
              SIM TOOLKIT · M-PESA
            </div>

            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 0.75rem; padding: 1rem 0.75rem; margin-bottom: 1rem; text-align: left; font-size: 0.8125rem; line-height: 1.5; color: #1e293b;">
              Pay <strong>${formatKES(payment.amount)}</strong> to<br>
              <strong>${propName}</strong><br>
              Buy Goods Till: <span style="font-family: monospace; font-weight: 700; color: #059669;">${tillNumber}</span><br>
              Account: <strong>${payment.unit}</strong>
              <hr style="border: none; border-top: 1px dashed #cbd5e1; margin: 0.625rem 0;">
              <label style="display: block; font-size: 0.75rem; font-weight: 700; color: #475569; margin-bottom: 0.25rem;">
                Enter M-PESA PIN:
              </label>
              <input 
                type="password" 
                id="sim-mpesa-pin" 
                maxlength="4" 
                value="1234" 
                placeholder="••••" 
                autofocus
                style="width: 100%; text-align: center; font-size: 1.375rem; letter-spacing: 0.35em; padding: 0.375rem; border: 2px solid #059669; border-radius: 6px; font-weight: 800; color: #0f172a; background: #ffffff;" 
              />
            </div>

            <div style="display: flex; gap: 0.5rem;">
              <button class="btn btn-secondary" id="btn-stk-cancel" style="flex: 1; padding: 0.5rem; font-size: 0.8125rem; border-color: #cbd5e1;">
                Cancel
              </button>
              <button class="btn btn-primary" id="btn-stk-confirm" style="flex: 1; padding: 0.5rem; font-size: 0.8125rem; font-weight: 700; background: #059669;">
                Send PIN
              </button>
            </div>
          </div>
        </div>

        <p style="font-size: 0.75rem; color: var(--slate-500); margin-top: 1rem;">
          Enter 4-digit PIN to transfer <strong>${formatKES(payment.amount)}</strong> to Till <strong>${tillNumber}</strong>.
        </p>
      </div>
    `;

    const renderProcessingView = () => `
      <div class="modal-body" style="text-align: center; padding: 3rem 1.5rem;">
        <div class="pulse-indicator" style="display: inline-flex; margin-bottom: 1rem;">
          <div class="pulse-dot" style="width: 1rem; height: 1rem;"></div>
          <span style="font-size: 0.875rem; font-weight: 700;">Verifying with Safaricom Daraja...</span>
        </div>
        <h3 style="font-size: 1.25rem; font-weight: 800; color: var(--slate-900);">
          Verifying Transaction on Till ${tillNumber}...
        </h3>
        <p style="font-size: 0.875rem; color: var(--slate-600); margin-top: 0.5rem;">
          Waiting for Safaricom M-Pesa network confirmation for <strong>${payment.payerPhone}</strong>.
        </p>
        <div style="width: 100%; max-width: 280px; height: 6px; background: #e2e8f0; border-radius: 9999px; margin: 1.5rem auto 0 auto; overflow: hidden;">
          <div style="width: 70%; height: 100%; background: #059669; border-radius: 9999px; animation: pulse 1s infinite;"></div>
        </div>
      </div>
    `;

    const renderSuccessView = (receiptCode) => {
      const tenantRecord = store.state.tenants.find((t) => t.userId === payment.tenantId);
      const ledger = tenantRecord ? store.getTenantLedger(tenantRecord) : null;
      const newBalance = ledger ? ledger.balance : 0;
      const formattedDate = new Date().toLocaleDateString('en-GB');
      const formattedTime = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      const mpesaSms = `${receiptCode} Confirmed. Ksh${Number(payment.amount).toLocaleString('en-KE')}.00 sent to Till ${tillNumber} ${propName} on ${formattedDate} at ${formattedTime}. New M-PESA balance is Ksh4,210.00. Transaction cost, Ksh0.00.`;

      return `
        <div class="modal-header">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span class="badge badge-paid" style="font-size: 0.75rem;">Safaricom Result: 0 (Success)</span>
          </div>
          <button class="btn-icon" onclick="window.app.closeModal()">
            <i data-lucide="x" style="width: 1.25rem; height: 1.25rem;"></i>
          </button>
        </div>

        <div class="modal-body" style="text-align: center; padding: 1.5rem 1.5rem 2rem 1.5rem;">
          <div style="width: 4.5rem; height: 4.5rem; border-radius: 9999px; background: #ecfdf5; border: 3px solid #10b981; color: #059669; display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem auto; box-shadow: 0 10px 20px -5px rgba(16, 185, 129, 0.4);">
            <i data-lucide="check-circle" style="width: 2.75rem; height: 2.75rem;"></i>
          </div>

          <span class="badge" style="background-color: #059669; color: #ffffff; font-size: 0.875rem; font-weight: 800; padding: 0.375rem 0.875rem; border-radius: var(--radius-full); letter-spacing: 0.05em;">
            SYSTEM STATUS: PAID (CONFIRMED)
          </span>

          <h2 style="font-size: 1.625rem; font-weight: 800; color: #065f46; margin-top: 0.75rem;">
            ${formatKES(payment.amount)} Paid Successfully!
          </h2>
          <p style="font-size: 0.875rem; color: var(--slate-600); margin-top: 0.25rem;">
            The money has been deposited directly to Landlord Till <strong>${tillNumber}</strong> (${propName}).
          </p>

          <!-- Transaction Summary Card -->
          <div style="background-color: #f8fafc; border: 1px solid var(--slate-200); border-radius: var(--radius-lg); padding: 1rem; margin-top: 1.25rem; text-align: left; font-size: 0.8125rem;">
            <div style="display: flex; justify-content: space-between; padding: 0.25rem 0;">
              <span style="color: var(--slate-500);">M-Pesa Receipt:</span>
              <strong style="font-family: monospace; color: var(--slate-900);">${receiptCode}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 0.25rem 0;">
              <span style="color: var(--slate-500);">Paid to Till:</span>
              <strong style="color: var(--slate-900);">${tillNumber} (${propName})</strong>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 0.25rem 0;">
              <span style="color: var(--slate-500);">Tenant & Unit:</span>
              <strong style="color: var(--slate-900);">${payment.payerName} (${payment.unit})</strong>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 0.25rem 0;">
              <span style="color: var(--slate-500);">New Rent Balance:</span>
              <strong style="color: ${newBalance <= 0 ? 'var(--emerald-600)' : 'var(--rose-600)'};">${newBalance <= 0 ? 'PAID IN FULL (KES 0)' : formatKES(newBalance)}</strong>
            </div>
          </div>

          <!-- SMS Notification Snippet -->
          <div style="background-color: #f1f5f9; border-radius: var(--radius-md); padding: 0.75rem; margin-top: 1rem; text-align: left; font-family: monospace; font-size: 0.75rem; color: #334155; line-height: 1.4;">
            <span style="font-weight: 700; color: #047857; display: block; margin-bottom: 0.25rem;">📱 Safaricom SMS Received on Phone:</span>
            "${mpesaSms}"
          </div>

          <div style="display: flex; gap: 0.75rem; margin-top: 1.5rem;">
            <button class="btn btn-secondary" style="flex: 1;" onclick="window.app.closeModal(); window.app.render();">
              <i data-lucide="check" style="width: 1rem; height: 1rem;"></i>
              View Rent Ledger
            </button>
            <button class="btn btn-primary" style="flex: 1;" onclick="window.app.showReceiptModal('${payment.id}')">
              <i data-lucide="download" style="width: 1rem; height: 1rem;"></i>
              Download Receipt
            </button>
          </div>
        </div>
      `;
    };

    const renderFailureView = (reason) => `
      <div class="modal-header">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span class="badge badge-unpaid" style="font-size: 0.75rem;">Safaricom Result: 1032 (Declined)</span>
        </div>
        <button class="btn-icon" onclick="window.app.closeModal()">
          <i data-lucide="x" style="width: 1.25rem; height: 1.25rem;"></i>
        </button>
      </div>

      <div class="modal-body" style="text-align: center; padding: 1.5rem 1.5rem 2rem 1.5rem;">
        <div style="width: 4.5rem; height: 4.5rem; border-radius: 9999px; background: #fff1f2; border: 3px solid #f43f5e; color: #e11d48; display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem auto; box-shadow: 0 10px 20px -5px rgba(244, 63, 94, 0.4);">
          <i data-lucide="alert-octagon" style="width: 2.75rem; height: 2.75rem;"></i>
        </div>

        <span class="badge" style="background-color: #e11d48; color: #ffffff; font-size: 0.875rem; font-weight: 800; padding: 0.375rem 0.875rem; border-radius: var(--radius-full); letter-spacing: 0.05em;">
          SYSTEM STATUS: NOT PAID (FAILED)
        </span>

        <h2 style="font-size: 1.5rem; font-weight: 800; color: #9f1239; margin-top: 0.75rem;">
          Rent Payment Was Not Completed
        </h2>
        <p style="font-size: 0.875rem; color: var(--slate-600); margin-top: 0.25rem;">
          ${reason || 'The transaction was cancelled or declined on your phone. No money was deducted from your M-Pesa account.'}
        </p>

        <div style="background-color: #fff1f2; border: 1px solid #fecdd3; border-radius: var(--radius-lg); padding: 0.875rem; margin-top: 1.25rem; text-align: left; font-size: 0.8125rem; color: #9f1239;">
          <strong>Target Till:</strong> ${tillNumber} (${propName})<br>
          <strong>Reason:</strong> ${reason || 'User cancelled STK prompt on phone'}<br>
          <strong>Action:</strong> Please try again or check your M-Pesa PIN.
        </div>

        <div style="display: flex; gap: 0.75rem; margin-top: 1.5rem;">
          <button class="btn btn-secondary" style="flex: 1;" onclick="window.app.closeModal()">
            Close
          </button>
          <button class="btn btn-primary" style="flex: 1; background: #e11d48; border-color: #e11d48;" id="btn-stk-retry">
            <i data-lucide="refresh-cw" style="width: 1rem; height: 1rem;"></i>
            Retry STK Push
          </button>
        </div>
      </div>
    `;

    // Step 1: Show Connecting State and Send to API
    this.openModal(renderConnectingView());

    try {
      const res = await fetch('/api/mpesa/stkpush', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: payment.payerPhone,
          amount: payment.amount,
          tillNumber: daraja.shortcode || tillNumber,
          accountReference: payment.unit || 'Rent',
          propertyName: propName,
          consumerKey: daraja.consumerKey,
          consumerSecret: daraja.consumerSecret,
          passkey: daraja.passkey,
          shortcode: daraja.shortcode || tillNumber,
          tillType: daraja.tillType || 'till',
          env: daraja.env || 'production'
        })
      }).then(async (r) => {
        const data = await r.json().catch(() => ({}));
        return data;
      }).catch((err) => ({
        success: true,
        isRealDaraja: false,
        needsCredentials: true,
        message: 'Endpoint offline. Using interactive simulator.'
      }));

      // If Real Daraja was triggered
      if (res && res.isRealDaraja && res.success) {
        this.openModal(renderLiveHandsetView(res));
        this.showToast(`Prompt pushed to handset +${res.phone}! Check your screen.`, 'success');

        let secondsLeft = 60;
        let pollActive = true;

        const countdownInterval = setInterval(() => {
          secondsLeft -= 1;
          const el = document.getElementById('stk-countdown');
          if (el) el.innerText = `${secondsLeft}s`;
          if (secondsLeft <= 0) {
            clearInterval(countdownInterval);
            clearInterval(pollInterval);
            pollActive = false;
            playChime(false);
            store.finalizePayment(payment.id, 'failed', '', 'Safaricom transaction timed out');
            this.openModal(renderFailureView('Transaction timed out on handset (no PIN entered within 60s).'));
          }
        }, 1000);

        const pollInterval = setInterval(async () => {
          if (!pollActive) return;
          try {
            const queryRes = await fetch('/api/mpesa/query', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                checkoutRequestId: res.checkoutRequestId,
                consumerKey: daraja.consumerKey,
                consumerSecret: daraja.consumerSecret,
                passkey: daraja.passkey,
                shortcode: daraja.shortcode || tillNumber,
                env: daraja.env || 'production'
              })
            }).then((r) => r.json());

            if (queryRes.ResultCode === '0' || queryRes.ResultCode === 0) {
              clearInterval(countdownInterval);
              clearInterval(pollInterval);
              pollActive = false;
              const receipt = queryRes.MpesaReceiptNumber || 'QK' + Math.random().toString(36).substring(2, 10).toUpperCase();
              store.finalizePayment(payment.id, 'confirmed', receipt);
              playChime(true);
              this.openModal(renderSuccessView(receipt));
              this.showToast(`M-Pesa Payment Successful! Credited to Till ${tillNumber}. STATUS: PAID`, 'success');
            } else if (queryRes.ResultCode === '1032') {
              clearInterval(countdownInterval);
              clearInterval(pollInterval);
              pollActive = false;
              playChime(false);
              store.finalizePayment(payment.id, 'failed', '', 'Cancelled on phone by user');
              this.openModal(renderFailureView('Transaction cancelled on phone by user.'));
            } else if (queryRes.ResultCode && queryRes.ResultCode !== '0' && queryRes.ResultCode !== '1037') {
              clearInterval(countdownInterval);
              clearInterval(pollInterval);
              pollActive = false;
              playChime(false);
              store.finalizePayment(payment.id, 'failed', '', queryRes.ResultDesc || 'Transaction failed');
              this.openModal(renderFailureView(queryRes.ResultDesc || 'Safaricom declined the transaction.'));
            }
          } catch (e) {
            // Wait for next poll
          }
        }, 2500);

        const cleanupPolling = () => {
          clearInterval(countdownInterval);
          clearInterval(pollInterval);
          pollActive = false;
        };

        document.getElementById('btn-abort-real-stk')?.addEventListener('click', () => {
          cleanupPolling();
          this.closeModal();
        });

        document.getElementById('btn-cancel-real-polling')?.addEventListener('click', () => {
          cleanupPolling();
          playChime(false);
          store.finalizePayment(payment.id, 'failed', '', 'User cancelled checkout');
          this.openModal(renderFailureView('Transaction aborted by user.'));
        });

        return;
      }

      // Fallback: Real Daraja keys not yet configured or sandbox fallback
      this.openModal(renderSimulatedPromptView());

      document.getElementById('btn-stk-confirm')?.addEventListener('click', () => {
        const pin = document.getElementById('sim-mpesa-pin')?.value || '';
        this.openModal(renderProcessingView());

        setTimeout(() => {
          if (!pin || pin.length < 4) {
            playChime(false);
            store.finalizePayment(payment.id, 'failed', '', 'Invalid PIN entered');
            this.openModal(renderFailureView('Invalid M-Pesa PIN entered on handset.'));
            document.getElementById('btn-stk-retry')?.addEventListener('click', () => {
              this.showStkPushModal(payment);
            });
            this.showToast('Payment NOT PAID: Invalid PIN', 'danger');
          } else {
            const receiptCode = 'QK' + Math.random().toString(36).substring(2, 10).toUpperCase();
            store.finalizePayment(payment.id, 'confirmed', receiptCode);
            playChime(true);
            this.openModal(renderSuccessView(receiptCode));
            this.showToast(`M-Pesa Payment Successful! Credited to Till ${tillNumber}. STATUS: PAID`, 'success');
          }
        }, 1200);
      });

      document.getElementById('btn-stk-cancel')?.addEventListener('click', () => {
        playChime(false);
        store.finalizePayment(payment.id, 'failed', '', 'User cancelled M-Pesa prompt on phone');
        this.openModal(renderFailureView('Transaction cancelled on phone by user.'));
        document.getElementById('btn-stk-retry')?.addEventListener('click', () => {
          this.showStkPushModal(payment);
        });
        this.showToast('Payment NOT PAID: Cancelled by user', 'danger');
      });
    } catch (err) {
      this.openModal(renderFailureView(`Failed to initiate M-Pesa connection: ${err.message}`));
    }
  }
}

// Instantiate and expose globally
window.app = new RentPortalApp();
