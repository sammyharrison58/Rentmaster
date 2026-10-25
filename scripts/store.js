// store.js - Rent Portal Reactive LocalStorage Data Engine
// Master Authentication: System Administrator (Super Admin)
// 3-Tier Multi-Tenant Hierarchy: Super Admin (Monitors All & Approves All) -> Landlords -> Tenants

const STORAGE_KEY = 'rentportal_state_v3';
export const SUPER_ADMIN_EMAIL = 'sammyharrison58@gmail.com';

// Formatter for Kenya Shillings (KES)
export const formatKES = (val) => {
  const num = Number(val) || 0;
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 0
  }).format(num).replace(/\u00a0/g, ' ');
};

export const formatMonth = (monthStr) => {
  if (!monthStr) return '';
  const [y, m] = monthStr.split('-').map(Number);
  if (!y || !m) return monthStr;
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
};

export const formatDate = (timestamp) => {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
};

export const formatDateTime = (timestamp) => {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const formatPhone = (phone) => {
  if (!phone) return '';
  const clean = phone.replace(/\D/g, '');
  if (clean.startsWith('254')) return '+' + clean;
  if (clean.startsWith('0')) return '+254' + clean.slice(1);
  return phone;
};

export const getCurrentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// Initial Seed Data with 3-Tier Hierarchy
const DEFAULT_STATE = {
  // Start on the dedicated Log In page by default (hidden quick-menu)
  currentUser: null,
  landlords: [
    {
      id: 'll-1',
      userId: 'user-admin-1',
      name: 'Linus Omwoyo',
      email: 'linusomwoyo2@gmail.com',
      phone: '0712345678',
      propertyName: 'Omwoyo Apartments',
      unitsCount: 12,
      location: 'Nairobi, Kilimani',
      tillNumber: '582190', // Online M-Pesa Till provided by Landlord
      paybillNumber: '',
      inviteCode: 'OMWOYO-B4',
      paymentInstructions: 'Pay online or via M-Pesa Till Number 582190 (Omwoyo Apartments). Use your Unit as account reference.',
      status: 'approved', // Approved by Super Admin
      approvedAt: Date.now() - 86400000 * 200,
      createdAt: Date.now() - 86400000 * 205
    },
    {
      id: 'll-2',
      userId: 'user-ll-2',
      name: 'David Mutua',
      email: 'david.mutua@sunrise.co.ke',
      phone: '0721884422',
      propertyName: 'Sunrise Heights',
      unitsCount: 16,
      location: 'Mombasa, Nyali',
      tillNumber: '992140',
      paybillNumber: '',
      inviteCode: 'SUNRISE-NYALI',
      paymentInstructions: 'Pay by M-Pesa Till 992140 (Sunrise Heights).',
      status: 'pending', // Awaiting approval by Super Admin!
      createdAt: Date.now() - 86400000 * 1
    },
    {
      id: 'll-3',
      userId: 'user-ll-3',
      name: 'Sarah Nduta',
      email: 'sarah.nduta@greenwood.co.ke',
      phone: '0733556677',
      propertyName: 'Greenwood Courts',
      unitsCount: 20,
      location: 'Nakuru, Milimani',
      tillNumber: '310450',
      paybillNumber: '',
      inviteCode: 'GREENWOOD-MILIMANI',
      paymentInstructions: 'Pay via Buy Goods Till 310450 (Greenwood Courts).',
      status: 'approved',
      approvedAt: Date.now() - 86400000 * 100,
      createdAt: Date.now() - 86400000 * 105
    }
  ],
  settings: {
    propertyName: 'Omwoyo Apartments',
    paymentInstructions: 'Pay by M-Pesa to Till 582190 (Omwoyo Apartments) or Send Money to 0712 345 678 (Linus Omwoyo).\nPlease use your House / Unit as the account reference.',
    mpesaEnabled: true,
    mpesaSandbox: false,
    alertsEnabled: true,
    smsWebhookUrl: 'https://rentmaster.app/api/webhook/mpesa-forward/k39s0l8d2q1',
    smsLastReceivedAt: Date.now() - 3600000 * 4,
    smsLastResult: 'Matched: Jane Wanjiru (Unit B4)',
    daraja: {
      env: 'production', // 'production' | 'sandbox'
      tillType: 'till', // 'till' (Buy Goods) | 'paybill'
      consumerKey: '',
      consumerSecret: '',
      passkey: '',
      shortcode: '582190',
      storeNumber: '',
      enabled: false
    }
  },
  staff: [
    { id: 'st-1', landlordId: 'll-1', email: 'peter.caretaker@omwoyo.co.ke', name: 'Peter Karanja', addedAt: Date.now() - 86400000 * 30 }
  ],
  tenants: [
    {
      userId: 'user-t-1',
      landlordId: 'll-1',
      name: 'Jane Wanjiru',
      email: 'jane.wanjiru@gmail.com',
      phone: '0712345678',
      unit: 'Unit B4',
      propertyName: 'Omwoyo Apartments',
      tillNumber: '582190',
      monthlyRent: 15000,
      status: 'approved', // Approved by Landlord and Super Admin
      approvedAt: Date.now() - 86400000 * 180,
      createdAt: Date.now() - 86400000 * 185
    },
    {
      userId: 'user-t-2',
      landlordId: 'll-1',
      name: 'Brian Kiprop',
      email: 'brian.kiprop@outlook.com',
      phone: '0722998877',
      unit: 'Unit A2',
      propertyName: 'Omwoyo Apartments',
      tillNumber: '582190',
      monthlyRent: 18000,
      status: 'approved',
      approvedAt: Date.now() - 86400000 * 150,
      createdAt: Date.now() - 86400000 * 155
    },
    {
      userId: 'user-t-3',
      landlordId: 'll-1',
      name: 'Faith Muthoni',
      email: 'faith.muthoni@yahoo.com',
      phone: '0733112233',
      unit: 'Unit C1',
      propertyName: 'Omwoyo Apartments',
      tillNumber: '582190',
      monthlyRent: 14000,
      status: 'approved',
      approvedAt: Date.now() - 86400000 * 90,
      createdAt: Date.now() - 86400000 * 95
    },
    {
      userId: 'user-t-4',
      landlordId: 'll-1',
      name: 'Kevin Otieno',
      email: 'kevin.otieno@gmail.com',
      phone: '0799445566',
      unit: 'Unit D3',
      propertyName: 'Omwoyo Apartments',
      tillNumber: '582190',
      monthlyRent: 16000,
      status: 'pending', // Pending approval!
      createdAt: Date.now() - 86400000 * 2
    },
    {
      userId: 'user-t-5',
      landlordId: 'll-1',
      name: 'Mercy Chebet',
      email: 'mercy.chebet@gmail.com',
      phone: '0744778899',
      unit: 'Unit A5',
      propertyName: 'Omwoyo Apartments',
      tillNumber: '582190',
      monthlyRent: 15000,
      status: 'suspended',
      approvedAt: Date.now() - 86400000 * 120,
      createdAt: Date.now() - 86400000 * 125
    },
    {
      userId: 'user-t-6',
      landlordId: 'll-3',
      name: 'Dennis Macharia',
      email: 'dennis.m@gmail.com',
      phone: '0711223344',
      unit: 'Villa 7',
      propertyName: 'Greenwood Courts',
      tillNumber: '310450',
      monthlyRent: 25000,
      status: 'approved',
      approvedAt: Date.now() - 86400000 * 80,
      createdAt: Date.now() - 86400000 * 85
    }
  ],
  payments: [
    {
      id: 'pay-001',
      landlordId: 'll-1',
      tenantId: 'user-t-1',
      tenantName: 'Jane Wanjiru',
      unit: 'Unit B4',
      amount: 15000,
      month: '2026-10',
      method: 'M-Pesa Till 582190',
      channel: 'mpesa',
      mpesaReceipt: 'QJD73821K9',
      payerPhone: '0712345678',
      payerName: 'Jane Wanjiru',
      status: 'confirmed', // Paid
      receiptNo: 'RCT-202610-001',
      paidAt: Date.now() - 86400000 * 3,
      createdAt: Date.now() - 86400000 * 3
    },
    {
      id: 'pay-002',
      landlordId: 'll-1',
      tenantId: 'user-t-1',
      tenantName: 'Jane Wanjiru',
      unit: 'Unit B4',
      amount: 15000,
      month: '2026-09',
      method: 'M-Pesa Till 582190',
      channel: 'mpesa',
      mpesaReceipt: 'QIC99410M2',
      payerPhone: '0712345678',
      payerName: 'Jane Wanjiru',
      status: 'confirmed',
      receiptNo: 'RCT-202609-014',
      paidAt: Date.now() - 86400000 * 34,
      createdAt: Date.now() - 86400000 * 34
    },
    {
      id: 'pay-003',
      landlordId: 'll-1',
      tenantId: 'user-t-2',
      tenantName: 'Brian Kiprop',
      unit: 'Unit A2',
      amount: 18000,
      month: '2026-10',
      method: 'M-Pesa Till 582190',
      channel: 'mpesa',
      mpesaReceipt: 'QJE48190L1',
      payerPhone: '0722998877',
      payerName: 'Brian Kiprop',
      status: 'confirmed',
      receiptNo: 'RCT-202610-002',
      paidAt: Date.now() - 86400000 * 5,
      createdAt: Date.now() - 86400000 * 5
    },
    {
      id: 'pay-004',
      landlordId: 'll-1',
      tenantId: 'user-t-3',
      tenantName: 'Faith Muthoni',
      unit: 'Unit C1',
      amount: 7000,
      month: '2026-10',
      method: 'M-Pesa Till 582190',
      channel: 'mpesa',
      mpesaReceipt: 'QJF11029P4',
      payerPhone: '0733112233',
      payerName: 'Faith Muthoni',
      status: 'confirmed',
      receiptNo: 'RCT-202610-003',
      paidAt: Date.now() - 86400000 * 1,
      createdAt: Date.now() - 86400000 * 1
    },
    {
      id: 'pay-005',
      landlordId: 'll-1',
      tenantId: 'user-t-2',
      tenantName: 'Brian Kiprop',
      unit: 'Unit A2',
      amount: 18000,
      month: '2026-10',
      method: 'M-Pesa Till 582190',
      channel: 'sms',
      mpesaReceipt: 'QJK98320A4',
      payerPhone: '0722998877',
      payerName: 'Brian Kiprop',
      smsText: 'QJK98320A4 Confirmed. Ksh18,000.00 paid to Omwoyo Apartments Till 582190 from Brian Kiprop 254722998877 on 22/10/26 at 11:15 AM.',
      tenantMessage: 'QJK98320A4 Confirmed. Ksh18,000.00 paid to Omwoyo Apartments Till 582190 from Brian Kiprop 254722998877 on 22/10/26 at 11:15 AM.',
      matchedBy: 'phone',
      status: 'pending', // Awaiting landlord approval
      submittedAt: Date.now() - 3600000 * 2,
      createdAt: Date.now() - 3600000 * 2
    },
    {
      id: 'pay-post-001',
      landlordId: 'll-1',
      tenantId: 'user-t-1',
      tenantName: 'Jane Wanjiru',
      unit: 'Unit B4',
      amount: 15000,
      month: '2026-10',
      method: 'M-Pesa Till 582190',
      channel: 'tenant_posted_sms',
      mpesaReceipt: 'QJD73821K9',
      payerPhone: '0712345678',
      payerName: 'Jane Wanjiru',
      smsText: 'QJD73821K9 Confirmed. Ksh15,000.00 paid to Omwoyo Apartments Till 582190 on 24/10/26 at 2:15 PM.',
      tenantMessage: 'QJD73821K9 Confirmed. Ksh15,000.00 paid to Omwoyo Apartments Till 582190 on 24/10/26 at 2:15 PM.',
      status: 'pending', // Awaiting Landlord confirmation!
      submittedAt: Date.now() - 3600000 * 1,
      createdAt: Date.now() - 3600000 * 1
    },
    {
      id: 'pay-006',
      landlordId: 'll-3',
      tenantId: 'user-t-6',
      tenantName: 'Dennis Macharia',
      unit: 'Villa 7',
      amount: 25000,
      month: '2026-10',
      method: 'M-Pesa Till 310450',
      channel: 'mpesa',
      mpesaReceipt: 'QJN88129B3',
      payerPhone: '0711223344',
      payerName: 'Dennis Macharia',
      status: 'confirmed',
      receiptNo: 'RCT-202610-009',
      paidAt: Date.now() - 86400000 * 4,
      createdAt: Date.now() - 86400000 * 4
    }
  ],
  audit: [
    { id: 'aud-0', action: 'Landlord Registered', detail: 'David Mutua requested onboarding for Sunrise Heights (16 units)', by: 'David Mutua', at: Date.now() - 86400000 * 1 },
    { id: 'aud-1', action: 'Landlord Approved', detail: 'Super Admin approved Linus Omwoyo for Omwoyo Apartments', by: 'Super Admin', at: Date.now() - 86400000 * 200 },
    { id: 'aud-2', action: 'Tenant Approved', detail: 'Linus Omwoyo approved Jane Wanjiru (Unit B4) at KES 15,000/mo', by: 'Linus Omwoyo', at: Date.now() - 86400000 * 180 },
    { id: 'aud-3', action: 'Payment Confirmed', detail: 'Confirmed KES 15,000 from Jane Wanjiru (Unit B4)', by: 'Linus Omwoyo', at: Date.now() - 86400000 * 3 },
    { id: 'aud-4', action: 'Tenant Requested', detail: 'Kevin Otieno requested access for Unit D3 under Omwoyo Apartments', by: 'Kevin Otieno', at: Date.now() - 86400000 * 2 }
  ]
};

class Store {
  constructor() {
    this.listeners = new Set();
    this.state = this.loadState();
    this.initCloudSync();
  }

  initCloudSync() {
    // Initial fetch from cloud
    this.fetchCloudState();

    // Poll periodically for incoming registrations and payments from all devices
    if (typeof window !== 'undefined') {
      setInterval(() => this.fetchCloudState(), 5000);
      window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this.fetchCloudState();
        }
      });
    }
  }

  loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Failed to load state from localStorage:', e);
    }
    return DEFAULT_STATE;
  }

  saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      this.notify();
    } catch (e) {
      console.error('Failed to save state to localStorage:', e);
    }
    this.pushCloudState();
  }

  async fetchCloudState() {
    if (typeof fetch === 'undefined') return;
    try {
      const res = await fetch('/api/sync', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.success && data.state) {
        this.mergeCloudState(data.state);
      }
    } catch (e) {
      // Network unavailable - safely continue locally
    }
  }

  mergeCloudState(cloudState) {
    if (!cloudState) return;
    let changed = false;

    // 1. Merge landlords (union by id)
    if (Array.isArray(cloudState.landlords)) {
      cloudState.landlords.forEach((remoteLl) => {
        const localIndex = this.state.landlords.findIndex((l) => l.id === remoteLl.id);
        if (localIndex === -1) {
          this.state.landlords.push(remoteLl);
          changed = true;
        } else {
          // If remote status or details differ, take the latest
          if (JSON.stringify(this.state.landlords[localIndex]) !== JSON.stringify(remoteLl)) {
            this.state.landlords[localIndex] = remoteLl;
            changed = true;
          }
        }
      });
    }

    // 2. Merge tenants (union by userId)
    if (Array.isArray(cloudState.tenants)) {
      cloudState.tenants.forEach((remoteT) => {
        const localIndex = this.state.tenants.findIndex((t) => t.userId === remoteT.userId);
        if (localIndex === -1) {
          this.state.tenants.push(remoteT);
          changed = true;
        } else {
          if (JSON.stringify(this.state.tenants[localIndex]) !== JSON.stringify(remoteT)) {
            this.state.tenants[localIndex] = remoteT;
            changed = true;
          }
        }
      });
    }

    // 3. Merge payments (union by id)
    if (Array.isArray(cloudState.payments)) {
      cloudState.payments.forEach((remoteP) => {
        const localIndex = this.state.payments.findIndex((p) => p.id === remoteP.id);
        if (localIndex === -1) {
          this.state.payments.push(remoteP);
          changed = true;
        } else {
          if (JSON.stringify(this.state.payments[localIndex]) !== JSON.stringify(remoteP)) {
            this.state.payments[localIndex] = remoteP;
            changed = true;
          }
        }
      });
    }

    // 4. Merge audit entries
    if (Array.isArray(cloudState.audit)) {
      cloudState.audit.forEach((remoteA) => {
        if (!this.state.audit.some((a) => a.id === remoteA.id)) {
          this.state.audit.unshift(remoteA);
          changed = true;
        }
      });
    }

    if (changed) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      } catch (e) {}
      this.notify();
    }
  }

  async pushCloudState() {
    if (typeof fetch === 'undefined') return;
    try {
      const snapshot = {
        landlords: this.state.landlords,
        tenants: this.state.tenants,
        payments: this.state.payments,
        audit: this.state.audit,
        syncedAt: Date.now()
      };

      await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: snapshot })
      });
    } catch (e) {
      // Cloud sync failure will retry on next state change
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    this.listeners.forEach((fn) => {
      try { fn(this.state); } catch (e) { console.error(e); }
    });
  }

  resetToDefault() {
    this.state = JSON.parse(JSON.stringify(DEFAULT_STATE));
    this.saveState();
  }

  // --- Auth: Dedicated Login Menu ---
  loginWithEmail(email) {
    const cleanEmail = (email || '').trim().toLowerCase();

    // 1. Super Admin Authentication (Master Access)
    if (cleanEmail === SUPER_ADMIN_EMAIL.toLowerCase()) {
      const superAdminUser = {
        userId: 'user-superadmin-sammy',
        name: 'Sammy Harrison',
        email: SUPER_ADMIN_EMAIL,
        role: 'superadmin',
        isAdmin: true
      };
      this.setCurrentUser(superAdminUser);
      this.addAudit('Super Admin Login', 'Sammy Harrison logged in as Platform Super Admin');
      return { success: true, role: 'superadmin', user: superAdminUser };
    }

    // 2. Landlord Authentication
    const landlord = this.state.landlords.find(
      (l) => l.email.toLowerCase() === cleanEmail || (cleanEmail === 'linus.omwoyo@gmail.com' && l.id === 'll-1')
    );
    if (landlord) {
      if (landlord.status === 'pending') {
        return {
          success: false,
          isPending: true,
          role: 'owner',
          message: `Your Landlord registration for "${landlord.propertyName}" is pending verification and approval. The Landlord Portal will open once approved.`
        };
      }
      if (landlord.status === 'rejected' || landlord.status === 'suspended') {
        return {
          success: false,
          isBlocked: true,
          message: `Your Landlord account has been ${landlord.status}. Please contact system support for assistance.`
        };
      }

      const landlordUser = {
        userId: landlord.userId,
        landlordId: landlord.id,
        name: landlord.name,
        email: landlord.email,
        role: 'owner',
        landlord,
        isAdmin: true
      };
      this.setCurrentUser(landlordUser);
      this.addAudit('Landlord Login', `${landlord.name} logged in to ${landlord.propertyName}`);
      return { success: true, role: 'owner', user: landlordUser, landlord };
    }

    // 3. Tenant Authentication
    const tenant = this.state.tenants.find((t) => t.email.toLowerCase() === cleanEmail);
    if (tenant) {
      if (tenant.status === 'pending') {
        return {
          success: false,
          isPending: true,
          role: 'tenant',
          message: `Your Tenant account for ${tenant.propertyName} (${tenant.unit}) is pending approval. The Tenant Portal will open once approved.`
        };
      }
      if (tenant.status === 'rejected' || tenant.status === 'declined') {
        return {
          success: false,
          isBlocked: true,
          message: `Your Tenant account request was not approved. Please contact your property manager.`
        };
      }

      const tenantUser = {
        userId: tenant.userId,
        landlordId: tenant.landlordId,
        name: tenant.name,
        email: tenant.email,
        role: 'tenant',
        isAdmin: false,
        tenant
      };
      this.setCurrentUser(tenantUser);
      this.addAudit('Tenant Login', `${tenant.name} (${tenant.unit}) logged in`);
      return { success: true, role: 'tenant', user: tenantUser, tenant };
    }

    return { success: false, message: 'No registered user found with that email. Please check spelling or register below.' };
  }

  loginWithGoogle({ email, name, picture }) {
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail) {
      return { success: false, message: 'Invalid Google account email.' };
    }

    const res = this.loginWithEmail(cleanEmail);
    if (res.success) {
      if (res.user) {
        res.user.authProvider = 'google';
        if (picture) res.user.avatar = picture;
        this.saveState();
      }
      this.addAudit('Google Sign-In', `${name || cleanEmail} signed in via Google`);
      return res;
    }

    if (res.isPending || res.isBlocked) {
      return res;
    }

    // New Google user trying to sign in
    return {
      success: false,
      isNewGoogleUser: true,
      googleProfile: {
        email: cleanEmail,
        name: name || cleanEmail.split('@')[0],
        picture: picture || ''
      },
      message: `No active account for ${cleanEmail}. Please complete registration below to activate access.`
    };
  }

  setCurrentUser(user) {
    this.state.currentUser = user;
    this.saveState();
  }

  getCurrentUser() {
    return this.state.currentUser;
  }

  // Pre-configured Impersonation Switcher (Super Admin Exclusive)
  switchDemoRole(roleKey) {
    const current = this.getCurrentUser();
    const isSuperAdminAuthorized = current && (current.role === 'superadmin' || current.impersonatedBy === SUPER_ADMIN_EMAIL);

    if (!isSuperAdminAuthorized && roleKey !== 'visitor') {
      console.warn('Unauthorized switch attempt: Quick role switcher is strictly restricted to Super Admin.');
      return;
    }

    switch (roleKey) {
      case 'superadmin':
        this.loginWithEmail(SUPER_ADMIN_EMAIL);
        break;

      case 'owner': { // Approved Landlord Linus
        const landlord = this.state.landlords.find((l) => l.id === 'll-1');
        this.setCurrentUser({
          userId: 'user-admin-1',
          landlordId: 'll-1',
          name: landlord?.name || 'Linus Omwoyo',
          email: landlord?.email || 'linusomwoyo2@gmail.com',
          role: 'owner',
          landlord,
          isAdmin: true,
          impersonatedBy: SUPER_ADMIN_EMAIL
        });
        break;
      }

      case 'landlord_pending': { // Pending Landlord David Mutua
        const landlord = this.state.landlords.find((l) => l.id === 'll-2');
        this.setCurrentUser({
          userId: 'user-ll-2',
          landlordId: 'll-2',
          name: landlord?.name || 'David Mutua',
          email: landlord?.email || 'david.mutua@sunrise.co.ke',
          role: 'owner',
          landlord,
          isAdmin: true,
          impersonatedBy: SUPER_ADMIN_EMAIL
        });
        break;
      }

      case 'caretaker': {
        this.setCurrentUser({
          userId: 'user-caretaker-1',
          landlordId: 'll-1',
          name: 'Peter Karanja',
          email: 'peter.caretaker@omwoyo.co.ke',
          role: 'caretaker',
          isAdmin: true,
          impersonatedBy: SUPER_ADMIN_EMAIL
        });
        break;
      }

      case 'tenant_jane': { // Approved Tenant Jane
        const tenant = this.state.tenants.find((t) => t.userId === 'user-t-1');
        this.setCurrentUser({
          userId: 'user-t-1',
          name: tenant?.name || 'Jane Wanjiru',
          email: tenant?.email || 'jane.wanjiru@gmail.com',
          role: 'tenant',
          isAdmin: false,
          tenant,
          impersonatedBy: SUPER_ADMIN_EMAIL
        });
        break;
      }

      case 'tenant_pending': { // Pending Tenant Kevin Otieno
        const tenant = this.state.tenants.find((t) => t.userId === 'user-t-4');
        this.setCurrentUser({
          userId: 'user-t-4',
          name: tenant?.name || 'Kevin Otieno',
          email: tenant?.email || 'kevin.otieno@gmail.com',
          role: 'tenant',
          isAdmin: false,
          tenant,
          impersonatedBy: SUPER_ADMIN_EMAIL
        });
        break;
      }

      case 'visitor':
        this.setCurrentUser(null);
        break;
    }
  }

  // --- Tier 1: Super Admin Approvals & Master Oversight ---
  registerLandlord({ name, email, phone, propertyName, unitsCount, location, tillNumber, paymentInstructions }) {
    const id = 'll-' + Date.now();
    const cleanTill = (tillNumber || '').trim() || String(Math.floor(100000 + Math.random() * 900000));
    const newLandlord = {
      id,
      userId: 'user-ll-' + Date.now(),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      propertyName: propertyName.trim(),
      unitsCount: Number(unitsCount) || 10,
      location: location ? location.trim() : 'Nairobi',
      tillNumber: cleanTill,
      paybillNumber: '',
      inviteCode: propertyName.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8),
      paymentInstructions: paymentInstructions || `Pay online or via M-Pesa Till Number ${cleanTill} (${propertyName.trim()}).\nPlease use your Unit as account reference.`,
      status: 'pending', // Requires Super Admin approval!
      createdAt: Date.now()
    };
    this.state.landlords.push(newLandlord);
    this.addAudit('Landlord Registered', `${newLandlord.name} requested onboarding for ${newLandlord.propertyName} (Till: ${cleanTill})`);

    // Auto-login as this new landlord so they see their pending status
    this.setCurrentUser({
      userId: newLandlord.userId,
      landlordId: newLandlord.id,
      name: newLandlord.name,
      email: newLandlord.email,
      role: 'owner',
      landlord: newLandlord,
      isAdmin: true
    });

    this.saveState();
    return newLandlord;
  }

  approveLandlord(landlordId) {
    const ll = this.state.landlords.find((l) => l.id === landlordId);
    if (!ll) throw new Error('Landlord not found');
    ll.status = 'approved';
    ll.approvedAt = Date.now();
    this.addAudit('Landlord Approved', `Super Admin approved ${ll.name} for ${ll.propertyName}`);
    this.saveState();
    return ll;
  }

  rejectLandlord(landlordId) {
    const ll = this.state.landlords.find((l) => l.id === landlordId);
    if (!ll) throw new Error('Landlord not found');
    ll.status = 'rejected';
    this.addAudit('Landlord Declined', `Super Admin declined onboarding for ${ll.name} (${ll.propertyName})`);
    this.saveState();
    return ll;
  }

  suspendLandlord(landlordId) {
    const ll = this.state.landlords.find((l) => l.id === landlordId);
    if (!ll) throw new Error('Landlord not found');
    ll.status = 'suspended';
    this.addAudit('Landlord Suspended', `Super Admin suspended ${ll.name} (${ll.propertyName})`);
    this.saveState();
    return ll;
  }

  reactivateLandlord(landlordId) {
    const ll = this.state.landlords.find((l) => l.id === landlordId);
    if (!ll) throw new Error('Landlord not found');
    ll.status = 'approved';
    this.addAudit('Landlord Reactivated', `Super Admin reactivated ${ll.name} (${ll.propertyName})`);
    this.saveState();
    return ll;
  }

  getLandlordForUser(user) {
    if (!user) return null;
    if (user.landlord) return user.landlord;
    if (user.landlordId) return this.state.landlords.find((l) => l.id === user.landlordId);
    return this.state.landlords.find((l) => l.userId === user.userId || l.email === user.email);
  }

  // --- Tier 2: Tenant Access & Landlord Scoping ---
  getTenantsForLandlord(landlordId) {
    if (!landlordId) return this.state.tenants;
    return this.state.tenants.filter((t) => t.landlordId === landlordId);
  }

  getPaymentsForLandlord(landlordId) {
    if (!landlordId) return this.state.payments;
    return this.state.payments.filter((p) => p.landlordId === landlordId);
  }

  registerTenant({ name, email, phone, landlordId, unit, monthlyRent }) {
    const targetLandlord = this.state.landlords.find((l) => l.id === landlordId) || this.state.landlords[0];
    const newTenant = {
      userId: 'user-t-' + Date.now(),
      landlordId: targetLandlord ? targetLandlord.id : 'll-1',
      name: (name || '').trim(),
      email: (email || '').trim().toLowerCase(),
      phone: (phone || '').trim(),
      unit: (unit || '').trim(),
      propertyName: targetLandlord ? targetLandlord.propertyName : 'Omwoyo Apartments',
      tillNumber: targetLandlord ? targetLandlord.tillNumber : '582190',
      monthlyRent: Number(monthlyRent) || 15000,
      status: 'pending', // Requires approval by Super Admin and Landlord before portal opens!
      createdAt: Date.now()
    };
    this.state.tenants.push(newTenant);
    this.addAudit('Tenant Requested', `${newTenant.name} submitted access request for ${newTenant.propertyName} (${newTenant.unit}) awaiting approval`);

    this.saveState();
    return newTenant;
  }

  registerTenantRequest(data) {
    return this.registerTenant(data);
  }

  // Super Admin or Landlord: Decide Tenant Access
  decideTenantStatus(userId, status, monthlyRent) {
    const tenant = this.state.tenants.find((t) => t.userId === userId);
    if (!tenant) throw new Error('Tenant not found');

    tenant.status = status;
    if (monthlyRent) {
      tenant.monthlyRent = Number(monthlyRent);
    }
    const current = this.state.currentUser;
    const actorName = current ? (current.role === 'superadmin' ? 'Super Admin' : current.name) : 'Admin';

    if (status === 'approved') {
      tenant.approvedAt = tenant.approvedAt || Date.now();
      this.addAudit('Tenant Approved', `${actorName} approved ${tenant.name} (${tenant.unit}) at ${formatKES(tenant.monthlyRent)}/mo`);
    } else if (status === 'rejected') {
      this.addAudit('Tenant Declined', `${actorName} declined request for ${tenant.name} (${tenant.unit})`);
    } else if (status === 'suspended') {
      this.addAudit('Tenant Suspended', `${actorName} suspended access for ${tenant.name} (${tenant.unit})`);
    }
    this.saveState();
    return tenant;
  }

  updateTenantRent(userId, newRent) {
    const tenant = this.state.tenants.find((t) => t.userId === userId);
    if (!tenant) throw new Error('Tenant not found');
    const oldRent = tenant.monthlyRent;
    tenant.monthlyRent = Number(newRent);
    this.addAudit('Rent Changed', `Updated rent for ${tenant.name} (${tenant.unit}) from ${formatKES(oldRent)} to ${formatKES(newRent)}`);
    this.saveState();
    return tenant;
  }

  updateLandlordTill(landlordId, tillNumber, paymentInstructions) {
    const ll = this.state.landlords.find((l) => l.id === landlordId);
    if (!ll) return;
    ll.tillNumber = tillNumber.trim();
    if (paymentInstructions) ll.paymentInstructions = paymentInstructions.trim();
    // Update all tenants under this landlord
    this.state.tenants.filter((t) => t.landlordId === landlordId).forEach((t) => {
      t.tillNumber = ll.tillNumber;
    });
    this.addAudit('Till Number Updated', `Landlord ${ll.name} updated M-Pesa Till to ${ll.tillNumber}`);
    this.saveState();
  }

  // --- Tier 3: Tenant Bills & Ledger ---
  getTenantBills(tenant) {
    if (!tenant || !tenant.monthlyRent) return [];
    const currentMonth = getCurrentMonth();
    const startMonth = tenant.approvedAt
      ? new Date(tenant.approvedAt).toISOString().slice(0, 7)
      : currentMonth;

    const bills = [];
    const [startYear, startM] = startMonth.split('-').map(Number);
    const [currYear, currM] = currentMonth.split('-').map(Number);

    let y = startYear;
    let m = startM;
    while (y < currYear || (y === currYear && m <= currM)) {
      const monthStr = `${y}-${String(m).padStart(2, '0')}`;
      bills.push({
        tenantId: tenant.userId,
        month: monthStr,
        amount: tenant.monthlyRent
      });
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
    }
    return bills;
  }

  getTenantLedger(tenant) {
    if (!tenant) return { bills: [], confirmedTotal: 0, billedTotal: 0, balance: 0, outstandingMonths: [] };

    const bills = this.getTenantBills(tenant);
    const confirmedPayments = this.state.payments.filter(
      (p) => p.tenantId === tenant.userId && p.status === 'confirmed'
    );
    const confirmedTotal = confirmedPayments.reduce((sum, p) => sum + p.amount, 0);
    const billedTotal = bills.reduce((sum, b) => sum + b.amount, 0);
    const balance = billedTotal - confirmedTotal;

    let remainingPaid = confirmedTotal;
    const allocatedBills = bills.map((bill) => {
      const paidForBill = Math.max(0, Math.min(remainingPaid, bill.amount));
      remainingPaid -= paidForBill;
      return {
        ...bill,
        paid: paidForBill,
        outstanding: bill.amount - paidForBill
      };
    });

    const outstandingMonths = allocatedBills.filter((b) => b.outstanding > 0);

    return {
      bills: allocatedBills,
      confirmedTotal,
      billedTotal,
      balance,
      outstandingMonths
    };
  }

  // --- Payments ---
  initiateMpesaPayment({ tenantId, amount, phone, date }) {
    const tenant = this.state.tenants.find((t) => t.userId === tenantId);
    if (!tenant) throw new Error('Tenant not found');

    const paymentMonth = date ? date.slice(0, 7) : getCurrentMonth();
    const id = 'pay-' + Date.now();
    const receiptNo = `RCT-${paymentMonth.replace('-', '')}-${id.slice(-5).toUpperCase()}`;

    // Look up landlord's till
    const landlord = this.state.landlords.find((l) => l.id === tenant.landlordId);
    const till = landlord ? landlord.tillNumber : tenant.tillNumber || '582190';

    const newPayment = {
      id,
      landlordId: tenant.landlordId || 'll-1',
      tenantId: tenant.userId,
      tenantName: tenant.name,
      unit: tenant.unit,
      amount: Number(amount),
      month: paymentMonth,
      method: `M-Pesa Till ${till}`,
      channel: 'mpesa',
      payerPhone: phone,
      payerName: tenant.name,
      status: 'processing',
      receiptNo,
      createdAt: Date.now()
    };

    this.state.payments.unshift(newPayment);
    this.saveState();
    return newPayment;
  }

  finalizePayment(paymentId, status, mpesaReceipt = '', failureReason = '', tenantMessage = '') {
    const payment = this.state.payments.find((p) => p.id === paymentId);
    if (!payment) return null;

    payment.status = status;
    if (mpesaReceipt) payment.mpesaReceipt = mpesaReceipt;
    if (tenantMessage) payment.tenantMessage = tenantMessage;

    if (status === 'confirmed') {
      payment.mpesaReceipt = mpesaReceipt || 'QK' + Math.random().toString(36).substring(2, 9).toUpperCase();
      payment.paidAt = Date.now();
      this.addAudit('Payment Confirmed', `Received ${formatKES(payment.amount)} from ${payment.tenantName} (${payment.unit}) via ${payment.method}`);
    } else if (status === 'pending') {
      payment.submittedAt = Date.now();
      this.addAudit('Payment Dispatched to Landlord', `Payment ${payment.mpesaReceipt} (${formatKES(payment.amount)}) sent to Landlord for confirmation`);
    } else if (status === 'failed') {
      payment.failureReason = failureReason || 'M-Pesa PIN cancelled by user';
    }
    this.saveState();
    return payment;
  }

  // Tenant: Post payment message (SMS or code) to Landlord for confirmation
  postTenantPaymentMessage({ tenantId, amount, mpesaCode, smsText = '', phone, month }) {
    const tenant = this.state.tenants.find((t) => t.userId === tenantId);
    if (!tenant) throw new Error('Tenant not found');

    const landlord = this.state.landlords.find((l) => l.id === tenant.landlordId);
    const till = landlord ? landlord.tillNumber : tenant.tillNumber || '582190';

    let cleanCode = (mpesaCode || '').trim().toUpperCase();
    let finalAmount = Number(amount) || tenant.monthlyRent;

    // Auto-parse from SMS text if code or amount not explicitly given
    if (smsText) {
      if (!cleanCode) {
        const codeMatch = smsText.match(/\b([A-Z0-9]{8,12})\b/);
        if (codeMatch) cleanCode = codeMatch[1].toUpperCase();
      }
      if (!amount) {
        const amtMatch = smsText.match(/Ksh\.?\s*([\d,]+(?:\.\d{2})?)/i) || smsText.match(/KES\.?\s*([\d,]+(?:\.\d{2})?)/i);
        if (amtMatch) finalAmount = Number(amtMatch[1].replace(/,/g, ''));
      }
    }

    if (!cleanCode) {
      cleanCode = 'QK' + Math.random().toString(36).substring(2, 10).toUpperCase();
    }

    const currentMonth = month || getCurrentMonth();
    const id = 'pay-post-' + Date.now();
    const receiptNo = `RCT-${currentMonth.replace('-', '')}-${id.slice(-5).toUpperCase()}`;

    const newPayment = {
      id,
      landlordId: tenant.landlordId || 'll-1',
      tenantId: tenant.userId,
      tenantName: tenant.name,
      unit: tenant.unit,
      amount: finalAmount,
      month: currentMonth,
      method: `M-Pesa Till ${till}`,
      channel: 'tenant_posted_sms',
      mpesaReceipt: cleanCode,
      payerPhone: phone || tenant.phone,
      payerName: tenant.name,
      tenantMessage: smsText.trim() || `Payment confirmation code ${cleanCode} submitted for ${formatKES(finalAmount)}`,
      smsText: smsText.trim(),
      receiptNo,
      status: 'pending', // Awaiting Landlord confirmation!
      submittedAt: Date.now(),
      createdAt: Date.now()
    };

    this.state.payments.unshift(newPayment);
    this.addAudit(
      'Tenant Message Posted',
      `${tenant.name} (${tenant.unit}) submitted payment message for ${formatKES(finalAmount)} (Code: ${cleanCode}) - awaiting Landlord confirmation`
    );
    this.saveState();
    return { success: true, payment: newPayment };
  }

  // Landlord or Super Admin: Mark Payment as Paid or Not Paid
  decidePaymentStatus(paymentId, status, tenantIdOverride) {
    const payment = this.state.payments.find((p) => p.id === paymentId);
    if (!payment) throw new Error('Payment not found');

    if (tenantIdOverride) {
      const tenant = this.state.tenants.find((t) => t.userId === tenantIdOverride);
      if (tenant) {
        payment.tenantId = tenant.userId;
        payment.tenantName = tenant.name;
        payment.unit = tenant.unit;
        payment.landlordId = tenant.landlordId || payment.landlordId;
      }
    }

    payment.status = status;
    const actor = this.state.currentUser ? this.state.currentUser.name : 'Admin';

    if (status === 'confirmed') {
      payment.paidAt = payment.paidAt || Date.now();
      payment.approvedAt = Date.now();
      payment.approvedBy = actor;
      if (!payment.receiptNo) {
        payment.receiptNo = `RCT-${payment.month.replace('-', '')}-${payment.id.slice(-5).toUpperCase()}`;
      }
      this.addAudit('Payment Confirmed & Approved', `${actor} confirmed & approved payment ${payment.mpesaReceipt || payment.id} of ${formatKES(payment.amount)} from ${payment.tenantName} (${payment.unit})`);
    } else if (status === 'rejected') {
      payment.rejectedAt = Date.now();
      payment.rejectedBy = actor;
      this.addAudit('Payment Declined (Not Paid)', `${actor} declined payment of ${formatKES(payment.amount)} from ${payment.tenantName} (${payment.unit})`);
    }
    this.saveState();
    return payment;
  }

  deletePayment(paymentId) {
    const idx = this.state.payments.findIndex((p) => p.id === paymentId);
    if (idx !== -1) {
      const p = this.state.payments[idx];
      this.state.payments.splice(idx, 1);
      this.addAudit('Payment Deleted', `Deleted record of ${formatKES(p.amount)} for ${p.tenantName}`);
      this.saveState();
    }
  }

  hidePaymentForTenant(paymentId) {
    const payment = this.state.payments.find((p) => p.id === paymentId);
    if (payment) {
      payment.hiddenByTenant = true;
      this.saveState();
    }
  }

  // --- SMS Forwarding & Tenant Phone Message Reader ---
  parseIncomingSms(smsText, landlordId = 'll-1') {
    if (!smsText || typeof smsText !== 'string') {
      return { success: false, message: 'Empty or invalid SMS text provided.' };
    }

    // 1. Transaction Code (e.g. QK49L908P1)
    const codeMatch = smsText.match(/^([A-Z0-9]{8,12})\s+Confirmed/i) || 
                      smsText.match(/\b([A-Z0-9]{10})\b/) ||
                      smsText.match(/Receipt\s*(?:No\.?|#)?\s*([A-Z0-9]{8,12})/i);
    const code = codeMatch ? codeMatch[1].toUpperCase() : 'QK' + Math.random().toString(36).slice(2, 10).toUpperCase();

    // 2. Amount in KES (e.g. Ksh15,000.00 or Ksh 15000)
    const amountMatch = smsText.match(/(?:Ksh|KSH|KES)\.?\s*([0-9,]+(?:\.[0-9]{2})?)/i) ||
                        smsText.match(/received\s+([0-9,]+)/i);
    const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : 15000;

    // 3. Sender / Tenant Phone Number (e.g. 0712345678 or 254712345678)
    const phoneMatch = smsText.match(/(?:from|sent by|phone|account)\s+.*?(254[71]\d{8}|0[71]\d{8})/i) ||
                       smsText.match(/\b(254[71]\d{8}|0[71]\d{8})\b/);
    const phone = phoneMatch ? phoneMatch[1] : '';

    // 4. Unit / Account Reference (e.g. Reference: Unit B4 or Unit B4 or B4)
    const unitMatch = smsText.match(/(?:unit|house|apt|room|ref|account)\s*[:#\-]?\s*([A-Za-z0-9\-]+)/i);
    const rawUnit = unitMatch ? unitMatch[1].trim() : '';

    // 5. Payer / Tenant Name
    const nameMatch = smsText.match(/(?:from|sent by)\s+([A-Za-z\s]+?)(?:\s+(?:254|0[71]|\d+|on|at|\.|\-)|$)/i);
    const payerName = nameMatch ? nameMatch[1].trim() : '';

    // 6. Match against Landlord's registered tenants
    let matchedTenant = null;
    let matchedBy = null;
    const tenants = this.getTenantsForLandlord(landlordId);

    // Try Phone Match
    if (phone) {
      const formattedPhone = formatPhone(phone);
      matchedTenant = tenants.find((t) => formatPhone(t.phone) === formattedPhone);
      if (matchedTenant) matchedBy = 'Phone (' + formattedPhone + ')';
    }

    // Try Unit Reference Match
    if (!matchedTenant && rawUnit) {
      const cleanUnit = rawUnit.toLowerCase().replace(/[^a-z0-9]/g, '');
      matchedTenant = tenants.find((t) => {
        const tUnit = t.unit.toLowerCase().replace(/[^a-z0-9]/g, '');
        return tUnit.includes(cleanUnit) || cleanUnit.includes(tUnit);
      });
      if (matchedTenant) matchedBy = 'Unit Reference (' + matchedTenant.unit + ')';
    }

    // Try Name Match
    if (!matchedTenant && payerName) {
      const lowerName = payerName.toLowerCase();
      matchedTenant = tenants.find((t) => {
        const tLower = t.name.toLowerCase();
        return tLower.includes(lowerName) || lowerName.includes(tLower);
      });
      if (matchedTenant) matchedBy = 'Tenant Name (' + matchedTenant.name + ')';
    }

    const currentMonth = getCurrentMonth();
    const payment = {
      id: 'pay-sms-' + Date.now(),
      landlordId,
      tenantId: matchedTenant ? matchedTenant.userId : '',
      tenantName: matchedTenant ? matchedTenant.name : (payerName || 'Unknown Tenant'),
      unit: matchedTenant ? matchedTenant.unit : (rawUnit ? 'Unit ' + rawUnit : 'Unassigned'),
      amount: amount || 15000,
      month: currentMonth,
      method: 'M-Pesa SMS Reader',
      channel: 'sms',
      mpesaReceipt: code,
      payerPhone: phone || (matchedTenant ? matchedTenant.phone : ''),
      payerName: payerName || (matchedTenant ? matchedTenant.name : 'M-Pesa Sender'),
      smsText,
      matchedBy: matchedBy || 'Manual Landlord Review',
      status: 'pending', // Awaiting landlord confirmation (Mark as Paid)
      createdAt: Date.now()
    };

    this.state.payments.unshift(payment);
    this.state.settings.smsLastReceivedAt = Date.now();
    this.state.settings.smsLastResult = matchedTenant
      ? `Matched: ${matchedTenant.name} (${matchedTenant.unit})`
      : 'Unmatched sender';
    this.addAudit('M-Pesa Message Read', `Parsed SMS ${code} for ${formatKES(payment.amount)} from tenant phone: ${matchedTenant ? matchedTenant.name : 'Unmatched'}`);
    this.saveState();

    return {
      success: true,
      payment,
      matchedTenant,
      matchedBy,
      code,
      amount,
      phone,
      unit: payment.unit
    };
  }

  regenerateSmsWebhook() {
    const randomKey = Math.random().toString(36).substring(2, 12);
    this.state.settings.smsWebhookUrl = `https://rentmaster.app/api/webhook/mpesa-forward/${randomKey}`;
    this.saveState();
    return this.state.settings.smsWebhookUrl;
  }

  // --- Caretaker Staff Management ---
  addCaretaker(email, landlordId = 'll-1') {
    const cleanEmail = email.trim().toLowerCase();
    const existing = this.state.staff.find((s) => s.email === cleanEmail);
    if (existing) throw new Error('Caretaker already exists');

    const newStaff = {
      id: 'st-' + Date.now(),
      landlordId,
      email: cleanEmail,
      addedAt: Date.now()
    };
    this.state.staff.push(newStaff);
    this.addAudit('Caretaker Added', `Granted caretaker role to ${cleanEmail}`);
    this.saveState();
    return newStaff;
  }

  removeCaretaker(id) {
    const staff = this.state.staff.find((s) => s.id === id);
    if (staff) {
      this.state.staff = this.state.staff.filter((s) => s.id !== id);
      this.addAudit('Caretaker Removed', `Revoked caretaker access for ${staff.email}`);
      this.saveState();
    }
  }

  // --- Audit Logs ---
  addAudit(action, detail) {
    const user = this.state.currentUser;
    this.state.audit.unshift({
      id: 'aud-' + Date.now(),
      action,
      detail,
      by: user ? user.name || user.email : 'System',
      at: Date.now()
    });
    if (this.state.audit.length > 200) {
      this.state.audit.pop();
    }
  }

  // --- Settings ---
  updateSettings(newSettings) {
    this.state.settings = { ...this.state.settings, ...newSettings };
    this.addAudit('Settings Updated', 'Property settings and payment instructions saved');
    this.saveState();
  }

  // --- Safaricom Daraja Real STK Push Config ---
  updateDarajaConfig(newConfig) {
    if (!this.state.settings.daraja) {
      this.state.settings.daraja = {};
    }
    this.state.settings.daraja = { ...this.state.settings.daraja, ...newConfig };
    this.addAudit('Daraja Config Updated', `Safaricom M-Pesa API settings updated (${newConfig.env || 'sandbox'})`);
    this.saveState();
  }

  getDarajaConfig() {
    return this.state.settings.daraja || {
      env: 'sandbox',
      consumerKey: '',
      consumerSecret: '',
      passkey: '',
      shortcode: '',
      enabled: false
    };
  }
}

export const store = new Store();
window.rentStore = store;
