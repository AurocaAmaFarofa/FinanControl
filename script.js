// ============================================================
// CONSTANTES GLOBAIS
// ============================================================
const MONTHS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

const PAYMENT_METHODS_DEFAULT = [
  'Pix',
  'Dinheiro',
  'Cartão de Crédito',
  'Cartão de Débito',
  'Outros',
]

const CATEGORIES_DEFAULT = [
  'Alimentação',
  'Transporte',
  'Saúde',
  'Lazer',
  'Educação',
  'Moradia',
  'Roupas',
  'Serviços',
  'Outros',
]

const CORES = {
  green: '#3d6b4a',
  red: '#b34d62',
  accent: '#b8944e',
  yellow: '#9a6f2a',
  purple: '#6b5aad',
}

const hoje = new Date()
const LS_KEY = 'financas_v2'

// ============================================================
// ESTADO GLOBAL
// ============================================================
let state = {
  data: {
    // movements e fixedExpenses são agora indexados por "ANO_MES"
    // ex: movements["2026_0"] = [ ...array de movimentações de jan/2026 ]
    // Dados globais (não dependem de mês)
    movements: {}, // { "ANO_MES": [...] }
    fixedExpenses: {}, // { "ANO_MES": [...] }
    reserves: [],
    categories: [...CATEGORIES_DEFAULT],
    paymentMethods: [...PAYMENT_METHODS_DEFAULT],
    accounts: [{ id: 'default', name: 'Conta Principal' }],
    activeAccountId: 'default',
  },
  tab: 'dashboard',
  month: hoje.getMonth(),
  year: hoje.getFullYear(),
  reportYear: hoje.getFullYear(),
  movementsFilter: 'todos',
  inlineAdjustReserveId: null,
  inlineAdjustType: 'add',
  accountDropdownOpen: false,
}

// ============================================================
// UTILITÁRIOS
// ============================================================
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function fmt(v) {
  return Number(v || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function pct(v, total) {
  if (!total) return 0
  return Math.min(100, Math.round((v / total) * 100))
}

function monthKey(year, month) {
  return `${year}_${month}`
}

// ============================================================
// PERSISTÊNCIA — LOCALSTORAGE COM MIGRAÇÃO
// ============================================================

/**
 * Detecta e migra dados do formato antigo ("financas_v1") para o novo.
 * Formato antigo: { movements: [...], fixedExpenses: [...], ... }
 * Formato novo:   { movements: { "2026_0": [...] }, fixedExpenses: { ... }, ... }
 */
function migrateOldData(oldData) {
  const migrated = {
    movements: {},
    fixedExpenses: {},
    reserves: oldData.reserves || [],
    categories: oldData.categories || [...CATEGORIES_DEFAULT],
    paymentMethods: oldData.paymentMethods || [...PAYMENT_METHODS_DEFAULT],
    accounts: [{ id: 'default', name: 'Conta Principal' }],
    activeAccountId: 'default',
  }

  // Migra array plano de movements para estrutura indexada por mês
  if (Array.isArray(oldData.movements)) {
    oldData.movements.forEach((m) => {
      try {
        const d = new Date((m.date || '') + 'T12:00:00')
        const key = monthKey(d.getFullYear(), d.getMonth())
        if (!migrated.movements[key]) migrated.movements[key] = []
        // Garante campos de conta
        migrated.movements[key].push({
          ...m,
          accountId: m.accountId || 'default',
        })
      } catch (e) {
        /* ignora entradas corrompidas */
      }
    })
  }

  // Migra array plano de fixedExpenses para estrutura indexada por mês
  if (Array.isArray(oldData.fixedExpenses)) {
    oldData.fixedExpenses.forEach((f) => {
      const key = monthKey(
        f.year !== undefined ? f.year : hoje.getFullYear(),
        f.month !== undefined ? f.month : hoje.getMonth(),
      )
      if (!migrated.fixedExpenses[key]) migrated.fixedExpenses[key] = []
      migrated.fixedExpenses[key].push({
        ...f,
        accountId: f.accountId || 'default',
      })
    })
  }

  console.info('[Finanças] Migração de dados v1 → v2 concluída.')
  return migrated
}

function loadState() {
  try {
    // Tenta carregar formato novo primeiro
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      // Valida se tem estrutura nova (movements é objeto, não array)
      if (
        parsed &&
        typeof parsed.movements === 'object' &&
        !Array.isArray(parsed.movements)
      ) {
        state.data = parsed
        return
      }
    }

    // Tenta carregar e migrar formato antigo
    const rawOld = localStorage.getItem('financas_v1')
    if (rawOld) {
      const parsedOld = JSON.parse(rawOld)
      if (parsedOld && Array.isArray(parsedOld.movements)) {
        state.data = migrateOldData(parsedOld)
        saveState() // persiste imediatamente no novo formato
        return
      }
    }
  } catch (e) {
    console.error('[Finanças] Erro ao carregar dados:', e)
  }
}

function saveState() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state.data))
  } catch (e) {
    console.error('[Finanças] Erro ao salvar dados:', e)
  }
}

// ============================================================
// ACCESSORS — LEITURAS DO STATE COM BASE NO MÊS/CONTA ATUAL
// ============================================================

function getMonthMovements() {
  const key = monthKey(state.year, state.month)
  const all = state.data.movements[key] || []
  // Se houver conta ativa diferente de "all", filtra
  return all
}

function getMonthMovementsForAccount(accountId) {
  const key = monthKey(state.year, state.month)
  const all = state.data.movements[key] || []
  if (!accountId || accountId === 'all') return all
  return all.filter((m) => m.accountId === accountId)
}

function getMonthFixed() {
  const key = monthKey(state.year, state.month)
  return state.data.fixedExpenses[key] || []
}

function getAllMovementsForYear(year) {
  const result = []
  for (let m = 0; m < 12; m++) {
    const key = monthKey(year, m)
    ;(state.data.movements[key] || []).forEach((mv) => result.push(mv))
  }
  return result
}

function getAccountBalance(accountId) {
  // Calcula saldo total histórico de uma conta (todos os meses)
  let balance = 0
  Object.values(state.data.movements).forEach((arr) => {
    arr.forEach((m) => {
      if (m.accountId !== accountId) return
      balance += m.type === 'recebimento' ? Number(m.value) : -Number(m.value)
    })
  })
  return balance
}

function getActiveAccount() {
  return (
    state.data.accounts.find((a) => a.id === state.data.activeAccountId) ||
    state.data.accounts[0] || { id: 'default', name: 'Conta Principal' }
  )
}

function calculateTotals() {
  const accId = state.data.activeAccountId
  const movements = getMonthMovementsForAccount(accId)
  const totalIn = movements
    .filter((m) => m.type === 'recebimento')
    .reduce((a, m) => a + Number(m.value), 0)
  const totalOut = movements
    .filter((m) => m.type === 'gasto')
    .reduce((a, m) => a + Number(m.value), 0)
  const totalReserved = state.data.reserves.reduce(
    (a, r) => a + Number(r.current),
    0,
  )
  const fixed = getMonthFixed()
  const pendingFixed = fixed.filter((f) => f.status === 'pendente')
  return { totalIn, totalOut, totalReserved, pendingFixed }
}

// ============================================================
// NOTIFICAÇÕES
// ============================================================
function showNotify(msg, type = 'success') {
  const toast = document.getElementById('notification-toast')
  toast.textContent = msg
  toast.className = `notification ${type}`
  setTimeout(() => {
    toast.className = 'notification hidden'
  }, 2800)
}

// ============================================================
// RENDERIZAÇÃO PRINCIPAL
// ============================================================
function renderApp() {
  // Atualiza label de data no header
  document.getElementById('current-date-display').textContent =
    `${MONTHS[state.month]} ${state.year}`

  // Atualiza nome da conta ativa no header
  const acc = getActiveAccount()
  const accNameEl = document.getElementById('account-current-name')
  if (accNameEl) accNameEl.textContent = acc.name

  // Ativa tab correta no menu inferior
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === state.tab)
  })

  // Controla FAB
  const fab = document.getElementById('global-fab')
  fab.classList.toggle(
    'hidden',
    !['movements', 'fixed', 'reserves'].includes(state.tab),
  )

  // Fecha dropdown de contas se estiver aberto
  const dropdown = document.getElementById('account-dropdown')
  if (!state.accountDropdownOpen) {
    dropdown.classList.add('hidden')
  } else {
    renderAccountDropdown(dropdown)
    dropdown.classList.remove('hidden')
  }

  // Renderiza aba ativa
  const container = document.getElementById('main-content')
  container.innerHTML = ''

  switch (state.tab) {
    case 'dashboard':
      renderDashboard(container)
      break
    case 'movements':
      renderMovements(container)
      break
    case 'fixed':
      renderFixed(container)
      break
    case 'reserves':
      renderReserves(container)
      break
    case 'reports':
      renderReports(container)
      break
  }
}

// ============================================================
// DROPDOWN DE CONTAS
// ============================================================
function renderAccountDropdown(container) {
  container.innerHTML = ''

  state.data.accounts.forEach((acc) => {
    const bal = getAccountBalance(acc.id)
    const item = document.createElement('div')
    item.className = `account-dropdown-item${acc.id === state.data.activeAccountId ? ' is-active' : ''}`
    item.innerHTML = `
      <span class="account-dropdown-dot"></span>
      <span>${acc.name}</span>
      <span class="account-dropdown-balance">${fmt(bal)}</span>
    `
    item.addEventListener('click', () => {
      state.data.activeAccountId = acc.id
      state.accountDropdownOpen = false
      saveState()
      renderApp()
    })
    container.appendChild(item)
  })

  // Opção: nova conta
  const newItem = document.createElement('div')
  newItem.className = 'account-dropdown-item'
  newItem.style.color = 'var(--accent)'
  newItem.innerHTML = `<span class="account-dropdown-dot" style="background:var(--accent);"></span><span>Nova conta</span>`
  newItem.addEventListener('click', () => {
    state.accountDropdownOpen = false
    renderApp()
    setTimeout(() => openAccountModal(), 50)
  })
  container.appendChild(newItem)
}

// ============================================================
// ABA 1: DASHBOARD
// ============================================================
function renderDashboard(target) {
  const totals = calculateTotals()
  const accId = state.data.activeAccountId
  const acc = getActiveAccount()
  const accBalance = getAccountBalance(accId)
  const saldoGlobal = state.data.accounts.reduce(
    (sum, a) => sum + getAccountBalance(a.id),
    0,
  )

  // Card escuro com saldo da conta e agora com o saldo total
  const overviewCard = document.createElement('div')
  overviewCard.className = 'account-overview-card'
  overviewCard.innerHTML = `
    <div class="account-overview-label">Saldo da conta</div>
    <div class="account-overview-name">${acc.name}</div>
    <div class="account-overview-balance${accBalance < 0 ? ' negative' : ''}" style="margin-bottom: 4px;">${fmt(accBalance)}</div>
    <div style="font-size: 13px; color: rgba(255,255,255,0.7); margin-bottom: 14px; letter-spacing: 0.02em;">
      Saldo Total: <span style="color: #fff; font-weight: 600;">${fmt(saldoGlobal)}</span>
    </div>
    <div class="account-overview-footer">
      <div class="account-overview-stat">
        <label>Entrada no mês</label>
        <span>${fmt(totals.totalIn)}</span>
      </div>
      <div class="account-overview-stat">
        <label>Saída no mês</label>
        <span>${fmt(totals.totalOut)}</span>
      </div>
    </div>
  `
  target.appendChild(overviewCard)

  // Grid de cards resumo
  // NOVO: Cálculo baseado na soma de TODAS as contas e travado em no mínimo 0.
  const saldoLivre = Math.max(0, saldoGlobal - totals.totalReserved)

  const grid = document.createElement('div')
  grid.className = 'summary-grid'
  grid.innerHTML = `
    <div class="summary-card" style="background-color:${saldoLivre >= 0 ? 'var(--green-light)' : 'var(--red-light)'}; color:${saldoLivre >= 0 ? 'var(--green)' : 'var(--red)'}; border-color:${saldoLivre >= 0 ? 'var(--green-light)' : 'var(--red-light)'}">
      <div class="summary-label">Pode gastar</div>
      <div class="summary-value">${fmt(saldoLivre)}</div>
    </div>
    <div class="summary-card" style="background-color:var(--accent-light); color:var(--accent-dark); border-color:var(--accent-light)">
      <div class="summary-label">Reservado</div>
      <div class="summary-value">${fmt(totals.totalReserved)}</div>
    </div>
    <div class="summary-card" style="background-color:var(--green-light); color:var(--green)">
      <div class="summary-label">Recebido</div>
      <div class="summary-value">${fmt(totals.totalIn)}</div>
    </div>
    <div class="summary-card" style="background-color:var(--red-light); color:var(--red)">
      <div class="summary-label">Gasto</div>
      <div class="summary-value">${fmt(totals.totalOut)}</div>
    </div>
  `
  target.appendChild(grid)

  // Alerta de fixos pendentes
  if (totals.pendingFixed.length > 0) {
    const upcoming = [...totals.pendingFixed]
      .sort((a, b) => a.day - b.day)
      .slice(0, 5)
    const banner = document.createElement('div')
    banner.className = 'card alert-banner'
    banner.innerHTML = `<div class="alert-title">${totals.pendingFixed.length} vencimento(s) pendente(s)</div>`
    upcoming.forEach((f) => {
      banner.innerHTML += `
        <div class="alert-row">
          <span>Dia ${f.day} — ${f.name}</span>
          <strong>${fmt(f.value)}</strong>
        </div>
      `
    })
    target.appendChild(banner)
  }

  // Últimos lançamentos
  const block = document.createElement('div')
  block.className = 'card'
  const blockHeader = document.createElement('div')
  blockHeader.style =
    'display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;'
  blockHeader.innerHTML = `
    <span class="section-title" style="margin-bottom:0;">Últimos lançamentos</span>
    <button id="dash-new-mov" class="btn btn-primary" style="padding:6px 14px; font-size:12px;">+ Novo</button>
  `
  block.appendChild(blockHeader)

  const currentMovements = getMonthMovementsForAccount(
    state.data.activeAccountId,
  )
  if (currentMovements.length === 0) {
    block.innerHTML += `<div class="empty-state"><div class="empty-icon"></div><div class="empty-text">Nenhum lançamento neste mês.</div></div>`
  } else {
    const listWrapper = document.createElement('div')
    ;[...currentMovements]
      .reverse()
      .slice(0, 6)
      .forEach((m) => {
        listWrapper.appendChild(createMovementRowElement(m, false))
      })
    block.appendChild(listWrapper)
  }

  target.appendChild(block)
  document
    .getElementById('dash-new-mov')
    .addEventListener('click', openMovementModal)
}

// ============================================================
// ABA 2: LANÇAMENTOS
// ============================================================
function renderMovements(target) {
  const allMovements = getMonthMovementsForAccount(state.data.activeAccountId)

  const pillBox = document.createElement('div')
  pillBox.className = 'pill-container'
  pillBox.innerHTML = `
    <button class="pill${state.movementsFilter === 'todos' ? ' active' : ''}" data-filter="todos">Todos</button>
    <button class="pill${state.movementsFilter === 'gasto' ? ' active' : ''}" data-filter="gasto">Gastos</button>
    <button class="pill${state.movementsFilter === 'recebimento' ? ' active' : ''}" data-filter="recebimento">Recebimentos</button>
  `
  target.appendChild(pillBox)

  pillBox.querySelectorAll('.pill').forEach((p) => {
    p.addEventListener('click', (e) => {
      state.movementsFilter = e.target.dataset.filter
      renderApp()
    })
  })

  const block = document.createElement('div')
  block.className = 'card'

  const filtered = allMovements.filter(
    (m) =>
      state.movementsFilter === 'todos' || m.type === state.movementsFilter,
  )

  if (filtered.length === 0) {
    block.innerHTML = `<div class="empty-state"><div class="empty-icon"></div><div class="empty-text">Nenhum lançamento encontrado.</div></div>`
  } else {
    ;[...filtered].reverse().forEach((m) => {
      block.appendChild(createMovementRowElement(m, true))
    })
  }
  target.appendChild(block)
}

function createMovementRowElement(m, showDelete = true) {
  const isIn = m.type === 'recebimento'
  const row = document.createElement('div')
  row.className = 'list-row'
  row.innerHTML = `
    <div class="row-icon-box" style="background-color:${isIn ? 'var(--green-light)' : 'var(--red-light)'}">
      <span class="${isIn ? 'row-arrow-in' : 'row-arrow-out'}"></span>
    </div>
    <div class="row-body">
      <div class="row-title">${m.description || m.category}</div>
      <div class="row-subtitle">${m.category} · ${m.paymentMethod || 'Outros'}</div>
    </div>
    <div class="row-right">
      <div class="row-value" style="color:${isIn ? 'var(--green)' : 'var(--red)'}">
        ${isIn ? '+' : '−'}${fmt(m.value)}
      </div>
      <div class="row-date">${m.date || ''}</div>
    </div>
    ${showDelete ? `<button class="btn-delete-row" data-id="${m.id}" aria-label="Remover lançamento">×</button>` : ''}
  `

  if (showDelete) {
    row.querySelector('.btn-delete-row').addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.id
      const key = monthKey(state.year, state.month)
      state.data.movements[key] = (state.data.movements[key] || []).filter(
        (mv) => mv.id !== id,
      )
      saveState()
      showNotify('Lançamento removido.')
      renderApp()
    })
  }
  return row
}

// ============================================================
// ABA 3: GASTOS FIXOS
// ============================================================
function renderFixed(target) {
  const fixed = getMonthFixed()
  const total = fixed.reduce((a, f) => a + Number(f.value), 0)
  const paid = fixed
    .filter((f) => f.status === 'pago')
    .reduce((a, f) => a + Number(f.value), 0)

  const actionBox = document.createElement('div')
  actionBox.style = 'display:flex; gap:8px; margin-bottom:12px;'
  actionBox.innerHTML = `
    <button id="fixed-add-btn" class="btn btn-primary">+ Adicionar</button>
    <button id="fixed-copy-btn" class="btn btn-secondary">Copiar mês anterior</button>
  `
  target.appendChild(actionBox)

  document
    .getElementById('fixed-add-btn')
    .addEventListener('click', openFixedModal)
  document
    .getElementById('fixed-copy-btn')
    .addEventListener('click', openCopyFixedConfirmation)

  if (fixed.length > 0) {
    const progCard = document.createElement('div')
    progCard.className = 'card'
    progCard.innerHTML = `
      <div style="font-size:12px; color:var(--text-secondary); margin-bottom:4px; letter-spacing:0.01em;">
        Pago: ${fmt(paid)} <span style="color:var(--text-muted);">/ ${fmt(total)}</span>
      </div>
      <div class="progress-container">
        <div class="progress-bar" style="width:${pct(paid, total)}%; background-color:var(--green);"></div>
      </div>
      <div style="font-size:11px; color:var(--text-muted); margin-top:3px;">${pct(paid, total)}% concluído</div>
    `
    target.appendChild(progCard)
  }

  if (fixed.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty-state'
    empty.innerHTML = `<div class="empty-icon"></div><div class="empty-text">Nenhum gasto fixo neste mês.</div>`
    target.appendChild(empty)
    return
  }

  ;[...fixed]
    .sort((a, b) => a.day - b.day)
    .forEach((f) => {
      const card = document.createElement('div')
      card.className = 'card'
      card.innerHTML = `
      <div class="fixed-card-inner">
        <div class="fixed-card-body">
          <div class="fixed-card-name">${f.name}</div>
          <div class="fixed-card-meta">${f.category} · Dia ${f.day}</div>
          <div class="fixed-card-value">${fmt(f.value)}</div>
        </div>
        <div class="fixed-card-actions">
          <button class="btn btn-toggle-status ${f.status === 'pago' ? 'btn-success-light' : 'btn-warning-light'}" data-id="${f.id}" style="padding:5px 12px; font-size:11px; font-weight:600; letter-spacing:0.04em;">
            ${f.status === 'pago' ? 'Pago' : 'Pendente'}
          </button>
          <button class="btn-delete-fixed btn-link" data-id="${f.id}" style="font-size:11px; color:var(--text-muted);">Remover</button>
        </div>
      </div>
    `

      card
        .querySelector('.btn-toggle-status')
        .addEventListener('click', (e) => {
          const id = e.currentTarget.dataset.id
          const key = monthKey(state.year, state.month)
          state.data.fixedExpenses[key] = (
            state.data.fixedExpenses[key] || []
          ).map((exp) =>
            exp.id === id
              ? { ...exp, status: exp.status === 'pago' ? 'pendente' : 'pago' }
              : exp,
          )
          saveState()
          renderApp()
        })

      card.querySelector('.btn-delete-fixed').addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id
        const key = monthKey(state.year, state.month)
        state.data.fixedExpenses[key] = (
          state.data.fixedExpenses[key] || []
        ).filter((exp) => exp.id !== id)
        saveState()
        showNotify('Removido.')
        renderApp()
      })

      target.appendChild(card)
    })
}

// ============================================================
// ABA 4: RESERVAS
// ============================================================
function renderReserves(target) {
  if (state.data.reserves.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty-state'
    empty.innerHTML = `<div class="empty-icon"></div><div class="empty-text">Nenhuma reserva cadastrada.</div>`
    target.appendChild(empty)
    return
  }

  state.data.reserves.forEach((r) => {
    const goalPct = r.goal ? pct(r.current, r.goal) : null
    const card = document.createElement('div')
    card.className = 'card'

    let html = `
      <div class="reserve-header">
        <div>
          <div class="reserve-title">${r.name}</div>
          <div class="reserve-value">${fmt(r.current)}</div>
          ${r.goal > 0 ? `<div class="reserve-meta">Meta: ${fmt(r.goal)}</div>` : ''}
        </div>
        <div class="reserve-actions">
          <button class="btn btn-secondary btn-adjust-trigger" data-id="${r.id}" style="padding:6px 12px; font-size:12px;">Ajustar</button>
          <button class="btn btn-danger btn-delete-reserve" data-id="${r.id}" style="padding:6px 10px; font-size:12px;">×</button>
        </div>
      </div>
    `

    if (goalPct !== null) {
      html += `
        <div class="progress-container" style="margin-top:8px;">
          <div class="progress-bar" style="width:${goalPct}%; background-color:${goalPct >= 100 ? 'var(--green)' : 'var(--accent)'};"></div>
        </div>
        <div style="font-size:11px; color:var(--text-muted); margin-top:3px;">${goalPct}% da meta</div>
      `
    }

    if (state.inlineAdjustReserveId === r.id) {
      html += `
        <div class="inline-adjuster">
          <div class="pill-container" style="margin-bottom:8px;">
            <button class="pill${state.inlineAdjustType === 'add' ? ' active' : ''}" id="pill-adjust-add">+ Depositar</button>
            <button class="pill${state.inlineAdjustType === 'remove' ? ' active' : ''}" id="pill-adjust-remove">− Retirar</button>
          </div>
          <div style="display:flex; gap:8px;">
            <input type="number" id="input-adjust-amount" placeholder="Valor" class="input" style="flex:1; margin-bottom:0;">
            <button id="btn-adjust-confirm" class="btn btn-primary">OK</button>
          </div>
        </div>
      `
    }

    card.innerHTML = html

    card.querySelector('.btn-adjust-trigger').addEventListener('click', () => {
      state.inlineAdjustReserveId =
        state.inlineAdjustReserveId === r.id ? null : r.id
      state.inlineAdjustType = 'add'
      renderApp()
    })

    card.querySelector('.btn-delete-reserve').addEventListener('click', () => {
      state.data.reserves = state.data.reserves.filter((res) => res.id !== r.id)
      saveState()
      showNotify('Reserva removida.')
      renderApp()
    })

    if (state.inlineAdjustReserveId === r.id) {
      card.querySelector('#pill-adjust-add').addEventListener('click', () => {
        state.inlineAdjustType = 'add'
        renderApp()
      })
      card
        .querySelector('#pill-adjust-remove')
        .addEventListener('click', () => {
          state.inlineAdjustType = 'remove'
          renderApp()
        })
      card
        .querySelector('#btn-adjust-confirm')
        .addEventListener('click', () => {
          const val = parseFloat(
            card.querySelector('#input-adjust-amount').value,
          )
          if (!val || val <= 0) return
          const modifier = state.inlineAdjustType === 'add' ? val : -val
          state.data.reserves = state.data.reserves.map((res) =>
            res.id === r.id
              ? { ...res, current: Math.max(0, Number(res.current) + modifier) }
              : res,
          )
          state.inlineAdjustReserveId = null
          saveState()
          showNotify(modifier > 0 ? 'Valor adicionado!' : 'Valor retirado!')
          renderApp()
        })
    }

    target.appendChild(card)
  })
}

// ============================================================
// ABA 5: RELATÓRIOS
// ============================================================
function renderReports(target) {
  const yearMovements = getAllMovementsForYear(state.reportYear)

  const byMonthData = MONTHS.map((name, index) => {
    const ms = yearMovements.filter(
      (m) => new Date((m.date || '') + 'T12:00:00').getMonth() === index,
    )
    const income = ms
      .filter((m) => m.type === 'recebimento')
      .reduce((a, m) => a + Number(m.value), 0)
    const expense = ms
      .filter((m) => m.type === 'gasto')
      .reduce((a, m) => a + Number(m.value), 0)
    return { name: name.slice(0, 3), income, expense }
  })

  const maxMonthValue = Math.max(
    ...byMonthData.map((b) => Math.max(b.income, b.expense)),
    1,
  )

  const catMap = {}
  yearMovements
    .filter((m) => m.type === 'gasto')
    .forEach((m) => {
      catMap[m.category] = (catMap[m.category] || 0) + Number(m.value)
    })
  const byCategorySorted = Object.entries(catMap).sort((a, b) => b[1] - a[1])
  const totalCatValue = byCategorySorted.reduce((a, [, v]) => a + v, 0)

  const payMap = {}
  yearMovements
    .filter((m) => m.type === 'gasto')
    .forEach((m) => {
      payMap[m.paymentMethod || 'Outros'] =
        (payMap[m.paymentMethod || 'Outros'] || 0) + Number(m.value)
    })
  const byPaymentSorted = Object.entries(payMap).sort((a, b) => b[1] - a[1])
  const totalPaymentValue = byPaymentSorted.reduce((a, [, v]) => a + v, 0)

  // Seletor de ano
  const yearSelect = document.createElement('div')
  yearSelect.className = 'report-year-selector'
  yearSelect.innerHTML = `
    <button id="rep-year-prev" class="btn btn-secondary" style="padding:6px 10px;">‹</button>
    <span class="report-year-display">${state.reportYear}</span>
    <button id="rep-year-next" class="btn btn-secondary" style="padding:6px 10px;">›</button>
  `
  target.appendChild(yearSelect)

  document.getElementById('rep-year-prev').addEventListener('click', () => {
    state.reportYear--
    renderApp()
  })
  document.getElementById('rep-year-next').addEventListener('click', () => {
    state.reportYear++
    renderApp()
  })

  // Gráfico evolução
  const graphCard = document.createElement('div')
  graphCard.className = 'card'
  graphCard.innerHTML = `<div class="section-title">Evolução mensal</div>`

  const chartContainer = document.createElement('div')
  chartContainer.className = 'chart-evolution-container'

  byMonthData.forEach((b) => {
    const col = document.createElement('div')
    col.className = 'chart-month-column'
    const incH = (b.income / maxMonthValue) * 60
    const expH = (b.expense / maxMonthValue) * 60
    col.innerHTML = `
      <div class="chart-bar-group">
        <div class="chart-bar" style="height:${incH}px; background-color:${CORES.green};" title="Recebido: ${fmt(b.income)}"></div>
        <div class="chart-bar" style="height:${expH}px; background-color:${CORES.red};" title="Gasto: ${fmt(b.expense)}"></div>
      </div>
      <div class="chart-month-label">${b.name}</div>
    `
    chartContainer.appendChild(col)
  })
  graphCard.appendChild(chartContainer)

  const legend = document.createElement('div')
  legend.className = 'chart-legend'
  legend.innerHTML = `
    <span class="legend-item"><span class="legend-color-box" style="background:${CORES.green};"></span> Recebido</span>
    <span class="legend-item"><span class="legend-color-box" style="background:${CORES.red};"></span> Gasto</span>
  `
  graphCard.appendChild(legend)
  target.appendChild(graphCard)

  // Por categoria
  const catCard = document.createElement('div')
  catCard.className = 'card'
  catCard.innerHTML = `<div class="section-title">Gastos por categoria</div>`

  if (byCategorySorted.length === 0) {
    catCard.innerHTML += `<div class="empty-state"><div class="empty-icon"></div><div class="empty-text">Sem dados.</div></div>`
  } else {
    byCategorySorted.forEach(([cat, val]) => {
      catCard.innerHTML += `
        <div style="margin-bottom:10px;">
          <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:3px;">
            <span style="color:var(--text-secondary);">${cat}</span>
            <span style="font-weight:600;">${fmt(val)}</span>
          </div>
          <div class="progress-container">
            <div class="progress-bar" style="width:${pct(val, totalCatValue)}%; background-color:${CORES.accent};"></div>
          </div>
        </div>
      `
    })
  }
  target.appendChild(catCard)

  // Por forma de pagamento
  const payCard = document.createElement('div')
  payCard.className = 'card'
  payCard.innerHTML = `<div class="section-title">Forma de pagamento</div>`

  if (byPaymentSorted.length === 0) {
    payCard.innerHTML += `<div class="empty-state"><div class="empty-icon"></div><div class="empty-text">Sem dados.</div></div>`
  } else {
    byPaymentSorted.forEach(([method, val]) => {
      payCard.innerHTML += `
        <div style="margin-bottom:10px;">
          <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:3px;">
            <span style="color:var(--text-secondary);">${method}</span>
            <span style="font-weight:600;">${fmt(val)} <span style="color:var(--text-muted); font-weight:400;">(${pct(val, totalPaymentValue)}%)</span></span>
          </div>
          <div class="progress-container">
            <div class="progress-bar" style="width:${pct(val, totalPaymentValue)}%; background-color:${CORES.purple};"></div>
          </div>
        </div>
      `
    })
  }
  target.appendChild(payCard)
}

// ============================================================
// SISTEMA DE MODAIS
// ============================================================
function closeModal() {
  const box = document.getElementById('modal-container')
  box.innerHTML = ''
  box.classList.add('hidden')
}

function initModalFrame(title) {
  const box = document.getElementById('modal-container')
  box.className = 'modal-backdrop'
  box.innerHTML = ''

  const content = document.createElement('div')
  content.className = 'modal-content'
  content.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-header">
      <span class="modal-title">${title}</span>
      <button class="modal-close" id="modal-close-x" aria-label="Fechar">×</button>
    </div>
    <div id="modal-form-body"></div>
  `

  box.appendChild(content)

  // Fechar ao clicar no backdrop
  box.addEventListener('click', (e) => {
    if (e.target === box) closeModal()
  })
  document.getElementById('modal-close-x').addEventListener('click', closeModal)

  return content.querySelector('#modal-form-body')
}

// ============================================================
// MODAL: GERENCIAR CONTAS
// ============================================================
function openAccountModal() {
  const body = initModalFrame('Contas')

  function render() {
    body.innerHTML = `
      <div style="margin-bottom:16px;">
        ${state.data.accounts
          .map((acc) => {
            const bal = getAccountBalance(acc.id)
            return `
            <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 0; border-bottom:1px solid var(--border-color);">
              <div>
                <div style="font-weight:600; font-size:14px;">${acc.name}</div>
                <div style="font-size:12px; color:var(--text-muted);">${fmt(bal)}</div>
              </div>
              ${state.data.accounts.length > 1 ? `<button class="btn btn-danger btn-del-account" data-id="${acc.id}" style="padding:5px 10px; font-size:11px;">Remover</button>` : ''}
            </div>
          `
          })
          .join('')}
      </div>
      <hr class="divider">
      <label class="label">Nova conta</label>
      <input type="text" id="new-account-name" placeholder="Ex: Nubank, Carteira, Investimentos" class="input">
      <button id="btn-create-account" class="btn btn-primary" style="width:100%; padding:12px;">Criar conta</button>
    `

    body.querySelectorAll('.btn-del-account').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id
        if (id === state.data.activeAccountId) {
          showNotify('Não é possível remover a conta ativa.', 'warning')
          return
        }
        state.data.accounts = state.data.accounts.filter((a) => a.id !== id)
        saveState()
        render()
        showNotify('Conta removida.')
      })
    })

    document
      .getElementById('btn-create-account')
      .addEventListener('click', () => {
        const nameEl = document.getElementById('new-account-name')
        const name = nameEl.value.trim()
        if (!name) return
        state.data.accounts.push({ id: uid(), name })
        saveState()
        nameEl.value = ''
        render()
        showNotify('Conta criada!')
      })
  }

  render()
}

// ============================================================
// MODAL: CONFIRMAÇÃO VINCULAR GASTO FIXO
// ============================================================
function openLinkFixedConfirmation(fixedExpense) {
  const body = initModalFrame('Vincular ao gasto fixo?')
  body.innerHTML = `
    <p style="color:var(--text-secondary); font-size:14px; margin-bottom:6px;">
      Este lançamento corresponde ao gasto fixo:
    </p>
    <p style="font-weight:700; font-size:16px; margin-bottom:22px; color:var(--text-primary);">
      ${fixedExpense.name} — ${fmt(fixedExpense.value)}
    </p>
    <div style="display:flex; gap:8px;">
      <button id="btn-link-yes" class="btn btn-primary" style="flex:1; padding:12px;">Marcar como pago</button>
      <button id="btn-link-no" class="btn btn-secondary" style="flex:1; padding:12px;">Não agora</button>
    </div>
  `

  document.getElementById('btn-link-yes').addEventListener('click', () => {
    const key = monthKey(state.year, state.month)
    state.data.fixedExpenses[key] = (state.data.fixedExpenses[key] || []).map(
      (f) => (f.id === fixedExpense.id ? { ...f, status: 'pago' } : f),
    )
    saveState()
    closeModal()
    showNotify('Gasto fixo marcado como pago!')
    renderApp()
  })

  document.getElementById('btn-link-no').addEventListener('click', () => {
    closeModal()
    renderApp()
  })
}

// ============================================================
// MODAL: NOVO LANÇAMENTO
// ============================================================
function openMovementModal() {
  const body = initModalFrame('Novo lançamento')

  let modalState = {
    type: 'gasto',
    category: state.data.categories[0] || '',
    paymentMethod: state.data.paymentMethods[0] || '',
    showCatInput: false,
    showPmInput: false,
  }

  function renderModalForm() {
    const mesPad = String(state.month + 1).padStart(2, '0')
    const diaPad = String(hoje.getDate()).padStart(2, '0')
    const dataDefault = `${state.year}-${mesPad}-${diaPad}`

    body.innerHTML = `
      <div class="pill-container" style="margin-bottom:18px;">
        <button class="pill${modalState.type === 'gasto' ? ' active' : ''}" id="m-pill-gasto">Gasto</button>
        <button class="pill${modalState.type === 'recebimento' ? ' active' : ''}" id="m-pill-recebimento">Recebimento</button>
      </div>

      <label class="label">Valor *</label>
      <input type="number" id="m-input-val" placeholder="0,00" class="input" style="font-size:22px; font-weight:700; letter-spacing:-0.01em;" inputmode="decimal">

      <label class="label">Categoria *</label>
      <select id="m-select-cat" class="input">
        ${state.data.categories.map((c) => `<option value="${c}"${c === modalState.category ? ' selected' : ''}>${c}</option>`).join('')}
      </select>

      <div id="m-cat-custom-box" class="${modalState.showCatInput ? '' : 'hidden'}" style="display:flex; gap:6px; margin-bottom:14px;">
        <input type="text" id="m-input-new-cat" placeholder="Nome da categoria" class="input" style="margin-bottom:0; flex:1;">
        <button id="m-btn-new-cat-ok" class="btn btn-primary">OK</button>
      </div>
      ${!modalState.showCatInput ? `<button id="m-trigger-new-cat" class="btn-link" style="margin-bottom:14px; display:block;">+ Nova categoria</button>` : ''}

      <label class="label">Descrição</label>
      <input type="text" id="m-input-desc" placeholder="Opcional" class="input">

      <label class="label">Forma de pagamento</label>
      <select id="m-select-pm" class="input">
        ${state.data.paymentMethods.map((p) => `<option value="${p}"${p === modalState.paymentMethod ? ' selected' : ''}>${p}</option>`).join('')}
      </select>

      <div id="m-pm-custom-box" class="${modalState.showPmInput ? '' : 'hidden'}" style="display:flex; gap:6px; margin-bottom:14px;">
        <input type="text" id="m-input-new-pm" placeholder="Ex: Débito automático" class="input" style="margin-bottom:0; flex:1;">
        <button id="m-btn-new-pm-ok" class="btn btn-primary">OK</button>
      </div>
      ${!modalState.showPmInput ? `<button id="m-trigger-new-pm" class="btn-link" style="margin-bottom:14px; display:block;">+ Novo método</button>` : ''}

      <label class="label">Conta</label>
      <select id="m-select-account" class="input">
        ${state.data.accounts.map((a) => `<option value="${a.id}"${a.id === state.data.activeAccountId ? ' selected' : ''}>${a.name}</option>`).join('')}
      </select>

      <label class="label">Data *</label>
      <input type="date" id="m-input-date" value="${dataDefault}" class="input" style="margin-bottom:22px;">

      <button id="m-btn-save" class="btn btn-primary" style="width:100%; padding:13px; font-size:14px;">Salvar lançamento</button>
    `

    body.querySelector('#m-pill-gasto').addEventListener('click', () => {
      modalState.type = 'gasto'
      renderModalForm()
    })
    body.querySelector('#m-pill-recebimento').addEventListener('click', () => {
      modalState.type = 'recebimento'
      renderModalForm()
    })

    if (!modalState.showCatInput) {
      body.querySelector('#m-trigger-new-cat').addEventListener('click', () => {
        modalState.showCatInput = true
        renderModalForm()
      })
    }
    if (!modalState.showPmInput) {
      body.querySelector('#m-trigger-new-pm').addEventListener('click', () => {
        modalState.showPmInput = true
        renderModalForm()
      })
    }

    body.querySelector('#m-btn-new-cat-ok').addEventListener('click', () => {
      const val = body.querySelector('#m-input-new-cat').value.trim()
      if (!val) return
      if (!state.data.categories.includes(val)) state.data.categories.push(val)
      modalState.category = val
      modalState.showCatInput = false
      saveState()
      renderModalForm()
    })

    body.querySelector('#m-btn-new-pm-ok').addEventListener('click', () => {
      const val = body.querySelector('#m-input-new-pm').value.trim()
      if (!val) return
      if (!state.data.paymentMethods.includes(val))
        state.data.paymentMethods.push(val)
      modalState.paymentMethod = val
      modalState.showPmInput = false
      saveState()
      renderModalForm()
    })

    body.querySelector('#m-btn-save').addEventListener('click', () => {
      const value = body.querySelector('#m-input-val').value
      const category = body.querySelector('#m-select-cat').value
      const description = body.querySelector('#m-input-desc').value
      const paymentMethod = body.querySelector('#m-select-pm').value
      const date = body.querySelector('#m-input-date').value
      const accountId = body.querySelector('#m-select-account').value

      if (!value || !category || !date) return

      const novoLancamento = {
        id: uid(),
        type: modalState.type,
        value: Number(value),
        category,
        description,
        paymentMethod,
        date,
        accountId,
      }

      const key = monthKey(state.year, state.month)
      if (!state.data.movements[key]) state.data.movements[key] = []
      state.data.movements[key].push(novoLancamento)
      saveState()
      closeModal()
      showNotify('Lançamento salvo!')

      // Sugestão de vincular ao gasto fixo
      const fixedExpenses = getMonthFixed()
      const match = fixedExpenses.find(
        (f) =>
          f.status === 'pendente' &&
          Number(f.value) === Number(novoLancamento.value) &&
          novoLancamento.type === 'gasto',
      )
      if (match) {
        setTimeout(() => openLinkFixedConfirmation(match), 300)
      } else {
        renderApp()
      }
    })
  }

  renderModalForm()
}

// ============================================================
// MODAL: GASTO FIXO
// ============================================================
function openFixedModal() {
  const body = initModalFrame('Gasto fixo')
  let modalState = {
    category: state.data.categories[0] || '',
    showCatInput: false,
  }

  function render() {
    body.innerHTML = `
      <label class="label">Nome *</label>
      <input type="text" id="f-name" placeholder="Ex: Aluguel, Netflix…" class="input">

      <label class="label">Categoria</label>
      <select id="f-select-cat" class="input">
        ${state.data.categories.map((c) => `<option value="${c}"${c === modalState.category ? ' selected' : ''}>${c}</option>`).join('')}
      </select>

      <div id="f-cat-custom-box" class="${modalState.showCatInput ? '' : 'hidden'}" style="display:flex; gap:6px; margin-bottom:14px;">
        <input type="text" id="f-input-new-cat" placeholder="Nome da categoria" class="input" style="margin-bottom:0; flex:1;">
        <button id="f-btn-new-cat-ok" class="btn btn-primary">OK</button>
      </div>
      ${!modalState.showCatInput ? `<button id="f-trigger-new-cat" class="btn-link" style="margin-bottom:14px; display:block;">+ Nova categoria</button>` : ''}

      <label class="label">Valor *</label>
      <input type="number" id="f-value" placeholder="0,00" class="input" inputmode="decimal">

      <label class="label">Dia de vencimento</label>
      <input type="number" id="f-day" min="1" max="31" value="1" class="input">

      <label class="label">Recorrência</label>
      <select class="input" disabled><option>Mensal</option></select>

      <button id="f-btn-save" class="btn btn-primary" style="width:100%; padding:13px; font-size:14px;">Salvar gasto fixo</button>
    `

    if (!modalState.showCatInput) {
      body.querySelector('#f-trigger-new-cat').addEventListener('click', () => {
        modalState.showCatInput = true
        render()
      })
    }

    body.querySelector('#f-btn-new-cat-ok').addEventListener('click', () => {
      const val = body.querySelector('#f-input-new-cat').value.trim()
      if (!val) return
      if (!state.data.categories.includes(val)) state.data.categories.push(val)
      modalState.category = val
      modalState.showCatInput = false
      saveState()
      render()
    })

    body.querySelector('#f-btn-save').addEventListener('click', () => {
      const name = body.querySelector('#f-name').value.trim()
      const value = body.querySelector('#f-value').value
      const day = body.querySelector('#f-day').value
      const category = body.querySelector('#f-select-cat').value
      if (!name || !value) return

      const key = monthKey(state.year, state.month)
      if (!state.data.fixedExpenses[key]) state.data.fixedExpenses[key] = []
      state.data.fixedExpenses[key].push({
        id: uid(),
        name,
        category,
        value: Number(value),
        day: Number(day || 1),
        recurrence: 'mensal',
        month: state.month,
        year: state.year,
        status: 'pendente',
        accountId: state.data.activeAccountId,
      })

      saveState()
      closeModal()
      showNotify('Gasto fixo adicionado!')
      renderApp()
    })
  }

  render()
}

// ============================================================
// MODAL: COPIAR GASTOS FIXOS DO MÊS ANTERIOR
// ============================================================
function openCopyFixedConfirmation() {
  const body = initModalFrame('Copiar gastos fixos')
  const prevM = state.month === 0 ? 11 : state.month - 1
  const prevY = state.month === 0 ? state.year - 1 : state.year

  body.innerHTML = `
    <p style="color:var(--text-secondary); font-size:14px; margin-bottom:22px; line-height:1.5;">
      Copiar todos os gastos fixos de <strong>${MONTHS[prevM]} ${prevY}</strong> para <strong>${MONTHS[state.month]} ${state.year}</strong>?
    </p>
    <button id="btn-confirm-copy" class="btn btn-primary" style="width:100%; padding:13px;">Confirmar cópia</button>
  `

  document.getElementById('btn-confirm-copy').addEventListener('click', () => {
    const prevKey = monthKey(prevY, prevM)
    const prevList = state.data.fixedExpenses[prevKey] || []

    if (!prevList.length) {
      closeModal()
      showNotify('Nenhum gasto fixo no mês anterior.', 'warning')
      return
    }

    const currKey = monthKey(state.year, state.month)
    const existing = state.data.fixedExpenses[currKey] || []
    const newOnes = prevList.map((f) => ({
      ...f,
      id: uid(), // novo id para evitar colisão
      month: state.month,
      year: state.year,
      status: 'pendente',
    }))

    state.data.fixedExpenses[currKey] = [...existing, ...newOnes]
    saveState()
    closeModal()
    showNotify(`${prevList.length} gasto(s) copiado(s)!`)
    renderApp()
  })
}

// ============================================================
// MODAL: NOVA RESERVA
// ============================================================
function openReserveModal() {
  const body = initModalFrame('Nova reserva')
  body.innerHTML = `
    <label class="label">Nome *</label>
    <input type="text" id="r-name" placeholder="Ex: Fundo de emergência" class="input">

    <label class="label">Valor inicial</label>
    <input type="number" id="r-initial" placeholder="0,00" class="input" inputmode="decimal">

    <label class="label">Meta (opcional)</label>
    <input type="number" id="r-goal" placeholder="Ex: 5000" class="input" style="margin-bottom:22px;" inputmode="decimal">

    <button id="r-btn-save" class="btn btn-primary" style="width:100%; padding:13px; font-size:14px;">Criar reserva</button>
  `

  document.getElementById('r-btn-save').addEventListener('click', () => {
    const name = document.getElementById('r-name').value.trim()
    const initial = document.getElementById('r-initial').value
    const goal = document.getElementById('r-goal').value
    if (!name) return

    state.data.reserves.push({
      id: uid(),
      name,
      goal: goal ? Number(goal) : 0,
      current: initial ? Number(initial) : 0,
    })

    saveState()
    closeModal()
    showNotify('Reserva criada!')
    renderApp()
  })
}

// ============================================================
// EVENTOS GLOBAIS
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  loadState()

  // Garante que accounts exista (compatibilidade)
  if (!state.data.accounts || !state.data.accounts.length) {
    state.data.accounts = [{ id: 'default', name: 'Conta Principal' }]
    state.data.activeAccountId = 'default'
  }

  // Navegação de mês
  document.getElementById('btn-prev-month').addEventListener('click', () => {
    if (state.month === 0) {
      state.month = 11
      state.year--
    } else state.month--
    state.inlineAdjustReserveId = null
    renderApp()
  })

  document.getElementById('btn-next-month').addEventListener('click', () => {
    if (state.month === 11) {
      state.month = 0
      state.year++
    } else state.month++
    state.inlineAdjustReserveId = null
    renderApp()
  })

  // Navegação inferior
  document.querySelectorAll('.bottom-nav .nav-item').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      state.tab = e.currentTarget.dataset.tab
      state.accountDropdownOpen = false
      renderApp()
    })
  })

  // FAB
  document.getElementById('global-fab').addEventListener('click', () => {
    if (state.tab === 'movements') openMovementModal()
    if (state.tab === 'fixed') openFixedModal()
    if (state.tab === 'reserves') openReserveModal()
  })

  // Toggle dropdown de contas
  document
    .getElementById('btn-account-toggle')
    .addEventListener('click', (e) => {
      e.stopPropagation()
      state.accountDropdownOpen = !state.accountDropdownOpen
      renderApp()
    })

  // Botão de gerenciar contas (ícone +)
  document
    .getElementById('btn-manage-accounts')
    .addEventListener('click', () => {
      state.accountDropdownOpen = false
      openAccountModal()
    })

  // Fecha dropdown ao clicar fora
  document.addEventListener('click', (e) => {
    if (state.accountDropdownOpen) {
      state.accountDropdownOpen = false
      renderApp()
    }
  })

  renderApp()
})
