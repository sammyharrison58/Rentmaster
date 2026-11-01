// Rentmaster AI Agent - Interactive Resident Concierge & Landlord Copilot
// Answers real-time questions for both Tenants and Landlords using live property data & Kenyan Tenancy rules

export class AIAgent {
  constructor(store, app) {
    this.store = store;
    this.app = app;
    this.isOpen = false;
    this.messages = [];
    this.currentUser = null;
    this.hasGreeted = false;
  }

  // Set the current authenticated user (tenant or landlord)
  setUser(user) {
    const previousUser = this.currentUser;
    this.currentUser = user;

    if (!user || (previousUser && previousUser.userId !== user.userId)) {
      this.messages = [];
      this.hasGreeted = false;
    }

    if (this.isOpen) {
      this.renderMessages();
      this.renderQuickPrompts();
    }
    this.renderLauncher();
  }

  // --- Live Context Extraction Engine ---
  getTenantContext(user) {
    if (!user) return null;
    const tenant = user.tenant || this.store.state.tenants.find((t) => t.userId === user.userId);
    if (!tenant) return null;

    const landlord = this.store.state.landlords.find((l) => l.id === tenant.landlordId);
    const tillNumber = landlord ? landlord.tillNumber : tenant.tillNumber || '582190';
    const propertyName = landlord ? landlord.propertyName : 'Omwoyo Apartments';
    const landlordName = landlord ? landlord.name : 'Linus Omwoyo';

    // Calculate current balance
    const bills = this.store.getTenantBills ? this.store.getTenantBills(tenant) : [];
    const totalOutstanding = bills.reduce((sum, b) => sum + (b.outstanding || 0), 0);
    const payments = this.store.state.payments.filter((p) => p.tenantId === tenant.userId);
    const confirmedPayments = payments.filter((p) => p.status === 'confirmed');
    const pendingPayments = payments.filter((p) => p.status === 'pending');

    return {
      type: 'tenant',
      tenant,
      name: tenant.name,
      unit: tenant.unit,
      monthlyRent: tenant.monthlyRent,
      phone: tenant.phone,
      landlordName,
      propertyName,
      tillNumber,
      totalOutstanding,
      bills,
      confirmedPaymentsCount: confirmedPayments.length,
      pendingPaymentsCount: pendingPayments.length,
      lastPayment: payments[0] || null,
      caretaker: {
        name: 'Sammy Harrison',
        phone: '0748 082 906',
        role: 'Resident Caretaker & Maintenance Desk'
      }
    };
  }

  getLandlordContext(user) {
    if (!user) return null;
    const landlord = user.landlord || this.store.state.landlords.find((l) => l.userId === user.userId) || this.store.state.landlords[0];
    if (!landlord) return null;

    const properties = [landlord];
    const tenants = this.store.state.tenants.filter((t) => t.landlordId === landlord.id);
    const approvedTenants = tenants.filter((t) => t.status === 'approved');
    const pendingTenants = tenants.filter((t) => t.status === 'pending');

    const payments = this.store.state.payments.filter((p) => p.landlordId === landlord.id);
    const confirmedPayments = payments.filter((p) => p.status === 'confirmed');
    const pendingPayments = payments.filter((p) => p.status === 'pending');

    const totalCollected = confirmedPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const expectedMonthly = approvedTenants.reduce((sum, t) => sum + (Number(t.monthlyRent) || 0), 0);

    // Identify tenants who haven't paid this month
    const currentMonth = new Date().toISOString().slice(0, 7);
    const paidTenantIds = new Set(
      confirmedPayments.filter((p) => p.month === currentMonth).map((p) => p.tenantId)
    );
    const unpaidTenants = approvedTenants.filter((t) => !paidTenantIds.has(t.userId));

    return {
      type: 'landlord',
      landlord,
      name: landlord.name,
      propertyName: landlord.propertyName,
      tillNumber: landlord.tillNumber,
      unitsCount: landlord.unitsCount,
      approvedTenantsCount: approvedTenants.length,
      pendingTenantsCount: pendingTenants.length,
      totalCollected,
      expectedMonthly,
      pendingPaymentsCount: pendingPayments.length,
      unpaidTenants,
      pendingPayments
    };
  }

  // --- Natural Language Knowledge & Response Generator ---
  generateResponse(query) {
    const q = (query || '').toLowerCase().trim();
    const user = this.currentUser;
    const isTenant = user && user.role === 'tenant';
    const isLandlord = user && (user.role === 'owner' || user.role === 'landlord' || user.role === 'caretaker' || user.role === 'superadmin');

    const tCtx = isTenant ? this.getTenantContext(user) : null;
    const lCtx = isLandlord ? this.getLandlordContext(user) : null;

    // Helper formatters
    const kes = (num) => `KES ${Number(num || 0).toLocaleString()}`;

    // 1. Swahili & English Greetings
    if (/^(hi|hello|hey|habari|jambo|mambo|sasa|good (morning|afternoon|evening)|niaje)/i.test(q)) {
      if (tCtx) {
        return `Hello **${tCtx.name}**! 👋 I am your **Rentmaster Resident AI Concierge** for **${tCtx.propertyName} (${tCtx.unit})**.\n\nI can help you with:\n- 💳 Paying rent directly to Till **${tCtx.tillNumber}**\n- ⏰ M-Pesa 10-minute SMS verification rules\n- 🧾 Checking your current balance & receipts\n- 🔧 Contacting Caretaker **Sammy Harrison** (${tCtx.caretaker.phone})\n\nHow can I assist you today?`;
      }
      if (lCtx) {
        return `Hello **${lCtx.name}**! 👋 I am your **Rentmaster Property AI Copilot** for **${lCtx.propertyName}**.\n\nI can help you with:\n- 📊 Today's collections (${kes(lCtx.totalCollected)})\n- ⚠️ Tracking ${lCtx.unpaidTenants.length} tenants with pending rent this month\n- 🔒 Reviewing pending payments & digital security seals\n- 📜 Kenyan Tenancy Tribunal & eviction guidelines\n\nWhat would you like to review?`;
      }
      return `Hello! 👋 I am the **Rentmaster AI Assistant**. Log in as a Tenant or Landlord to get personalized, real-time property intelligence.`;
    }

    // -------------------------------------------------------------
    // TENANT QUERIES
    // -------------------------------------------------------------
    if (tCtx) {
      // 1. Till Number & How to Pay
      if (q.includes('till') || q.includes('how to pay') || q.includes('kulipa') || q.includes('payment method') || q.includes('pay rent') || q.includes('paybill') || q.includes('lipa')) {
        return `### 💳 How to Pay Rent via M-Pesa Buy Goods\n\n1. Open M-Pesa on your Safaricom phone.\n2. Select **Lipa na M-PESA** ➜ **Buy Goods and Services**.\n3. Enter Property Till: **\`${tCtx.tillNumber}\`** (*${tCtx.propertyName}*).\n4. Enter your monthly rent amount: **${kes(tCtx.monthlyRent)}**.\n5. Enter your M-Pesa PIN and press **OK**.\n6. **Immediately copy your Safaricom SMS** and paste it into the **Post Payment Message** tab on your portal.\n\n> ⚠️ **Important Security Rule**: Paste your SMS within **10 minutes** of payment. The Till number in the SMS must match **${tCtx.tillNumber}** exactly.`;
      }

      // 2. 10-Minute SMS Verification & Read-Only Explanation
      if (q.includes('10 min') || q.includes('ten min') || q.includes('late') || q.includes('sms') || q.includes('read only') || q.includes('readonly') || q.includes('reject') || q.includes('failed') || q.includes('why cannot edit') || q.includes('tamper')) {
        return `### ⏰ Anti-Fraud SMS Verification & Read-Only Policy\n\nTo prevent fake receipts, double claims, and financial disputes, Rentmaster enforces bank-grade verification:\n\n1. **Freshness Rule (10-Minute Window)**: The SMS timestamp must be within **10 minutes** of current time and dated **today**.\n2. **Strict Till Check**: The SMS must indicate money was paid to Till **\`${tCtx.tillNumber}\`**.\n3. **Read-Only Fields**: Transaction Code and Amount are locked to **Read-Only** so they cannot be altered or falsified manually. They populate automatically once your authentic SMS is verified.\n4. **Duplicate Protection**: Transaction codes are registered permanently in our tamper-proof ledger and cannot be re-used.\n\n*If your message failed verification, ensure you pasted a complete, unedited Safaricom SMS completed today within the last 10 minutes.*`;
      }

      // 3. Balance & Owed Rent
      if (q.includes('balance') || q.includes('owe') || q.includes('how much') || q.includes('rent amount') || q.includes('deni') || q.includes('baki')) {
        const balStr = tCtx.totalOutstanding > 0 ? `⚠️ You currently have an outstanding balance of **${kes(tCtx.totalOutstanding)}**.` : `🎉 **All Clear!** Your account has a zero balance (**KES 0**). You are fully up to date on rent.`;
        return `### 🧾 Your Rent Account Summary\n\n- **Tenant:** ${tCtx.name}\n- **Assigned Unit:** ${tCtx.unit} (*${tCtx.propertyName}*)\n- **Monthly Rent:** ${kes(tCtx.monthlyRent)}\n- **Current Balance:** ${balStr}\n- **Confirmed Payments:** ${tCtx.confirmedPaymentsCount} payment(s) recorded.\n${tCtx.pendingPaymentsCount > 0 ? `- **Pending Verification:** ${tCtx.pendingPaymentsCount} payment awaiting landlord confirmation.\n` : ''}\nRent is due by the **5th of every month** via Till **${tCtx.tillNumber}**.`;
      }

      // 4. Receipts & Statements
      if (q.includes('receipt') || q.includes('statement') || q.includes('stakabadhi') || q.includes('download') || q.includes('proof')) {
        return `### 📄 Official Receipts & Payment Statements\n\nAll payments confirmed by your landlord automatically generate official digital receipts with cryptographic security seals:\n\n- **View Receipts:** Click the **Payments & History** tab in your portal.\n- **Download Statement:** Click the **"📥 Download Statement"** button in your history tab to save a printable PDF summary for your records or employer reimbursement.\n- **Digital Seal:** Every receipt contains an immutable verification seal (e.g. \`RMS-SEC-...\`) recognized by Kenyan financial and legal bodies.`;
      }

      // 5. Caretaker & Maintenance
      if (q.includes('caretaker') || q.includes('repair') || q.includes('maintenance') || q.includes('water') || q.includes('plumber') || q.includes('leak') || q.includes('lights') || q.includes('garbage') || q.includes('emergency')) {
        return `### 🔧 Resident Caretaker & Maintenance Help Desk\n\nFor on-site facility issues (water supply, plumbing, electrical repairs, compound security):\n\n- **Resident Caretaker:** **${tCtx.caretaker.name}**\n- **Direct Line:** [${tCtx.caretaker.phone}](tel:${tCtx.caretaker.phone.replace(/\\s/g, '')})\n- **WhatsApp:** Click the WhatsApp button on your Resident Help Desk widget to message Peter instantly.\n- **Working Hours:** 7:00 AM – 7:00 PM (Emergency desk 24/7 for burst pipes or blackouts).`;
      }

      // 6. Security Deposit & Move-out rules
      if (q.includes('deposit') || q.includes('move out') || q.includes('vacate') || q.includes('refund') || q.includes('leaving')) {
        return `### 📦 Security Deposit & Notice to Vacate\n\n- **Notice Period:** As per your tenancy agreement and Kenyan law, provide **one full calendar month's written notice** before the 1st of the month you intend to vacate.\n- **Deposit Refund:** Refunded within **14 to 30 days** following joint move-out inspection, less verified utility bills and repairs for damages beyond normal wear and tear.\n- **Deposit as Rent:** By law, security deposits are held in trust for property protection and cannot be converted into your last month's rent.`;
      }
    }

    // -------------------------------------------------------------
    // LANDLORD QUERIES
    // -------------------------------------------------------------
    if (lCtx) {
      // 1. Collections & Financial Status
      if (q.includes('collection') || q.includes('total') || q.includes('income') || q.includes('how much') || q.includes('pesa') || q.includes('revenue') || q.includes('rent roll')) {
        const rate = lCtx.expectedMonthly > 0 ? Math.round((lCtx.totalCollected / lCtx.expectedMonthly) * 100) : 0;
        return `### 📊 Financial Collections Summary for ${lCtx.propertyName}\n\n- **Total Collected This Month:** **${kes(lCtx.totalCollected)}**\n- **Target Monthly Rent Roll:** ${kes(lCtx.expectedMonthly)}\n- **Collection Rate:** **${rate}%**\n- **Approved Active Tenants:** ${lCtx.approvedTenantsCount} of ${lCtx.unitsCount} Units\n- **Pending Payment Approvals:** ${lCtx.pendingPaymentsCount} transaction(s)\n\n*Tip: Click "Download Excel / CSV Statement" on your Dashboard to export audit-ready financial spreadsheets.*`;
      }

      // 2. Unpaid Tenants / Who hasn't paid
      if (q.includes('who has not') || q.includes('unpaid') || q.includes('late') || q.includes('pending rent') || q.includes('arrears') || q.includes('defaulter') || q.includes('hawajalipa')) {
        if (lCtx.unpaidTenants.length === 0) {
          return `### 🎉 Perfect Record!\n\nAll **${lCtx.approvedTenantsCount} approved tenants** in **${lCtx.propertyName}** have paid rent for this billing cycle! Zero arrears recorded.`;
        }
        const tenantList = lCtx.unpaidTenants.map((t) => `- **${t.name}** (${t.unit}) — Rent: **${kes(t.monthlyRent)}** · Phone: [${t.phone}](tel:${t.phone})`).join('\n');
        return `### ⚠️ Unpaid Tenants for Current Month (${lCtx.unpaidTenants.length})\n\nThe following tenants have not yet completed rent confirmation for this cycle:\n\n${tenantList}\n\n*Tip: You can send a 1-click WhatsApp rent reminder from the Tenants tab.*`;
      }

      // 3. Payment Approval & Digital Security Seal
      if (q.includes('approve') || q.includes('confirm payment') || q.includes('seal') || q.includes('verify') || q.includes('fraud') || q.includes('mismatch')) {
        return `### 🔒 Payment Verification & Approval Guide\n\n1. **Pending Payments Queue:** Review payments in your **Pending Tenant Payments** card.\n2. **Green Security Badge:** Look for **\`Secured SMS (Verified Till & Freshness)\`**. This guarantees Rentmaster verified:\n   - Exact match with your Till **${lCtx.tillNumber}**\n   - Fresh Safaricom timestamp within 10 minutes\n   - Authenticity seal with immutable cryptographic hash\n3. **Confirm & Approve:** Click **"Confirm & Approve (Paid)"** to approve the rent payment. A digital receipt is automatically dispatched to the tenant.\n4. **Decline (Not Paid):** If a tenant pastes an invalid message or cancels, click **"Decline"** with an optional note.`;
      }

      // 4. Onboarding Tenants & WhatsApp Invites
      if (q.includes('invite') || q.includes('whatsapp') || q.includes('add tenant') || q.includes('onboard') || q.includes('flyer') || q.includes('poster')) {
        return `### 📲 Inviting Tenants & Property Signage\n\n- **1-Click WhatsApp Invite:** Go to the **Tenants tab** and click **"📱 WhatsApp Invite"** next to any tenant to send an automatic onboarding link.\n- **Printable A4 Notice Board Flyer:** Click **"🖨️ Print Notice Board Flyer"** to generate an A4 poster with your Till **${lCtx.tillNumber}**, building rules, and QR code to post at building entrances.\n- **Manual Add:** Click **"+ Add Tenant"** to register a new resident and assign their monthly rent and unit.`;
      }

      // 5. Kenyan Tenancy Law (Rent Restriction Tribunal & Eviction Notice)
      if (q.includes('law') || q.includes('evict') || q.includes('eviction') || q.includes('tribunal') || q.includes('notice period') || q.includes('increase rent') || q.includes('legal')) {
        return `### ⚖️ Kenyan Tenancy Law Quick Reference (Rent Restriction & Landlord-Tenant Act)\n\n1. **Eviction Notice Period:** Under Kenyan law, landlords cannot perform summary evictions. You must serve a formal **minimum 30-day notice to quit** (or as specified in the lease, typically up to 90 days for commercial premises).\n2. **Illegal Eviction Acts:** Locking out tenants without an order from the Rent Restriction Tribunal / Business Premises Rent Tribunal, disconnecting water or electricity, or seizing household property without licensed auctioneers is **illegal under the Penal Code**.\n3. **Rent Increases:** Permitted under Kenyan law with a **formal minimum 1-month written notice**, typically aligned with market valuation or substantial capital improvements.\n4. **Security Deposit Handling:** Landlord must refund deposit within **14 to 30 days** post-inspection, itemizing any legitimate deduction with receipts.`;
      }
    }

    // -------------------------------------------------------------
    // GENERAL FALLBACK RESPONSE
    // -------------------------------------------------------------
    return `### Rentmaster Intelligent Property Assistant\n\nI understand your question regarding "${query}".\n\nHere are quick actions you can take right now:\n- **For Payments:** Pay via Official Till **${(tCtx && tCtx.tillNumber) || (lCtx && lCtx.tillNumber) || '582190'}**.\n- **For Verification:** Paste complete Safaricom SMS within 10 minutes.\n- **For Emergency On-Site Help:** Contact Caretaker **Sammy Harrison** at **0748 082 906**.\n\nCould you specify if you are inquiring about **rent payments**, **balances**, **tenant onboarding**, or **payment verification**?`;
  }

  // --- UI Component Rendering ---
  mount() {
    let root = document.getElementById('ai-agent-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'ai-agent-root';
      document.body.appendChild(root);
    }

    root.innerHTML = `
      <!-- Floating AI Launcher Pill -->
      <div id="ai-agent-launcher" class="ai-launcher-container" style="position: fixed; bottom: 5.75rem; right: 1.5rem; z-index: 990; transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);">
        <button id="btn-toggle-ai-agent" type="button" class="ai-launcher-btn" style="display: flex; align-items: center; gap: 0.625rem; padding: 0.625rem 1.125rem; border-radius: 9999px; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #ffffff; border: 1.5px solid rgba(255, 255, 255, 0.15); box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.35), 0 0 15px rgba(16, 185, 129, 0.2); cursor: pointer; font-family: inherit; font-size: 0.875rem; font-weight: 700;">
          <span style="display: inline-flex; align-items: center; justify-content: center; width: 1.75rem; height: 1.75rem; border-radius: 50%; background: linear-gradient(135deg, #10b981 0%, #065f46 100%); color: #ffffff; font-size: 0.875rem; box-shadow: 0 0 10px rgba(16, 185, 129, 0.5);">
            ✨
          </span>
          <span id="ai-launcher-text">Ask AI Concierge</span>
          <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #10b981; box-shadow: 0 0 8px #10b981;"></span>
        </button>
      </div>

      <!-- Slide-Up AI Chat Window -->
      <div id="ai-agent-panel" class="ai-chat-panel" style="display: none; position: fixed; bottom: 5.5rem; right: 1.5rem; width: min(400px, calc(100vw - 2rem)); height: 560px; max-height: calc(100vh - 7rem); background: #ffffff; border: 1.5px solid var(--slate-200); border-radius: 1.25rem; box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.25), 0 0 20px rgba(15, 23, 42, 0.08); z-index: 1000; flex-direction: column; overflow: hidden; font-family: inherit;">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #ffffff; padding: 1rem 1.25rem; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <div style="position: relative; width: 2.25rem; height: 2.25rem; border-radius: 50%; background: linear-gradient(135deg, #10b981 0%, #047857 100%); display: flex; align-items: center; justify-content: center; font-size: 1.125rem; box-shadow: 0 0 12px rgba(16, 185, 129, 0.4);">
              ✨
              <span style="position: absolute; bottom: 0; right: 0; width: 9px; height: 9px; border-radius: 50%; background: #10b981; border: 2px solid #0f172a;"></span>
            </div>
            <div>
              <div id="ai-panel-title" style="font-weight: 800; font-size: 0.9375rem; letter-spacing: -0.01em;">Rentmaster AI Concierge</div>
              <div id="ai-panel-subtitle" style="font-size: 0.6875rem; color: #94a3b8; display: flex; align-items: center; gap: 0.375rem;">
                <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #10b981;"></span>
                <span>Active 24/7 · Powered by Rentmaster Core</span>
              </div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 0.25rem;">
            <button id="btn-clear-ai-chat" type="button" title="Clear Chat" style="background: transparent; border: none; color: #94a3b8; cursor: pointer; padding: 0.375rem; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center;">
              <i data-lucide="trash-2" style="width: 1rem; height: 1rem;"></i>
            </button>
            <button id="btn-close-ai-agent" type="button" title="Close" style="background: transparent; border: none; color: #94a3b8; cursor: pointer; padding: 0.375rem; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center;">
              <i data-lucide="x" style="width: 1.25rem; height: 1.25rem;"></i>
            </button>
          </div>
        </div>

        <!-- Quick Action Prompt Chips Bar -->
        <div id="ai-quick-prompts-bar" style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 0.625rem 0.75rem; display: flex; gap: 0.5rem; overflow-x: auto; white-space: nowrap; scrollbar-width: none;">
          <!-- Injected dynamically -->
        </div>

        <!-- Conversation History Stream -->
        <div id="ai-messages-stream" style="flex: 1; padding: 1rem; overflow-y: auto; display: flex; flex-direction: column; gap: 0.875rem; background: #ffffff;">
          <!-- Message bubbles will be injected here -->
        </div>

        <!-- Input Bar -->
        <div style="padding: 0.75rem 1rem; border-top: 1px solid #e2e8f0; background: #ffffff; display: flex; align-items: center; gap: 0.5rem;">
          <input 
            type="text" 
            id="ai-agent-input" 
            placeholder="Ask a question about rent, Till, bills, law..." 
            style="flex: 1; border: 1.5px solid #cbd5e1; border-radius: 9999px; padding: 0.625rem 1rem; font-size: 0.8125rem; font-family: inherit; outline: none; transition: border-color 0.2s;"
          />
          <button 
            id="btn-send-ai-agent" 
            type="button" 
            style="background: #10b981; color: #ffffff; border: none; width: 2.375rem; height: 2.375rem; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: transform 0.15s, background 0.15s; flex-shrink: 0;"
          >
            <i data-lucide="send" style="width: 1rem; height: 1rem;"></i>
          </button>
        </div>
      </div>
    `;

    this.attachEventListeners();
    this.renderLauncher();
  }

  attachEventListeners() {
    document.getElementById('btn-toggle-ai-agent')?.addEventListener('click', () => {
      this.toggle();
    });

    document.getElementById('btn-close-ai-agent')?.addEventListener('click', () => {
      this.close();
    });

    document.getElementById('btn-clear-ai-chat')?.addEventListener('click', () => {
      this.messages = [];
      this.hasGreeted = false;
      this.renderMessages();
      this.initGreeting();
    });

    const input = document.getElementById('ai-agent-input');
    const sendBtn = document.getElementById('btn-send-ai-agent');

    const handleSend = () => {
      if (!input) return;
      const val = input.value.trim();
      if (!val) return;
      input.value = '';
      this.handleUserQuery(val);
    };

    sendBtn?.addEventListener('click', handleSend);
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });

    // Make input glow on focus
    input?.addEventListener('focus', () => {
      input.style.borderColor = '#10b981';
      input.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.15)';
    });
    input?.addEventListener('blur', () => {
      input.style.borderColor = '#cbd5e1';
      input.style.boxShadow = 'none';
    });
  }

  toggle() {
    this.isOpen ? this.close() : this.open();
  }

  open() {
    this.isOpen = true;
    const panel = document.getElementById('ai-agent-panel');
    const launcher = document.getElementById('ai-agent-launcher');
    if (panel) panel.style.display = 'flex';
    if (launcher) launcher.style.transform = 'scale(0.95)';

    this.updateHeaderInfo();
    this.renderQuickPrompts();

    if (!this.hasGreeted) {
      this.initGreeting();
    } else {
      this.renderMessages();
    }

    setTimeout(() => {
      document.getElementById('ai-agent-input')?.focus();
    }, 100);

    if (window.lucide) window.lucide.createIcons();
  }

  close() {
    this.isOpen = false;
    const panel = document.getElementById('ai-agent-panel');
    const launcher = document.getElementById('ai-agent-launcher');
    if (panel) panel.style.display = 'none';
    if (launcher) launcher.style.transform = 'scale(1)';
  }

  renderLauncher() {
    const launcher = document.getElementById('ai-agent-launcher');
    const btn = document.getElementById('btn-toggle-ai-agent');
    const textEl = document.getElementById('ai-launcher-text');
    if (!launcher || !btn || !textEl) return;

    const user = this.currentUser;
    // Only show for Tenants, Landlords, Caretakers, and Super Admin
    if (!user || (user.role !== 'tenant' && user.role !== 'owner' && user.role !== 'caretaker' && user.role !== 'landlord' && user.role !== 'superadmin')) {
      launcher.style.display = 'none';
      return;
    }

    launcher.style.display = 'block';

    if (user.role === 'tenant') {
      btn.style.background = 'linear-gradient(135deg, #064e3b 0%, #065f46 100%)';
      btn.style.borderColor = 'rgba(52, 211, 153, 0.3)';
      textEl.innerText = 'Ask AI Concierge';
    } else {
      btn.style.background = 'linear-gradient(135deg, #1e1b4b 0%, #1e3a8a 100%)';
      btn.style.borderColor = 'rgba(96, 165, 250, 0.3)';
      textEl.innerText = 'Property AI Copilot';
    }
  }

  updateHeaderInfo() {
    const titleEl = document.getElementById('ai-panel-title');
    const subtitleEl = document.getElementById('ai-panel-subtitle');
    const user = this.currentUser;

    if (!titleEl || !subtitleEl) return;

    if (user && user.role === 'tenant') {
      const tCtx = this.getTenantContext(user);
      titleEl.innerText = 'Rentmaster Tenant Concierge';
      subtitleEl.innerHTML = `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#10b981;"></span><span>${tCtx ? tCtx.propertyName : 'Residential Living'} · ${tCtx ? tCtx.unit : 'Tenant Portal'}</span>`;
    } else if (user && (user.role === 'owner' || user.role === 'caretaker' || user.role === 'landlord' || user.role === 'superadmin')) {
      const lCtx = this.getLandlordContext(user);
      titleEl.innerText = 'Rentmaster Landlord Copilot';
      subtitleEl.innerHTML = `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#38bdf8;"></span><span>${lCtx ? lCtx.propertyName : 'Portfolio HQ'} · Financial & Tenancy AI</span>`;
    }
  }

  renderQuickPrompts() {
    const bar = document.getElementById('ai-quick-prompts-bar');
    if (!bar) return;

    const user = this.currentUser;
    const isTenant = user && user.role === 'tenant';

    const prompts = isTenant
      ? [
          { label: '💳 How to Pay Rent', query: 'How do I pay rent through M-Pesa Till?' },
          { label: '🧾 Current Balance', query: 'What is my current balance and how much do I owe?' },
          { label: '⏰ 10-Minute SMS Rule', query: 'Why must my payment SMS be within 10 minutes and read only?' },
          { label: '🔧 Caretaker Help', query: 'What are the contact details for the caretaker?' },
          { label: '📄 Download Receipt', query: 'How do I download my payment receipt and statement?' }
        ]
      : [
          { label: '📊 Collections Summary', query: 'How much rent has been collected this month?' },
          { label: '⚠️ Unpaid Tenants', query: 'Who has not paid rent yet this month?' },
          { label: '🔒 Security Seals', query: 'How do digital security seals and till verification work?' },
          { label: '📲 WhatsApp Invites', query: 'How do I invite tenants via WhatsApp and print notice flyers?' },
          { label: '⚖️ Kenya Eviction Law', query: 'What is the legal eviction notice period in Kenya?' }
        ];

    bar.innerHTML = prompts.map((p) => `
      <button 
        type="button" 
        class="ai-prompt-chip" 
        data-query="${p.query.replace(/"/g, '&quot;')}"
        style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 9999px; padding: 0.25rem 0.75rem; font-size: 0.6875rem; font-weight: 700; color: #475569; cursor: pointer; transition: all 0.15s; white-space: nowrap; flex-shrink: 0;"
        onmouseover="this.style.background='#f1f5f9'; this.style.borderColor='#94a3b8';"
        onmouseout="this.style.background='#ffffff'; this.style.borderColor='#cbd5e1';"
      >
        ${p.label}
      </button>
    `).join('');

    bar.querySelectorAll('.ai-prompt-chip').forEach((chip) => {
      chip.addEventListener('click', (e) => {
        const query = e.currentTarget.getAttribute('data-query');
        if (query) this.handleUserQuery(query);
      });
    });
  }

  initGreeting() {
    this.hasGreeted = true;
    const user = this.currentUser;
    let welcomeText = '';

    if (user && user.role === 'tenant') {
      const tCtx = this.getTenantContext(user);
      welcomeText = `Hello **${tCtx ? tCtx.name : 'Resident'}**! 👋 I am your **Rentmaster AI Concierge** for **${tCtx ? tCtx.propertyName : 'your apartment'} (${tCtx ? tCtx.unit : ''})**.\n\nAsk me anything about your rent, M-Pesa Till **${tCtx ? tCtx.tillNumber : '582190'}**, payment verification, or on-site maintenance desk!`;
    } else if (user && (user.role === 'owner' || user.role === 'caretaker' || user.role === 'landlord' || user.role === 'superadmin')) {
      const lCtx = this.getLandlordContext(user);
      welcomeText = `Hello **${lCtx ? lCtx.name : 'Property Owner'}**! 👋 I am your **Rentmaster Property AI Copilot**.\n\nI can analyze your monthly collections (**KES ${Number(lCtx ? lCtx.totalCollected : 0).toLocaleString()}** recorded), flag unpaid units, review payment security seals, or answer legal compliance questions under the Kenyan Rent Restriction Act!`;
    } else {
      welcomeText = `Hello! 👋 I am your **Rentmaster AI Assistant**. How may I assist you with the property today?`;
    }

    this.messages.push({
      sender: 'ai',
      text: welcomeText,
      timestamp: Date.now()
    });

    this.renderMessages();
  }

  handleUserQuery(queryText) {
    if (!queryText) return;

    // 1. Append user message
    this.messages.push({
      sender: 'user',
      text: queryText,
      timestamp: Date.now()
    });
    this.renderMessages();

    // 2. Show typing indicator
    this.showTypingIndicator();

    // 3. Compute response with realistic cognitive delay
    setTimeout(() => {
      this.removeTypingIndicator();
      const aiResponseText = this.generateResponse(queryText);

      this.messages.push({
        sender: 'ai',
        text: aiResponseText,
        timestamp: Date.now()
      });

      this.renderMessages();
    }, 450);
  }

  showTypingIndicator() {
    const stream = document.getElementById('ai-messages-stream');
    if (!stream) return;

    const existing = document.getElementById('ai-typing-indicator');
    if (existing) return;

    const indicator = document.createElement('div');
    indicator.id = 'ai-typing-indicator';
    indicator.style.cssText = 'display: flex; align-items: center; gap: 0.5rem; align-self: flex-start; background: #f1f5f9; padding: 0.625rem 0.875rem; border-radius: 1rem 1rem 1rem 0.25rem; font-size: 0.75rem; color: #64748b;';
    indicator.innerHTML = `
      <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #94a3b8; animation: pulse 1s infinite alternate;"></span>
      <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #94a3b8; animation: pulse 1s infinite alternate 0.2s;"></span>
      <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #94a3b8; animation: pulse 1s infinite alternate 0.4s;"></span>
      <span style="margin-left: 0.25rem;">AI is thinking...</span>
    `;

    stream.appendChild(indicator);
    stream.scrollTop = stream.scrollHeight;
  }

  removeTypingIndicator() {
    const indicator = document.getElementById('ai-typing-indicator');
    if (indicator) indicator.remove();
  }

  renderMessages() {
    const stream = document.getElementById('ai-messages-stream');
    if (!stream) return;

    stream.innerHTML = this.messages.map((m) => {
      const isUser = m.sender === 'user';
      return `
        <div style="display: flex; flex-direction: column; align-self: ${isUser ? 'flex-end' : 'flex-start'}; max-width: 88%;">
          <div style="
            background: ${isUser ? 'linear-gradient(135deg, #059669 0%, #047857 100%)' : '#f8fafc'};
            color: ${isUser ? '#ffffff' : '#1e293b'};
            border: ${isUser ? 'none' : '1px solid #e2e8f0'};
            padding: 0.75rem 1rem;
            border-radius: ${isUser ? '1rem 1rem 0.25rem 1rem' : '1rem 1rem 1rem 0.25rem'};
            font-size: 0.8125rem;
            line-height: 1.5;
            box-shadow: ${isUser ? '0 4px 12px rgba(5, 150, 105, 0.25)' : '0 2px 4px rgba(0, 0, 0, 0.02)'};
            word-break: break-word;
          ">
            ${this.formatMarkdown(m.text)}
          </div>
          <span style="font-size: 0.625rem; color: #94a3b8; margin-top: 0.25rem; align-self: ${isUser ? 'flex-end' : 'flex-start'}; padding: 0 0.25rem;">
            ${new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      `;
    }).join('');

    stream.scrollTop = stream.scrollHeight;
    if (window.lucide) window.lucide.createIcons();
  }

  formatMarkdown(text) {
    if (!text) return '';
    return text
      .replace(/^### (.*$)/gim, '<div style="font-size: 0.875rem; font-weight: 800; color: #0f172a; margin-bottom: 0.375rem;">$1</div>')
      .replace(/^## (.*$)/gim, '<div style="font-size: 0.9375rem; font-weight: 800; color: #0f172a; margin-bottom: 0.5rem;">$1</div>')
      .replace(/^> (.*$)/gim, '<blockquote style="border-left: 3px solid #10b981; padding-left: 0.625rem; margin: 0.5rem 0; font-size: 0.75rem; color: #475569; background: rgba(16, 185, 129, 0.05); padding-top: 0.25rem; padding-bottom: 0.25rem; border-radius: 0 4px 4px 0;">$1</blockquote>')
      .replace(/\*\*(.*?)\*\*/g, '<strong style="color: #0f172a; font-weight: 700;">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code style="background: rgba(0,0,0,0.06); padding: 0.125rem 0.375rem; border-radius: 4px; font-family: monospace; font-size: 0.75rem; color: #047857; font-weight: 700;">$1</code>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color: #059669; font-weight: 700; text-decoration: underline;">$1</a>')
      .replace(/\n\n/g, '<div style="height: 0.5rem;"></div>')
      .replace(/\n/g, '<br/>');
  }
}
