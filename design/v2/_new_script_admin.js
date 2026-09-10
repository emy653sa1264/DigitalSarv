<script type="text/x-dc" data-dc-script data-props="{&quot;$preview&quot;:{&quot;width&quot;:1440,&quot;height&quot;:950},&quot;pickupFee&quot;:{&quot;editor&quot;:&quot;int&quot;,&quot;default&quot;:50000,&quot;tsType&quot;:&quot;number&quot;,&quot;unit&quot;:&quot;تومان&quot;,&quot;section&quot;:&quot;قیمت‌گذاری&quot;},&quot;deliveryFee&quot;:{&quot;editor&quot;:&quot;int&quot;,&quot;default&quot;:50000,&quot;tsType&quot;:&quot;number&quot;,&quot;unit&quot;:&quot;تومان&quot;,&quot;section&quot;:&quot;قیمت‌گذاری&quot;},&quot;urgentFee&quot;:{&quot;editor&quot;:&quot;int&quot;,&quot;default&quot;:80000,&quot;tsType&quot;:&quot;number&quot;,&quot;unit&quot;:&quot;تومان&quot;,&quot;section&quot;:&quot;قیمت‌گذاری&quot;},&quot;urgentEnabled&quot;:{&quot;editor&quot;:&quot;boolean&quot;,&quot;default&quot;:true,&quot;tsType&quot;:&quot;boolean&quot;,&quot;section&quot;:&quot;رفتار&quot;}}">
class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.gradeBooks = {
      'اول ابتدایی': 8, 'دوم ابتدایی': 8, 'سوم ابتدایی': 9, 'چهارم ابتدایی': 10, 'پنجم ابتدایی': 11, 'ششم ابتدایی': 11,
      'هفتم': 12, 'هشتم': 12, 'نهم': 13, 'اول دبیرستان': 13, 'دوم دبیرستان': 13, 'سوم دبیرستان': 14,
    };
    this.state = {
      surface: 'admin', cs: 'home', ds: 'today', ad: 'dash', stack: [], toast: '',
      picker: false,
      loggedIn: false, loginStep: 'phone', loginPhone: '۰۹۱۲۳۴۵۶۷۸۹', loginCode: '', termsOk: false, showTerms: false, termsOpen: 0,
      plan: 'gold',
      children: [
        { id: 1, name: 'سارا', grade: 'سوم ابتدایی', books: 9, tone: 'blue', color: 'blue', lined: true, linedCount: 10, linedPos: 'all', extras: [], note: '', orders: [
          { code: '۱۰۲۴۵', kind: 'فنری ۹ کتاب', status: 'در حال فنری', pct: 62, eta: 'تحویل چهارشنبه' },
          { code: '۱۰۲۳۰', kind: 'چاپ جزوه ریاضی', status: 'در حال چاپ', pct: 45, eta: 'تحویل فردا' },
        ] },
        { id: 2, name: 'علی', grade: 'هشتم', books: 12, tone: 'violet', color: 'navy', lined: false, linedCount: 10, linedPos: 'all', extras: [], note: '', orders: [
          { code: '۱۰۲۴۶', kind: 'فنری ۱۲ کتاب', status: 'کنترل کیفیت', pct: 78, eta: 'تحویل چهارشنبه' },
          { code: '۱۰۲۱۲', kind: 'چاپ اطلس تاریخ', status: 'بسته‌بندی', pct: 88, eta: 'تحویل امروز' },
          { code: '۱۰۱۹۸', kind: 'کاور و دیوایدر', status: 'آماده‌سازی', pct: 30, eta: 'تحویل پنجشنبه' },
        ] },
        { id: 3, name: 'نگار', grade: 'سوم دبیرستان', books: 14, tone: 'pink', color: 'red', lined: true, linedCount: 20, linedPos: 'range', extras: [], note: '', orders: [
          { code: '۱۰۲۴۷', kind: 'فنری ۱۴ کتاب', status: 'در حال فنری', pct: 54, eta: 'تحویل چهارشنبه' },
          { code: '۱۰۲۲۵', kind: 'چاپ جزوه کنکور', status: 'در مسیر', pct: 94, eta: 'تا ۱ ساعت' },
        ] },
        { id: 4, name: 'امیر', grade: 'اول ابتدایی', books: 8, tone: 'amber', color: 'orange', lined: false, linedCount: 10, linedPos: 'all', extras: [], note: '', orders: [
          { code: '۱۰۲۴۸', kind: 'فنری ۸ کتاب', status: 'دریافت‌شده', pct: 18, eta: 'تحویل پنجشنبه' },
          { code: '۱۰۲۴۹', kind: 'برچسب نام و کاور', status: 'آماده‌سازی', pct: 35, eta: 'تحویل پنجشنبه' },
        ] },
      ],
      activeChild: 1,
      draft: null, orderFor: null, editingOrderId: null,
      extraOrders: [
        { id: 1, kind: 'docs', label: 'چاپ اسناد', detail: 'پایان‌نامه ۱۲۰ صفحه · A4 · دورو', price: 168000 },
        { id: 2, kind: 'cart', label: 'شارژ کارتریج', detail: 'HP 85A · ۲ عدد', price: 420000 },
      ],
      prices: {
        bindPerBook: 28000, linedSheet: 700, pickupFee: 35000, deliveryFee: 35000, urgentFee: 80000,
        couponPct: 5, couponCap: 100000,
        docBw: 380, docColor: 1200, docMixed: 560, docDoubleDiscount: 12,
        docBind: 65000, stampGold: 45000, stampSilver: 38000,
        flyerA4: 1100, flyerA5: 700, flyerA6: 450, flyerBwPct: 62, flyerGlossyPct: 15,
        flyerBulk2000: 10, flyerBulk5000: 18, flyerDesign: 250000,
        cartridge: 420000,
      },
      coupon: '', couponApplied: false,
      address: 'تهران، سعادت‌آباد، خیابان کوهسار، پلاک ۱۲، واحد ۵',
      phone: '۰۹۱۲۳۴۵۶۷۸۹', pickupDay: 15, pickupSlot: '۱۶ تا ۱۸', urgent: false, pay: 'gateway',
      doc: { ink: 'bw', sides: 'double', copies: 2, scope: 'all', from: 1, to: 120, bindColor: 'maroon', stamp: 'gold', colorPages: '', colorRanges: [{ from: 10, to: 20 }], desc: '', coverTitle: '', coverBack: '', fullName: '' },
      flyerMode: null, problem: 'کیفیت چاپ',
      flyer: { qty: 1000, ink: 'color', size: 'A5', paper: 'گلاسه' },
      collected: 43, checks: [false, false, false, false],
      qc: [true, true, true, false, false, false, false, false, false],
      colors: [
        { id: 'blue', name: 'آبی', hex: '#2f6df6', extra: 0, on: true },
        { id: 'red', name: 'قرمز', hex: '#e04848', extra: 0, on: true },
        { id: 'navy', name: 'سرمه‌ای', hex: '#132a63', extra: 0, on: true },
        { id: 'white', name: 'سفید', hex: '#fbfcff', extra: 2000, on: true },
        { id: 'clear', name: 'شفاف', hex: '#d6f4f8', extra: 5000, on: true },
        { id: 'orange', name: 'نارنجی', hex: '#ef9d0c', extra: 0, on: true },
      ],
      colorQueue: [
        { id: 'green', name: 'سبز', hex: '#1fa968', extra: 3000 },
        { id: 'violet', name: 'بنفش', hex: '#7c5cf5', extra: 3000 },
        { id: 'pink', name: 'صورتی', hex: '#ea5399', extra: 6000 },
        { id: 'gold', name: 'طلایی ویژه', hex: '#c9962b', extra: 20000 },
      ],
      rules: [
        { n: 1, cond: 'تعداد کتاب > ۱۵', effect: '۵٪ تخفیف خدمات', used: '۴۱۲ بار', on: true },
        { n: 2, cond: 'عضویت = طلایی', effect: 'تحویل رایگان', used: '۱۸۶ بار', on: true },
        { n: 3, cond: 'مبلغ > ۵۰۰٬۰۰۰', effect: 'رفت و برگشت رایگان', used: '۲۳۰ بار', on: true },
        { n: 4, cond: 'کمپین = اول مهر ۱۴۰۵', effect: '۵٪ تخفیف با کد SCHOOL1405', used: '۸۴۲ بار', on: true },
        { n: 5, cond: 'سفارش فوری = بله', effect: 'هزینه اضطراری +۸۰٬۰۰۰', used: '۵۷ بار', on: false },
      ],
      cms: [
        { label: 'هیرو', on: true }, { label: 'فنری کتاب مدرسه', on: true }, { label: 'چاپ اسناد', on: true },
        { label: 'تراکت', on: true }, { label: 'کارتریج', on: true }, { label: 'تعمیر پرینتر', on: true },
        { label: 'تحویل‌گیری و تحویل درب منزل', on: true }, { label: 'چطور کار می‌کند', on: true }, { label: 'قیمت‌ها', on: false },
        { label: 'عضویت', on: true }, { label: 'کمپین', on: true }, { label: 'نظر مشتریان', on: false },
        { label: 'پرسش‌های پرتکرار', on: true }, { label: 'فراخوان نهایی', on: true }, { label: 'فوتر', on: true },
      ],
      notifs: [
        { ch: 'پیامک', label: 'سفارش شما ثبت شد.', on: true }, { ch: 'پوش', label: 'پیک برای شما تعیین شد.', on: true },
        { ch: 'پیامک', label: 'کتاب‌های شما دریافت شدند.', on: true }, { ch: 'پوش', label: 'سفارش وارد مرحله تولید شد.', on: true },
        { ch: 'پوش', label: 'سفارش در حال کنترل کیفیت است.', on: false }, { ch: 'پیامک', label: 'سفارش آماده شده است.', on: true },
        { ch: 'پوش', label: 'پیک در مسیر شماست.', on: true }, { ch: 'پیامک', label: 'سفارش تحویل داده شد.', on: true },
      ],
    };
    this.state.extras = [
      { v: 'tag', label: 'برچسب نام', price: 3000, on: false },
      { v: 'laminate', label: 'لمینت جلد', price: 12000, on: false },
      { v: 'trim', label: 'برش لبه', price: 5000, on: false },
      { v: 'waterproof', label: 'جلد ضدآب', price: 9000, on: false },
      { v: 'corner', label: 'گوشه‌گیر فلزی', price: 7000, on: false },
      { v: 'ribbon', label: 'نشانک روبان', price: 4000, on: false },
      { v: 'divider', label: 'دیوایدر رنگی', price: 6000, on: false },
      { v: 'cover', label: 'چاپ نام روی جلد', price: 8000, on: false },
      { v: 'repairPage', label: 'ترمیم صفحات پاره', price: 10000, on: false },
      { v: 'round', label: 'گردکردن گوشه‌ها', price: 5500, on: false },
      { v: 'sleeve', label: 'کاور پلاستیکی', price: 6500, on: false },
      { v: 'numbering', label: 'شماره‌گذاری صفحات', price: 4500, on: false },
    ];
    this.bindColors = [
      { id: 'maroon', name: 'زرشکی', css: 'linear-gradient(160deg,#a63344 0%,#7b1f2b 60%,#4d1017 100%)' },
      { id: 'navy', name: 'آبی تیره', css: 'linear-gradient(160deg,#2c4a86 0%,#16274f 60%,#0b1531 100%)' },
      { id: 'marbled', name: 'ابر و باد', css: 'repeating-linear-gradient(115deg,#4a5568 0 4px,#7d8ea6 4px 7px,#2f3a4d 7px 11px,#98a3b5 11px 14px)' },
    ];
    this.state.grades = Object.keys(this.gradeBooks).map(g => ({ name: g, books: this.gradeBooks[g], on: true }));
    this.state.edit = null;
    this.plans = [
      { id: 'bronze', name: 'برنزی', title: 'دفترچه', price: '۰', cap: 0, disc: 0, freeDelivery: false, freePickup: false, perks: 'رهگیری سفارش · پرداخت آنلاین',
        ink: '#7a4118', soft: '#f6e3d3', border: '#d9a878', grad: ['#e0a874', '#b9722f', '#7a4118'] },
      { id: 'silver', name: 'نقره‌ای', title: 'کیف مدرسه', price: '۳۹٬۰۰۰', cap: 80000, disc: 0.05, freeDelivery: false, freePickup: false, perks: '۵٪ تخفیف خدمات (تا ۸۰ هزار) · تحویل با نرخ ثابت',
        ink: '#4a5568', soft: '#eceff4', border: '#c3cad6', grad: ['#dbe1ea', '#98a3b5', '#5c6779'] },
      { id: 'gold', name: 'طلایی', title: 'شاگرد اول', price: '۷۹٬۰۰۰', cap: 150000, disc: 0.10, freeDelivery: true, freePickup: false, perks: '۱۰٪ تخفیف (تا ۱۵۰ هزار) · تحویل رایگان · اولویت پردازش',
        ink: '#7a5a06', soft: '#fdf0cd', border: '#e3c264', grad: ['#ffdf8a', '#e0ad20', '#9c7405'] },
      { id: 'platinum', name: 'پلاتینیوم', title: 'مدیر مدرسه', price: '۱۴۹٬۰۰۰', cap: 300000, disc: 0.15, freeDelivery: true, freePickup: true, perks: '۱۵٪ تخفیف (تا ۳۰۰ هزار) · تحویل‌گیری و تحویل رایگان · پشتیبانی اختصاصی',
        ink: '#243347', soft: '#e7ecf2', border: '#9fb0c4', grad: ['#cfd9e6', '#7d8ea6', '#33445c'] },
    ];
  }

  fa(n) { return Math.round(n).toLocaleString('fa-IR'); }
  toNum(v) {
    const ascii = String(v)
      .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
      .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
      .replace(/[^0-9]/g, '');
    return parseInt(ascii) || 0;
  }
  money(n) { return this.fa(n) + ' تومان'; }
  notify(msg) {
    this.setState({ toast: msg });
    clearTimeout(this._tt);
    this._tt = setTimeout(() => this.setState({ toast: '' }), 2400);
  }
  componentWillUnmount() { clearTimeout(this._tt); }
  openMap(q) { window.open('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q), '_blank', 'noopener'); }

  resetScroll() {
    const doIt = () => {
      const el = (this.scrollRef && this.scrollRef.current) || document.querySelector('[data-app-scroll]');
      if (el) el.scrollTop = 0;
    };
    doIt();
    setTimeout(doIt, 0);
    setTimeout(doIt, 60);
  }
  nav(patch) { this.setState(patch); this.resetScroll(); }
  requireLogin(then) {
    if (this.state.loggedIn) { then(); return; }
    this.pendingNav = then;
    this.setState({ surface: 'customer', cs: 'login', loginStep: 'phone', stack: [] });
  }
  colorExtra(c) { const x = this.state.colors.find(k => k.id === c.color); return x ? x.extra : 0; }
  extraList() { return this.state.extras || []; }
  extrasPrice(c) { return (c.extras || []).reduce((s, e) => { const x = this.extraList().find(k => k.v === e && k.on); return s + (x ? x.price : 0); }, 0); }
  gradeList() { return this.state.grades || []; }
  gradeDefault(name) { const g = this.gradeList().find(x => x.name === name); return g ? g.books : (this.gradeBooks[name] || 10); }
  bookCount(c) { return typeof c.books === 'number' ? c.books : this.gradeDefault(c.grade); }
  startEdit(kind, id, f1, f2, f3) { this.setState({ edit: { kind, id, f1: String(f1), f2: String(f2), f3: f3 || '' } }); }
  setEditField(k, v) { this.setState(s => ({ edit: { ...s.edit, [k]: v } })); }
  commitEdit() {
    const e = this.state.edit;
    if (!e) return;
    const name = e.f1.trim() || 'بدون نام';
    const num = this.toNum(e.f2);
    if (e.kind === 'extra') {
      this.setState(s => ({ extras: s.extras.map(x => x.v === e.id ? { ...x, label: name, price: num } : x), edit: null }));
    } else if (e.kind === 'grade') {
      this.setState(s => ({
        grades: s.grades.map(x => x.name === e.id ? { ...x, name, books: Math.max(1, num) } : x),
        children: s.children.map(c => c.grade === e.id ? { ...c, grade: name } : c),
        edit: null,
      }));
    } else if (e.kind === 'color') {
      const hex = /^#[0-9a-fA-F]{3,8}$/.test(e.f3) ? e.f3 : '#2f6df6';
      this.setState(s => ({ colors: s.colors.map(x => x.id === e.id ? { ...x, name, extra: num, hex } : x), edit: null }));
    }
    this.notify('تغییرات ذخیره شد');
  }
  p(k) { const v = this.state.prices[k]; return typeof v === 'number' ? v : 0; }
  childTotal(c) { const n = this.bookCount(c); return n * (this.p('bindPerBook') + this.colorExtra(c) + this.extrasPrice(c)) + (c.lined ? n * (c.linedCount || 10) * this.p('linedSheet') : 0); }
  plan() { return this.plans.find(p => p.id === this.state.plan) || this.plans[0]; }

  badge(tone, size) {
    const g = {
      blue: ['#7ea6ff', '#2f6df6', '#1b45b8', 'rgba(47,109,246,0.42)'],
      cyan: ['#7be0ec', '#0fa9bd', '#0b7686', 'rgba(15,169,189,0.4)'],
      violet: ['#b9a4ff', '#7c5cf5', '#4c31b8', 'rgba(124,92,245,0.42)'],
      amber: ['#ffd27a', '#ef9d0c', '#a86a05', 'rgba(239,157,12,0.4)'],
      green: ['#79e0b0', '#1fa968', '#14764a', 'rgba(31,169,104,0.4)'],
      pink: ['#ffa8cf', '#ea5399', '#a82c69', 'rgba(234,83,153,0.4)'],
      ink: ['#5b6480', '#1c2233', '#07090f', 'rgba(7,9,15,0.4)'],
    }[tone] || ['#7ea6ff', '#2f6df6', '#1b45b8', 'rgba(47,109,246,0.42)'];
    const s = size || 42;
    return 'width:' + s + 'px;height:' + s + 'px;flex:none;border-radius:' + Math.round(s * 0.34) + 'px;color:#fff;display:flex;align-items:center;justify-content:center;'
      + 'background:linear-gradient(160deg,' + g[0] + ' 0%,' + g[1] + ' 55%,' + g[2] + ' 100%);'
      + 'box-shadow:0 ' + Math.round(s * 0.18) + 'px ' + Math.round(s * 0.42) + 'px ' + g[3] + ',inset 0 1.5px 0 rgba(255,255,255,0.55)';
  }
  tint(tone) {
    return { blue: ['#e3ecff', '#1b45b8'], cyan: ['#d6f4f8', '#0b5a66'], violet: ['#ebe5ff', '#4c31b8'], amber: ['#fdeecd', '#5c4306'], green: ['#d7f4e6', '#0d5334'], pink: ['#ffe1ef', '#7c1f4d'], ink: ['#eef2fb', '#4a5268'] }[tone] || ['#e3ecff', '#1b45b8'];
  }
  roleTheme() {
    return {
      landing: { accent: '#2f6df6', dark: '#1b45b8', soft: '#e3ecff', softInk: '#1b45b8', shell: '#eef2fb', glow: 'rgba(47,109,246,0.35)' },
      customer: { accent: '#2f6df6', dark: '#1b45b8', soft: '#e3ecff', softInk: '#1b45b8', shell: '#eef2fb', glow: 'rgba(47,109,246,0.35)' },
      delivery: { accent: '#1fa968', dark: '#14764a', soft: '#d7f4e6', softInk: '#0d5334', shell: '#ecf6f0', glow: 'rgba(31,169,104,0.35)' },
      admin: { accent: '#7c5cf5', dark: '#4c31b8', soft: '#ebe5ff', softInk: '#4c31b8', shell: '#f2effc', glow: 'rgba(124,92,245,0.35)' },
    }[this.state.surface] || { accent: '#2f6df6', dark: '#1b45b8', soft: '#e3ecff', softInk: '#1b45b8', shell: '#eef2fb', glow: 'rgba(47,109,246,0.35)' };
  }
  chip(sel, pad) {
    const th = this.roleTheme();
    return 'cursor:pointer;border-radius:999px;padding:' + (pad || '11px 16px') + ';font-size:13px;font-weight:700;'
      + (sel ? 'background:' + th.accent + ';color:#fff;border:1px solid ' + th.accent + ';box-shadow:0 4px 12px ' + th.glow : 'background:#fff;color:#3a4257;border:1px solid #cfd8ec');
  }
  sw(on) { return 'width:52px;height:30px;flex:none;border-radius:999px;border:none;cursor:pointer;display:flex;align-items:center;padding:3px;background:' + (on ? '#1fa968' : '#c3cadd'); }
  knob(on) { return 'width:24px;height:24px;border-radius:999px;background:#fff;box-shadow:0 2px 5px rgba(7,9,15,0.28);transition:transform .18s;transform:translateX(' + (on ? '-22px' : '0') + ')'; }

  go(cs) {
    this.requireLogin(() => this.nav(s => ({
      surface: 'customer', cs,
      stack: s.surface === 'customer' ? [...s.stack, s.cs] : ['home'],
    })));
  }
  back() { this.nav(s => ({ cs: s.stack.length ? s.stack[s.stack.length - 1] : 'home', stack: s.stack.slice(0, -1) })); }
  patchChild(fields) {
    this.setState(s => ({ children: s.children.map(c => c.id !== s.activeChild ? c : { ...c, ...fields }) }));
  }
  addExtraOrder(kind, label, detail, price) {
    const editingId = this.state.editingOrderId;
    this.nav(s => {
      const editing = s.editingOrderId;
      const item = { id: editing || Date.now(), kind, label, detail, price, forChild: editing ? (s.extraOrders.find(x => x.id === editing) || {}).forChild || null : (s.orderFor || null) };
      return {
        extraOrders: editing ? s.extraOrders.map(x => x.id === editing ? item : x) : [...s.extraOrders, item],
        orderFor: null, editingOrderId: null,
        cs: editing ? 'summary' : (s.orderFor ? 'child' : 'family'),
        stack: editing ? ['home', 'family'] : (s.orderFor ? ['home', 'family'] : ['home']),
      };
    });
    this.notify(editingId ? label + ' ویرایش شد' : label + (this.state.children.length ? ' به سفارش خانوادگی اضافه شد' : ' به سفارش شما اضافه شد'));
  }

  renderVals() {
    const S = this.state, fa = n => this.fa(n), money = n => this.money(n);
    const pickupFee = this.p('pickupFee');
    const deliveryFee = this.p('deliveryFee');
    const urgentFee = this.p('urgentFee');
    const urgentEnabled = this.props.urgentEnabled ?? true;
    const plan = this.plan();

    const totalBooksN = S.children.reduce((s, c) => s + this.bookCount(c), 0);
    const bindingN = S.children.reduce((s, c) => s + this.childTotal(c), 0);
    const extrasN = S.extraOrders.reduce((s, o) => s + o.price, 0);
    const subtotalN = bindingN + extrasN;
    const planDiscN = plan.cap ? Math.min(Math.round(subtotalN * plan.disc), plan.cap) : Math.round(subtotalN * plan.disc);
    const couponN = S.couponApplied ? Math.min(Math.round(subtotalN * this.p('couponPct') / 100), this.p('couponCap')) : 0;
    const pickupN = plan.freePickup ? 0 : pickupFee;
    const deliveryN = plan.freeDelivery ? 0 : deliveryFee;
    const totalN = subtotalN + pickupN + deliveryN - planDiscN - couponN + (S.urgent ? urgentFee : 0);

    const child = S.children.find(c => c.id === S.activeChild) || S.children[0] || { id: 0, name: '', grade: 'اول ابتدایی', books: 8, tone: 'blue', color: 'blue', extras: [], lined: false, linedCount: 10, linedPos: 'all', note: '', orders: [] };
    const isDelivery = S.surface === 'delivery';
    const isNew = S.draft === 'new';

    const icon = {
      book: ['M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2z', 'M9 4v16'],
      file: ['M5 3h14v18H5z', 'M9 9h6M9 13h6M9 17h4'],
      flyer: ['M5 3h14v18H5z', 'M8 7h8v5H8z'],
      printer: ['M6 3h12v5H6z', 'M3 8h18v8H3zM7 14h10v7H7z'],
      wrench: ['M8 4a4 4 0 1 0 3 6.8L19 19l1-1-8.2-8.2A4 4 0 0 0 8 4z', 'M6 18h3'],
      truck: ['M1 6h13v10H1z', 'M14 9h4l3 3v4h-7zM6 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM18 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4z'],
      home: ['M4 10 12 4l8 6v10H4z', 'M10 20v-6h4v6'],
      clip: ['M5 4h14v17H5z', 'M9 2h6v4H9z'],
      route: ['M6 4a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z', 'M6 9v5a4 4 0 0 0 4 4h5M18 15a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z'],
      user: ['M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6'],
      pen: ['M4 20h4L20 8l-4-4L4 16z', 'M14 6l4 4'],
      up: ['M12 17V5', 'M7 10l5-5 5 5M4 20h16'],
      check: ['M5 13l5 5 9-12', 'M5 13l5 5 9-12'],
      crown: ['M4 18h16', 'M4 16 3 7l5 4 4-6 4 6 5-4-1 9z'],
      pin: ['M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11z', 'M12 7.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8z'],
    };

    const roleColor = { landing: '#2f6df6', customer: '#2f6df6', delivery: '#1fa968', admin: '#7c5cf5' };
    const th = this.roleTheme();
    const surfaceTab = (id, label) => ({
      label,
      pick: () => (id === 'customer' && !S.loggedIn)
        ? this.setState({ surface: 'customer', cs: 'login', loginStep: 'phone', stack: [] })
        : this.setState({ surface: id }),
      style: 'cursor:pointer;border:none;border-radius:999px;padding:9px 16px;font-size:13px;font-weight:800;'
        + (S.surface === id ? 'background:' + roleColor[id] + ';color:#fff;box-shadow:0 4px 12px ' + roleColor[id] + '80' : 'background:transparent;color:#9aa2b8'),
    });

    const titles = {
      home: ['سلام، مریم', 'خانواده رضایی · ' + plan.title, 'home', 'blue'],
      family: ['سفارش خانوادگی', fa(S.children.length) + ' فرزند · ' + fa(totalBooksN) + ' کتاب', 'book', 'blue'],
      child: [isNew ? 'افزودن فرزند' : (child ? child.name : 'فرزند'), 'پایه تحصیلی و گزینه‌ها', 'user', 'blue'],
      summary: ['خلاصه سفارش', 'قبل از پرداخت بررسی کنید', 'clip', 'violet'],
      pickup: ['زمان و آدرس تحویل‌گیری', 'روی نقشه گوگل مشخص کنید', 'pin', 'green'],
      membership: ['عضویت', 'قبل از پرداخت، پلن را مقایسه کنید', 'crown', 'amber'],
      pay: ['پرداخت', 'مرور نهایی و روش پرداخت', 'clip', 'violet'],
      done: ['ثبت شد', 'سفارش ۱۰۲۵۰', 'check', 'green'],
      track: ['رهگیری سفارش', 'وضعیت لحظه‌ای هر فرزند', 'route', 'violet'],
      docs: ['چاپ و صحافی اسناد', 'پایان‌نامه، جزوه، مدرک اداری', 'file', 'cyan'],
      flyer: ['تراکت', 'طراحی و چاپ', 'flyer', 'violet'],
      cart: ['شارژ کارتریج', 'دریافت و تحویل درب منزل', 'printer', 'amber'],
      repair: ['تعمیر پرینتر', 'دریافت دستگاه در محل', 'wrench', 'green'],
      me: ['پروفایل', 'مریم رضایی · ' + plan.title, 'user', 'pink'],
      orders: ['سفارش‌های من', 'تاریخچه و سفارش دوباره', 'clip', 'blue'],
      login: ['ورود به دیجیتال سرو', 'با شماره موبایل', 'user', 'blue'],
    };
    const dvTitles = {
      today: ['مسیر امروز', 'شنبه ۱۴ شهریور', 'route', 'ink'],
      task: ['سفارش ۱۰۲۵۰', 'تحویل‌گیری · سعادت‌آباد', 'clip', 'blue'],
      verify: ['شمارش و تطبیق', 'خانواده رضایی', 'check', 'green'],
    };
    const t = isDelivery ? (dvTitles[S.ds] || dvTitles.today) : (titles[S.cs] || titles.home);

    const bento = [
      { title: 'چاپ اسناد', body: 'فایل را بفرستید، چاپ‌شده تحویل بگیرید — بدون انتخاب گرماژ.', cta: 'سفارش چاپ', k: 'file', tone: 'cyan', go: () => this.go('docs') },
      { title: 'پایان‌نامه و صحافی', body: 'دانشجو، اداره و شرکت: فایل را بفرستید، چاپ و صحافی‌شده تحویل بگیرید.', cta: 'چاپ و صحافی', k: 'clip', tone: 'blue', go: () => { this.setState(s => ({ doc: { ...s.doc, bind: 'فنری' } })); this.go('docs'); } },
      { title: 'طراحی و چاپ تراکت', body: 'طراحی دارید یا نه، هر دو مسیر هست.', cta: 'شروع کنید', k: 'flyer', tone: 'violet', go: () => this.go('flyer') },
      { title: 'شارژ کارتریج', body: 'کارتریج را می‌گیریم، پر می‌کنیم، برمی‌گردانیم.', cta: 'درخواست سرویس', k: 'printer', tone: 'amber', go: () => this.go('cart') },
      { title: 'تعمیر پرینتر', body: 'دستگاه را می‌بریم؛ پیش‌فاکتور را تأیید کنید.', cta: 'درخواست تعمیر', k: 'wrench', tone: 'green', go: () => this.go('repair') },
      { title: 'تحویل‌گیری و تحویل درب منزل', body: 'ما می‌آییم؛ شما فقط سفارش دهید.', cta: 'ثبت سفارش', k: 'truck', tone: 'pink', go: () => this.go('family') },
    ];
    const btnBg = { cyan: '#0fa9bd', violet: '#7c5cf5', amber: '#ef9d0c', green: '#1fa968', pink: '#ea5399', blue: '#2f6df6' };

    const trackLabels = [
      ['ثبت سفارش', 'شنبه ۱۴:۰۲'], ['تأیید سفارش', 'شنبه ۱۴:۰۵'], ['تعیین پیک', 'شنبه ۱۵:۱۰'],
      ['تحویل‌گیری از منزل', 'شنبه ۱۶:۴۰'], ['آماده‌سازی', 'یکشنبه ۰۹:۱۰'], ['فنری‌کردن', 'در حال انجام'],
      ['کنترل کیفیت', '—'], ['بسته‌بندی', '—'], ['در مسیر تحویل', '—'], ['تحویل شد', '—'],
    ];
    const cur = 5;

    const docFilePages = 120;
    const dFrom = Math.min(Math.max(1, S.doc.from || 1), docFilePages);
    const dTo = Math.min(Math.max(dFrom, S.doc.to || docFilePages), docFilePages);
    const docPagesN = S.doc.scope === 'range' ? (dTo - dFrom + 1) : docFilePages;
    const inkRate = S.doc.ink === 'color' ? this.p('docColor') : S.doc.ink === 'mixed' ? this.p('docMixed') : this.p('docBw');
    const sizeMul = 1;
    const sidesMul = S.doc.sides === 'double' ? (1 - this.p('docDoubleDiscount') / 100) : 1;
    const bindPrice = this.p('docBind') + (S.doc.stamp === 'silver' ? this.p('stampSilver') : this.p('stampGold'));
    const docTotalN = Math.round(docPagesN * inkRate * sizeMul * sidesMul * S.doc.copies + bindPrice * S.doc.copies);

    const flyerQty = Math.max(500, S.flyer.qty || 1000);
    const flyerBase = { A4: this.p('flyerA4'), A5: this.p('flyerA5'), A6: this.p('flyerA6') }[S.flyer.size] || this.p('flyerA5');
    const flyerRate = flyerBase * (S.flyer.ink === 'color' ? 1 : this.p('flyerBwPct') / 100)
      * ({ 'گلاسه': 1 + this.p('flyerGlossyPct') / 100, 'تحریر': 1 }[S.flyer.paper] || 1)
      * (flyerQty >= 5000 ? 1 - this.p('flyerBulk5000') / 100 : flyerQty >= 2000 ? 1 - this.p('flyerBulk2000') / 100 : 1);
    const flyerTotalN = Math.round(flyerQty * flyerRate) + (S.flyerMode === 'need' ? this.p('flyerDesign') : 0);

    const opt = (list, cur2, set, pad) => list.map(o => ({ label: o.label, style: this.chip(cur2 === o.v, pad), smallStyle: this.chip(cur2 === o.v, '8px 13px'), pick: () => set(o.v) }));
    const grades = Object.keys(this.gradeBooks);

    return {
      surfaceTabs: [surfaceTab('landing', 'لندینگ'), surfaceTab('customer', 'مشتری'), surfaceTab('delivery', 'پیک'), surfaceTab('admin', 'ادمین')],
      isLanding: S.surface === 'landing',
      isPhone: S.surface === 'customer' || S.surface === 'delivery',
      isAdmin: S.surface === 'admin',
      toastOn: !!S.toast, toastMsg: S.toast,
      shellStyle: 'display:flex;align-items:flex-start;justify-content:center;gap:34px;padding:38px 20px;position:relative;background:' + th.shell,
      adminShellStyle: 'max-width:1260px;margin:0 auto;padding:26px 24px;display:grid;grid-template-columns:242px minmax(0,1fr);gap:22px;align-items:start;background:' + th.shell,
      appBg: 'height:100%;display:flex;flex-direction:column;background:' + th.shell + ';font-family:Vazirmatn,system-ui,sans-serif;color:#0f1320;position:relative;overflow:hidden',
      blob1: 'position:absolute;top:60px;right:8%;width:320px;height:320px;border-radius:999px;background:' + th.glow + ';opacity:0.35;pointer-events:none',
      blob2: 'position:absolute;bottom:40px;left:10%;width:240px;height:240px;border-radius:999px;background:' + th.accent + ';opacity:0.12;pointer-events:none',
      softBg: 'background:' + th.soft + ';color:' + th.softInk,
      softPanel: 'border-radius:22px;padding:16px;background:' + th.soft + ';color:' + th.softInk,
      stepBtn: 'width:52px;height:52px;border-radius:18px;border:none;background:' + th.soft + ';color:' + th.softInk + ';font-size:26px;font-weight:800;cursor:pointer',
      softBtn: 'background:' + th.soft + ';color:' + th.softInk + ';border:none;border-radius:999px;padding:16px;font-weight:800;font-size:14.5px;cursor:pointer',
      softChipBtn: 'flex:1;background:' + th.soft + ';color:' + th.softInk + ';border:none;border-radius:999px;padding:12px;font-weight:800;font-size:13px;cursor:pointer',
      softWide: 'width:100%;margin-top:12px;display:flex;align-items:center;justify-content:center;gap:8px;background:' + th.soft + ';color:' + th.softInk + ';border:none;border-radius:20px;padding:15px;font-weight:800;font-size:14px;cursor:pointer',
      accentBtn: 'background:' + th.accent + ';color:#fff;border:none;border-radius:999px;padding:13px 22px;font-weight:800;font-size:13.5px;cursor:pointer;box-shadow:0 8px 18px ' + th.glow,
      accentSmall: 'display:inline-flex;align-items:center;gap:7px;background:' + th.accent + ';color:#fff;border:none;border-radius:999px;padding:10px 16px;font-weight:800;font-size:13px;cursor:pointer;box-shadow:0 6px 14px ' + th.glow,
      condChip: 'border-radius:999px;padding:8px 14px;font-size:13px;font-weight:700;background:' + th.soft + ';color:' + th.softInk,
      roleBadge: 'border-radius:999px;padding:5px 12px;font-size:11.5px;font-weight:800;background:' + th.soft + ';color:' + th.softInk,

      csLogin: !isDelivery && S.cs === 'login',
      loginPhoneStep: S.loginStep === 'phone', loginCodeStep: S.loginStep === 'code',
      loginPhone: S.loginPhone, loginCode: S.loginCode,
      setLoginPhone: e => this.setState({ loginPhone: e.target.value }),
      setLoginCode: e => this.setState({ loginCode: e.target.value }),
      termsOk: S.termsOk,
      toggleTerms: () => this.setState(s => ({ termsOk: !s.termsOk })),
      termsBox: 'width:24px;height:24px;flex:none;border-radius:8px;border:2px solid ' + (S.termsOk ? '#1fa968' : '#c3cadd') + ';background:' + (S.termsOk ? '#1fa968' : 'transparent') + ';display:flex;align-items:center;justify-content:center',
      openTerms: () => this.setState({ showTerms: true }),
      closeTerms: () => this.setState({ showTerms: false }),
      showTerms: S.showTerms,
      acceptTerms: () => this.setState({ termsOk: true, showTerms: false }),
      termsUpdated: 'آخرین بازنگری: ۱۵ شهریور ۱۴۰۵',
      termsList: [
        { t: 'موضوع خدمات و نقش پلتفرم', b: 'دیجیتال سرو یک پلتفرم واسط است: سفارش شما را دریافت می‌کند، به یکی از مراکز چاپ طرف قرارداد ارجاع می‌دهد، کیفیت را کنترل و کالا را تحویل می‌دهد. مالکیت کالا در تمام مراحل با شماست و پلتفرم امانت‌دار آن است.' },
        { t: 'ثبت‌نام و اعتبار حساب', b: 'حساب کاربری با شماره موبایل و کد یک‌بارمصرف ساخته می‌شود. شماره ثبت‌شده مبنای همه اطلاع‌رسانی‌ها و تحویل است. مسئولیت صحت شماره، آدرس و حفاظت از کد تأیید با کاربر است و انتقال حساب به دیگری مجاز نیست. حساب کاربران زیر ۱۸ سال باید با اطلاع سرپرست قانونی ایجاد شود.' },
        { t: 'ثبت سفارش و قیمت', b: 'قیمت نمایش‌داده‌شده پیش از پرداخت، قیمت قطعی همان سفارش با همان مشخصات است. تغییر مشخصات پس از تحویل‌گیری، سفارش را مشمول بازمحاسبه می‌کند. قیمت‌ها بر پایه تعرفه روز مراکز چاپ است و تغییر تعرفه اثری بر سفارش‌های پرداخت‌شده ندارد.' },
        { t: 'تحویل‌گیری، شمارش و مغایرت', b: 'پیک در محل، تعداد و وضعیت ظاهری اقلام را در حضور شما شمارش و ثبت می‌کند و رسید دیجیتال صادر می‌شود. اگر تعداد یا مشخصات با سفارش اختلاف داشته باشد، مبلغ بازمحاسبه و پیش از شروع کار برای تأیید شما ارسال می‌گردد؛ کار بدون تأیید شما آغاز نمی‌شود.' },
        { t: 'زمان انجام و تأخیر', b: 'زمان استاندارد برای سفارش‌های تا ۲۵ کتاب، ۲۴ تا ۴۸ ساعت کاری از لحظه تحویل‌گیری است. در کمپین‌های پرترافیک (مانند اول مهر) زمان اعلام‌شده در صفحه سفارش معتبر است. در صورت تأخیر بیش از ۲۴ ساعت نسبت به زمان اعلامی، هزینه تحویل‌گیری و تحویل بازگردانده می‌شود.' },
        { t: 'مسئولیت کالا و خسارت', b: 'از لحظه تحویل به پیک تا تحویل نهایی، اقلام تحت پوشش تضمین خدمات هستند. در صورت آسیب، گم‌شدن یا خطای اجرایی (رنگ، جلد یا صفحات نادرست)، انجام دوباره کار بدون هزینه یا جبران نقدی تا سقف ارزش کارشناسی‌شده کالا انجام می‌شود. فرسودگی پیشین کتاب و پارگی‌های ثبت‌شده در رسید تحویل‌گیری مشمول این بند نیست.' },
        { t: 'کنترل کیفیت و مغایرت پس از تحویل', b: 'هر سفارش پیش از بسته‌بندی از چک‌لیست کیفیت عبور می‌کند. اعتراض به کیفیت تا ۴۸ ساعت پس از تحویل، با ارسال تصویر، در پلتفرم قابل ثبت است و در صورت تأیید، اصلاح یا بازپرداخت انجام می‌شود.' },
        { t: 'پرداخت، انصراف و بازپرداخت', b: 'پرداخت از طریق درگاه بانکی، کیف پول یا در محل تحویل انجام می‌شود. انصراف پیش از تحویل‌گیری رایگان است؛ پس از تحویل‌گیری و پیش از شروع کار، فقط هزینه رفت‌وبرگشت کسر می‌شود؛ پس از شروع فنری، هزینه اقلام انجام‌شده محاسبه و مابقی بازگردانده می‌شود. بازپرداخت به کیف پول آنی و به کارت بانکی حداکثر ۷۲ ساعت کاری است.' },
        { t: 'عضویت ماهانه', b: 'حق عضویت ماهانه و به‌صورت خودکار تمدید می‌شود و هر زمان بدون جریمه قابل لغو است؛ پس از لغو، مزایا تا پایان دوره پرداخت‌شده باقی می‌ماند. تخفیف هر پلن در هر سفارش سقف مشخصی دارد و با تخفیف کمپین تا سقف مجاز جمع می‌شود. حق عضویت بازگشت‌پذیر نیست.' },
        { t: 'کمپین‌ها و کدهای تخفیف', b: 'هر کد تخفیف بازه زمانی، حداقل مبلغ سفارش، سقف تخفیف و ظرفیت روزانه دارد. استفاده از یک کد در چند حساب متعلق به یک شخص، یا سفارش‌های صوری برای دریافت تخفیف، موجب ابطال کد و تخفیف اعمال‌شده می‌شود.' },
        { t: 'محتوای ارسالی و مالکیت فکری', b: 'کاربر تأیید می‌کند حق چاپ فایل‌های ارسالی را دارد. سفارش چاپ آثار دارای حق نشر بدون مجوز، اسناد جعلی، یا محتوای مغایر قوانین جمهوری اسلامی ایران پذیرفته نمی‌شود و پلتفرم می‌تواند چنین سفارشی را لغو کند.' },
        { t: 'حریم خصوصی و داده‌ها', b: 'فایل‌های ارسالی فقط برای انجام همان سفارش استفاده می‌شوند و حداکثر ۳۰ روز پس از تحویل از سرور حذف می‌گردند. شماره تماس و آدرس فقط در اختیار پیک همان سفارش قرار می‌گیرد. داده‌ها بدون رضایت کاربر به شخص سوم فروخته یا واگذار نمی‌شود؛ درخواست حذف کامل حساب از بخش پشتیبانی قابل ثبت است.' },
        { t: 'اطلاع‌رسانی', b: 'پیام‌های مربوط به وضعیت سفارش (پیامک و پوش) بخشی از خدمات است و قابل غیرفعال‌سازی کامل نیست؛ پیام‌های تبلیغاتی از پروفایل قابل خاموش کردن است.' },
        { t: 'موارد خارج از تعهد', b: 'قطعی برق و اینترنت، تعطیلی‌های غیرمترقبه، محدودیت‌های حمل‌ونقل شهری و حوادث قهری، تعهد زمانی را به تعویق می‌اندازد؛ در این موارد کاربر می‌تواند سفارش را بدون هزینه لغو کند.' },
        { t: 'تغییر قوانین و حل اختلاف', b: 'تغییر این قوانین از طریق پلتفرم اطلاع‌رسانی می‌شود و نسبت به سفارش‌های ثبت‌شده پیش از تغییر اثر ندارد. رسیدگی به اختلاف ابتدا از مسیر پشتیبانی و در صورت عدم توافق، بر اساس قوانین تجارت الکترونیک ایران انجام می‌شود.' },
      ].map((x, i) => ({
        n: fa(i + 1), t: x.t, b: x.b,
        toggle: () => this.setState(s => ({ termsOpen: s.termsOpen === i ? -1 : i })),
        rowStyle: 'display:flex;gap:10px;width:100%;background:transparent;border:none;border-top:1px solid #eef2fb;padding:11px 0;cursor:pointer;text-align:right;align-items:flex-start',
        numStyle: 'width:24px;height:24px;flex:none;border-radius:9px;font-size:11.5px;font-weight:800;display:flex;align-items:center;justify-content:center;background:'
          + (S.termsOpen === i ? '#2f6df6' : '#e3ecff') + ';color:' + (S.termsOpen === i ? '#fff' : '#1b45b8'),
        titleStyle: 'font-weight:800;font-size:13.5px;color:#0f1320',
        bodyStyle: S.termsOpen === i ? 'display:block;font-size:12.5px;color:#4a5268;margin-top:6px;line-height:1.85' : 'display:none',
        caret: 'flex:none;font-size:11px;color:#8c93a8;font-weight:800;margin-top:4px',
        caretIcon: S.termsOpen === i ? '−' : '+',
      })),
      sendCode: () => {
        if (!S.termsOk) { this.notify('برای ادامه، قوانین و مقررات را بپذیرید'); return; }
        this.setState({ loginStep: 'code' }); this.notify('کد تأیید ارسال شد: ۴۸۲۹');
      },
      resendCode: () => this.notify('کد تأیید دوباره ارسال شد: ۴۸۲۹'),
      editPhone: () => this.setState({ loginStep: 'phone' }),
      doLogin: () => {
        this.setState({ loggedIn: true, cs: 'home', stack: [] });
        this.notify('خوش آمدید، مریم');
        const then = this.pendingNav; this.pendingNav = null;
        if (then) setTimeout(then, 60);
      },
      logout: () => { this.setState({ loggedIn: false, cs: 'login', loginStep: 'phone', loginCode: '', stack: [], surface: 'customer' }); this.notify('از حساب خارج شدید'); },
      startOrder: () => this.go('family'),
      goDocs: () => this.go('docs'),
      goHome: () => this.nav({ cs: 'home', stack: [] }),
      goFamily: () => this.nav({ cs: 'family', stack: ['home'] }),
      goSummary: () => this.go('summary'),
      goPickup: () => this.go('pickup'),
      goMembership: () => this.go('membership'),
      goPay: () => this.go('pay'),
      goDone: () => { this.nav({ cs: 'done', stack: [] }); this.notify('پرداخت انجام شد — سفارش ۱۰۲۵۰ ثبت شد'); },
      goTrack: () => this.nav({ cs: 'track', stack: ['home'] }),
      goBack: () => this.back(),
      showBack: isDelivery ? S.ds !== 'today' : (S.cs !== 'home' && S.cs !== 'done' && S.cs !== 'login'),
      showChrome: isDelivery || S.cs !== 'login',
      screenTitle: t[0], screenSub: t[1],
      headPath1: icon[t[2]][0], headPath2: icon[t[2]][1], headIconStyle: this.badge(t[3], 38),
      openNotifs: () => this.notify('۳ اعلان جدید: پیک برای فردا تعیین شد'),
      support: () => this.notify('پشتیبانی: ۰۲۱۹۱۰۰۲۲۳۳'),

      bentoCards: bento.map(b => {
        const tn = this.tint(b.tone);
        return {
          title: b.title, body: b.body, cta: b.cta, go: b.go, path1: icon[b.k][0], path2: icon[b.k][1],
          cardStyle: 'background:' + tn[0] + ';border-radius:30px;padding:26px;display:flex;flex-direction:column;justify-content:space-between;min-height:236px;color:' + tn[1],
          bodyStyle: 'font-size:14px;line-height:1.7;margin:0;opacity:0.85',
          iconStyle: this.badge(b.tone, 46),
          ctaStyle: 'align-self:flex-start;margin-top:18px;background:' + btnBg[b.tone] + ';color:#fff;border:none;border-radius:999px;padding:13px 24px;font-weight:800;font-size:14px;cursor:pointer;box-shadow:0 8px 18px rgba(7,9,15,0.16)',
        };
      }),
      howSteps: [
        { n: '۱', title: 'انتخاب پایه', body: 'برای هر فرزند فقط پایه تحصیلی' },
        { n: '۲', title: 'محاسبه قیمت', body: 'قیمت هر فرزند جداگانه' },
        { n: '۳', title: 'تحویل‌گیری', body: 'پیک درب منزل، شمارش و تطبیق' },
        { n: '۴', title: 'کنترل کیفیت', body: 'بازبینی نهایی هر کتاب' },
        { n: '۵', title: 'تحویل', body: 'بسته خانوادگی، یک تحویل' },
      ].map(h => ({ ...h, numStyle: 'width:30px;height:30px;border-radius:10px;background:#fff;color:#4c31b8;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:13px;box-shadow:0 4px 10px rgba(7,9,15,0.2)' })),
      faq: [
        { q: 'کتاب‌ها را چطور انتخاب کنم؟', a: 'لازم نیست. فقط پایه تحصیلی را از اول ابتدایی تا سوم دبیرستان انتخاب کنید؛ کتاب‌های همان پایه خودکار در نظر گرفته می‌شود.' },
        { q: 'چند فرزند می‌توانم اضافه کنم؟', a: 'محدودیتی نیست؛ هر فرزند پایه، رنگ فنری و خدمات اضافی مستقل خودش را دارد.' },
        { q: 'می‌توانم چاپ اسناد را هم به همین سفارش اضافه کنم؟', a: 'بله. چاپ اسناد، تراکت، کارتریج و تعمیر پرینتر همه در همان سفارش خانوادگی و همان تحویل‌گیری جمع می‌شوند.' },
        { q: 'اگر تعداد کتاب‌ها با ثبت سفارش فرق داشت؟', a: 'پیک در محل شمارش می‌کند؛ مغایرت ثبت و مبلغ بازمحاسبه و برای تأیید شما ارسال می‌شود.' },
      ],
      planName: plan.title + ' (' + plan.name + ')',
      planCards: this.plans.map(p => {
        const on = S.plan === p.id;
        return {
          name: p.name, title: p.title, price: p.price, perks: p.perks, badge: on ? 'پلن فعال' : (p.id === 'gold' ? 'پیشنهاد ما' : ''),
          pick: () => { this.setState({ plan: p.id }); this.notify('پلن ' + p.title + ' (' + p.name + ') انتخاب شد'); },
          style: 'text-align:right;cursor:pointer;border-radius:24px;padding:20px;display:block;width:100%;background:' + p.soft + ';color:' + p.ink + ';border:' + (on ? '2.5px solid ' + p.grad[1] : '1.5px solid ' + p.border),
          medalStyle: 'width:38px;height:38px;flex:none;border-radius:13px;display:flex;align-items:center;justify-content:center;color:#fff;background:linear-gradient(160deg,' + p.grad[0] + ' 0%,' + p.grad[1] + ' 55%,' + p.grad[2] + ' 100%);box-shadow:0 7px 15px ' + p.grad[2] + '59,inset 0 1.5px 0 rgba(255,255,255,0.6)',
          titleStyle: 'font-weight:900;font-size:18px;color:' + p.ink,
          nameStyle: 'display:block;font-size:12px;font-weight:700;margin-top:1px;opacity:0.75',
          unitStyle: 'display:block;font-size:12px;opacity:0.75',
          badgeStyle: (on || p.id === 'gold') ? ('border-radius:999px;padding:5px 11px;font-size:11.5px;font-weight:800;background:' + p.grad[1] + ';color:#fff') : 'display:none',
        };
      }),

      csHome: !isDelivery && S.cs === 'home', csFamily: !isDelivery && S.cs === 'family',
      csChild: !isDelivery && S.cs === 'child', csSummary: !isDelivery && S.cs === 'summary',
      csPickup: !isDelivery && S.cs === 'pickup', csMembership: !isDelivery && S.cs === 'membership',
      csPay: !isDelivery && S.cs === 'pay', csDone: !isDelivery && S.cs === 'done',
      csTrack: !isDelivery && S.cs === 'track', csDocs: !isDelivery && S.cs === 'docs',
      csFlyer: !isDelivery && S.cs === 'flyer', csCart: !isDelivery && S.cs === 'cart',
      csRepair: !isDelivery && S.cs === 'repair', csMe: !isDelivery && S.cs === 'me',
      csOrders: !isDelivery && S.cs === 'orders',
      goOrders: () => this.nav({ cs: 'orders', stack: ['home'] }),
      pastOrders: [
        { code: '۱۰۲۴۴', date: '۸ شهریور ۱۴۰۵', title: 'فنری ۱۶ کتاب — دو فرزند', amount: 620000, status: 'تحویل شد', tone: 'green', k: 'book' },
        { code: '۱۰۲۲۱', date: '۲۹ مرداد ۱۴۰۵', title: 'چاپ و صحافی پایان‌نامه', amount: 168000, status: 'تحویل شد', tone: 'cyan', k: 'file' },
        { code: '۱۰۱۸۷', date: '۱۴ مرداد ۱۴۰۵', title: 'شارژ ۲ کارتریج HP 85A', amount: 420000, status: 'تحویل شد', tone: 'amber', k: 'printer' },
        { code: '۱۰۱۵۲', date: '۳۰ تیر ۱۴۰۵', title: 'تراکت ۲۰۰۰ عددی A5', amount: 1900000, status: 'لغو شده', tone: 'ink', k: 'flyer' },
      ].map(o => {
        const tn = this.tint(o.tone === 'ink' ? 'blue' : o.tone);
        return {
          code: o.code, date: o.date, title: o.title, amount: money(o.amount), status: o.status,
          path1: icon[o.k][0], path2: icon[o.k][1], iconStyle: this.badge(o.tone, 38),
          cardStyle: 'background:#fff;border:1px solid #dfe5f2;border-right:6px solid ' + btnBg[o.tone === 'ink' ? 'blue' : o.tone] + ';border-radius:20px;padding:14px',
          tagStyle: 'border-radius:999px;padding:5px 11px;font-size:11px;font-weight:800;'
            + (o.status === 'تحویل شد' ? 'background:#d7f4e6;color:#0d5334' : 'background:#eef2fb;color:#6b7488'),
          reorder: () => { this.notify('سفارش ' + o.code + ' دوباره ثبت شد — خلاصه را بررسی کنید'); this.nav({ cs: 'summary', stack: ['home', 'family'] }); },
          receipt: () => this.notify('فاکتور سفارش ' + o.code + ' دانلود شد'),
        };
      }),
      dvMe: isDelivery && S.ds === 'me',
      agentStats: [
        { label: 'تحویل‌گیری امروز', value: '۵', tone: 'blue' },
        { label: 'تحویل امروز', value: '۴', tone: 'green' },
        { label: 'مسیر طی‌شده', value: '۳۸ کیلومتر', tone: 'cyan' },
        { label: 'میانگین زمان', value: '۴۱ دقیقه', tone: 'violet' },
      ].map(s2 => {
        const tn = this.tint(s2.tone);
        return { label: s2.label, value: s2.value, style: 'border-radius:20px;padding:14px;background:' + tn[0] + ';color:' + tn[1] };
      }),
      agentEarnings: [
        { label: 'درآمد امروز', value: money(680000) },
        { label: 'این هفته', value: money(3240000) },
        { label: 'پاداش عملکرد', value: money(250000) },
        { label: 'تسویه بعدی', value: 'پنجشنبه ۱۹ شهریور' },
      ],
      agentActions: [
        { label: 'پایان شیفت', act: () => this.notify('شیفت امروز بسته شد') },
        { label: 'گزارش مشکل', act: () => this.notify('فرم گزارش مشکل باز شد') },
      ],
      dvToday: isDelivery && S.ds === 'today', dvTask: isDelivery && S.ds === 'task', dvVerify: isDelivery && S.ds === 'verify',

      childCount: fa(S.children.length), totalBooks: fa(totalBooksN),
      subtotal: money(subtotalN), total: money(totalN),
      childGroups: S.children.map(c => {
        const tn = this.tint(c.tone);
        return {
          name: c.name || 'فرزند جدید', grade: c.grade, initial: (c.name || '؟').slice(0, 1), count: fa(this.bookCount(c)),
          avatarStyle: this.badge(c.tone, 40) + ';font-weight:900;font-size:16px',
          railStyle: 'width:5px;border-radius:999px;flex:none;background:' + btnBg[c.tone === 'ink' ? 'blue' : c.tone],
          chipStyle: 'border-radius:999px;padding:5px 11px;font-size:11px;font-weight:800;background:' + tn[0] + ';color:' + tn[1],
          orders: (c.orders || []).map(o => ({
            code: o.code, kind: o.kind, status: o.status, eta: o.eta,
            cardStyle: 'text-align:right;background:#fff;border:1px solid #dfe5f2;border-radius:20px;padding:13px;display:flex;align-items:center;gap:11px;cursor:pointer',
            barStyle: 'height:100%;width:' + o.pct + '%;border-radius:999px;background:' + btnBg[c.tone === 'ink' ? 'blue' : c.tone],
            tagStyle: 'flex:none;border-radius:999px;padding:6px 11px;font-size:11px;font-weight:800;background:' + tn[0] + ';color:' + tn[1],
            open: () => this.nav({ cs: 'track', stack: ['home'] }),
          })),
        };
      }),
      childCards: S.children.map(c => {
        const tn = this.tint(c.tone);
        return {
          name: c.name || 'فرزند جدید', grade: c.grade, initial: (c.name || '؟').slice(0, 1), count: fa(this.bookCount(c)),
          subtotal: money(this.childTotal(c)),
          summary: ((this.state.colors.find(x => x.id === c.color) || {}).name || 'آبی') + (c.lined ? ' · ' + fa(c.linedCount || 10) + ' برگ خط‌دار' : '') + ((c.extras || []).length ? ' · ' + fa(c.extras.length) + ' خدمت اضافی' : ''),
          avatarStyle: this.badge(c.tone, 44) + ';font-weight:900;font-size:17px',
          cardStyle: 'background:#fff;border:1px solid #dfe5f2;border-right:6px solid ' + btnBg[c.tone === 'ink' ? 'blue' : c.tone] + ';border-radius:22px;padding:14px',
          chipStyle: 'border-radius:999px;padding:5px 11px;font-size:11px;font-weight:800;background:' + tn[0] + ';color:' + tn[1],
          open: () => this.nav(st => ({ activeChild: c.id, draft: null, cs: 'child', stack: st.cs === 'summary' ? ['home', 'family', 'summary'] : ['home', 'family'] })),
          remove: () => {
            this.setState(s => ({
              children: s.children.filter(x => x.id !== c.id),
              extraOrders: s.extraOrders.filter(x => x.forChild !== c.id),
            }));
            this.notify((c.name || 'فرزند') + ' از سفارش حذف شد');
          },
        };
      }),
      addChild: () => {
        const id = Date.now();
        this.nav(s => ({
          children: [...s.children, { id, name: '', grade: 'اول ابتدایی', books: 8, tone: ['blue', 'violet', 'pink', 'amber', 'cyan', 'green'][s.children.length % 6], color: 'blue', lined: false, linedCount: 10, linedPos: 'all', extras: [], note: '', orders: [] }],
          activeChild: id, draft: 'new', cs: 'child', stack: ['home', 'family'],
        }));
      },
      childName: child ? child.name : '', childGrade: child ? child.grade : '',
      childBooks: child ? fa(this.bookCount(child)) : '', childNote: child ? (child.note || '') : '',
      childPrice: child ? money(this.childTotal(child) + S.extraOrders.filter(o => o.forChild === child.id).reduce((s, o) => s + o.price, 0)) : '',
      setChildName: e => this.patchChild({ name: e.target.value }),
      setChildGrade: e => this.patchChild({ grade: e.target.value, books: this.gradeDefault(e.target.value) }),
      gradeOptions: this.gradeList().filter(g => g.on).map(g => ({ value: g.name, label: g.name + ' — ' + fa(g.books) + ' کتاب' })),
      gradeNote: child ? ('کتاب‌های پایه ' + child.grade + ' به‌صورت پیش‌فرض ' + fa(this.gradeDefault(child.grade)) + ' جلد است؛ در صورت نیاز تعداد را تغییر دهید.') : '',
      booksPlus: () => this.patchChild({ books: this.bookCount(child) + 1 }),
      booksMinus: () => this.patchChild({ books: Math.max(1, this.bookCount(child) - 1) }),
      colorOpts: S.colors.filter(c => c.on).map(c => ({
        label: c.name, pick: () => this.patchChild({ color: c.id }),
        style: 'display:flex;align-items:center;gap:8px;cursor:pointer;border-radius:999px;padding:8px 14px 8px 10px;'
          + (child && child.color === c.id ? 'background:#07090f;color:#fff;border:1px solid #07090f' : 'background:#fff;color:#3a4257;border:1px solid #cfd8ec'),
        swatch: 'width:20px;height:20px;border-radius:999px;flex:none;background:' + c.hex + ';box-shadow:inset 0 1.5px 0 rgba(255,255,255,0.45),0 2px 5px rgba(7,9,15,0.22)',
      })),
      colorNote: child ? ((c => c && c.extra ? 'رنگ ' + c.name + ': +' + money(c.extra) + ' برای هر کتاب' : 'این رنگ هزینه اضافی ندارد.')(S.colors.find(c => c.id === child.color))) : '',
      childLined: !!(child && child.lined), childLinedCount: child ? fa(child.linedCount || 10) : '',
      toggleLined: () => this.patchChild({ lined: !child.lined }),
      linedSwitch: this.sw(!!(child && child.lined)), linedKnob: this.knob(!!(child && child.lined)),
      linedPlus: () => this.patchChild({ linedCount: (child.linedCount || 10) + 5 }),
      linedMinus: () => this.patchChild({ linedCount: Math.max(5, (child.linedCount || 10) - 5) }),
      posOpts: opt([{ v: 'all', label: 'کل کتاب' }, { v: 'range', label: 'صفحات مشخص' }], child && child.linedPos, v => this.patchChild({ linedPos: v })),
      isRange: !!(child && child.linedPos === 'range'),
      pageFrom: child ? fa(child.pfrom || 20) : '', pageTo: child ? fa(child.pto || 40) : '',
      setPageFrom: e => this.patchChild({ pfrom: this.toNum(e.target.value) }),
      setPageTo: e => this.patchChild({ pto: this.toNum(e.target.value) }),
      rangeNote: child ? ('برگه‌های خط‌دار بین صفحه ' + fa(child.pfrom || 20) + ' و صفحه ' + fa(child.pto || 40) + ' قرار می‌گیرند.') : '',
      hasExtras: this.extraList().some(o => o.on),
      colorsMasterLabel: S.colors.every(c => c.on) ? 'همه روشن' : (S.colors.some(c => c.on) ? 'روشن: ' + fa(S.colors.filter(c => c.on).length) + ' از ' + fa(S.colors.length) : 'همه خاموش'),
      colorsMasterSwitch: this.sw(S.colors.some(c => c.on)),
      colorsMasterKnob: this.knob(S.colors.some(c => c.on)),
      toggleAllColors: () => {
        const anyOn = S.colors.some(c => c.on);
        this.setState(s => ({ colors: s.colors.map(x => ({ ...x, on: !anyOn })) }));
        this.notify(anyOn ? 'همه رنگ‌های فنری خاموش شد' : 'همه رنگ‌های فنری روشن شد');
      },
      gradesMasterLabel: this.gradeList().every(g => g.on !== false) ? 'همه روشن' : (this.gradeList().some(g => g.on !== false) ? 'روشن: ' + fa(this.gradeList().filter(g => g.on !== false).length) + ' از ' + fa(this.gradeList().length) : 'همه خاموش'),
      gradesMasterSwitch: this.sw(this.gradeList().some(g => g.on !== false)),
      gradesMasterKnob: this.knob(this.gradeList().some(g => g.on !== false)),
      toggleAllGrades: () => {
        const anyOn = this.gradeList().some(g => g.on !== false);
        this.setState(s => ({ grades: s.grades.map(x => ({ ...x, on: !anyOn })) }));
        this.notify(anyOn ? 'همه پایه‌ها خاموش شد' : 'همه پایه‌ها روشن شد');
      },
      extrasAllOn: this.extraList().every(o => o.on),
      extrasMasterLabel: this.extraList().every(o => o.on) ? 'همه روشن' : (this.extraList().some(o => o.on) ? 'روشن: ' + fa(this.extraList().filter(o => o.on).length) + ' از ' + fa(this.extraList().length) : 'همه خاموش'),
      extrasMasterSwitch: this.sw(this.extraList().some(o => o.on)),
      extrasMasterKnob: this.knob(this.extraList().some(o => o.on)),
      toggleAllExtras: () => {
        const anyOn = this.extraList().some(o => o.on);
        this.setState(s => ({ extras: s.extras.map(x => ({ ...x, on: !anyOn })) }));
        this.notify(anyOn ? 'همه خدمات اضافی خاموش شد' : 'همه خدمات اضافی روشن شد');
      },
      extraOpts: this.extraList().filter(o => o.on).map(o => ({
        label: o.label + ' · ' + fa(o.price),
        style: this.chip(!!(child && (child.extras || []).includes(o.v)), '10px 14px'),
        pick: () => { const ex = child.extras || []; this.patchChild({ extras: ex.includes(o.v) ? ex.filter(x => x !== o.v) : [...ex, o.v] }); },
      })),
      setChildNote: e => this.patchChild({ note: e.target.value }),
      saveChild: () => {
        if (child && !child.name) this.patchChild({ name: 'فرزند ' + S.children.length });
        this.nav({ cs: 'family', stack: ['home'], draft: null });
        this.notify('اطلاعات ذخیره شد');
      },
      childCta: isNew ? 'افزودن به سفارش خانوادگی' : 'ذخیره تغییرات',
      childServiceTiles: [
        { k: 'docs', label: 'چاپ و صحافی', sub: 'جزوه، پایان‌نامه، مدرک', tone: 'cyan', icon: 'file' },
        { k: 'flyer', label: 'تراکت', sub: 'طراحی و چاپ', tone: 'violet', icon: 'flyer' },
        { k: 'cart', label: 'شارژ کارتریج', tone: 'amber', sub: 'درب منزل', icon: 'printer' },
        { k: 'repair', label: 'تعمیر پرینتر', tone: 'green', sub: 'دریافت در محل', icon: 'wrench' },
      ].map(t => {
        const tn = this.tint(t.tone);
        return {
          label: t.label, sub: t.sub, path1: icon[t.icon][0], path2: icon[t.icon][1],
          go: () => this.nav({ orderFor: child.id, cs: t.k, stack: ['home', 'family', 'child'] }),
          style: 'text-align:right;cursor:pointer;border:none;border-radius:18px;padding:13px;min-height:96px;display:flex;flex-direction:column;justify-content:space-between;background:' + tn[0] + ';color:' + tn[1],
          iconStyle: this.badge(t.tone, 34),
        };
      }),
      childExtraRows: S.extraOrders.filter(o => o.forChild === (child ? child.id : null)).map(o => {
        const tone = { docs: 'cyan', flyer: 'violet', cart: 'amber', repair: 'green' }[o.kind] || 'blue';
        const tn = this.tint(tone);
        return {
          label: o.label, detail: o.detail, price: o.price ? money(o.price) : 'پس از عیب‌یابی',
          rowStyle: 'display:flex;align-items:center;gap:10px;border-radius:16px;padding:11px 12px;background:' + tn[0] + ';color:' + tn[1],
          remove: () => { this.setState(s => ({ extraOrders: s.extraOrders.filter(x => x.id !== o.id) })); this.notify(o.label + ' حذف شد'); },
        };
      }),
      childExtrasCount: fa(S.extraOrders.filter(o => o.forChild === (child ? child.id : null)).length),
      childExtrasTotal: money(S.extraOrders.filter(o => o.forChild === (child ? child.id : null)).reduce((s, o) => s + o.price, 0)),
      hasChildExtras: S.extraOrders.some(o => o.forChild === (child ? child.id : null)),

      extraOrderRows: S.extraOrders.map(o => {
        const tone = { docs: 'cyan', flyer: 'violet', cart: 'amber', repair: 'green' }[o.kind] || 'blue';
        const tn = this.tint(tone);
        return {
          label: o.label, detail: o.detail, price: money(o.price),
          iconStyle: this.badge(tone, 38),
          path1: icon[{ docs: 'file', flyer: 'flyer', cart: 'printer', repair: 'wrench' }[o.kind] || 'file'][0],
          path2: icon[{ docs: 'file', flyer: 'flyer', cart: 'printer', repair: 'wrench' }[o.kind] || 'file'][1],
          cardStyle: 'background:#fff;border:1px solid #dfe5f2;border-right:6px solid ' + btnBg[tone] + ';border-radius:20px;padding:13px;display:flex;align-items:center;gap:11px',
          wrapStyle: 'background:#fff;border:1px solid #dfe5f2;border-right:6px solid ' + btnBg[tone] + ';border-radius:20px;padding:13px',
          chipStyle: 'border-radius:999px;padding:5px 10px;font-size:11px;font-weight:800;background:' + tn[0] + ';color:' + tn[1],
          edit: () => this.nav({
            cs: o.kind, orderFor: o.forChild || null, editingOrderId: o.id,
            stack: ['home', 'family', 'summary'],
          }),
          remove: () => { this.setState(s => ({ extraOrders: s.extraOrders.filter(x => x.id !== o.id) })); this.notify(o.label + ' حذف شد'); },
        };
      }),
      addServiceButtons: [
        { label: 'چاپ اسناد', tone: 'cyan', k: 'file', go: () => this.go('docs') },
        { label: 'تراکت', tone: 'violet', k: 'flyer', go: () => this.go('flyer') },
        { label: 'کارتریج', tone: 'amber', k: 'printer', go: () => this.go('cart') },
        { label: 'تعمیر پرینتر', tone: 'green', k: 'wrench', go: () => this.go('repair') },
      ].map(b => {
        const tn = this.tint(b.tone);
        return {
          label: b.label, go: b.go, path1: icon[b.k][0], path2: icon[b.k][1],
          style: 'display:flex;align-items:center;gap:9px;cursor:pointer;border:none;border-radius:18px;padding:12px 14px;font-weight:800;font-size:13px;background:' + tn[0] + ';color:' + tn[1],
          iconStyle: this.badge(b.tone, 30),
        };
      }),

      campaignBannerNote: S.couponApplied
        ? 'کد SCHOOL1405 فعال است · ۵٪ تخفیف روی این سفارش'
        : 'تا ۱۵ شهریور: ۵٪ تخفیف با کد SCHOOL1405 — برای فعال‌سازی بزنید',
      useCampaign: () => {
        this.setState({ coupon: 'SCHOOL1405', couponApplied: true });
        this.notify('کد کمپین اول مهر فعال شد — ۵٪ تخفیف');
        this.nav({ cs: 'family', stack: ['home'] });
      },
      coupon: S.coupon, setCoupon: e => this.setState({ coupon: e.target.value }),
      applyCoupon: () => { this.setState({ couponApplied: true }); this.notify('کد تخفیف اعمال شد'); },
      couponNote: S.couponApplied ? 'کد کمپین اعمال شد: ۵٪ معادل ' + money(couponN) : 'کد کمپین اول مهر: SCHOOL1405 (۵٪ تا سقف ۱۰۰ هزار)',
      totalsLines: [
        { label: 'فنری کتاب‌ها (' + fa(totalBooksN) + ' کتاب)', value: money(bindingN) },
        { label: 'سرویس‌های دیگر (' + fa(S.extraOrders.length) + ' مورد)', value: extrasN ? money(extrasN) : '—' },
        { label: 'تحویل‌گیری', value: pickupN ? money(pickupN) : 'رایگان با عضویت', accent: !pickupN },
        { label: 'تحویل', value: deliveryN ? money(deliveryN) : 'رایگان با عضویت', accent: !deliveryN },
        { label: 'تخفیف عضویت ' + plan.name, value: planDiscN ? '−' + money(planDiscN) : '—', accent: !!planDiscN },
        { label: 'کد تخفیف', value: couponN ? '−' + money(couponN) : '—', accent: !!couponN },
        { label: 'سفارش فوری', value: S.urgent ? money(urgentFee) : '—' },
      ].map(l => ({ label: l.label, value: l.value, valueStyle: 'font-weight:700;color:' + (l.accent ? '#14764a' : '#0f1320') })),

      address: S.address, setAddress: e => this.setState({ address: e.target.value }),
      phone: S.phone, setPhone: e => this.setState({ phone: e.target.value }),
      pickupDate: fa(S.pickupDay) + ' شهریور', pickupSlot: S.pickupSlot,
      mapSrc: 'https://www.google.com/maps?q=' + encodeURIComponent(S.address) + '&z=15&output=embed',
      openMapPicker: () => this.openMap(S.address),
      calMonth: 'شهریور ۱۴۰۵',
      calWeekdays: ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'].map(w => ({ label: w })),
      calDays: (() => {
        const today = 14, lead = 2, days = 31, out = [];
        for (let i = 0; i < lead; i++) out.push({ label: '', style: 'height:40px', disabled: true });
        for (let d = 1; d <= days; d++) {
          const past = d < today, sel = S.pickupDay === d, isToday = d === today;
          out.push({
            label: fa(d),
            pick: past ? () => this.notify('این تاریخ گذشته است') : () => this.setState({ pickupDay: d }),
            style: 'height:40px;border-radius:13px;border:none;font-size:13.5px;font-weight:' + (sel || isToday ? '900' : '600') + ';cursor:' + (past ? 'default' : 'pointer') + ';'
              + (sel ? 'background:#2f6df6;color:#fff;box-shadow:0 5px 12px rgba(47,109,246,0.4)'
                : past ? 'background:transparent;color:#c3cadd'
                  : isToday ? 'background:#e3ecff;color:#1b45b8'
                    : 'background:#fff;color:#0f1320;border:1px solid #e7ecf7'),
          });
        }
        return out;
      })(),
      calSelected: 'انتخاب‌شده: ' + fa(S.pickupDay) + ' شهریور ۱۴۰۵ · ' + S.pickupSlot,
      slotOpts: opt([{ v: '۸ تا ۱۰', label: '۸ تا ۱۰' }, { v: '۱۰ تا ۱۲', label: '۱۰ تا ۱۲' }, { v: '۱۲ تا ۱۴', label: '۱۲ تا ۱۴' }, { v: '۱۴ تا ۱۶', label: '۱۴ تا ۱۶' }, { v: '۱۶ تا ۱۸', label: '۱۶ تا ۱۸' }, { v: '۱۸ تا ۲۰', label: '۱۸ تا ۲۰' }], S.pickupSlot, v => this.setState({ pickupSlot: v })),
      urgentEnabled, urgentFee: fa(urgentFee),
      toggleUrgent: () => this.setState(s => ({ urgent: !s.urgent })),
      urgentSwitch: this.sw(S.urgent), urgentKnob: this.knob(S.urgent),

      upsellCards: this.plans.map(p => {
        const on = S.plan === p.id;
        const pDisc = Math.round(subtotalN * p.disc);
        const pTotal = subtotalN + (p.freePickup ? 0 : pickupFee) + (p.freeDelivery ? 0 : deliveryFee) - pDisc - couponN + (S.urgent ? urgentFee : 0);
        const saving = totalN - pTotal;
        return {
          name: p.name, title: p.title, price: p.price, perks: p.perks,
          thisOrder: 'این سفارش با ' + p.title + ': ' + money(pTotal),
          saving: saving > 0 ? 'صرفه‌جویی ' + money(saving) + ' نسبت به پلن فعلی' : (saving < 0 ? 'گران‌تر از پلن فعلی' : 'پلن فعلی شما'),
          savingStyle: 'display:block;font-size:12px;font-weight:800;margin-top:6px;color:' + (saving > 0 ? '#14764a' : p.ink),
          pick: () => { this.setState({ plan: p.id }); this.notify('پلن ' + p.title + ' فعال شد'); },
          style: 'width:100%;text-align:right;cursor:pointer;border-radius:22px;padding:15px;display:block;background:' + p.soft + ';color:' + p.ink + ';border:' + (on ? '2.5px solid ' + p.grad[1] : '1.5px solid ' + p.border),
          medalStyle: 'width:36px;height:36px;flex:none;border-radius:12px;display:flex;align-items:center;justify-content:center;color:#fff;background:linear-gradient(160deg,' + p.grad[0] + ' 0%,' + p.grad[1] + ' 55%,' + p.grad[2] + ' 100%);box-shadow:0 6px 14px ' + p.grad[2] + '59,inset 0 1.5px 0 rgba(255,255,255,0.6)',
          nameStyle: 'font-weight:900;font-size:16px',
          subNameStyle: 'font-size:11.5px;font-weight:700;opacity:0.75',
          priceStyle: 'font-size:12.5px;font-weight:700;opacity:0.8',
          perkStyle: 'display:block;font-size:12.5px;line-height:1.7;margin-top:6px;opacity:0.9',
          badge: on ? 'فعال' : 'انتخاب',
          badgeStyle: 'border-radius:999px;padding:5px 12px;font-size:11.5px;font-weight:800;background:' + p.grad[1] + ';color:#fff',
        };
      }),
      payOpts: [
        { v: 'gateway', label: 'درگاه پرداخت اینترنتی', sub: 'شتاب · انتقال به بانک' },
        { v: 'wallet', label: 'کیف پول دیجیتال سرو', sub: 'موجودی: ۲٬۱۰۰٬۰۰۰ تومان' },
        { v: 'cod', label: 'پرداخت در محل تحویل', sub: 'کارت‌خوان همراه پیک' },
      ].map(o => ({
        label: o.label, sub: o.sub, pick: () => this.setState({ pay: o.v }),
        style: 'display:flex;align-items:center;gap:12px;cursor:pointer;text-align:right;border-radius:22px;padding:15px;background:#fff;border:1.5px solid ' + (S.pay === o.v ? '#2f6df6' : '#dfe5f2'),
        radio: 'width:22px;height:22px;flex:none;border-radius:999px;border:2px solid ' + (S.pay === o.v ? '#2f6df6' : '#c3cadd') + ';box-shadow:' + (S.pay === o.v ? 'inset 0 0 0 4px #fff, inset 0 0 0 12px #2f6df6' : 'none'),
      })),
      planLine: 'عضویت ' + plan.name + (plan.disc ? ' · ' + fa(plan.disc * 100) + '٪ تخفیف' : ' · بدون تخفیف'),

      trackSteps: trackLabels.map((s, i) => ({
        label: s[0], time: s[1],
        dotStyle: 'width:' + (i === cur ? '18px' : '14px') + ';height:' + (i === cur ? '18px' : '14px') + ';border-radius:999px;flex:none;background:'
          + (i < cur ? '#1fa968' : i === cur ? '#2f6df6' : '#d3d9e8') + (i === cur ? ';box-shadow:0 0 0 5px rgba(47,109,246,0.22)' : ''),
        lineStyle: i === trackLabels.length - 1 ? 'display:none' : 'flex:1;width:2px;min-height:22px;background:' + (i < cur ? '#1fa968' : '#dfe5f2'),
        labelStyle: 'font-size:14.5px;font-weight:' + (i === cur ? '900' : '600') + ';color:' + (i <= cur ? '#0f1320' : '#8c93a8'),
      })),

      docGroups: [
        { label: 'رنگ', opts: opt([{ v: 'bw', label: 'سیاه‌وسفید' }, { v: 'color', label: 'همه رنگی' }, { v: 'mixed', label: 'ترکیبی' }], S.doc.ink, v => this.setState(s => ({ doc: { ...s.doc, ink: v } }))) },
        { label: 'چند رو', opts: opt([{ v: 'single', label: 'یک‌رو' }, { v: 'double', label: 'دورو' }], S.doc.sides, v => this.setState(s => ({ doc: { ...s.doc, sides: v } }))) },
      ],
      docMixed: S.doc.ink === 'mixed',
      docColorPages: S.doc.colorPages || '',
      setDocColorPages: e => this.setState(s => ({ doc: { ...s.doc, colorPages: e.target.value } })),
      colorRanges: (S.doc.colorRanges || []).map((r, i) => ({
        from: fa(r.from), to: fa(r.to),
        setFrom: e => this.setState(s => ({ doc: { ...s.doc, colorRanges: s.doc.colorRanges.map((x, j) => j === i ? { ...x, from: this.toNum(e.target.value) } : x) } })),
        setTo: e => this.setState(s => ({ doc: { ...s.doc, colorRanges: s.doc.colorRanges.map((x, j) => j === i ? { ...x, to: this.toNum(e.target.value) } : x) } })),
        remove: () => this.setState(s => ({ doc: { ...s.doc, colorRanges: s.doc.colorRanges.filter((x, j) => j !== i) } })),
      })),
      addColorRange: () => this.setState(s => ({ doc: { ...s.doc, colorRanges: [...(s.doc.colorRanges || []), { from: 1, to: 10 }] } })),
      colorRangeNote: ((rs, pg) => {
        const valid = (rs || []).filter(r => r.to >= r.from);
        const n = valid.reduce((sum, r) => sum + (r.to - r.from + 1), 0);
        const list = pg ? String(pg).trim() : '';
        if (!valid.length && !list) return 'بازه اضافه کنید یا شماره صفحه‌ها را جدا با ویرگول بنویسید؛ بقیه سیاه‌وسفید چاپ می‌شود.';
        return 'مجموع ' + fa(n) + ' صفحه رنگی از بازه‌ها' + (list ? ' به‌علاوه صفحه‌های ' + list : '') + ' · بقیه سیاه‌وسفید.';
      })(S.doc.colorRanges, S.doc.colorPages),
      docDesc: S.doc.desc || '',
      setDocDesc: e => this.setState(s => ({ doc: { ...s.doc, desc: e.target.value } })),
      coverTitle: S.doc.coverTitle || '',
      setCoverTitle: e => this.setState(s => ({ doc: { ...s.doc, coverTitle: e.target.value } })),
      coverBack: S.doc.coverBack || '',
      setCoverBack: e => this.setState(s => ({ doc: { ...s.doc, coverBack: e.target.value } })),
      docFullName: S.doc.fullName || '',
      setDocFullName: e => this.setState(s => ({ doc: { ...s.doc, fullName: e.target.value } })),
      bindColorOpts: this.bindColors.map(c => ({
        label: c.name, pick: () => this.setState(s => ({ doc: { ...s.doc, bindColor: c.id } })),
        style: 'display:flex;align-items:center;gap:8px;cursor:pointer;border-radius:999px;padding:8px 14px 8px 10px;'
          + (S.doc.bindColor === c.id ? 'background:#07090f;color:#fff;border:1px solid #07090f' : 'background:#fff;color:#3a4257;border:1px solid #cfd8ec'),
        swatch: 'width:22px;height:22px;border-radius:999px;flex:none;background:' + c.css + ';box-shadow:inset 0 1.5px 0 rgba(255,255,255,0.35),0 2px 5px rgba(7,9,15,0.22)',
      })),
      stampOpts: [
        { v: 'gold', label: 'زرکوب', hint: '+' + money(this.p('stampGold')) },
        { v: 'silver', label: 'نقره‌کوب', hint: '+' + money(this.p('stampSilver')) },
      ].map(o => ({
        label: o.label + ' · ' + o.hint, pick: () => this.setState(s => ({ doc: { ...s.doc, stamp: o.v } })),
        style: this.chip(S.doc.stamp === o.v, '10px 15px'),
      })),
      docBindNote: 'صحافی ' + ((this.bindColors.find(c => c.id === S.doc.bindColor) || {}).name || 'زرشکی')
        + ' با مندرجات ' + (S.doc.stamp === 'silver' ? 'نقره‌کوب' : 'زرکوب') + ' روی جلد · کاغذ تحریر ۸۰ گرم، قطع A4',
      copies: fa(S.doc.copies),
      copiesPlus: () => this.setState(s => ({ doc: { ...s.doc, copies: s.doc.copies + 1 } })),
      copiesMinus: () => this.setState(s => ({ doc: { ...s.doc, copies: Math.max(1, s.doc.copies - 1) } })),
      docPagesLabel: fa(docPagesN) + ' صفحه × ' + fa(S.doc.copies) + ' سری',
      docSpec: 'A4 · ' + ({ bw: 'سیاه‌وسفید', color: 'همه رنگی', mixed: 'ترکیبی' }[S.doc.ink] || '') + ' · ' + (S.doc.sides === 'double' ? 'دورو' : 'یک‌رو') + ' · صحافی',
      docTotal: money(docTotalN),
      docFilePages: fa(docFilePages),



      docScopeOpts: opt([{ v: 'all', label: 'همه صفحات' }, { v: 'range', label: 'بازه صفحات' }], S.doc.scope, v => this.setState(s => ({ doc: { ...s.doc, scope: v, ink: v === 'range' ? 'mixed' : s.doc.ink } }))),
      docIsRange: S.doc.scope === 'range',
      docFrom: fa(dFrom), docTo: fa(dTo),
      setDocFrom: e => this.setState(s => ({ doc: { ...s.doc, from: this.toNum(e.target.value) } })),
      setDocTo: e => this.setState(s => ({ doc: { ...s.doc, to: this.toNum(e.target.value) } })),
      docRangeNote: 'از ' + fa(docFilePages) + ' صفحه فایل، ' + fa(docPagesN) + ' صفحه چاپ می‌شود (صفحه ' + fa(dFrom) + ' تا ' + fa(dTo) + ').',
      pickFile: () => this.notify('فایل پایان‌نامه-نهایی.pdf انتخاب شد'),
      addDocs: () => this.addExtraOrder('docs', 'چاپ اسناد', fa(docPagesN) + ' صفحه' + (S.doc.scope === 'range' ? ' (صفحه ' + fa(dFrom) + '–' + fa(dTo) + ')' : '') + ' · ' + S.doc.size + ' · ' + (S.doc.sides === 'double' ? 'دورو' : 'یک‌رو'), docTotalN),

      flyerModes: [
        { v: 'have', label: 'طراحی دارم', sub: 'فایل آماده را بفرستید', k: 'up', tone: 'violet' },
        { v: 'need', label: 'طراحی ندارم', sub: 'اطلاعات کسب‌وکار را بدهید، ما طراحی می‌کنیم', k: 'pen', tone: 'pink' },
      ].map(m => ({
        label: m.label, sub: m.sub, path1: icon[m.k][0], path2: icon[m.k][1],
        pick: () => this.setState({ flyerMode: m.v }),
        style: 'display:flex;align-items:center;gap:13px;cursor:pointer;text-align:right;border-radius:22px;padding:16px;background:#fff;border:1.5px solid ' + (S.flyerMode === m.v ? '#7c5cf5' : '#dfe5f2'),
        iconStyle: this.badge(m.tone, 42),
      })),
      flyerBrief: S.flyerMode === 'need',
      flyerUploadReady: S.flyerMode === 'have',
      flyerModePicked: !!S.flyerMode,
      flyerFields: [
        { label: 'نام کسب‌وکار', ph: 'مثلاً قنادی نارون' }, { label: 'شماره تماس', ph: '۰۲۱۴۴۵۵۶۶۷۷' },
        { label: 'آدرس', ph: 'خیابان ...' }, { label: 'شبکه اجتماعی', ph: '@narvan.cake' },
        { label: 'متن اصلی تراکت', ph: 'افتتاحیه با ۲۰٪ تخفیف' },
      ],
      flyerQty: fa(flyerQty),
      flyerQtyPlus: () => this.setState(s => ({ flyer: { ...s.flyer, qty: Math.min(50000, (s.flyer.qty || 1000) + 500) } })),
      flyerQtyMinus: () => {
        if ((S.flyer.qty || 1000) <= 500) { this.notify('حداقل تیراژ ۵۰۰ عدد است'); return; }
        this.setState(s => ({ flyer: { ...s.flyer, qty: Math.max(500, (s.flyer.qty || 1000) - 500) } }));
      },
      flyerQtyChips: [500, 1000, 2000, 5000, 10000].map(q => ({
        label: fa(q), style: this.chip(flyerQty === q, '9px 14px'),
        pick: () => this.setState(s => ({ flyer: { ...s.flyer, qty: q } })),
      })),
      flyerQtyNote: 'حداقل تیراژ ۵۰۰ عدد · هر پله ۵۰۰ عدد · قیمت هر عدد ' + money(Math.round(flyerRate)),
      flyerInkOpts: [
        { v: 'color', label: 'تمام‌رنگی', sub: 'چهاررنگ CMYK' },
        { v: 'mono', label: 'سیاه‌وسفید', sub: 'روی کاغذ سفید' },
      ].map(o => ({
        label: o.label, sub: o.sub, pick: () => this.setState(s => ({ flyer: { ...s.flyer, ink: o.v } })),
        style: 'flex:1;min-width:0;cursor:pointer;text-align:right;border-radius:18px;padding:13px;background:#fff;border:1.5px solid ' + (S.flyer.ink === o.v ? '#7c5cf5' : '#dfe5f2'),
        swatch: 'width:26px;height:26px;border-radius:9px;margin-bottom:9px;box-shadow:inset 0 1.5px 0 rgba(255,255,255,0.5),0 3px 8px rgba(7,9,15,0.18);background:'
          + (o.v === 'color' ? 'conic-gradient(#2f6df6,#0fa9bd,#1fa968,#ef9d0c,#ea5399,#7c5cf5,#2f6df6)' : 'linear-gradient(160deg,#fff 0%,#c3cadd 60%,#4a5268 100%)'),
      })),
      flyerSizeOpts: opt([{ v: 'A4', label: 'A4' }, { v: 'A5', label: 'A5' }, { v: 'A6', label: 'A6' }], S.flyer.size, v => this.setState(s => ({ flyer: { ...s.flyer, size: v } }))),
      flyerPaperOpts: opt([{ v: 'گلاسه', label: 'گلاسه' }, { v: 'تحریر', label: 'تحریر' }], S.flyer.paper, v => this.setState(s => ({ flyer: { ...s.flyer, paper: v } }))),
      flyerSpec: fa(flyerQty) + ' عدد · ' + S.flyer.size + ' · ' + (S.flyer.ink === 'color' ? 'تمام‌رنگی' : 'سیاه‌وسفید') + ' · ' + S.flyer.paper,
      flyerTotal: money(flyerTotalN),
      flyerDesignFee: S.flyerMode === 'need' ? 'شامل ۲۵۰٬۰۰۰ تومان هزینه طراحی' : 'با فایل طراحی خودتان',
      uploadLogo: () => this.notify('لوگو و تصاویر بارگذاری شد'),
      uploadDesign: () => this.notify('فایل طراحی تراکت بارگذاری شد'),
      addFlyer: () => {
        if (!S.flyerMode) { this.notify('اول مشخص کنید طراحی دارید یا نه'); return; }
        this.addExtraOrder('flyer', 'تراکت', (S.flyerMode === 'have' ? 'طراحی آماده' : 'طراحی توسط ما') + ' · ' + fa(flyerQty) + ' عدد ' + S.flyer.size + ' · ' + (S.flyer.ink === 'color' ? 'تمام‌رنگی' : 'سیاه‌وسفید'), flyerTotalN);
      },

      cartFields: [
        { label: 'برند', ph: 'HP' }, { label: 'مدل کارتریج', ph: '85A' },
        { label: 'نوع', ph: 'لیزری سیاه‌وسفید' }, { label: 'تعداد', ph: '۲' },
      ],
      cartFlow: [{ label: 'تحویل‌گیری از محل شما' }, { label: 'شارژ و تست' }, { label: 'کنترل کیفیت' }, { label: 'تحویل درب منزل' }],
      photoCartridge: () => this.notify('عکس کارتریج ثبت شد'),
      addCart: () => this.addExtraOrder('cart', 'شارژ کارتریج', 'HP 85A · ۲ عدد', this.p('cartridge')),
      problemOpts: opt([{ v: 'کیفیت چاپ', label: 'کیفیت چاپ' }, { v: 'گیر کاغذ', label: 'گیر کردن کاغذ' }, { v: 'روشن نشدن', label: 'روشن نمی‌شود' }, { v: 'خطای سیستم', label: 'خطای دستگاه' }, { v: 'شبکه', label: 'اتصال شبکه' }], S.problem, v => this.setState({ problem: v })),
      repairFlow: [
        { n: '۱', label: 'دریافت دستگاه توسط پیک' }, { n: '۲', label: 'عیب‌یابی در مرکز سرویس' },
        { n: '۳', label: 'ارسال پیش‌فاکتور' }, { n: '۴', label: 'تأیید شما' },
        { n: '۵', label: 'تعمیر و کنترل کیفیت' }, { n: '۶', label: 'تحویل درب منزل' },
      ],
      photoDevice: () => this.notify('عکس دستگاه ثبت شد'),
      addRepair: () => this.addExtraOrder('repair', 'تعمیر پرینتر', 'HP LaserJet 1102 · ' + S.problem, 0),

      scrollRef: (this.scrollRef = this.scrollRef || React.createRef()),
      showAddMore: !isDelivery && ['family', 'child', 'docs', 'flyer', 'cart', 'repair', 'summary', 'membership'].indexOf(S.cs) > -1,
      pickerOpen: !!S.picker,
      openPicker: () => this.setState({ picker: true }),
      closePicker: () => this.setState({ picker: false }),
      pickerServices: [
        { k: 'family', label: 'کتاب‌های مدرسه', sub: 'پایه را انتخاب کن، کتاب‌ها خودکار', tone: 'blue', icon: 'book' },
        { k: 'docs', label: 'چاپ و صحافی', sub: 'پایان‌نامه، جزوه، مدرک اداری', tone: 'cyan', icon: 'file' },
        { k: 'flyer', label: 'تراکت', sub: 'طراحی و چاپ از ۵۰۰ عدد', tone: 'violet', icon: 'flyer' },
        { k: 'cart', label: 'شارژ کارتریج', sub: 'دریافت و تحویل درب منزل', tone: 'amber', icon: 'printer' },
        { k: 'repair', label: 'تعمیر پرینتر', sub: 'دریافت دستگاه در محل', tone: 'green', icon: 'wrench' },
      ].map(s2 => {
        const tn = this.tint(s2.tone);
        return {
          label: s2.label, sub: s2.sub, path1: icon[s2.icon][0], path2: icon[s2.icon][1],
          go: () => this.nav(st => ({ picker: false, cs: s2.k, stack: st.cs === s2.k ? st.stack : ['home', 'family'] })),
          style: 'display:flex;align-items:center;gap:12px;width:100%;text-align:right;cursor:pointer;border:none;border-radius:20px;padding:14px;background:' + tn[0] + ';color:' + tn[1],
          iconStyle: this.badge(s2.tone, 40),
        };
      }),
      pickerSummaryLine: (S.children.length ? fa(S.children.length) + ' فرزند · ' + fa(totalBooksN) + ' کتاب' : 'بدون کتاب مدرسه')
        + (S.extraOrders.length ? ' · ' + fa(S.extraOrders.length) + ' سرویس دیگر' : ''),
      goSummaryFromPicker: () => this.nav({ picker: false, cs: 'summary', stack: ['home', 'family'] }),
      isEditingService: !!S.editingOrderId,
      docsCta: S.editingOrderId ? 'ذخیره تغییرات چاپ و صحافی' : 'افزودن چاپ و صحافی به سفارش',
      flyerCta: S.editingOrderId ? 'ذخیره تغییرات تراکت' : 'افزودن تراکت به سفارش',
      cartCta: S.editingOrderId ? 'ذخیره تغییرات کارتریج' : 'افزودن کارتریج به سفارش',
      repairCta: S.editingOrderId ? 'ذخیره تغییرات تعمیر' : 'افزودن تعمیر به سفارش',
      orderLabel: S.children.length ? 'سفارش خانوادگی' : 'سفارش شما',
      hasChildrenInOrder: S.children.length > 0,
      payMetaLine: S.children.length ? (fa(totalBooksN) + ' کتاب · ' + fa(S.children.length) + ' فرزند') : (fa(S.extraOrders.length) + ' سرویس در سفارش'),
      walletBalance: money(2100000), memberSaved: money(1240000),
      planMonthly: plan.price + ' تومان در ماه',
      profileRows: [
        { label: 'آدرس‌های ذخیره‌شده', value: 'خانه · محل کار', act: () => this.notify('مدیریت آدرس‌ها') },
        { label: 'فرزندان ثبت‌شده', value: S.children.map(c => c.name || 'فرزند جدید').join('، '), act: () => this.nav({ cs: 'family', stack: ['home'] }) },
        { label: 'سفارش‌های من', value: 'تاریخچه و فاکتورها', act: () => this.nav({ cs: 'orders', stack: ['home'] }) },
        { label: 'کد معرف', value: 'MARYAM-1405', act: () => this.notify('کد معرف کپی شد') },
        { label: 'اعلان‌ها', value: 'پیامک و پوش فعال', act: () => this.notify('تنظیمات اعلان‌ها') },
      ].map(r => ({ ...r, style: 'display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 0;border-top:1px solid #eef2fb;width:100%;background:transparent;border-left:none;border-right:none;border-bottom:none;cursor:pointer;text-align:right' })),

      tabs: (isDelivery ? [
        { v: 'today', label: 'امروز', k: 'home' }, { v: 'task', label: 'سفارش', k: 'clip' },
        { v: 'verify', label: 'شمارش', k: 'check' }, { v: 'me', label: 'من', k: 'user' },
      ] : [
        { v: 'home', label: 'خانه', k: 'home' }, { v: 'family', label: 'سفارش', k: 'book' },
        { v: 'track', label: 'رهگیری', k: 'route' }, { v: 'me', label: 'پروفایل', k: 'user' },
      ]).map(tb => {
        const on = isDelivery ? S.ds === tb.v : S.cs === tb.v;
        return {
          label: tb.label, path1: icon[tb.k][0], path2: icon[tb.k][1],
          pick: () => isDelivery ? this.nav({ ds: tb.v }) : this.nav({ cs: tb.v, stack: tb.v === 'home' ? [] : ['home'] }),
          on,
          style: 'flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 0;border:none;cursor:pointer;border-radius:16px;background:' + (on ? '#1c2233' : 'transparent') + ';color:' + (on ? (isDelivery ? '#79e0b0' : '#7ea6ff') : '#7b839a'),
        };
      }),

      tasks: [
        { kind: 'تحویل‌گیری', time: '۱۶:۰۰ – ۱۸:۰۰', code: '۱۰۲۵۰', customer: 'خانواده رضایی', address: 'سعادت‌آباد، خیابان کوهسار، پلاک ۱۲', detail: fa(totalBooksN) + ' کتاب · ' + fa(S.children.length) + ' فرزند + ۲ سرویس دیگر' },
        { kind: 'تحویل', time: '۱۸:۳۰ – ۱۹:۳۰', code: '۱۰۲۱۹', customer: 'مهدی کریمی', address: 'شهرک غرب، بلوار دادمان، پلاک ۴۵', detail: 'بسته خانوادگی · ۱۶ کتاب' },
        { kind: 'تحویل‌گیری', time: '۱۹:۴۵ – ۲۰:۴۵', code: '۱۰۲۵۱', customer: 'شرکت آریا نت', address: 'میرداماد، ساختمان نگین، طبقه ۳', detail: '۲ کارتریج + ۱ پرینتر' },
        { kind: 'تحویل', time: '۲۱:۰۰', code: '۱۰۲۰۸', customer: 'زهرا نوری', address: 'ونک، خیابان ملاصدرا، پلاک ۸', detail: 'چاپ ۳۴۰ برگ' },
      ].map(tk => ({
        ...tk, open: () => this.nav({ ds: 'task' }),
        navigate: () => this.openMap(tk.address + '، تهران'),
        tagStyle: 'border-radius:999px;padding:5px 12px;font-size:11.5px;font-weight:800;'
          + (tk.kind === 'تحویل‌گیری' ? 'background:#d7f4e6;color:#0d5334' : 'background:#07090f;color:#fff'),
      })),
      taskMapSrc: 'https://www.google.com/maps?q=' + encodeURIComponent('سعادت آباد، خیابان کوهسار، تهران') + '&z=15&output=embed',
      navigateTask: () => this.openMap('سعادت آباد، خیابان کوهسار، تهران'),
      callCustomer: () => this.notify('تماس با ۰۹۱۲۳۴۵۶۷۸۹'),
      goVerify: () => this.nav({ ds: 'verify' }),
      finishVerify: () => { this.nav({ ds: 'today' }); this.notify(S.collected === totalBooksN ? 'تأیید شد و به مرکز چاپ منتقل شد' : 'مغایرت ثبت شد و برای تأیید مشتری ارسال شد'); },
      photoBooks: () => this.notify('عکس کتاب‌ها ثبت شد'),
      collectedFa: fa(S.collected),
      collectedPlus: () => this.setState(s => ({ collected: s.collected + 1 })),
      collectedMinus: () => this.setState(s => ({ collected: Math.max(0, s.collected - 1) })),
      mismatch: S.collected !== totalBooksN,
      mismatchNote: 'ثبت‌شده ' + fa(totalBooksN) + ' کتاب، شمارش‌شده ' + fa(S.collected) + ' کتاب.',
      collectedCardStyle: 'border-radius:22px;padding:16px;text-align:center;color:#fff;'
        + (S.collected === totalBooksN ? 'background:#1fa968;box-shadow:0 10px 22px rgba(31,169,104,0.32)' : 'background:#ea5399;box-shadow:0 10px 22px rgba(234,83,153,0.32)'),
      verifyCta: S.collected === totalBooksN ? 'تأیید و انتقال به مرکز چاپ' : 'ثبت مغایرت و ادامه',
      pickChecks: ['تعداد کتاب‌ها با سفارش تطبیق داده شد', 'وضعیت ظاهری کتاب‌ها سالم است', 'عکس تحویل‌گیری ثبت شد', 'تأیید امضای مشتری گرفته شد'].map((label, i) => ({
        label, toggle: () => this.setState(s => ({ checks: s.checks.map((c, j) => j === i ? !c : c) })),
        style: 'display:flex;align-items:center;gap:11px;width:100%;background:transparent;border:none;border-top:1px solid #eef2fb;padding:12px 0;cursor:pointer',
        box: 'width:24px;height:24px;flex:none;border-radius:8px;border:2px solid ' + (S.checks[i] ? '#1fa968' : '#c3cadd') + ';background:' + (S.checks[i] ? '#1fa968' : 'transparent'),
      })),

      stageTitle: isDelivery ? 'اپ پیک' : 'اپ مشتری',
      stageNote: isDelivery
        ? 'رابط پیک عمداً کم‌عنصر است: دکمه‌های بزرگ، یک تصمیم در هر صفحه. آدرس روی نقشه گوگل باز می‌شود و شمارش کتاب‌ها همان‌جا با سفارش تطبیق داده می‌شود.'
        : 'برای هر فرزند فقط پایه تحصیلی انتخاب می‌شود؛ کتاب‌ها خودکار محاسبه می‌شوند. سرویس‌های دیگر (چاپ اسناد، تراکت، کارتریج، تعمیر) به همان سفارش خانوادگی اضافه می‌شوند.',
      jumps: (isDelivery
        ? [{ v: 'today', label: 'مسیر امروز' }, { v: 'task', label: 'جزئیات سفارش' }, { v: 'verify', label: 'شمارش و تطبیق' }]
          .map(j => ({ label: j.label, pick: () => this.nav({ ds: j.v }), style: this.chip(S.ds === j.v, '9px 14px') }))
        : [
          { v: 'home', label: 'خانه' }, { v: 'family', label: 'سفارش خانوادگی' }, { v: 'child', label: 'فرزند و پایه' },
          { v: 'orders', label: 'سفارش‌های من' }, { v: 'summary', label: 'خلاصه سفارش' }, { v: 'pickup', label: 'تحویل‌گیری و نقشه' }, { v: 'membership', label: 'عضویت' },
          { v: 'pay', label: 'پرداخت' }, { v: 'done', label: 'ثبت شد' }, { v: 'track', label: 'رهگیری' },
          { v: 'docs', label: 'چاپ اسناد' }, { v: 'flyer', label: 'تراکت' }, { v: 'cart', label: 'کارتریج' },
          { v: 'repair', label: 'تعمیر' }, { v: 'me', label: 'پروفایل' }, { v: 'login', label: 'ورود و قوانین' },
        ].map(j => ({
          label: j.label,
          pick: () => (j.v === 'login' || S.loggedIn)
            ? this.nav({ cs: j.v, stack: ['home'] })
            : this.nav({ loggedIn: true, cs: j.v, stack: ['home'] }),
          style: this.chip(S.cs === j.v, '9px 14px'),
        }))),

      priceGroups: [
        { title: 'فنری کتاب مدرسه', items: [
          { k: 'bindPerBook', label: 'فنری هر کتاب', unit: 'تومان' },
          { k: 'linedSheet', label: 'هر برگ کاغذ خط‌دار', unit: 'تومان' },
        ] },
        { title: 'چاپ و صحافی اسناد', items: [
          { k: 'docBw', label: 'هر صفحه سیاه‌وسفید', unit: 'تومان' },
          { k: 'docColor', label: 'هر صفحه رنگی', unit: 'تومان' },
          { k: 'docMixed', label: 'هر صفحه ترکیبی (میانگین)', unit: 'تومان' },
          { k: 'docDoubleDiscount', label: 'تخفیف چاپ دورو', unit: 'درصد' },
          { k: 'docBind', label: 'صحافی هر جلد', unit: 'تومان' },
          { k: 'stampGold', label: 'زرکوب روی جلد', unit: 'تومان' },
          { k: 'stampSilver', label: 'نقره‌کوب روی جلد', unit: 'تومان' },
        ] },
        { title: 'تراکت', items: [
          { k: 'flyerA4', label: 'هر برگ A4', unit: 'تومان' },
          { k: 'flyerA5', label: 'هر برگ A5', unit: 'تومان' },
          { k: 'flyerA6', label: 'هر برگ A6', unit: 'تومان' },
          { k: 'flyerBwPct', label: 'ضریب سیاه‌وسفید', unit: 'درصد قیمت رنگی' },
          { k: 'flyerGlossyPct', label: 'افزایش کاغذ گلاسه', unit: 'درصد' },
          { k: 'flyerBulk2000', label: 'تخفیف بالای ۲۰۰۰ عدد', unit: 'درصد' },
          { k: 'flyerBulk5000', label: 'تخفیف بالای ۵۰۰۰ عدد', unit: 'درصد' },
          { k: 'flyerDesign', label: 'هزینه طراحی', unit: 'تومان' },
        ] },
        { title: 'کارتریج و حمل', items: [
          { k: 'cartridge', label: 'شارژ کارتریج (پیش‌فرض)', unit: 'تومان' },
          { k: 'pickupFee', label: 'هزینه تحویل‌گیری', unit: 'تومان' },
          { k: 'deliveryFee', label: 'هزینه تحویل', unit: 'تومان' },
          { k: 'urgentFee', label: 'هزینه سفارش فوری', unit: 'تومان' },
        ] },
        { title: 'کمپین و تخفیف', items: [
          { k: 'couponPct', label: 'درصد تخفیف کوپن', unit: 'درصد' },
          { k: 'couponCap', label: 'سقف تخفیف کوپن', unit: 'تومان' },
        ] },
      ].map(g => ({
        title: g.title,
        items: g.items.map(it => ({
          label: it.label, unit: it.unit, value: fa(S.prices[it.k]),
          set: e => { const v = this.toNum(e.target.value); this.setState(s => ({ prices: { ...s.prices, [it.k]: v } })); },
          step: () => {},
        })),
      })),
      priceInput: 'width:120px;border:1px solid #cfd8ec;background:#fbfcff;border-radius:999px;padding:10px 12px;font-size:13.5px;font-weight:800;text-align:center;color:#0f1320',
      priceRow: 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 0;border-top:1px solid #eef2fb',
      resetPrices: () => {
        this.setState({ prices: { bindPerBook: 28000, linedSheet: 700, pickupFee: 35000, deliveryFee: 35000, urgentFee: 80000, couponPct: 5, couponCap: 100000, docBw: 380, docColor: 1200, docMixed: 560, docDoubleDiscount: 12, docBind: 65000, stampGold: 45000, stampSilver: 38000, flyerA4: 1100, flyerA5: 700, flyerA6: 450, flyerBwPct: 62, flyerGlossyPct: 15, flyerBulk2000: 10, flyerBulk5000: 18, flyerDesign: 250000, cartridge: 420000 } });
        this.notify('قیمت‌ها به مقادیر پیش‌فرض بازگشت');
      },
      adPrices: S.ad === 'prices',
      adCustomers: S.ad === 'customers', adAgents: S.ad === 'agents',
      adminCustomers: [
        { name: 'خانواده رضایی', phone: '۰۹۱۲۳۴۵۶۷۸۹', plan: 'شاگرد اول', orders: '۱۴', spent: '۸٫۴م', zone: 'سعادت‌آباد' },
        { name: 'مهدی کریمی', phone: '۰۹۱۲۱۱۱۲۲۳۳', plan: 'کیف مدرسه', orders: '۹', spent: '۴٫۱م', zone: 'شهرک غرب' },
        { name: 'شرکت آریا نت', phone: '۰۲۱۸۸۷۷۶۶۵۵', plan: 'مدیر مدرسه', orders: '۲۷', spent: '۳۱٫۶م', zone: 'میرداماد' },
        { name: 'زهرا نوری', phone: '۰۹۳۵۴۴۴۵۵۶۶', plan: 'دفترچه', orders: '۳', spent: '۹۲۰ه', zone: 'ونک' },
        { name: 'دبستان مهر', phone: '۰۲۱۴۴۵۵۶۶۷۷', plan: 'مدیر مدرسه', orders: '۱۹', spent: '۲۴٫۲م', zone: 'پونک' },
      ],
      adminAgents: [
        { name: 'رضا موسوی', code: '۲۴۷', zone: 'سعادت‌آباد · شهرک غرب', today: '۹ مأموریت', rate: '۴٫۹', status: 'در مسیر', tone: 'green' },
        { name: 'سعید احمدی', code: '۲۵۱', zone: 'ونک · میرداماد', today: '۷ مأموریت', rate: '۴٫۷', status: 'در مسیر', tone: 'green' },
        { name: 'حسین کاظمی', code: '۲۶۰', zone: 'پونک · جنت‌آباد', today: '۴ مأموریت', rate: '۴٫۵', status: 'آزاد', tone: 'cyan' },
        { name: 'مریم شریفی', code: '۲۶۳', zone: 'تهرانپارس', today: '۰ مأموریت', rate: '۴٫۸', status: 'خارج از شیفت', tone: 'ink' },
      ].map(a => {
        const tn = this.tint(a.tone === 'ink' ? 'blue' : a.tone);
        return { ...a, tagStyle: 'border-radius:999px;padding:5px 11px;font-size:11.5px;font-weight:800;text-align:center;background:' + (a.tone === 'ink' ? '#eef2fb' : tn[0]) + ';color:' + (a.tone === 'ink' ? '#6b7488' : tn[1]) };
      }),
      adminZones: [
        { name: 'منطقه ۱ — مرکز و غرب', fee: 'تحویل‌گیری و تحویل پایه', agents: '۶ پیک', sla: 'همان روز' },
        { name: 'منطقه ۲ — شمال', fee: '+۱۵٪ نرخ حمل', agents: '۴ پیک', sla: 'همان روز' },
        { name: 'منطقه ۳ — شرق و حاشیه', fee: '+۳۰٪ نرخ حمل', agents: '۳ پیک', sla: 'روز بعد' },
      ],
      adDash: S.ad === 'dash', adOrders: S.ad === 'orders', adColors: S.ad === 'colors', adRules: S.ad === 'rules',
      adCamp: S.ad === 'camp', adProd: S.ad === 'prod', adCenters: S.ad === 'centers', adCms: S.ad === 'cms', adNotif: S.ad === 'notif',
      adminMenu: [
        { v: 'dash', label: 'داشبورد', count: '' }, { v: 'orders', label: 'سفارش‌ها', count: '۲۴' },
        { v: 'prod', label: 'تولید و کنترل کیفیت', count: '۹۵' }, { v: 'colors', label: 'سرویس‌ها و گزینه‌ها', count: '' },
        { v: 'prices', label: 'قیمت‌ها', count: '' }, { v: 'rules', label: 'قوانین قیمت', count: '۵' }, { v: 'camp', label: 'کمپین‌ها', count: '۱' },
        { v: 'customers', label: 'مشتریان', count: '۱٬۲۴۰' }, { v: 'agents', label: 'پیک‌ها و مناطق', count: '۱۳' },
        { v: 'centers', label: 'مراکز چاپ', count: '۳۲' }, { v: 'cms', label: 'لندینگ و محتوا', count: '' },
        { v: 'notif', label: 'اعلان‌ها', count: '۸' },
      ].map(m => {
        const on = S.ad === m.v;
        return {
          label: m.label, count: m.count, pick: () => this.setState({ ad: m.v }),
          style: 'display:flex;align-items:center;gap:10px;width:100%;border:none;cursor:pointer;border-radius:14px;padding:11px 12px;font-size:13.5px;font-weight:' + (on ? '800' : '600') + ';background:' + (on ? '#7c5cf5' : 'transparent') + ';color:' + (on ? '#fff' : '#c6cbdc'),
          bullet: 'width:8px;height:8px;flex:none;border-radius:999px;background:' + (on ? '#fff' : '#4a5268'),
          countStyle: m.count ? 'font-size:11.5px;font-weight:700;opacity:0.8' : 'display:none',
        };
      }),
      kpis: [
        { label: 'فروش امروز', value: '۴۸٫۲م', delta: '+۱۲٪', tone: 'violet' },
        { label: 'سفارش‌ها', value: '۶۴', delta: '+۸', tone: 'cyan' },
        { label: 'تحویل‌گیری', value: '۲۹', delta: '۳ در انتظار', tone: 'blue' },
        { label: 'تحویل', value: '۲۲', delta: 'میانگین ۴۱ دقیقه', tone: 'green' },
        { label: 'مشتری جدید', value: '۱۷', delta: '+۵٪', tone: 'pink' },
      ].map(k => {
        const tn = this.tint(k.tone);
        return {
          ...k, cardStyle: 'background:' + tn[0] + ';border-radius:22px;padding:16px;color:' + tn[1],
          labelStyle: 'font-size:12.5px;opacity:0.8', deltaStyle: 'font-size:11.5px;font-weight:800;margin-top:5px;opacity:0.85',
        };
      }),
      bars: [['ش', 62], ['ی', 78], ['د', 54], ['س', 88], ['چ', 71], ['پ', 96], ['ج', 44]].map(b => ({
        label: b[0], style: 'width:100%;max-width:34px;height:' + b[1] + '%;border-radius:12px 12px 6px 6px;background:linear-gradient(180deg,' + (b[1] > 85 ? '#b9a4ff,#4c31b8' : '#e3dbff,#b9a4ff') + ')',
      })),
      perf: [
        { label: 'درآمد ماه', value: '۱٫۲۴ میلیارد' }, { label: 'کمیسیون پلتفرم', value: '۹۸ میلیون' },
        { label: 'کتاب پردازش‌شده', value: '۹٬۳۶۰' }, { label: 'تحویل به‌موقع', value: '۹۴٪' },
        { label: 'رضایت مشتری', value: '۴٫۸ از ۵' },
      ],
      orders: [
        { code: '۱۰۲۵۰', customer: 'خانواده رضایی', service: 'فنری + چاپ + کارتریج', items: fa(totalBooksN) + ' کتاب', amount: fa(totalN), status: 'در حال فنری', tone: 'background:#e3ecff;color:#1b45b8' },
        { code: '۱۰۲۴۴', customer: 'مهدی کریمی', service: 'فنری کتاب', items: '۱۶ کتاب', amount: '۹۸۰٬۰۰۰', status: 'کنترل کیفیت', tone: 'background:#d7f4e6;color:#0d5334' },
        { code: '۱۰۲۴۳', customer: 'شرکت آریا نت', service: 'چاپ اسناد', items: '۳۴۰ برگ', amount: '۳۱۰٬۰۰۰', status: 'در مسیر', tone: 'background:#d6f4f8;color:#0b5a66' },
        { code: '۱۰۲۴۲', customer: 'زهرا نوری', service: 'کارتریج', items: '۲ کارتریج', amount: '۴۲۰٬۰۰۰', status: 'تحویل شد', tone: 'background:#eef2fb;color:#4a5268' },
        { code: '۱۰۲۴۱', customer: 'علی صادقی', service: 'تعمیر پرینتر', items: 'HP 1102', amount: 'در انتظار تأیید', status: 'پیش‌فاکتور', tone: 'background:#07090f;color:#fff' },
        { code: '۱۰۲۴۰', customer: 'خانواده موسوی', service: 'فنری کتاب', items: '۱۱ کتاب', amount: '۷۴۰٬۰۰۰', status: 'بسته‌بندی', tone: 'background:#ebe5ff;color:#4c31b8' },
        { code: '۱۰۲۳۹', customer: 'دبستان مهر', service: 'تراکت', items: '۲۰۰۰ عدد', amount: '۱٬۹۰۰٬۰۰۰', status: 'تحویل شد', tone: 'background:#eef2fb;color:#4a5268' },
      ].map(o => ({ ...o, tagStyle: 'border-radius:999px;padding:6px 12px;font-size:11.5px;font-weight:800;text-align:center;' + o.tone })),
      adminColors: S.colors.map(c => ({
        name: c.name, hex: c.hex, extra: c.extra ? '+' + money(c.extra) : 'بدون هزینه',
        editing: !!(S.edit && S.edit.kind === 'color' && S.edit.id === c.id),
        view: !(S.edit && S.edit.kind === 'color' && S.edit.id === c.id),
        nameStyle: 'flex:1 1 110px;min-width:0;font-weight:700;font-size:14px;color:' + (c.on ? '#0f1320' : '#8c93a8'),
        swatch: 'width:28px;height:28px;flex:none;border-radius:10px;background:' + c.hex + ';box-shadow:inset 0 1.5px 0 rgba(255,255,255,0.5),0 4px 9px rgba(7,9,15,0.22)',
        switch: this.sw(c.on), knob: this.knob(c.on),
        toggle: () => this.setState(s => ({ colors: s.colors.map(x => x.id === c.id ? { ...x, on: !x.on } : x) })),
        edit: () => this.startEdit('color', c.id, c.name, c.extra, c.hex),
        remove: () => {
          this.setState(s => ({
            colors: s.colors.filter(x => x.id !== c.id),
            children: s.children.map(ch => ch.color === c.id ? { ...ch, color: 'blue' } : ch),
          }));
          this.notify('رنگ ' + c.name + ' حذف شد');
        },
      })),
      addColor: () => {
        const id = 'c' + Date.now();
        this.setState(s => {
          const next = s.colorQueue.length ? s.colorQueue[0] : { name: 'رنگ جدید', hex: '#2f6df6', extra: 0 };
          return {
            colors: [...s.colors, { ...next, id, on: true }],
            colorQueue: s.colorQueue.slice(1),
            edit: { kind: 'color', id, f1: next.name, f2: String(next.extra), f3: next.hex },
          };
        });
      },
      editName: S.edit ? S.edit.f1 : '', editNum: S.edit ? S.edit.f2 : '', editHex: S.edit ? S.edit.f3 : '',
      setEditName: e => this.setEditField('f1', e.target.value),
      setEditNum: e => this.setEditField('f2', e.target.value),
      setEditHex: e => this.setEditField('f3', e.target.value),
      saveEdit: () => this.commitEdit(),
      cancelEdit: () => this.setState({ edit: null }),
      rowBase: 'display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;padding:10px 0;border-top:1px solid #eef2fb',
      editInput: 'flex:1 1 140px;min-width:0;border:1px solid #cfd8ec;background:#fbfcff;border-radius:999px;padding:9px 14px;font-size:13px',
      numInput: 'flex:0 1 100px;width:100px;min-width:76px;border:1px solid #cfd8ec;background:#fbfcff;border-radius:999px;padding:9px 12px;font-size:13px;text-align:center',
      hexInput: 'flex:0 1 100px;width:100px;min-width:76px;border:1px solid #cfd8ec;background:#fbfcff;border-radius:999px;padding:9px 12px;font-size:12px;direction:ltr;text-align:center;font-family:ui-monospace,monospace',
      priceCell: 'margin-inline-start:auto;font-size:13px;font-weight:700;white-space:nowrap',
      saveBtn: 'background:#1fa968;color:#fff;border:none;border-radius:999px;padding:9px 16px;font-weight:800;font-size:12.5px;cursor:pointer',
      cancelBtn: 'background:#eef2fb;color:#4a5268;border:none;border-radius:999px;padding:9px 14px;font-weight:700;font-size:12.5px;cursor:pointer',
      iconBtn: 'width:32px;height:32px;flex:none;border-radius:11px;border:1px solid #dfe5f2;background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer',
      adminExtras: this.extraList().map(e => ({
        name: e.label, price: money(e.price),
        editing: !!(S.edit && S.edit.kind === 'extra' && S.edit.id === e.v),
        view: !(S.edit && S.edit.kind === 'extra' && S.edit.id === e.v),
        nameStyle: 'flex:1 1 130px;min-width:0;font-weight:600;font-size:13.5px;color:' + (e.on ? '#0f1320' : '#8c93a8'),
        switch: this.sw(e.on), knob: this.knob(e.on),
        toggle: () => this.setState(s => ({ extras: s.extras.map(x => x.v === e.v ? { ...x, on: !x.on } : x) })),
        edit: () => this.startEdit('extra', e.v, e.label, e.price),
        remove: () => {
          this.setState(s => ({
            extras: s.extras.filter(x => x.v !== e.v),
            children: s.children.map(c => ({ ...c, extras: (c.extras || []).filter(x => x !== e.v) })),
          }));
          this.notify(e.label + ' حذف شد');
        },
      })),
      addExtra: () => {
        const v = 'x' + Date.now();
        this.setState(s => ({ extras: [...s.extras, { v, label: 'خدمت جدید', price: 5000, on: true }] }));
        this.startEdit('extra', v, 'خدمت جدید', 5000);
      },
      adminGrades: this.gradeList().map(g => ({
        name: g.name, books: fa(g.books) + ' کتاب',
        editing: !!(S.edit && S.edit.kind === 'grade' && S.edit.id === g.name),
        view: !(S.edit && S.edit.kind === 'grade' && S.edit.id === g.name),
        nameStyle: 'flex:1 1 130px;min-width:0;font-weight:600;font-size:13.5px;color:' + (g.on ? '#0f1320' : '#8c93a8'),
        switch: this.sw(g.on), knob: this.knob(g.on),
        toggle: () => this.setState(s => ({ grades: s.grades.map(x => x.name === g.name ? { ...x, on: !x.on } : x) })),
        edit: () => this.startEdit('grade', g.name, g.name, g.books),
        remove: () => { this.setState(s => ({ grades: s.grades.filter(x => x.name !== g.name) })); this.notify('پایه ' + g.name + ' حذف شد'); },
      })),
      addGrade: () => {
        const name = 'پایه جدید ' + this.fa(this.gradeList().length + 1);
        this.setState(s => ({ grades: [...s.grades, { name, books: 10, on: true }] }));
        this.startEdit('grade', name, name, 10);
      },
      rules: S.rules.map(r => ({
        n: fa(r.n), cond: r.cond, effect: r.effect, used: r.used,
        numStyle: 'width:32px;height:32px;flex:none;border-radius:11px;background:' + th.soft + ';color:' + th.softInk + ';font-weight:800;font-size:13px;display:flex;align-items:center;justify-content:center',
        switch: this.sw(r.on), knob: this.knob(r.on),
        toggle: () => this.setState(s => ({ rules: s.rules.map(x => x.n === r.n ? { ...x, on: !x.on } : x) })),
      })),
      addRule: () => { this.setState(s => ({ rules: [...s.rules, { n: s.rules.length + 1, cond: 'شرط جدید', effect: 'اثر جدید', used: 'تازه', on: false }] })); this.notify('قانون جدید ساخته شد'); },
      campFields: [
        { label: 'بازه اجرا', value: '۱ مرداد – ۱۵ شهریور ۱۴۰۵' }, { label: 'ظرفیت روزانه', value: '۱۲۰ سفارش' },
        { label: 'ساعت‌های تحویل‌گیری', value: '۱۰ تا ۲۰' }, { label: 'تخفیف کمپین', value: '۵ درصد (سقف ۱۰۰ هزار)' },
        { label: 'کوپن فعال', value: 'SCHOOL1405' }, { label: 'سرویس‌های مشمول', value: 'فنری کتاب، چاپ اسناد' },
      ],
      newCampaign: () => this.notify('کمپین جدید ساخته شد — پیش‌نویس'),
      prodColumns: [
        { label: 'دریافت‌شده', n: '۱۴', items: [{ label: '۱۰۲۵۱ · ۲ کارتریج' }, { label: '۱۰۲۵۰ · ۴۳ کتاب' }], tone: 'ink' },
        { label: 'آماده‌سازی', n: '۲۲', items: [{ label: '۱۰۲۴۸ · ۱۸ کتاب' }, { label: '۱۰۲۴۷ · ۳۴۰ برگ' }], tone: 'cyan' },
        { label: 'فنری', n: '۳۱', items: [{ label: '۱۰۲۵۰ · ۴۳ کتاب' }, { label: '۱۰۲۴۶ · ۱۲ کتاب' }], tone: 'blue' },
        { label: 'خدمات اضافی', n: '۹', items: [{ label: '۱۰۲۴۴ · لمینت جلد' }], tone: 'violet' },
        { label: 'کنترل کیفیت', n: '۱۲', items: [{ label: '۱۰۲۴۴ · ۱۶ کتاب' }, { label: '۱۰۲۴۰ · ۱۱ کتاب' }], tone: 'green' },
        { label: 'بسته‌بندی', n: '۷', items: [{ label: '۱۰۲۴۰ · بسته خانوادگی' }], tone: 'pink' },
      ].map(c => {
        const tn = this.tint(c.tone);
        return {
          label: c.label, n: c.n, items: c.items,
          style: 'background:' + tn[0] + ';border-radius:22px;padding:14px;color:' + tn[1],
          badgeStyle: 'border-radius:999px;padding:4px 10px;font-size:11.5px;font-weight:800;background:rgba(255,255,255,0.72)',
          itemStyle: 'font-size:12px;border-radius:14px;padding:9px 11px;margin-top:8px;background:rgba(255,255,255,0.72)',
        };
      }),
      qcChecks: ['تعداد کتاب‌ها صحیح است', 'نام کتاب‌ها مطابق سفارش است', 'پایه تحصیلی صحیح است', 'رنگ فنری صحیح است', 'کاغذهای خط‌دار اضافه شده‌اند', 'محل صفحات صحیح است', 'خدمات اضافی انجام شده‌اند', 'فنری سالم و بدون لبه تیز است', 'ظاهر نهایی مناسب است'].map((label, i) => ({
        label, toggle: () => this.setState(s => ({ qc: s.qc.map((c, j) => j === i ? !c : c) })),
        style: 'display:flex;align-items:center;gap:11px;width:100%;background:transparent;border:none;border-top:1px solid #eef2fb;padding:11px 0;cursor:pointer;text-align:right',
        box: 'width:22px;height:22px;flex:none;border-radius:7px;border:2px solid ' + (S.qc[i] ? '#1fa968' : '#c3cadd') + ';background:' + (S.qc[i] ? '#1fa968' : 'transparent'),
      })),
      qcProgress: fa(S.qc.filter(Boolean).length) + ' از ۹ مورد تأیید شده',
      qcBar: 'height:100%;border-radius:999px;background:#1fa968;width:' + Math.round(S.qc.filter(Boolean).length / 9 * 100) + '%',
      goCenters: () => this.setState({ ad: 'centers' }),
      centers: [
        { name: 'چاپ نگین', zone: 'سعادت‌آباد', cap: '۱۲۰ کتاب/روز', time: '۲۴ ساعت', com: '۸٪', rate: '۴٫۹' },
        { name: 'دیجیتال آرت', zone: 'شهرک غرب', cap: '۹۰ کتاب/روز', time: '۳۶ ساعت', com: '۷٪', rate: '۴٫۷' },
        { name: 'چاپخانه مهر', zone: 'ونک', cap: '۲۱۰ کتاب/روز', time: '۲۴ ساعت', com: '۱۰٪', rate: '۴٫۸' },
        { name: 'پرینت لند', zone: 'میرداماد', cap: '۶۰ کتاب/روز', time: '۴۸ ساعت', com: '۶٪', rate: '۴٫۴' },
        { name: 'کپی‌سنتر پارس', zone: 'پونک', cap: '۱۵۰ کتاب/روز', time: '۳۰ ساعت', com: '۹٪', rate: '۴٫۶' },
      ].map(c => ({ ...c, openMap: () => this.openMap(c.zone + '، تهران') })),
      cmsSections: S.cms.map((s2, i) => ({
        label: s2.label, n: fa(i + 1),
        switch: this.sw(s2.on), knob: this.knob(s2.on),
        toggle: () => this.setState(st => ({ cms: st.cms.map((x, j) => j === i ? { ...x, on: !x.on } : x) })),
        style: 'display:flex;align-items:center;gap:12px;padding:11px 14px;border-radius:18px;background:' + (s2.on ? '#fff' : '#e7ebf5') + ';border:1px solid #dfe5f2',
        badge: 'width:28px;height:28px;flex:none;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:11.5px;font-weight:800;background:' + (s2.on ? th.soft : '#d7dce8') + ';color:' + (s2.on ? th.softInk : '#6b7488'),
      })),
      addSection: () => this.notify('بخش جدید به لندینگ اضافه شد'),
      notifTemplates: S.notifs.map((n2, i) => ({
        label: n2.label, ch: n2.ch,
        chStyle: 'border-radius:999px;padding:5px 11px;font-size:11px;font-weight:800;flex:none;' + (n2.ch === 'پیامک' ? 'background:#e3ecff;color:#1b45b8' : 'background:#ebe5ff;color:#4c31b8'),
        switch: this.sw(n2.on), knob: this.knob(n2.on),
        toggle: () => this.setState(st => ({ notifs: st.notifs.map((x, j) => j === i ? { ...x, on: !x.on } : x) })),
        edit: () => this.notify('ویرایش قالب: ' + n2.label),
      })),
    };
  }
}
</script>
</body>
</html>