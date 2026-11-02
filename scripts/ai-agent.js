
export class AIAgent {
  constructor(store, app) {
    this.store = store;
    this.app = app;
    this.isOpen = false;
    this.messages = [];
    this.currentUser = null;
    this.hasGreeted = false;
  }

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

  getSuperAdminContext(user) {
    if (!user) return null;
    const landlords = this.store.state.landlords || [];
    const tenants = this.store.state.tenants || [];
    const payments = this.store.state.payments || [];
    const confirmedPayments = payments.filter((p) => p.status === 'confirmed');
    const pendingPayments = payments.filter((p) => p.status === 'pending');
    const totalVolume = confirmedPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const totalUnits = landlords.reduce((sum, l) => sum + (Number(l.unitsCount) || 0), 0);
    const auditLogs = this.store.state.audit || [];

    return {
      type: 'superadmin',
      name: user.name || 'Sammy Harrison',
      email: user.email || 'sammyharrison58@gmail.com',
      role: 'Platform Super Administrator',
      totalLandlords: landlords.length,
      totalTenants: tenants.length,
      totalUnits: totalUnits || tenants.length,
      totalPaymentsCount: confirmedPayments.length,
      pendingPaymentsCount: pendingPayments.length,
      totalVolume,
      auditLogsCount: auditLogs.length,
      landlordsList: landlords
    };
  }

  getTenantContext(user) {
    if (!user) return null;
    const tenant = user.tenant || (this.store.state.tenants && this.store.state.tenants.find((t) => t.userId === user.userId));
    if (!tenant) return null;

    const landlord = this.store.state.landlords && this.store.state.landlords.find((l) => l.id === tenant.landlordId);
    const tillNumber = landlord ? landlord.tillNumber : tenant.tillNumber || '582190';
    const propertyName = landlord ? landlord.propertyName : (tenant.propertyName || 'Residential Living');
    const landlordName = landlord ? landlord.name : 'Property Management';

    const bills = this.store.getTenantBills ? this.store.getTenantBills(tenant) : [];
    const totalOutstanding = bills.reduce((sum, b) => sum + (b.outstanding || 0), 0);
    const payments = (this.store.state.payments || []).filter((p) => p.tenantId === tenant.userId);
    const confirmedPayments = payments.filter((p) => p.status === 'confirmed');
    const pendingPayments = payments.filter((p) => p.status === 'pending');
    const totalPaid = confirmedPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    return {
      type: 'tenant',
      tenant,
      userId: tenant.userId,
      name: tenant.name,
      unit: tenant.unit,
      monthlyRent: Number(tenant.monthlyRent) || 0,
      phone: tenant.phone,
      landlordName,
      propertyName,
      tillNumber,
      totalOutstanding,
      totalPaid,
      bills,
      confirmedPaymentsCount: confirmedPayments.length,
      pendingPaymentsCount: pendingPayments.length,
      lastPayment: payments[0] || null,
      caretaker: {
        name: 'Sammy Harrison',
        phone: '0748 082 906',
        role: 'Resident Caretaker & Emergency Desk'
      }
    };
  }

  getLandlordContext(user) {
    if (!user) return null;
    const landlord = user.landlord || 
      (this.store.state.landlords && this.store.state.landlords.find((l) => l.userId === user.userId)) || 
      (this.store.state.landlords && this.store.state.landlords[0]) ||
      { id: 'l1', name: 'Property Owner', propertyName: 'Residential Portfolio', tillNumber: '582190', unitsCount: 24 };

    const tenants = (this.store.state.tenants || []).filter((t) => t.landlordId === landlord.id);
    const approvedTenants = tenants.filter((t) => t.status === 'approved');
    const pendingTenants = tenants.filter((t) => t.status === 'pending');

    const payments = (this.store.state.payments || []).filter((p) => p.landlordId === landlord.id);
    const confirmedPayments = payments.filter((p) => p.status === 'confirmed');
    const pendingPayments = payments.filter((p) => p.status === 'pending');

    const totalCollected = confirmedPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const expectedMonthly = approvedTenants.reduce((sum, t) => sum + (Number(t.monthlyRent) || 0), 0);

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
      unitsCount: landlord.unitsCount || approvedTenants.length,
      approvedTenantsCount: approvedTenants.length,
      pendingTenantsCount: pendingTenants.length,
      totalCollected,
      expectedMonthly,
      pendingPaymentsCount: pendingPayments.length,
      unpaidTenants,
      pendingPayments,
      currentMonth
    };
  }

  generateResponse(query) {
    const rawQ = (query || '').trim();
    const q = rawQ.toLowerCase();
    const user = this.currentUser;

    const isSuperAdmin = user && (user.role === 'superadmin' || user.email === 'sammyharrison58@gmail.com' || (user.impersonatedBy && !user.role));
    const isTenant = !isSuperAdmin && user && user.role === 'tenant';
    const isLandlord = !isSuperAdmin && user && (user.role === 'owner' || user.role === 'landlord' || user.role === 'caretaker');

    const sCtx = isSuperAdmin ? this.getSuperAdminContext(user) : null;
    const tCtx = isTenant ? this.getTenantContext(user) : null;
    const lCtx = isLandlord ? this.getLandlordContext(user) : null;

    const kes = (num) => `KES ${Number(num || 0).toLocaleString()}`;
    const extractNumbers = (str) => {
      const matches = str.match(/\d+[\d,]*/g);
      return matches ? matches.map(m => parseInt(m.replace(/,/g, ''), 10)).filter(n => !isNaN(n)) : [];
    };

    const hasAny = (keywords) => keywords.some(k => q.includes(k));

    if (sCtx) {
      if (/^(hi|hello|hey|habari|jambo|mambo|sasa|niaje|good (morning|afternoon|evening)|vipi|kazi gani)/i.test(q) && q.split(' ').length <= 4) {
        return `> 🧠 **AI Executive Intelligence:** Authenticated session for Super Administrator **${sCtx.name}**\n\nGreetings **${sCtx.name}**! 🛡️ Welcome to your **Rentmaster Super Admin Executive Intelligence Console**.\n\n**Enterprise System Health:**\n- 🌐 **Managed Landlord Portfolios:** ${sCtx.totalLandlords} Client Account(s)\n- 🏢 **Total Units Under System:** ${sCtx.totalUnits} Units Across Kenya\n- 👥 **Total Registered Tenants:** ${sCtx.totalTenants} Active Residents\n- 💰 **System-Wide Processed Volume:** **${kes(sCtx.totalVolume)}** (${sCtx.totalPaymentsCount} Confirmed Records)\n- ⏳ **Pending Inflows Under Review:** ${sCtx.pendingPaymentsCount} Transaction(s)\n- 🔒 **Tamper-Evident Audit Logs:** ${sCtx.auditLogsCount} System Audit Entries\n\nHow would you like to direct platform operations today? You can audit registered landlords, review gross payment volumes, or inspect cryptographic security integrity.`;
      }

      if (hasAny(['overview', 'system', 'platform', 'stats', 'how many', 'summary', 'total', 'health', 'metrics', 'analytics'])) {
        return `> 🧠 **System Telemetry:** Platform Core Performance Report\n\n### 🌐 Rentmaster Enterprise Telemetry Overview\n\n- **Principal Administrator:** **${sCtx.name}** (${sCtx.email})\n- **Active Landlord Client Accounts:** **${sCtx.totalLandlords}** Properties Registered\n- **Total Managed Inventory:** **${sCtx.totalUnits} Units**\n- **Total Active Residents:** **${sCtx.totalTenants} Tenants**\n- **Gross Transaction Volume (GMV):** **${kes(sCtx.totalVolume)}**\n- **Confirmed System Receipts:** **${sCtx.totalPaymentsCount}** verified cryptographic receipts\n- **Inflow Queue:** **${sCtx.pendingPaymentsCount}** pending landlord sign-offs\n- **Security Ledger Status:** All cryptographic signatures, anti-replay registries, and carrier timestamps operating with **100% integrity**.\n\n*Tip: Use the top Super Admin Role Switcher bar to preview the platform as any specific landlord or tenant account with full impersonation rights.*`;
      }

      if (hasAny(['landlord', 'landlords', 'owners', 'properties', 'portfolio', 'clients', 'buildings'])) {
        const listStr = sCtx.landlordsList.length > 0 
          ? sCtx.landlordsList.map((l, i) => `${i + 1}. **${l.name}** — *${l.propertyName}* (${l.unitsCount || 0} Units) · Till: \`${l.tillNumber || 'N/A'}\` · Location: ${l.location || 'Nairobi'}`).join('\n')
          : 'No external landlord accounts registered yet.';

        return `> 🧠 **Client Management Desk:** Managed Landlord Accounts\n\n### 🏢 Registered Landlord Portfolio Accounts (${sCtx.totalLandlords})\n\n${listStr}\n\n**Super Admin Privileges:**\n- You can onboard new landlords from the **Landlords Directory** tab.\n- You can assign custom Till numbers, manage unit limits, or impersonate their view via the **Role Switcher** bar at the top of the screen.`;
      }

      if (hasAny(['revenue', 'volume', 'pesa', 'collection', 'financial', 'income', 'money', 'gmv', 'transactions', 'gross'])) {
        return `> 🧠 **Platform Financial Intelligence:** Gross Volume Analytics\n\n### 💰 System-Wide Financial Roll & Transaction Volume\n\n- **Cumulative Processed Volume:** **${kes(sCtx.totalVolume)}**\n- **Total Confirmed Transactions:** **${sCtx.totalPaymentsCount}**\n- **Pending Inflow Approvals:** **${sCtx.pendingPaymentsCount}** transaction(s)\n- **M-Pesa Routing Protocols:** Safaricom Buy Goods (Till) with direct 10-minute carrier verification\n- **Settlement Architecture:** Direct-to-merchant ledger with automated receipt generation and zero custodial leakage.`;
      }

      if (hasAny(['audit', 'security', 'seal', 'tamper', 'fraud', 'hash', 'integrity', 'loophole', 'carrier', 'sha-256', 'protection'])) {
        return `> 🧠 **Cryptographic Security Core:** Bank-Grade Zero-Trust Audit\n\n### 🔒 Rentmaster Security & Tamper-Proof Infrastructure\n\nAs Super Administrator **${sCtx.name}**, your platform runs the following perimeter security protocols:\n\n1. **Anti-Replay Registry (\`usedMpesaCodes\`):** Eliminates double-submission or recycled SMS receipts permanently across the entire network.\n2. **10-Minute Freshness Perimeter:** Strictly enforces that tenant payment SMS must be generated and submitted within 10 minutes of real time.\n3. **Event-Locked Read-Only Fields:** Transaction Codes and Amounts are parsed directly from Safaricom signatures and locked to prevent client-side DOM tampering.\n4. **Cryptographic SHA-256 Receipts:** Every confirmed payment is stamped with an immutable digital seal (\`RMS-SEC-...\`) admissible in Kenyan courts and banks.\n5. **Audit Trail Entries:** Recorded **${sCtx.auditLogsCount}** immutable security events capturing logins, role transitions, and payment approvals.`;
      }

      if (hasAny(['switch', 'impersonat', 'demo bar', 'role bar', 'how to switch', 'preview'])) {
        return `> 🧠 **Executive Privilege:** Super Admin Impersonation Control\n\n### ⚙️ Super Admin Role Switcher Guide\n\n- **Location:** The dark top bar labeled **"Super Admin Role Switcher"** is exclusively visible to you (**${sCtx.email}**).\n- **Instant Preview:** Click **"Landlord Mode"** or **"Tenant Mode"** to experience any user's exact workflow without requiring their passwords.\n- **Return to Super Admin:** Click the **"Back to Super Admin"** badge on the top banner at any time to restore your root administrative session.`;
      }

      if (hasAny(['caretaker', 'sammy', 'emergency', 'phone', 'contact', 'hotline', '0748'])) {
        return `> 🧠 **Central Support Dispatch:** Lead Executive Contact\n\n### 🚨 Central Emergency & Operations Desk\n\n- **Platform Principal & Lead Caretaker:** **Sammy Harrison**\n- **Direct Cellular:** [0748 082 906](tel:0748082906)\n- **WhatsApp Escalation:** [Chat on WhatsApp](https://wa.me/254748082906)\n- **Status:** All dispatch, maintenance, and emergency escalations route directly to your central operations line.`;
      }
    }

    if (/^(hi|hello|hey|habari|jambo|mambo|sasa|niaje|good (morning|afternoon|evening)|vipi|kazi gani)/i.test(q) && q.split(' ').length <= 4) {
      if (tCtx) {
        return `> 🧠 **AI Resident Assistant:** Initialized session for **${tCtx.name}** · Unit **${tCtx.unit}**\n\nHello **${tCtx.name}**! 👋 Welcome to your **Rentmaster AI Concierge** for **${tCtx.propertyName}**.\n\nI am equipped with high-level knowledge of your property ledger, Safaricom M-Pesa protocols, building operations, and Kenyan tenancy rights. How can I assist you today?\n\n- 💳 **M-Pesa Rent Payments** (Till: \`${tCtx.tillNumber}\`)\n- 🧾 **Real-Time Account Balance** (${tCtx.totalOutstanding > 0 ? `Current arrears: ${kes(tCtx.totalOutstanding)}` : 'Zero balance 🎉'})\n- ⏰ **10-Minute SMS Verification & Security Seal Rules**\n- 🔧 **Emergency & Maintenance Desk** (Caretaker Sammy Harrison: \`0748 082 906\`)\n- ⚖️ **Kenyan Tenancy Law & Eviction Protections**`;
      }
      if (lCtx) {
        const rate = lCtx.expectedMonthly > 0 ? Math.round((lCtx.totalCollected / lCtx.expectedMonthly) * 100) : 0;
        return `> 🧠 **AI Property Copilot:** Portfolio HQ Analysis for **${lCtx.propertyName}**\n\nGreetings **${lCtx.name}**! 👋 I am your **Rentmaster Intelligent Property Copilot**.\n\nI monitor your property's real-time financial roll, tenant compliance, cryptographic payment verification, and legal governance under Kenyan tenancy statutes.\n\n**Quick Portfolio Snapshot:**\n- 💰 **Month Collections:** ${kes(lCtx.totalCollected)} (${rate}% of ${kes(lCtx.expectedMonthly)} target)\n- ⚠️ **Unpaid Units:** ${lCtx.unpaidTenants.length} unit(s) pending\n- 🔒 **Pending Confirmations:** ${lCtx.pendingPaymentsCount} transaction(s)\n- ⚖️ **Legal Desk:** Eviction notices, KRA 7.5% MRI Tax, Distress for Rent Act guidance\n\nWhat would you like to review or execute?`;
      }
      return `Hello! 👋 I am the **Rentmaster Intelligent Property Assistant**. Please sign in as a resident tenant or property manager to access tailored real-time property intelligence.`;
    }

    if (tCtx) {
      if (hasAny(['till', 'how to pay', 'kulipa', 'lipa', 'pay rent', 'paybill', 'buy goods', 'lipa na mpesa', 'payment instructions', 'procedure ya kulipa'])) {
        return `> 🧠 **Cognitive Guidance:** Generating authenticated payment instructions for **Unit ${tCtx.unit}**\n\n### 💳 Official M-Pesa Payment Procedure for ${tCtx.propertyName}\n\nRentmaster uses **Safaricom Buy Goods and Services (Till)** for direct, real-time automated ledger reconciliation.\n\n#### Step-by-Step Payment Instructions:\n1. Open your Safaricom SIM Toolkit or M-Pesa App on your phone.\n2. Select **Lipa na M-PESA** ➜ **Buy Goods and Services**.\n3. Enter Official Property Till: **\`${tCtx.tillNumber}\`** (*Registered to ${tCtx.propertyName}*).\n4. Enter Amount: **${kes(tCtx.monthlyRent)}** (or your agreed installment/balance).\n5. Enter your M-Pesa Secret PIN and confirm transaction.\n6. **Immediately copy the full Safaricom confirmation SMS** upon arrival.\n7. Go to your portal's **"Post Payment Message"** tab, paste the SMS, and click **"Verify & Submit"**.\n\n> 🛡️ **Zero-Fraud Anti-Tampering Notice:**\n> Ensure you submit within **10 minutes** of payment. The system validates the timestamp, verifies Till \`${tCtx.tillNumber}\`, locks fields to prevent tampering, and records an immutable cryptographic audit seal.`;
      }

      if (hasAny(['10 min', '10-minute', 'ten min', 'late', 'read only', 'readonly', 'why locked', 'cannot edit', 'fraud', 'security check', 'failed check', 'tamper', 'sms rule', 'kwanini'])) {
        return `> 🧠 **Security Architecture Briefing:** Rentmaster Zero-Trust Verification Engine\n\n### 🔒 Why Rentmaster Enforces the 10-Minute SMS Rule & Read-Only Fields\n\nRentmaster implements a bank-grade verification protocol to eliminate fraudulent payment claims, recycled SMS receipts, and accounting disputes between tenants and landlords.\n\n#### 1. The 10-Minute Freshness Window\n- **Preventing Replay Attacks:** In traditional setups, dishonest parties reuse old M-Pesa messages or forward friends' messages. By restricting verification to **within 10 minutes** of the Safaricom network timestamp, we mathematically guarantee the payment was initiated right now for this unit.\n- **Calendar Date Synchronization:** The transaction date in the SMS must match today's date in Kenya time (EAT UTC+3).\n\n#### 2. Read-Only Transaction Code & Amount\n- **Zero-Trust Field Locking:** Once your SMS is parsed by the regex engine, the **Transaction Code** (e.g. \`TG49...\`) and **Amount** are strictly locked to **Read-Only**.\n- **Anti-Tampering:** Tenants cannot manually type, inflate, or fabricate transaction numbers or amounts. The values are extracted directly from Safaricom's cryptographic carrier signature.\n\n#### 3. Single-Use Replay Protection\n- Each transaction code is stored in the tamper-proof ledger. Once registered, it cannot ever be used again by any tenant on any property in the system.`;
      }

      if (hasAny(['balance', 'owe', 'deni', 'how much', 'baki', 'arrears', 'debt', 'rent amount', 'bill', 'ledger', 'hesabu'])) {
        const nums = extractNumbers(q);
        let partialCalculation = '';
        if (nums.length > 0 && nums[0] < tCtx.totalOutstanding) {
          const intended = nums[0];
          const remaining = tCtx.totalOutstanding - intended;
          partialCalculation = `\n\n💡 **Partial Payment Deduction:** If you pay **${kes(intended)}** today towards your balance, your remaining outstanding balance will be **${kes(remaining)}**.`;
        }

        const statusPill = tCtx.totalOutstanding > 0 
          ? `⚠️ **Outstanding Balance Due:** **${kes(tCtx.totalOutstanding)}**`
          : `🎉 **Account in Good Standing:** You have a **KES 0.00** zero balance. All rent is settled.`;

        return `> 🧠 **Ledger Calculation:** Auditing resident account for **${tCtx.name} (${tCtx.unit})**\n\n### 🧾 Resident Rent Ledger Summary\n\n- **Resident:** ${tCtx.name}\n- **Assigned Unit:** Unit ${tCtx.unit} · ${tCtx.propertyName}\n- **Agreed Monthly Rent:** ${kes(tCtx.monthlyRent)}\n- **Status:** ${statusPill}${partialCalculation}\n- **Confirmed Payments on Record:** ${tCtx.confirmedPaymentsCount} transaction(s) totaling **${kes(tCtx.totalPaid)}**\n${tCtx.pendingPaymentsCount > 0 ? `- ⏳ **Pending Landlord Confirmation:** ${tCtx.pendingPaymentsCount} transaction(s) under review.\n` : ''}\n\n**Payment Policy:** Rent is payable on or before the **5th day of every calendar month** via Till **\`${tCtx.tillNumber}\`**.`;
      }

      if (hasAny(['partial', 'installment', 'half', 'kidogo', 'lipa nusu', 'kulipa nusu', 'can i pay part', 'pay in two', 'advance', 'lipa mapema'])) {
        return `> 🧠 **Financial Policy Analysis:** Partial rent & installment compliance\n\n### 💵 Policy on Partial Payments & Installments\n\nUnder standard Kenyan residential tenancy practices and Rentmaster guidelines:\n\n1. **Permitted with Communication:** You can pay your rent in installments via Till **\`${tCtx.tillNumber}\`**. Each payment SMS should be posted to your portal separately to receive an individual confirmed receipt.\n2. **Grace Period:** Standard rent agreements allow a grace period up to the **5th of the month**. If paying balance after the 5th, notify Landlord **${tCtx.landlordName}** or Caretaker **Sammy Harrison** (\`0748 082 906\`).\n3. **Automatic Ledger Deduction:** Rentmaster automatically credits every confirmed payment against your oldest outstanding bill first, updating your net arrears in real-time.\n4. **Advance Payments:** Overpayments or advance rent payments will reflect as a positive ledger credit against next month's invoice.`;
      }

      if (hasAny(['receipt', 'statement', 'download', 'pdf', 'proof', 'stakabadhi', 'evidence', 'ushahidi'])) {
        return `> 🧠 **Document Audit Desk:** Receipt & Financial Statement Retrieval\n\n### 📄 Official Receipts & Cryptographic Statements\n\nRentmaster generates tamper-evident, court-admissible digital receipts for every payment confirmed on your ledger:\n\n- **Where to Access:** Navigate to your **"Payments & History"** tab.\n- **Download Full PDF Statement:** Click the **"📥 Download Statement"** button to export your complete multi-month ledger. This document includes property tax stamps, unit details, and timestamped transaction logs suitable for bank loans, employer rent allowances, and visa applications.\n- **Cryptographic Security Seal:** Every receipt contains an immutable verification hash (e.g. \`RMS-SEC-...\`) generated via SHA-256 that proves the payment was verified without alteration.`;
      }

      if (hasAny(['caretaker', 'repair', 'maintenance', 'water', 'leak', 'pipe', 'plumber', 'stima', 'electricity', 'power', 'blackout', 'lights', 'garbage', 'takataka', 'emergency', 'lock', 'fungua', 'maji', 'sammy'])) {
        return `> 🧠 **Facility Management Desk:** Operational Protocol for ${tCtx.propertyName}\n\n### 🔧 Resident Caretaker & On-Site Emergency Desk\n\nFor maintenance, repairs, water utility inquiries, and urgent building emergencies:\n\n- **Resident Caretaker:** **Sammy Harrison**\n- **Direct Cellular:** [0748 082 906](tel:0748082906)\n- **WhatsApp Hotline:** [Message Sammy on WhatsApp](https://wa.me/254748082906?text=Hello%20Sammy,%20I%20am%20in%20Unit%20${encodeURIComponent(tCtx.unit)}%20at%20${encodeURIComponent(tCtx.propertyName)}%20and%20need%20assistance)\n- **Operating Hours:** 7:00 AM – 7:30 PM (Daily). **Emergency line is available 24/7** for burst water mains, sewer blockages, electrical sparking, or lockouts.\n\n> 💡 **Maintenance Policy Tip:** Landlords are legally required under Kenyan law to maintain the structural integrity, exterior, and essential utilities of the premises. Tenants are responsible for internal fittings damaged through negligence.`;
      }

      if (hasAny(['deposit', 'move out', 'vacate', 'refund', 'leaving', 'kuhama', 'notisi ya kuhama', 'dhamana', 'security deposit', 'notice'])) {
        return `> 🧠 **Legal & Statutory Knowledge:** Security Deposit & Vacating Protocols\n\n### 📦 Security Deposit Refund & Notice to Vacate Regulations\n\nUnder Kenyan Tenancy Law and standard lease covenants:\n\n#### 1. Written Notice to Vacate\n- You must provide **one full calendar month's formal written notice** before vacating (e.g., to vacate at the end of April, serve written notice on or before March 31st).\n- Notice must be delivered in writing via letter, email, or formal WhatsApp message to Landlord **${tCtx.landlordName}**.\n\n#### 2. Joint Move-Out Inspection\n- Schedule a walk-through inspection with Caretaker **Sammy Harrison** on or before your last day.\n- An inspection checklist comparing the initial check-in inventory will be signed by both parties.\n\n#### 3. Deposit Refund Timeline\n- By standard practice, deposits are refunded within **14 to 30 days** post-vacation.\n- **Permitted Deductions:** Unpaid utility bills (water, KPLC tokens) and physical repairs for damage exceeding ordinary wear and tear.\n- ⚖️ **Important Legal Rule:** Security deposits are held in escrow for repair indemnification and **cannot be converted into rent for your final month** unless agreed upon in writing by the landlord.`;
      }

      if (hasAny(['evict', 'lock out', 'locked', 'padlock', 'cut water', 'cut power', 'disconnect', 'tupa vitu', 'fukuzwa', 'haki', 'rights', 'police', 'tribunal', 'rrt'])) {
        return `> 🧠 **Kenyan Legal Rights Protection:** Cap 296 & Landlord-Tenant Statutory Protections\n\n### ⚖️ Your Legal Rights as a Tenant in Kenya\n\nUnder the **Rent Restriction Act (Cap 296)**, the **Landlord and Tenant Act**, and Kenyan Constitutional Property Protections:\n\n1. **Arbitrary Lockouts are Illegal:** A landlord or caretaker **CANNOT** lock your door with padlocks, remove doors or iron sheets, or physically eject you without a valid eviction order issued by the **Rent Restriction Tribunal (RRT)** or a court of law.\n2. **Disconnection of Utilities is a Criminal Offense:** Disconnecting water, electricity, or essential amenities to coerce rent payment is strictly prohibited under **Section 15 of Cap 296** and carries criminal penalties.\n3. **Seizure of Household Goods:** Landlords cannot casually confiscate your personal belongings. The **Distress for Rent Act (Cap 293)** requires a licensed court auctioneer/bailiff with a valid proclamation warrant. Essential personal items (bedding, tools of trade) are legally exempt from distress.\n4. **Dispute Resolution:** In case of unlawful harassment, report to the nearest police station to obtain an OB number and lodge a complaint with the **Rent Restriction Tribunal (RRT)** located at the Housing / Law Courts.`;
      }

      if (hasAny(['wrong till', 'reversal', 'reversed', 'wrong number', 'nimekosea', 'rudisha', 'reverse'])) {
        return `> 🧠 **Transaction Recovery Protocol:** Safaricom M-Pesa Reversal\n\n### 🔄 What to Do If You Sent Money to the Wrong Till or Paybill\n\n1. **Act Within 2 Hours:** Immediately forward the Safaricom M-Pesa confirmation SMS to **\`456\`** via SMS, or dial **\`*234#\`** ➜ **M-Pesa Reversal**.\n2. **Contact Safaricom Customer Support:** Call **234** (Toll-Free) or **+254 722 000 000** and quote your transaction ID.\n3. **Notify Property Desk:** Inform Caretaker **Sammy Harrison** at **0748 082 906** so management is aware that your payment was delayed or pending re-transfer.\n4. **Do Not Post Failed Messages:** Never submit a reversed or cancelled SMS into Rentmaster — our verification engine cross-references carrier timestamps and will flag the attempt.`;
      }
    }

    if (lCtx) {
      if (hasAny(['collection', 'total collected', 'income', 'revenue', 'how much collected', 'financial', 'pesa ngapi', 'mapato', 'rent roll', 'yield'])) {
        const rate = lCtx.expectedMonthly > 0 ? Math.round((lCtx.totalCollected / lCtx.expectedMonthly) * 100) : 0;
        const remaining = Math.max(0, lCtx.expectedMonthly - lCtx.totalCollected);

        return `> 🧠 **Financial Yield Analytics:** Performance Report for **${lCtx.propertyName}**\n\n### 📊 Financial Collections Performance (${lCtx.currentMonth})\n\n- **Gross Collections Recorded:** **${kes(lCtx.totalCollected)}**\n- **Projected Target Rent Roll:** ${kes(lCtx.expectedMonthly)}\n- **Realization Efficiency:** **${rate}%**\n- **Outstanding Monthly Gap:** **${kes(remaining)}**\n- **Occupancy & Units:** ${lCtx.approvedTenantsCount} approved active tenants across ${lCtx.unitsCount} total units\n- **Pending Inflow:** ${lCtx.pendingPaymentsCount} transaction(s) in review queue\n\n💡 **Executive Tip:** Export your audit-ready spreadsheet by clicking **"Download Excel / CSV Statement"** on your dashboard.`;
      }

      if (hasAny(['who has not', 'unpaid', 'who owes', 'defaulter', 'pending rent', 'arrears', 'not paid', 'hawajalipa', 'madeni'])) {
        if (lCtx.unpaidTenants.length === 0) {
          return `> 🧠 **Compliance Roll Audit:** Perfect 100% Collection\n\n### 🎉 Outstanding Performance!\n\nAll **${lCtx.approvedTenantsCount} active tenants** in **${lCtx.propertyName}** have settled rent for cycle **${lCtx.currentMonth}**! Zero unit arrears recorded.`;
        }

        const tenantItems = lCtx.unpaidTenants.map((t, i) => 
          `${i + 1}. **${t.name}** (Unit **${t.unit}**) — Rent: **${kes(t.monthlyRent)}** · Contact: [${t.phone}](tel:${t.phone})`
        ).join('\n');

        const totalArrears = lCtx.unpaidTenants.reduce((sum, t) => sum + (Number(t.monthlyRent) || 0), 0);

        return `> 🧠 **Compliance Roll Audit:** Found ${lCtx.unpaidTenants.length} unit(s) pending for cycle ${lCtx.currentMonth}\n\n### ⚠️ Pending Rent Defaulters (${lCtx.unpaidTenants.length} Units)\n\n**Total Cycle Arrears Exposed:** **${kes(totalArrears)}**\n\n${tenantItems}\n\n#### Recommended Next Steps:\n- **WhatsApp 1-Click Reminder:** Go to the **Tenants tab** and click the green WhatsApp icon to dispatch a polite, pre-formatted rent reminder.\n- **Statutory Reminder Notice:** Issue formal notices for accounts exceeding 15 days past due before considering formal distress procedures.`;
      }

      if (hasAny(['approve', 'confirm', 'seal', 'verify', 'fraud', 'counterfeit', 'fake sms', 'how to verify', 'security seal'])) {
        return `> 🧠 **Payment Security Architecture:** Audit & Reconciliation Protocol\n\n### 🔒 Payment Verification & Approval Protocols\n\nWhen a tenant submits their M-Pesa SMS, Rentmaster's cryptographic engine runs three automated perimeter checks:\n\n1. **Freshness & Till Assertion:** Confirms the message timestamp is within 10 minutes of submission and belongs to Till **\`${lCtx.tillNumber}\`**.\n2. **Tamper-Evident SHA-256 Seal:** A unique cryptographic digest is stamped to the record. Look for the green badge: **\`Secured SMS (Verified Till & Freshness)\`**.\n3. **Landlord Final Sign-off:**\n   - Review the M-Pesa code against your Safaricom Merchant statement or Till phone.\n   - Click **"Confirm & Approve (Paid)"** to instantly commit the funds to the ledger, clear the tenant's bill, and generate an official receipt.\n   - Click **"Decline"** if the transaction did not reflect in your merchant cash balance.`;
      }

      if (hasAny(['invite', 'onboard', 'flyer', 'poster', 'notice board', 'add tenant', 'signage', 'qr code', 'welcome tenant'])) {
        return `> 🧠 **Tenant Lifecycle Automation:** Resident Onboarding Tools\n\n### 📲 Seamless Tenant Onboarding & Building Signage\n\nRentmaster provides three integrated channels to onboard residents without paperwork:\n\n1. **1-Click WhatsApp Onboarding Link:**\n   - Open the **Tenants tab**.\n   - Click **"📱 WhatsApp Invite"** next to any tenant.\n   - A pre-filled onboarding link with their assigned unit is dispatched directly to their phone.\n2. **Printable A4 Notice Board Flyer:**\n   - Click **"🖨️ Print Notice Board Flyer"** on your dashboard.\n   - Generates a branded, full-color A4 building poster complete with your Till **\`${lCtx.tillNumber}\`**, resident portal URL, and payment rules to mount at gates and elevator lobbies.\n3. **Direct Resident Registration:**\n   - New tenants can self-register using your property invite code, routing them to your approval queue.`;
      }

      if (hasAny(['law', 'evict', 'eviction', 'tribunal', 'notice period', 'increase rent', 'legal', 'distress', 'auctioneer', 'cap 296', 'cap 293', 'court'])) {
        return `> 🧠 **Statutory Legal Compliance Desk:** Kenyan Tenancy Framework\n\n### ⚖️ Kenyan Landlord Legal Compliance Guide (Cap 296 & Cap 293)\n\nTo protect your property investments and avoid costly criminal civil liabilities, adhere to Kenya's statutory tenancy procedures:\n\n#### 1. Lawful Eviction Procedure\n- **Never Self-Help:** Locking gates, padlocking doors, dismantling roofs, or cutting off electricity/water is **strictly illegal under Section 15 of Cap 296** and exposes landlords to criminal assault/trespass charges and hefty civil damages.\n- **Formal Notice to Quit:** Must provide **at least 30 to 90 days' written notice** specifying ground of termination.\n- **Court/Tribunal Order:** If tenant fails to vacate, file an application at the **Rent Restriction Tribunal (RRT)** or Environment & Land Court to obtain a formal decree.\n\n#### 2. Distress for Rent (Cap 293)\n- Levying distress for rent requires a **licensed, certified court broker/auctioneer** acting under a valid warrant.\n- An auctioneer must issue a **proclamation inventory** giving the tenant 14 days to settle before any public auction.\n- Tools of trade, bedding, and wear apparel are exempt from seizure.\n\n#### 3. Rent Increases\n- Permitted with **minimum 30 days written notice** and must be justifiable based on inflation or capital improvements.`;
      }

      if (hasAny(['kra', 'tax', 'mri', 'rental tax', 'ecitizen', 'itax', '7.5', 'withholding', 'ushuru'])) {
        const estTax = Math.round(lCtx.totalCollected * 0.075);
        return `> 🧠 **Tax Compliance Desk:** KRA Monthly Rental Income (MRI) Tax\n\n### 🏛️ Kenyan Tax Compliance: Monthly Rental Income (MRI) Tax\n\nUnder the Kenyan Finance Act administered by the **Kenya Revenue Authority (KRA)**:\n\n1. **Applicable Rate:** Residential rental income is subject to a flat **7.5% Monthly Rental Income (MRI) Tax** on gross collections.\n2. **Estimated MRI for ${lCtx.currentMonth}:**\n   - Gross Collections: **${kes(lCtx.totalCollected)}**\n   - Estimated Tax Due (7.5%): **${kes(estTax)}**\n3. **Filing Due Date:** Due on or before the **20th day of the subsequent month** (e.g. October rent tax is due by November 20th).\n4. **Filing Method:** Log into **KRA iTax** (or eCitizen KRA portal), navigate to **Payments ➜ Payment Registration ➜ Tax Head: Income Tax ➜ Sub-head: Monthly Rental Income (MRI)**, generate an e-slip PRN, and pay via M-Pesa Paybill **572572**.\n5. **Penalty for Late Filing:** KRA levies a penalty of KES 2,000 per month for late returns plus 1% interest per month on unpaid tax.`;
      }
    }


    if (hasAny(['emergency', 'dharura', 'contact', 'namba', 'phone number', 'hotline', 'help desk', 'sammy'])) {
      return `> 🧠 **Emergency Response Directory:** Central Dispatch\n\n### 🚨 Emergency Contacts & Support Directory\n\n- **Resident Caretaker & Emergency Desk:** **Sammy Harrison**\n  - Phone: [0748 082 906](tel:0748082906)\n  - WhatsApp: [Chat on WhatsApp](https://wa.me/254748082906)\n  - Available 24/7 for plumbing leaks, blackouts, or structural hazards.\n- **National Police Service:** 999 / 112\n- **Kenya Power Emergency Hotline:** 97771 / 0703 070 707\n- **Nairobi Water / Sewerage Emergency:** 0703 080 598`;
    }

    if (hasAny(['what is rentmaster', 'about', 'how does this work', 'mfumo huu', 'rentmaster', 'harris apex', 'owner'])) {
      return `> 🧠 **System Architecture:** About Rentmaster Enterprise Property Cloud\n\n### 🏢 About Rentmaster Enterprise Property Cloud\n\nRentmaster is a proprietary enterprise property of **Harris Apex**, Kenya's leading technological real-estate operating group:\n\n- **Corporate Identity:** A Property of **Harris Apex**\n- **Automated M-Pesa Buy Goods Integration** with instant 10-minute anti-fraud validation\n- **Tamper-Evident SHA-256 Cryptographic Receipts**\n- **Real-Time Resident Ledgers & PDF Statements**\n- **Kenyan Tenancy Law (Cap 296 & 293) Compliance Advisory**\n- **Resident Maintenance Desk** powered by Caretaker Sammy Harrison (\`0748 082 906\`)`;
    }

    const userRoleStr = isSuperAdmin ? `Super Admin (${sCtx.name})` : isTenant ? `Resident Tenant (${tCtx.unit})` : isLandlord ? `Property Manager (${lCtx.propertyName})` : 'Guest User';
    const tillDisplay = (tCtx && tCtx.tillNumber) || (lCtx && lCtx.tillNumber) || '582190';

    return `> 🧠 **Cognitive Synthesis:** Interpreting inquiry "${rawQ}" for ${userRoleStr}\n\n### Rentmaster Property Intelligence Desk\n\nI have analyzed your query regarding **"${rawQ}"**.\n\nHere are direct insights and actions relevant to your profile:\n\n${isSuperAdmin ? `
- 🌐 **Platform Telemetry:** Review system-wide metrics across all ${sCtx.totalLandlords} registered landlords and ${sCtx.totalUnits} units.
- 💰 **System Volume:** Total platform collections processed: **${kes(sCtx.totalVolume)}**.
- 🔒 **Security Audits:** Check carrier timestamp integrity and anti-replay registries.
- ⚙️ **Role Switcher:** Test portals as Landlord or Tenant via the top switcher bar.
` : isTenant ? `
- 💳 **Make a Payment:** Use Official Property Till **\`${tillDisplay}\`** via Lipa na M-PESA Buy Goods.
- ⏰ **Submit SMS Verification:** Paste your carrier confirmation within 10 minutes to verify your payment.
- 🧾 **Check Balance:** Your current account balance is **${kes(tCtx.totalOutstanding)}**.
- 🔧 **Facility Inquiries:** For water, electrical, or lock issues, contact Caretaker **Sammy Harrison** at **\`0748 082 906\`**.
` : isLandlord ? `
- 📊 **Track Portfolio:** Total verified collections this cycle stand at **${kes(lCtx.totalCollected)}**.
- ⚠️ **Review Defaulters:** ${lCtx.unpaidTenants.length} tenants are pending settlement this cycle.
- ⚖️ **Legal Advisory:** Inquire about eviction notice periods, KRA 7.5% MRI Tax, or Distress for Rent protocols.
` : `
- Please log in as a resident or landlord to access private financial ledger details.
`}
\n*You can also click any of the quick-action chips above or ask a more specific question regarding payments, legal rules, or maintenance.*`;
  }

  mount() {
    let root = document.getElementById('ai-agent-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'ai-agent-root';
      document.body.appendChild(root);
    }

    root.innerHTML = `
      
      <div id="ai-agent-launcher" class="ai-launcher-container" style="position: fixed; bottom: 5.75rem; right: 1.5rem; z-index: 990; transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);">
        <button id="btn-toggle-ai-agent" type="button" class="ai-launcher-btn" style="display: flex; align-items: center; gap: 0.625rem; padding: 0.625rem 1.125rem; border-radius: 9999px; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #ffffff; border: 1.5px solid rgba(255, 255, 255, 0.15); box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.35), 0 0 15px rgba(16, 185, 129, 0.2); cursor: pointer; font-family: inherit; font-size: 0.875rem; font-weight: 700;">
          <span style="display: inline-flex; align-items: center; justify-content: center; width: 1.75rem; height: 1.75rem; border-radius: 50%; background: linear-gradient(135deg, #10b981 0%, #065f46 100%); color: #ffffff; font-size: 0.875rem; box-shadow: 0 0 10px rgba(16, 185, 129, 0.5);">
            ✨
          </span>
          <span id="ai-launcher-text">Ask AI Concierge</span>
          <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #10b981; box-shadow: 0 0 8px #10b981;"></span>
        </button>
      </div>

      
      <div id="ai-agent-panel" class="ai-chat-panel" style="display: none; position: fixed; bottom: 5.5rem; right: 1.5rem; width: min(440px, calc(100vw - 2rem)); height: 600px; max-height: calc(100vh - 7rem); background: #ffffff; border: 1.5px solid var(--slate-200, #e2e8f0); border-radius: 1.25rem; box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.25), 0 0 25px rgba(15, 23, 42, 0.08); z-index: 1000; flex-direction: column; overflow: hidden; font-family: inherit;">
        
        
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
                <span>Cognitive AI Core · 24/7 Active</span>
              </div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 0.25rem;">
            <button id="btn-clear-ai-chat" type="button" title="Clear Chat History" style="background: transparent; border: none; color: #94a3b8; cursor: pointer; padding: 0.375rem; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center;">
              <i data-lucide="trash-2" style="width: 1rem; height: 1rem;"></i>
            </button>
            <button id="btn-close-ai-agent" type="button" title="Close" style="background: transparent; border: none; color: #94a3b8; cursor: pointer; padding: 0.375rem; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center;">
              <i data-lucide="x" style="width: 1.25rem; height: 1.25rem;"></i>
            </button>
          </div>
        </div>

        
        <div id="ai-quick-prompts-bar" style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 0.625rem 0.75rem; display: flex; gap: 0.5rem; overflow-x: auto; white-space: nowrap; scrollbar-width: none;">
          
        </div>

        
        <div id="ai-messages-stream" style="flex: 1; padding: 1rem; overflow-y: auto; display: flex; flex-direction: column; gap: 0.875rem; background: #ffffff;">
          
        </div>

        
        <div style="padding: 0.75rem 1rem; border-top: 1px solid #e2e8f0; background: #ffffff; display: flex; align-items: center; gap: 0.5rem;">
          <input 
            type="text" 
            id="ai-agent-input" 
            placeholder="Ask about rent, M-Pesa till, tenancy law, repairs..." 
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
    if (!user || (user.role !== 'tenant' && user.role !== 'owner' && user.role !== 'caretaker' && user.role !== 'landlord' && user.role !== 'superadmin')) {
      launcher.style.display = 'none';
      return;
    }

    launcher.style.display = 'block';

    const isSuperAdmin = user.role === 'superadmin' || user.email === 'sammyharrison58@gmail.com' || (user.impersonatedBy && !user.role);

    if (isSuperAdmin) {
      btn.style.background = 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)';
      btn.style.borderColor = 'rgba(165, 180, 252, 0.45)';
      textEl.innerText = 'Super Admin AI Core';
    } else if (user.role === 'tenant') {
      btn.style.background = 'linear-gradient(135deg, #064e3b 0%, #065f46 100%)';
      btn.style.borderColor = 'rgba(52, 211, 153, 0.35)';
      textEl.innerText = 'Ask AI Concierge';
    } else {
      btn.style.background = 'linear-gradient(135deg, #1e1b4b 0%, #1e3a8a 100%)';
      btn.style.borderColor = 'rgba(96, 165, 250, 0.35)';
      textEl.innerText = 'Property AI Copilot';
    }
  }

  updateHeaderInfo() {
    const titleEl = document.getElementById('ai-panel-title');
    const subtitleEl = document.getElementById('ai-panel-subtitle');
    const user = this.currentUser;

    if (!titleEl || !subtitleEl) return;

    const isSuperAdmin = user && (user.role === 'superadmin' || user.email === 'sammyharrison58@gmail.com' || (user.impersonatedBy && !user.role));

    if (isSuperAdmin) {
      const sCtx = this.getSuperAdminContext(user);
      titleEl.innerText = 'Rentmaster Super Admin AI Core';
      subtitleEl.innerHTML = `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#818cf8;"></span><span>Executive Console · ${sCtx.name} (Platform Principal)</span>`;
    } else if (user && user.role === 'tenant') {
      const tCtx = this.getTenantContext(user);
      titleEl.innerText = 'Rentmaster Tenant Concierge';
      subtitleEl.innerHTML = `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#10b981;"></span><span>${tCtx ? tCtx.propertyName : 'Residential Living'} · Unit ${tCtx ? tCtx.unit : ''}</span>`;
    } else if (user && (user.role === 'owner' || user.role === 'caretaker' || user.role === 'landlord')) {
      const lCtx = this.getLandlordContext(user);
      titleEl.innerText = 'Rentmaster Property Copilot';
      subtitleEl.innerHTML = `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#38bdf8;"></span><span>${lCtx ? lCtx.propertyName : 'Portfolio HQ'} · Cognitive Intelligence</span>`;
    }
  }

  renderQuickPrompts() {
    const bar = document.getElementById('ai-quick-prompts-bar');
    if (!bar) return;

    const user = this.currentUser;
    const isSuperAdmin = user && (user.role === 'superadmin' || user.email === 'sammyharrison58@gmail.com' || (user.impersonatedBy && !user.role));
    const isTenant = !isSuperAdmin && user && user.role === 'tenant';

    const prompts = isSuperAdmin
      ? [
          { label: '🌐 Platform Overview', query: 'Give me a complete overview of the system, registered landlords, and total units' },
          { label: '🏢 Landlords Directory', query: 'Show me the list of all registered landlords and their properties' },
          { label: '💰 Gross Platform Volume', query: 'What is the total cumulative transaction volume processed by the platform?' },
          { label: '🔒 Security & Audit Logs', query: 'How do Rentmaster cryptographic seals and tamper-evident audit logs work?' },
          { label: '⚙️ Role Switcher Guide', query: 'How does the Super Admin Role Switcher and user impersonation work?' },
          { label: '🏛️ System Tax Compliance', query: 'What are the KRA 7.5% MRI tax reporting metrics across properties?' },
          { label: '🚨 Emergency Hotline', query: 'What are the contact details for central dispatch and Caretaker Sammy Harrison?' }
        ]
      : isTenant
      ? [
          { label: '💳 How to Pay Rent', query: 'How do I pay rent through M-Pesa Till?' },
          { label: '🧾 Current Balance', query: 'What is my current balance and ledger summary?' },
          { label: '⏰ 10-Minute SMS Rule', query: 'Why must my payment SMS be verified within 10 minutes?' },
          { label: '🔧 Caretaker & Repairs', query: 'What are the contact details for Caretaker Sammy Harrison?' },
          { label: '💵 Can I Pay in Half?', query: 'Can I pay my rent in installments or partial amounts?' },
          { label: '📄 Download Statements', query: 'How do I download my official receipts and PDF statement?' },
          { label: '📦 Security Deposit Rules', query: 'What are the rules and timelines for deposit refunds in Kenya?' },
          { label: '⚖️ Eviction Laws (Cap 296)', query: 'What are my legal rights regarding eviction notices and lockouts?' }
        ]
      : [
          { label: '📊 Collections Summary', query: 'How much rent has been collected this month?' },
          { label: '⚠️ Unpaid Defaulters', query: 'Who has not paid rent yet this month?' },
          { label: '🔒 Security Seals & Fraud', query: 'How do digital security seals and till verification work?' },
          { label: '📲 WhatsApp Invites', query: 'How do I invite tenants via WhatsApp and print notice flyers?' },
          { label: '🏛️ KRA 7.5% Rental Tax', query: 'What is the KRA Monthly Rental Income tax requirement and deadline?' },
          { label: '⚖️ Eviction Law in Kenya', query: 'What is the lawful procedure for eviction notices under Kenyan law?' },
          { label: '🔨 Distress for Rent (Cap 293)', query: 'What are the legal steps for auctioning property for unpaid rent?' },
          { label: '📥 Export Excel Statement', query: 'How do I export financial statements to Excel or CSV?' }
        ];

    bar.innerHTML = prompts.map((p) => `
      <button 
        type="button" 
        class="ai-prompt-chip" 
        data-query="${p.query.replace(/"/g, '&quot;')}"
        style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 9999px; padding: 0.3125rem 0.8125rem; font-size: 0.6875rem; font-weight: 700; color: #334155; cursor: pointer; transition: all 0.15s; white-space: nowrap; flex-shrink: 0; box-shadow: 0 1px 2px rgba(0,0,0,0.04);"
        onmouseover="this.style.background='#f1f5f9'; this.style.borderColor='#94a3b8'; this.style.color='#0f172a';"
        onmouseout="this.style.background='#ffffff'; this.style.borderColor='#cbd5e1'; this.style.color='#334155';"
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

    const isSuperAdmin = user && (user.role === 'superadmin' || user.email === 'sammyharrison58@gmail.com' || (user.impersonatedBy && !user.role));

    if (isSuperAdmin) {
      const sCtx = this.getSuperAdminContext(user);
      welcomeText = `> 🧠 **AI Executive Intelligence:** Initialized session for Super Administrator **${sCtx.name}**\n\nGreetings **${sCtx.name}**! 🛡️ Welcome to your **Rentmaster Super Admin Executive Intelligence Console**.\n\n**Enterprise System Health:**\n- 🌐 **Managed Landlord Portfolios:** ${sCtx.totalLandlords} Client Account(s)\n- 🏢 **Total Units Under System:** ${sCtx.totalUnits} Units Across Kenya\n- 👥 **Total Registered Tenants:** ${sCtx.totalTenants} Active Residents\n- 💰 **System-Wide Processed Volume:** **KES ${Number(sCtx.totalVolume).toLocaleString()}** (${sCtx.totalPaymentsCount} Confirmed Records)\n- 🔒 **Tamper-Evident Audit Logs:** ${sCtx.auditLogsCount} System Audit Entries\n\nHow would you like to direct platform operations today?`;
    } else if (user && user.role === 'tenant') {
      const tCtx = this.getTenantContext(user);
      welcomeText = `> 🧠 **AI Resident Assistant:** Initialized session for **${tCtx ? tCtx.name : 'Resident'}** · Unit **${tCtx ? tCtx.unit : ''}**\n\nHello **${tCtx ? tCtx.name : 'Resident'}**! 👋 I am your **Rentmaster Resident AI Concierge** for **${tCtx ? tCtx.propertyName : 'your apartment'}**.\n\nI can answer questions regarding your rent balance (**${tCtx && tCtx.totalOutstanding > 0 ? `Current arrears: KES ${Number(tCtx.totalOutstanding).toLocaleString()}` : 'Zero balance 🎉'}**), M-Pesa Till **\`${tCtx ? tCtx.tillNumber : '582190'}\`**, Safaricom 10-minute verification, or contact Caretaker **Sammy Harrison** (\`0748 082 906\`). How can I help you today?`;
    } else if (user && (user.role === 'owner' || user.role === 'caretaker' || user.role === 'landlord')) {
      const lCtx = this.getLandlordContext(user);
      welcomeText = `> 🧠 **AI Property Copilot:** Portfolio HQ Analysis for **${lCtx ? lCtx.propertyName : 'Portfolio'}**\n\nHello **${lCtx ? lCtx.name : 'Property Owner'}**! 👋 I am your **Rentmaster Intelligent Property Copilot**.\n\nI monitor your live financial collections (**KES ${Number(lCtx ? lCtx.totalCollected : 0).toLocaleString()}** recorded), flag unpaid units, explain payment security hashes, and provide legal guidance under Kenyan Tenancy Law & KRA 7.5% MRI Tax. What would you like to review?`;
    } else {
      welcomeText = `Hello! 👋 I am your **Rentmaster AI Assistant**. Please sign in as a resident or landlord to access personalized property intelligence.`;
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

    this.messages.push({
      sender: 'user',
      text: queryText,
      timestamp: Date.now()
    });
    this.renderMessages();

    this.showTypingIndicator();

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
      <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #10b981; animation: pulse 1s infinite alternate;"></span>
      <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #10b981; animation: pulse 1s infinite alternate 0.2s;"></span>
      <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #10b981; animation: pulse 1s infinite alternate 0.4s;"></span>
      <span style="margin-left: 0.25rem; font-weight: 600;">Analyzing property context & reasoning...</span>
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
        <div style="display: flex; flex-direction: column; align-self: ${isUser ? 'flex-end' : 'flex-start'}; max-width: 90%;">
          <div style="
            background: ${isUser ? 'linear-gradient(135deg, #059669 0%, #047857 100%)' : '#f8fafc'};
            color: ${isUser ? '#ffffff' : '#1e293b'};
            border: ${isUser ? 'none' : '1px solid #e2e8f0'};
            padding: 0.8125rem 1.0625rem;
            border-radius: ${isUser ? '1rem 1rem 0.25rem 1rem' : '1rem 1rem 1rem 0.25rem'};
            font-size: 0.8125rem;
            line-height: 1.55;
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
      .replace(/^#### (.*$)/gim, '<div style="font-size: 0.8125rem; font-weight: 800; color: #0f172a; margin: 0.375rem 0 0.25rem;">$1</div>')
      .replace(/^### (.*$)/gim, '<div style="font-size: 0.875rem; font-weight: 800; color: #0f172a; margin-bottom: 0.375rem;">$1</div>')
      .replace(/^## (.*$)/gim, '<div style="font-size: 0.9375rem; font-weight: 800; color: #0f172a; margin-bottom: 0.5rem;">$1</div>')
      .replace(/^> 🧠 (.*$)/gim, '<blockquote style="border-left: 3px solid #6366f1; padding: 0.375rem 0.625rem; margin: 0.375rem 0; font-size: 0.6875rem; color: #4338ca; background: #eef2ff; border-radius: 0 4px 4px 0; font-weight: 600;">🧠 $1</blockquote>')
      .replace(/^> (.*$)/gim, '<blockquote style="border-left: 3px solid #10b981; padding: 0.375rem 0.625rem; margin: 0.375rem 0; font-size: 0.75rem; color: #475569; background: rgba(16, 185, 129, 0.06); border-radius: 0 4px 4px 0;">$1</blockquote>')
      .replace(/\*\*(.*?)\*\*/g, '<strong style="color: #0f172a; font-weight: 700;">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code style="background: rgba(0,0,0,0.06); padding: 0.125rem 0.375rem; border-radius: 4px; font-family: monospace; font-size: 0.75rem; color: #047857; font-weight: 700;">$1</code>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color: #059669; font-weight: 700; text-decoration: underline;">$1</a>')
      .replace(/\n\n/g, '<div style="height: 0.5rem;"></div>')
      .replace(/\n/g, '<br/>');
  }
}
