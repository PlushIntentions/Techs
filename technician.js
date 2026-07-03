// ── SUPABASE INIT ─────────────────────────────────────────
const supabaseUrl = 'https://iazvpykfdckpffhakncd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhenZweWtmZGNrcGZmaGFrbmNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNzA0MTEsImV4cCI6MjA5NTg0NjQxMX0.OOXhS1zLez30isOszxP0XOIyndpJq2jwqE90eY649bA'
if (!window._supabaseClient) {
  window._supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
}
let supabase = window._supabaseClient;
let currentUser = null;
let currentTechnician = null;

// ── CORE INIT ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  wireNav();
  wireSidebar();
  wireRefresh();

  await initTechApp();
  await loadAllPanels();
  subscribeChat();
});

async function initTechApp() {
  showLoader(true);

  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) {
    window.location.href = '/login.html';
    return;
  }

  currentUser = session.user;

  const { data: tech, error: techErr } = await supabase
    .from('technicians')
    .select('*')
    .eq('user_id', currentUser.id)
    .single();

  if (techErr || !tech) {
    showToast('Technician record not found');
    return;
  }

  currentTechnician = tech;

  const emailEl = document.querySelector('.signed-in-email');
  if (emailEl) emailEl.textContent = currentUser.email || '';

  showLoader(false);
}

async function loadAllPanels() {
  await Promise.all([
    loadDashboard(),
    loadTechDocuments(),
    loadChatMessages(),
    loadAvailability(),
    loadTimesheet()
  ]);
}

// ── UI HELPERS ────────────────────────────────────────────
function showLoader(show) {
  const el = document.getElementById('loader');
  if (!el) return;
  el.classList.toggle('hidden', !show);
}

let toastTimeout;
function showToast(msg, duration = 2500) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), duration);
}

// ── NAV / PANELS / SIDEBAR ────────────────────────────────
function wireNav() {
  const links = document.querySelectorAll('.nav-link');
  links.forEach(link => {
    link.addEventListener('click', () => {
      links.forEach(l => l.classList.remove('active'));
      link.classList.add('active');

      const panelId = link.getAttribute('data-panel');
      document.querySelectorAll('.panel').forEach(p => {
        p.classList.toggle('active', p.id === panelId);
      });
    });
  });
}

function wireSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const backdrop = document.querySelector('.sidebar-backdrop');
  const hamburger = document.querySelector('.hamburger');
  const closeBtn = document.querySelector('.sidebar-close-btn');

  if (hamburger) {
    hamburger.addEventListener('click', () => {
      sidebar?.classList.add('open');
      backdrop?.classList.add('show');
    });
  }
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      sidebar?.classList.remove('open');
      backdrop?.classList.remove('show');
    });
  }
  if (backdrop) {
    backdrop.addEventListener('click', () => {
      sidebar?.classList.remove('open');
      backdrop?.classList.remove('show');
    });
  }

  document.addEventListener('click', (e) => {
    if (e.target.closest('.btn-signout')) {
      signOut();
    }
  });
}

function wireRefresh() {
  const btn = document.getElementById('btn-refresh');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    showLoader(true);
    await loadAllPanels();
    showLoader(false);
    showToast('Refreshed');
  });
}

async function signOut() {
  await supabase.auth.signOut();
  window.location.href = '/login.html';
}

// ── DASHBOARD / WORK ORDERS ───────────────────────────────
async function loadDashboard() {
  try {
    const { data: workOrders } = await supabase
      .from('work_orders')
      .select('*')
      .eq('assigned_tech_id', currentTechnician.id)
      .order('created_at', { ascending: false })
      .limit(6);

    renderDashboardWorkOrders(workOrders || []);
    updateStats(workOrders || []);

    const { data: earnings } = await supabase
      .from('earnings')
      .select('amount')
      .eq('technician_id', currentTechnician.id);

    const total = (earnings || []).reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const el = document.getElementById('earnings-total');
    if (el) el.textContent = `$${total.toFixed(2)}`;
  } catch (err) {
    console.error(err);
    showToast('Failed to load dashboard');
  }
}

function renderDashboardWorkOrders(list) {
  const container = document.getElementById('dash-workorders');
  if (!container) return;

  if (!list.length) {
    container.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24"><path fill="currentColor" d="M5 4h14v2H5zm2 4h10v2H7zm0 4h7v2H7z"/></svg>
        <p>No work orders assigned yet.</p>
      </div>`;
    return;
  }

  container.innerHTML = list.map(wo => `
    <div class="card">
      <div class="card-top">
        <div>
          <div class="card-title">${wo.title}</div>
          <div class="card-sub">${wo.job_address || ''}</div>
        </div>
        <span class="badge badge-${(wo.status || 'pending').toLowerCase()}">
          ${(wo.status || 'pending').replace('_',' ')}
        </span>
      </div>
      <div class="card-body">
        <span><strong>WO #</strong> ${wo.wo_number}</span>
        <span><strong>Scheduled</strong> ${wo.scheduled_date || 'TBD'} ${wo.scheduled_time || ''}</span>
      </div>
    </div>
  `).join('');
}

async function loadWorkOrders() {
  const { data, error } = await supabase
    .from('work_orders')
    .select('*')
    .eq('assigned_tech_id', currentTechnician.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    showToast('Failed to load work orders');
    return;
  }

  const container = document.getElementById('workorders-list');
  if (!container) return;

  if (!data.length) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No work orders assigned.</p>
      </div>`;
    return;
  }

  container.innerHTML = data.map(wo => `
    <div class="card">
      <div class="card-top">
        <div>
          <div class="card-title">${wo.title}</div>
          <div class="card-sub">${wo.job_address || ''}</div>
        </div>
        <span class="badge badge-${(wo.status || 'pending').toLowerCase()}">
          ${(wo.status || 'pending').replace('_',' ')}
        </span>
      </div>
      <div class="card-body">
        <span><strong>WO #</strong> ${wo.wo_number}</span>
        <span><strong>Scheduled</strong> ${wo.scheduled_date || 'TBD'} ${wo.scheduled_time || ''}</span>
      </div>
    </div>
  `).join('');
}

function updateStats(workOrders) {
  const open = workOrders.filter(w => w.status !== 'completed' && w.status !== 'cancelled').length;
  const today = workOrders.filter(w => w.scheduled_date === new Date().toISOString().slice(0,10)).length;

  const s1 = document.getElementById('stat-open-wos');
  const s2 = document.getElementById('stat-today');
  const m1 = document.getElementById('msb-open-wos');
  const m2 = document.getElementById('msb-today');

  if (s1) s1.textContent = open;
  if (s2) s2.textContent = today;
  if (m1) m1.textContent = open;
  if (m2) m2.textContent = today;
}

// ── DOCUMENTS ─────────────────────────────────────────────
async function loadTechDocuments() {
  const { data, error } = await supabase
    .from('technician_documents')
    .select('*')
    .eq('technician_id', currentTechnician.id)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error(error);
    showToast('Failed to load documents');
    return;
  }

  if (!data) return;

  setDocStatus('w9', data.w9_url);
  setDocStatus('id', data.id_url);
  setDocStatus('certs', data.certs_url);
  setDocStatus('insurance', data.insurance_url);
}

function setDocStatus(type, url) {
  const el = document.getElementById(`doc-${type}-status`);
  if (!el) return;
  el.textContent = url ? 'Uploaded' : 'Missing';
  el.className = 'doc-status badge ' + (url ? 'badge-completed' : 'badge-pending');
}

async function uploadTechDoc(type) {
  const input = document.getElementById(`doc-${type}-file`);
  if (!input || !input.files.length) {
    showToast('Select a file first');
    return;
  }

  const file = input.files[0];
  const path = `tech_${currentUser.id}/${type}-${Date.now()}-${file.name}`;

  const { error: upErr } = await supabase
    .storage
    .from('tech_documents')
    .upload(path, file);

  if (upErr) {
    console.error(upErr);
    showToast('Upload failed');
    return;
  }

  const { data: existing } = await supabase
    .from('technician_documents')
    .select('*')
    .eq('technician_id', currentTechnician.id)
    .maybeSingle();

  const payload = {
    technician_id: currentTechnician.id,
    [`${type}_url`]: path,
    updated_at: new Date().toISOString()
  };

  let error;
  if (existing) {
    ({ error } = await supabase
      .from('technician_documents')
      .update(payload)
      .eq('technician_id', currentTechnician.id));
  } else {
    ({ error } = await supabase
      .from('technician_documents')
      .insert(payload));
  }

  if (error) {
    console.error(error);
    showToast('Failed to save document record');
    return;
  }

  showToast('Document uploaded');
  await loadTechDocuments();
}

// ── CHAT ──────────────────────────────────────────────────
async function loadChatMessages() {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('technician_id', currentTechnician.id)
    .order('created_at', { ascending: true });

  if (error) {
    console.error(error);
    showToast('Failed to load chat');
    return;
  }

  renderChat(data || []);
}

function renderChat(list) {
  const container = document.querySelector('.chat-messages');
  if (!container) return;
  container.innerHTML = '';

  list.forEach(msg => {
    const div = document.createElement('div');
    const isMe = msg.sender_id === currentUser.id;
    div.className = `chat-bubble ${isMe ? 'me' : 'them'}`;
    div.textContent = msg.message;
    container.appendChild(div);
  });

  container.scrollTop = container.scrollHeight;
}

async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  if (!input || !input.value.trim()) return;

  const text = input.value.trim();
  input.value = '';

  const { error } = await supabase
    .from('chat_messages')
    .insert({
      technician_id: currentTechnician.id,
      sender_id: currentUser.id,
      sender_name: currentUser.email,
      message: text
    });

  if (error) {
    console.error(error);
    showToast('Failed to send message');
  }
}

function subscribeChat() {
  if (!currentTechnician) return;

  supabase
    .channel('chat_messages_tech_' + currentTechnician.id)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `technician_id=eq.${currentTechnician.id}` },
      payload => {
        const msg = payload.new;
        const container = document.querySelector('.chat-messages');
        if (!container) return;
        const div = document.createElement('div');
        const isMe = msg.sender_id === currentUser.id;
        div.className = `chat-bubble ${isMe ? 'me' : 'them'}`;
        div.textContent = msg.message;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
      }
    )
    .subscribe();
}

// ── AVAILABILITY ──────────────────────────────────────────
async function loadAvailability() {
  const { data, error } = await supabase
    .from('technician_availability')
    .select('*')
    .eq('technician_id', currentTechnician.id)
    .order('day_of_week', { ascending: true });

  if (error) {
    console.error(error);
    showToast('Failed to load availability');
    return;
  }

  renderAvailability(data || []);
}

function renderAvailability(list) {
  const container = document.querySelector('.availability-grid');
  if (!container) return;

  if (!list.length) {
    container.innerHTML = `<div class="empty-state"><p>No availability set yet.</p></div>`;
    return;
  }

  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  container.innerHTML = list.map(a => `
    <div class="avail-card">
      <div class="card-top">
        <div class="card-title">${days[a.day_of_week]}</div>
        <span class="badge ${a.active ? 'badge-active' : 'badge-pending'}">
          ${a.active ? 'Active' : 'Inactive'}
        </span>
      </div>
      <div class="card-body">
        <span><strong>${a.start_time}</strong> - <strong>${a.end_time}</strong></span>
      </div>
    </div>
  `).join('');
}

// ── TIMESHEET ─────────────────────────────────────────────
async function loadTimesheet() {
  const { data, error } = await supabase
    .from('timesheet')
    .select('*')
    .eq('technician_id', currentTechnician.id)
    .order('clock_in', { ascending: false })
    .limit(30);

  if (error) {
    console.error(error);
    showToast('Failed to load timesheet');
    return;
  }

  renderTimesheet(data || []);
}

function renderTimesheet(list) {
  const container = document.querySelector('.timesheet-list');
  if (!container) return;

  if (!list.length) {
    container.innerHTML = `<div class="empty-state"><p>No time entries yet.</p></div>`;
    return;
  }

  container.innerHTML = list.map(row => {
    const start = new Date(row.clock_in);
    const end = row.clock_out ? new Date(row.clock_out) : null;
    const hours = end ? ((end - start) / 1000 / 60 / 60).toFixed(2) : '—';

    return `
      <div class="timesheet-row">
        <div>
          <div>${start.toLocaleString()}</div>
          <div style="font-size:11px;color:var(--text-muted);">
            ${end ? 'Out: ' + end.toLocaleString() : 'Currently clocked in'}
          </div>
        </div>
        <div style="font-weight:700;">${hours} h</div>
      </div>
    `;
  }).join('');
}

async function clockIn() {
  const { error } = await supabase
    .from('timesheet')
    .insert({
      technician_id: currentTechnician.id,
      clock_in: new Date().toISOString()
    });

  if (error) {
    console.error(error);
    showToast('Clock in failed');
    return;
  }

  showToast('Clocked in');
  await loadTimesheet();
}
