// ==========================================
// CONSTANTES GLOBAIS DE CONFIGURAÇÃO
// ==========================================
const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const PAYMENT_METHODS_DEFAULT = [
  "Pix",
  "Dinheiro",
  "Cartão de Crédito",
  "Cartão de Débito",
  "Outros",
];
const CATEGORIES_DEFAULT = [
  "Alimentação",
  "Transporte",
  "Saúde",
  "Lazer",
  "Educação",
  "Moradia",
  "Roupas",
  "Serviços",
  "Outros",
];

// Cores para controle dinâmico via JS
const CORES = {
  accent: "#2563eb",
  accentLight: "#eff6ff",
  green: "#16a34a",
  greenLight: "#f0fdf4",
  red: "#dc2626",
  redLight: "#fef2f2",
  yellow: "#ca8a04",
  yellowLight: "#fefce8",
};

const hoje = new Date();

// ==========================================
// ESTADO GLOBAL DA APLICAÇÃO (Estado Reativo)
// ==========================================
let state = {
  data: {
    movements: [],
    fixedExpenses: [],
    reserves: [],
    categories: [...CATEGORIES_DEFAULT],
    paymentMethods: [...PAYMENT_METHODS_DEFAULT],
  },
  tab: "dashboard",
  month: hoje.getMonth(),
  year: hoje.getFullYear(),
  reportYear: hoje.getFullYear(),
  movementsFilter: "todos",
  inlineAdjustReserveId: null,
  inlineAdjustType: "add",
};

// ==========================================
// UTILITÁRIOS E FORMATADORES
// ==========================================
function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function fmt(v) {
  return Number(v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function pct(v, total) {
  if (!total) return 0;
  return Math.min(100, Math.round((v / total) * 100));
}

// ==========================================
// PERSISTÊNCIA (LOCALSTORAGE)
// ==========================================
function loadState() {
  try {
    const localData = localStorage.getItem("financas_v1");
    if (localData) {
      state.data = JSON.parse(localData);
    }
  } catch (e) {
    console.error("Erro ao carregar dados do localStorage", e);
  }
}

function saveState() {
  try {
    localStorage.setItem("financas_v1", JSON.stringify(state.data));
  } catch (e) {
    console.error("Erro ao salvar dados no localStorage", e);
  }
}

// ==========================================
// MECANISMO DE SELETORES CALCULADOS (useMemo)
// ==========================================
function getMonthMovements() {
  return state.data.movements.filter((m) => {
    const d = new Date(m.date + "T12:00:00");
    return d.getMonth() === state.month && d.getFullYear() === state.year;
  });
}

function getMonthFixed() {
  return state.data.fixedExpenses.filter(
    (f) => f.month === state.month && f.year === state.year,
  );
}

function calculateTotals() {
  const movements = getMonthMovements();
  const totalIn = movements
    .filter((m) => m.type === "recebimento")
    .reduce((a, m) => a + Number(m.value), 0);
  const totalOut = movements
    .filter((m) => m.type === "gasto")
    .reduce((a, m) => a + Number(m.value), 0);
  const totalReserved = state.data.reserves.reduce(
    (a, r) => a + Number(r.current),
    0,
  );

  const fixed = getMonthFixed();
  const pendingFixed = fixed.filter((f) => f.status === "pendente");

  return { totalIn, totalOut, totalReserved, pendingFixed };
}

// ==========================================
// NOTIFICAÇÕES (TOAST)
// ==========================================
function showNotify(msg, type = "success") {
  const toast = document.getElementById("notification-toast");
  toast.innerText = msg;
  toast.className = `notification ${type}`;

  setTimeout(() => {
    toast.className = "notification hidden";
  }, 2600);
}

// ==========================================
// RENDERIZAÇÃO DAS ABAS PRINCIPAIS
// ==========================================
function renderApp() {
  // Sincroniza Exibição de Data do Topo
  document.getElementById("current-date-display").innerText =
    `${MONTHS[state.month]} ${state.year}`;

  // Atualiza Menu Inferior Ativo
  document.querySelectorAll(".nav-item").forEach((btn) => {
    if (btn.dataset.tab === state.tab) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  // Controla Visibilidade e Ação do FAB Lateral
  const fab = document.getElementById("global-fab");
  if (["movements", "fixed", "reserves"].includes(state.tab)) {
    fab.classList.remove("hidden");
  } else {
    fab.classList.add("hidden");
  }

  // Direciona Renderização pelo ID da Aba Ativa
  const container = document.getElementById("main-content");
  container.innerHTML = "";

  switch (state.tab) {
    case "dashboard":
      renderDashboard(container);
      break;
    case "movements":
      renderMovements(container);
      break;
    case "fixed":
      renderFixed(container);
      break;
    case "reserves":
      renderReserves(container);
      break;
    case "reports":
      renderReports(container);
      break;
  }
}

// --- ABA 1: DASHBOARD ---
function renderDashboard(target) {
  const totals = calculateTotals();

  // 1. Calcula o dinheiro real que está na sua conta bancária agora
  const saldoEmConta = totals.totalIn - totals.totalOut;

  // 2. Calcula o novo "Saldo Disponível" (Tira as reservas da conta)
  const saldoDisponivel = saldoEmConta - totals.totalReserved;

  const currentMonthMovements = getMonthMovements();

  // Cards Superiores Informativos Atualizados
  const grid = document.createElement("div");
  grid.className = "summary-grid";
  grid.innerHTML = `
        <div class="summary-card" style="background-color: ${saldoEmConta >= 0 ? CORES.greenLight : CORES.redLight}; color: ${saldoEmConta >= 0 ? CORES.green : CORES.red}">
            <div class="summary-label">Saldo na Conta</div>
            <div class="summary-value">${fmt(saldoEmConta)}</div>
        </div>
        <div class="summary-card" style="background-color: ${saldoDisponivel >= 0 ? CORES.accentLight : CORES.redLight}; color: ${saldoDisponivel >= 0 ? CORES.accent : CORES.red}">
            <div class="summary-label">Pode Gastar</div>
            <div class="summary-value">${fmt(saldoDisponivel)}</div>
        </div>
        <div class="summary-card" style="background-color: ${CORES.yellowLight}; color: #854d0e">
            <div class="summary-label">Reservado</div>
            <div class="summary-value">${fmt(totals.totalReserved)}</div>
        </div>
        <div class="summary-card" style="background-color: ${CORES.redLight}; color: ${CORES.red}">
            <div class="summary-label">Gasto no Mês</div>
            <div class="summary-value">${fmt(totals.totalOut)}</div>
        </div>
    `;
  target.appendChild(grid);

  // Alertas de Despesas Fixas Pendentes
  if (totals.pendingFixed.length > 0) {
    const upcoming = [...totals.pendingFixed]
      .sort((a, b) => a.day - b.day)
      .slice(0, 5);
    const banner = document.createElement("div");
    banner.className = "card alert-banner";

    let bannerHtml = `<div class="alert-title">⏰ ${totals.pendingFixed.length} gasto(s) fixo(s) pendente(s)</div>`;
    upcoming.forEach((f) => {
      bannerHtml += `
                <div class="alert-row">
                    <span>Dia ${f.day} — ${f.name}</span>
                    <strong>${fmt(f.value)}</strong>
                </div>
            `;
    });
    banner.innerHTML = bannerHtml;
    target.appendChild(banner);
  }

  // Seção de Últimos Lançamentos
  const block = document.createElement("div");
  block.className = "card";

  const blockHeader = document.createElement("div");
  blockHeader.style =
    "display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;";
  blockHeader.innerHTML = `
        <span style="font-weight: 600; font-size: 15px;">Últimos lançamentos</span>
        <button id="dash-new-mov" class="btn btn-primary" style="padding: 6px 14px; font-size: 13px;">+ Novo</button>
    `;
  block.appendChild(blockHeader);

  if (currentMonthMovements.length === 0) {
    block.innerHTML += `
            <div class="empty-state">
                <div class="empty-icon">📝</div>
                <div class="empty-text">Nenhum lançamento neste mês.</div>
            </div>
        `;
  } else {
    const listWrapper = document.createElement("div");
    const recent = [...currentMonthMovements].reverse().slice(0, 6);
    recent.forEach((m) => {
      listWrapper.appendChild(createMovementRowElement(m, false));
    });
    block.appendChild(listWrapper);
  }

  target.appendChild(block);
  document
    .getElementById("dash-new-mov")
    .addEventListener("click", () => openMovementModal());
}

// --- ABA 2: LANÇAMENTOS ---
function renderMovements(target) {
  const movements = getMonthMovements();

  const pillBox = document.createElement("div");
  pillBox.className = "pill-container";
  pillBox.innerHTML = `
        <button class="pill ${state.movementsFilter === "todos" ? "active" : ""}" data-filter="todos">Todos</button>
        <button class="pill ${state.movementsFilter === "gasto" ? "active" : ""}" data-filter="gasto">Gastos</button>
        <button class="pill ${state.movementsFilter === "recebimento" ? "active" : ""}" data-filter="recebimento">Recebimentos</button>
    `;
  target.appendChild(pillBox);

  pillBox.querySelectorAll(".pill").forEach((p) => {
    p.addEventListener("click", (e) => {
      state.movementsFilter = e.target.dataset.filter;
      renderApp();
    });
  });

  const block = document.createElement("div");
  block.className = "card";

  const filtered = movements.filter(
    (m) =>
      state.movementsFilter === "todos" || m.type === state.movementsFilter,
  );

  if (filtered.length === 0) {
    block.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">💸</div>
                <div class="empty-text">Nenhum lançamento encontrado.</div>
            </div>
        `;
  } else {
    const items = [...filtered].reverse();
    items.forEach((m) => {
      block.appendChild(createMovementRowElement(m, true));
    });
  }
  target.appendChild(block);
}

function createMovementRowElement(m, showDelete = true) {
  const isIn = m.type === "recebimento";
  const row = document.createElement("div");
  row.className = "list-row";
  row.innerHTML = `
        <div class="row-icon-box flex-center" style="background-color: ${isIn ? CORES.greenLight : CORES.redLight}">
            ${isIn ? "⬆️" : "⬇️"}
        </div>
        <div class="row-body">
            <div class="row-title">${m.description || m.category}</div>
            <div class="row-subtitle">${m.category} · ${m.paymentMethod || "Outros"}</div>
        </div>
        <div class="row-right">
            <div class="row-value" style="color: ${isIn ? CORES.green : CORES.red}">
                ${isIn ? "+" : "-"}${fmt(m.value)}
            </div>
            <div class="row-date">${m.date}</div>
        </div>
        ${showDelete ? `<button class="btn-delete-row" data-id="${m.id}">×</button>` : ""}
    `;

  if (showDelete) {
    row.querySelector(".btn-delete-row").addEventListener("click", (e) => {
      const id = e.target.dataset.id;
      state.data.movements = state.data.movements.filter(
        (mov) => mov.id !== id,
      );
      saveState();
      showNotify("Lançamento removido.");
      renderApp();
    });
  }
  return row;
}

// --- ABA 3: GASTOS FIXOS ---
function renderFixed(target) {
  const fixed = getMonthFixed();
  const total = fixed.reduce((a, f) => a + Number(f.value), 0);
  const paid = fixed
    .filter((f) => f.status === "pago")
    .reduce((a, f) => a + Number(f.value), 0);

  const actionBox = document.createElement("div");
  actionBox.style = "display: flex; gap: 8px; margin-bottom: 12px;";
  actionBox.innerHTML = `
        <button id="fixed-add-btn" class="btn btn-primary">+ Adicionar</button>
        <button id="fixed-copy-btn" class="btn btn-secondary">Copiar mês anterior</button>
    `;
  target.appendChild(actionBox);

  document
    .getElementById("fixed-add-btn")
    .addEventListener("click", () => openFixedModal());
  document
    .getElementById("fixed-copy-btn")
    .addEventListener("click", () => openCopyFixedConfirmation());

  if (fixed.length > 0) {
    const progCard = document.createElement("div");
    progCard.className = "card";
    progCard.innerHTML = `
            <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 4px;">
                Pago: ${fmt(paid)} / ${fmt(total)}
            </div>
            <div class="progress-container">
                <div class="progress-bar" style="width: ${pct(paid, total)}%; background-color: ${CORES.green};"></div>
            </div>
            <div style="font-size: 12px; color: var(--text-muted);">${pct(paid, total)}% concluído</div>
        `;
    target.appendChild(progCard);
  }

  if (fixed.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `
            <div class="empty-icon">📋</div>
            <div class="empty-text">Nenhum gasto fixo neste mês.</div>
        `;
    target.appendChild(empty);
  } else {
    const list = [...fixed].sort((a, b) => a.day - b.day);
    list.forEach((f) => {
      const card = document.createElement("div");
      card.className = "card";
      card.style = "display: flex; align-items: center; gap: 12px;";
      card.innerHTML = `
                <div style="flex: 1;">
                    <div style="font-weight: 600; font-size: 14px;">${f.name}</div>
                    <div style="font-size: 12px; color: var(--text-muted);">${f.category} · Dia ${f.day}</div>
                    <div style="font-size: 15px; font-weight: 700; margin-top: 2px;">${fmt(f.value)}</div>
                </div>
                <div style="display: flex; flexDirection: column; align-items: flex-end; gap: 6px; text-align: right;">
                    <button class="btn btn-toggle-status ${f.status === "pago" ? "btn-success-light" : "btn-warning-light"}" data-id="${f.id}" style="padding: 5px 12px; font-size: 12px;">
                        ${f.status === "pago" ? "✓ Pago" : "Pendente"}
                    </button>
                    <button class="btn-delete-fixed" data-id="${f.id}" style="background:none; border:none; cursor:pointer; color:var(--border-color); font-size:18px;">×</button>
                </div>
            `;

      card
        .querySelector(".btn-toggle-status")
        .addEventListener("click", (e) => {
          const id = e.target.dataset.id;
          state.data.fixedExpenses = state.data.fixedExpenses.map((exp) =>
            exp.id === id
              ? { ...exp, status: exp.status === "pago" ? "pendente" : "pago" }
              : exp,
          );
          saveState();
          renderApp();
        });

      card.querySelector(".btn-delete-fixed").addEventListener("click", (e) => {
        const id = e.target.dataset.id;
        state.data.fixedExpenses = state.data.fixedExpenses.filter(
          (exp) => exp.id !== id,
        );
        saveState();
        showNotify("Removido.");
        renderApp();
      });

      target.appendChild(card);
    });
  }
}

// --- ABA 4: RESERVAS ---
function renderReserves(target) {
  if (state.data.reserves.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `
            <div class="empty-icon">🏦</div>
            <div class="empty-text">Nenhuma reserva cadastrada.</div>
        `;
    target.appendChild(empty);
    return;
  }

  state.data.reserves.forEach((r) => {
    const goalPct = r.goal ? pct(r.current, r.goal) : null;
    const card = document.createElement("div");
    card.className = "card";

    let html = `
            <div class="reserve-header">
                <div>
                    <div class="reserve-title">${r.name}</div>
                    <div class="reserve-value">${fmt(r.current)}</div>
                    ${r.goal > 0 ? `<div class="reserve-meta">Meta: ${fmt(r.goal)}</div>` : ""}
                </div>
                <div class="reserve-actions">
                    <button class="btn btn-secondary btn-adjust-trigger" data-id="${r.id}" style="padding: 6px 12px; font-size: 13px;">Ajustar</button>
                    <button class="btn btn-danger btn-delete-reserve" data-id="${r.id}" style="padding: 6px 10px; font-size: 13px;">×</button>
                </div>
            </div>
        `;

    if (goalPct !== null) {
      html += `
                <div class="progress-container" style="margin-top: 8px;">
                    <div class="progress-bar" style="width: ${goalPct}%; background-color: ${goalPct >= 100 ? CORES.green : CORES.accent};"></div>
                </div>
                <div style="font-size: 12px; color: var(--text-muted);">${goalPct}% da meta</div>
            `;
    }

    // Lógica de Renderização do Ajustador Inline
    if (state.inlineAdjustReserveId === r.id) {
      html += `
                <div class="inline-adjuster">
                    <div class="pill-container" style="margin-bottom: 8px;">
                        <button class="pill ${state.inlineAdjustType === "add" ? "active" : ""}" id="pill-adjust-add">+ Depositar</button>
                        <button class="pill ${state.inlineAdjustType === "remove" ? "active" : ""}" id="pill-adjust-remove">− Retirar</button>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <input type="number" id="input-adjust-amount" placeholder="Valor" class="input" style="flex:1; margin-bottom:0;">
                        <button id="btn-adjust-confirm" class="btn btn-primary">OK</button>
                    </div>
                </div>
            `;
    }

    card.innerHTML = html;

    // Eventos das Ações das Reservas
    card.querySelector(".btn-adjust-trigger").addEventListener("click", () => {
      if (state.inlineAdjustReserveId === r.id) {
        state.inlineAdjustReserveId = null;
      } else {
        state.inlineAdjustReserveId = r.id;
        state.inlineAdjustType = "add";
      }
      renderApp();
    });

    card.querySelector(".btn-delete-reserve").addEventListener("click", () => {
      state.data.reserves = state.data.reserves.filter(
        (res) => res.id !== r.id,
      );
      saveState();
      showNotify("Reserva removida.");
      renderApp();
    });

    if (state.inlineAdjustReserveId === r.id) {
      card.querySelector("#pill-adjust-add").addEventListener("click", () => {
        state.inlineAdjustType = "add";
        renderApp();
      });
      card
        .querySelector("#pill-adjust-remove")
        .addEventListener("click", () => {
          state.inlineAdjustType = "remove";
          renderApp();
        });
      card
        .querySelector("#btn-adjust-confirm")
        .addEventListener("click", () => {
          const amountInput = card.querySelector("#input-adjust-amount");
          const val = parseFloat(amountInput.value);
          if (!val || val <= 0) return;

          const modifier = state.inlineAdjustType === "add" ? val : -val;

          state.data.reserves = state.data.reserves.map((res) =>
            res.id === r.id
              ? { ...res, current: Math.max(0, Number(res.current) + modifier) }
              : res,
          );

          state.inlineAdjustReserveId = null;
          saveState();
          showNotify(modifier > 0 ? "Valor adicionado!" : "Valor retirado!");
          renderApp();
        });
    }

    target.appendChild(card);
  });
}

// --- ABA 5: RELATÓRIOS ---
function renderReports(target) {
  // Computação de Dados Anuais Agrupados (Simulação de useMemo)
  const yearMovements = state.data.movements.filter((m) => {
    return new Date(m.date + "T12:00:00").getFullYear() === state.reportYear;
  });

  const byMonthData = MONTHS.map((name, index) => {
    const ms = yearMovements.filter(
      (m) => new Date(m.date + "T12:00:00").getMonth() === index,
    );
    const income = ms
      .filter((m) => m.type === "recebimento")
      .reduce((a, m) => a + Number(m.value), 0);
    const expense = ms
      .filter((m) => m.type === "gasto")
      .reduce((a, m) => a + Number(m.value), 0);
    return { name: name.slice(0, 3), income, expense };
  });

  const maxMonthValue = Math.max(
    ...byMonthData.map((b) => Math.max(b.income, b.expense)),
    1,
  );

  // Agrupamento por Categoria
  const catMap = {};
  yearMovements
    .filter((m) => m.type === "gasto")
    .forEach((m) => {
      catMap[m.category] = (catMap[m.category] || 0) + Number(m.value);
    });
  const byCategorySorted = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
  const totalCatValue = byCategorySorted.reduce((a, [, v]) => a + v, 0);

  // Agrupamento por Forma de Pagamento
  const payMap = {};
  yearMovements
    .filter((m) => m.type === "gasto")
    .forEach((m) => {
      payMap[m.paymentMethod || "Outros"] =
        (payMap[m.paymentMethod || "Outros"] || 0) + Number(m.value);
    });
  const byPaymentSorted = Object.entries(payMap).sort((a, b) => b[1] - a[1]);
  const totalPaymentValue = byPaymentSorted.reduce((a, [, v]) => a + v, 0);

  // Renderização do Seletor de Ano
  const yearSelect = document.createElement("div");
  yearSelect.className = "report-year-selector";
  yearSelect.innerHTML = `
        <button id="rep-year-prev" class="btn btn-secondary" style="padding: 6px 10px;">‹</button>
        <span class="report-year-display">${state.reportYear}</span>
        <button id="rep-year-next" class="btn btn-secondary" style="padding: 6px 10px;">›</button>
    `;
  target.appendChild(yearSelect);

  document.getElementById("rep-year-prev").addEventListener("click", () => {
    state.reportYear--;
    renderApp();
  });
  document.getElementById("rep-year-next").addEventListener("click", () => {
    state.reportYear++;
    renderApp();
  });

  // Painel 1: Evolução Mensal Gráfica
  const graphCard = document.createElement("div");
  graphCard.className = "card";
  graphCard.innerHTML = `<div style="font-weight: 600; font-size: 15px; margin-bottom: 12px;">Evolução mensal</div>`;

  const chartContainer = document.createElement("div");
  chartContainer.className = "chart-evolution-container";

  byMonthData.forEach((b) => {
    const col = document.createElement("div");
    col.className = "chart-month-column";

    const incHeight = (b.income / maxMonthValue) * 60;
    const expHeight = (b.expense / maxMonthValue) * 60;

    col.innerHTML = `
            <div class="chart-bar-group">
                <div class="chart-bar" style="height: ${incHeight}px; background-color: ${CORES.green};" title="Recebido: ${fmt(b.income)}"></div>
                <div class="chart-bar" style="height: ${expHeight}px; background-color: ${CORES.red};" title="Gasto: ${fmt(b.expense)}"></div>
            </div>
            <div class="chart-month-label">${b.name}</div>
        `;
    chartContainer.appendChild(col);
  });
  graphCard.appendChild(chartContainer);
  graphCard.innerHTML += `
        <div class="chart-legend">
            <span class="legend-item"><span class="legend-color-box" style="background-color: ${CORES.green};"></span> Recebido</span>
            <span class="legend-item"><span class="legend-color-box" style="background-color: ${CORES.red};"></span> Gasto</span>
        </div>
    `;
  target.appendChild(graphCard);

  // Painel 2: Distribuição por Categorias
  const catCard = document.createElement("div");
  catCard.className = "card";
  catCard.innerHTML = `<div style="font-weight: 600; font-size: 15px; margin-bottom: 12px;">Gastos por categoria</div>`;

  if (byCategorySorted.length === 0) {
    catCard.innerHTML += `<div class="empty-state"><div class="empty-icon">📂</div><div class="empty-text">Sem dados.</div></div>`;
  } else {
    byCategorySorted.forEach(([cat, val]) => {
      catCard.innerHTML += `
                <div style="margin-bottom: 10px;">
                    <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 3px;">
                        <span style="color: var(--text-secondary);">${cat}</span>
                        <span style="font-weight: 600;">${fmt(val)}</span>
                    </div>
                    <div class="progress-container">
                        <div class="progress-bar" style="width: ${pct(val, totalCatValue)}%; background-color: ${CORES.accent};"></div>
                    </div>
                </div>
            `;
    });
  }
  target.appendChild(catCard);

  // Painel 3: Distribuição por Forma de Pagamento
  const payCard = document.createElement("div");
  payCard.className = "card";
  payCard.innerHTML = `<div style="font-weight: 600; font-size: 15px; margin-bottom: 12px;">Forma de pagamento</div>`;

  if (byPaymentSorted.length === 0) {
    payCard.innerHTML += `<div class="empty-state"><div class="empty-icon">💳</div><div class="empty-text">Sem dados.</div></div>`;
  } else {
    byPaymentSorted.forEach(([method, val]) => {
      payCard.innerHTML += `
                <div style="margin-bottom: 10px;">
                    <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 3px;">
                        <span style="color: var(--text-secondary);">${method}</span>
                        <span style="font-weight: 600;">${fmt(val)} <span style="color: var(--text-muted); font-weight: 400;">(${pct(val, totalPaymentValue)}%)</span></span>
                    </div>
                    <div class="progress-container">
                        <div class="progress-bar" style="width: ${pct(val, totalPaymentValue)}%; background-color: #7c3aed;"></div>
                    </div>
                </div>
            `;
    });
  }
  target.appendChild(payCard);
}

// ==========================================
// CONTROLADOR DOS MODAIS DA APLICAÇÃO
// ==========================================
function closeModal() {
  const box = document.getElementById("modal-container");
  box.innerHTML = "";
  box.classList.add("hidden");
}

function initModalFrame(title) {
  const box = document.getElementById("modal-container");
  box.className = "modal-backdrop";
  box.innerHTML = "";

  const content = document.createElement("div");
  content.className = "modal-content";

  content.innerHTML = `
        <div class="modal-header">
            <span class="modal-title">${title}</span>
            <button class="modal-close" id="modal-close-x">×</button>
        </div>
        <div id="modal-form-body"></div>
    `;

  box.appendChild(content);
  document
    .getElementById("modal-close-x")
    .addEventListener("click", closeModal);
  return content.querySelector("#modal-form-body");
}

// --- MODAL: LANÇAMENTOS ---
function openMovementModal() {
  const body = initModalFrame("Novo lançamento");

  let modalState = {
    type: "gasto",
    category: state.data.categories[0] || "",
    paymentMethod: state.data.paymentMethods[0] || "",
    showCatInput: false,
    showPmInput: false,
  };

  function renderModalForm() {
    const mesPad = String(state.month + 1).padStart(2, "0");
    const diaPad = String(hoje.getDate()).padStart(2, "0");
    const dataDefault = `${state.year}-${mesPad}-${diaPad}`;

    body.innerHTML = `
            <div class="pill-container" style="margin-bottom: 18px;">
                <button class="pill ${modalState.type === "gasto" ? "active" : ""}" id="m-pill-gasto">⬇️ Gasto</button>
                <button class="pill ${modalState.type === "recebimento" ? "active" : ""}" id="m-pill-recebimento">⬆️ Recebimento</button>
            </div>

            <label class="label">Valor *</label>
            <input type="number" id="m-input-val" placeholder="0,00" class="input" style="font-size: 22px; font-weight: 600;">

            <label class="label">Categoria *</label>
            <select id="m-select-cat" class="input">
                ${state.data.categories.map((c) => `<option value="${c}" ${c === modalState.category ? "selected" : ""}>${c}</option>`).join("")}
            </select>
            
            <div id="m-cat-custom-box" class="hidden" style="display: flex; gap: 6px; margin-bottom: 14px;">
                <input type="text" id="m-input-new-cat" placeholder="Nome da categoria" class="input" style="margin-bottom:0; flex:1;">
                <button id="m-btn-new-cat-ok" class="btn btn-primary">OK</button>
            </div>
            <button id="m-trigger-new-cat" class="btn-link" style="background:none; border:none; color:var(--accent); font-size:13px; cursor:pointer; padding:0; margin-bottom:14px; display:block;">+ Nova categoria</button>

            <label class="label">Descrição</label>
            <input type="text" id="m-input-desc" placeholder="Opcional" class="input">

            <label class="label">Forma de pagamento</label>
            <select id="m-select-pm" class="input">
                ${state.data.paymentMethods.map((p) => `<option value="${p}" ${p === modalState.paymentMethod ? "selected" : ""}>${p}</option>`).join("")}
            </select>

            <div id="m-pm-custom-box" class="hidden" style="display: flex; gap: 6px; margin-bottom: 14px;">
                <input type="text" id="m-input-new-pm" placeholder="Ex: Transferência" class="input" style="margin-bottom:0; flex:1;">
                <button id="m-btn-new-pm-ok" class="btn btn-primary">OK</button>
            </div>
            <button id="m-trigger-new-pm" class="btn-link" style="background:none; border:none; color:var(--accent); font-size:13px; cursor:pointer; padding:0; margin-bottom:14px; display:block;">+ Novo método</button>

            <label class="label">Data *</label>
            <input type="date" id="m-input-date" value="${dataDefault}" class="input" style="margin-bottom: 20px;">

            <button id="m-btn-save" class="btn btn-primary" style="width: 100%; padding: 13px;">Salvar lançamento</button>
        `;

    // Eventos dos botões de tipo
    body.querySelector("#m-pill-gasto").addEventListener("click", () => {
      modalState.type = "gasto";
      renderModalForm();
    });
    body.querySelector("#m-pill-recebimento").addEventListener("click", () => {
      modalState.type = "recebimento";
      renderModalForm();
    });

    // Gerenciamento de Sub-inputs Customizados (Categorias / Métodos)
    if (modalState.showCatInput) {
      body.querySelector("#m-cat-custom-box").classList.remove("hidden");
      body.querySelector("#m-trigger-new-cat").classList.add("hidden");
    }
    if (modalState.showPmInput) {
      body.querySelector("#m-pm-custom-box").classList.remove("hidden");
      body.querySelector("#m-trigger-new-pm").classList.add("hidden");
    }

    body.querySelector("#m-trigger-new-cat").addEventListener("click", () => {
      modalState.showCatInput = true;
      renderModalForm();
    });
    body.querySelector("#m-trigger-new-pm").addEventListener("click", () => {
      modalState.showPmInput = true;
      renderModalForm();
    });

    body.querySelector("#m-btn-new-cat-ok").addEventListener("click", () => {
      const val = body.querySelector("#m-input-new-cat").value.trim();
      if (!val) return;
      if (!state.data.categories.includes(val)) {
        state.data.categories.push(val);
        saveState();
      }
      modalState.category = val;
      modalState.showCatInput = false;
      renderModalForm();
    });

    body.querySelector("#m-btn-new-pm-ok").addEventListener("click", () => {
      const val = body.querySelector("#m-input-new-pm").value.trim();
      if (!val) return;
      if (!state.data.paymentMethods.includes(val)) {
        state.data.paymentMethods.push(val);
        saveState();
      }
      modalState.paymentMethod = val;
      modalState.showPmInput = false;
      renderModalForm();
    });

    // Evento de Gravação do Formulário Principal
    body.querySelector("#m-btn-save").addEventListener("click", () => {
      const value = body.querySelector("#m-input-val").value;
      const category = body.querySelector("#m-select-cat").value;
      const description = body.querySelector("#m-input-desc").value;
      const paymentMethod = body.querySelector("#m-select-pm").value;
      const date = body.querySelector("#m-input-date").value;

      if (!value || !category || !date) return;

      const novoLancamento = {
        id: uid(),
        type: modalState.type,
        value: Number(value),
        category,
        description,
        paymentMethod,
        date,
      };

      state.data.movements.push(novoLancamento);
      saveState();
      closeModal();
      showNotify("Lançamento salvo!");

      // Validação de Vinculação Inteligente Automática com Despesas Fixas
      const fixedExpenses = getMonthFixed();
      const match = fixedExpenses.find(
        (f) =>
          f.status === "pendente" &&
          Number(f.value) === Number(novoLancamento.value) &&
          novoLancamento.type === "gasto",
      );

      if (match) {
        setTimeout(() => openLinkFixedConfirmation(match), 300);
      } else {
        renderApp();
      }
    });
  }

  renderModalForm();
}

// --- CONFIRMAÇÃO EXTRA: VINCULAR GASTO FIXO ---
function openLinkFixedConfirmation(fixedExpense) {
  const body = initModalFrame("Marcar gasto fixo como pago?");
  body.innerHTML = `
        <p style="color: var(--text-secondary); font-size: 14px; margin-bottom: 4px;">O lançamento corresponde ao gasto fixo:</p>
        <p style="font-weight: 600; margin-bottom: 20px;">${fixedExpense.name} — ${fmt(fixedExpense.value)}</p>
        <div style="display: flex; gap: 8px;">
            <button id="btn-link-yes" class="btn btn-primary" style="flex:1;">Marcar como pago</button>
            <button id="btn-link-no" class="btn btn-secondary" style="flex:1;">Agora não</button>
        </div>
    `;

  document.getElementById("btn-link-yes").addEventListener("click", () => {
    state.data.fixedExpenses = state.data.fixedExpenses.map((f) =>
      f.id === fixedExpense.id ? { ...f, status: "pago" } : f,
    );
    saveState();
    closeModal();
    showNotify("Gasto fixo marcado como pago!");
    renderApp();
  });

  document.getElementById("btn-link-no").addEventListener("click", () => {
    closeModal();
    renderApp();
  });
}

// --- MODAL: COMPLEMENTO DE GASTOS FIXOS ---
function openFixedModal() {
  const body = initModalFrame("Gasto fixo");
  let modalState = {
    category: state.data.categories[0] || "",
    showCatInput: false,
  };

  function render() {
    body.innerHTML = `
            <label class="label">Nome *</label>
            <input type="text" id="f-name" placeholder="Ex: Aluguel" class="input">

            <label class="label">Categoria</label>
            <select id="f-select-cat" class="input">
                ${state.data.categories.map((c) => `<option value="${c}" ${c === modalState.category ? "selected" : ""}>${c}</option>`).join("")}
            </select>

            <div id="f-cat-custom-box" class="hidden" style="display: flex; gap: 6px; margin-bottom: 14px;">
                <input type="text" id="f-input-new-cat" placeholder="Nome da categoria" class="input" style="margin-bottom:0; flex:1;">
                <button id="f-btn-new-cat-ok" class="btn btn-primary">OK</button>
            </div>
            <button id="f-trigger-new-cat" class="btn-link" style="background:none; border:none; color:var(--accent); font-size:13px; cursor:pointer; padding:0; margin-bottom:14px; display:block;">+ Nova categoria</button>

            <label class="label">Valor *</label>
            <input type="number" id="f-value" placeholder="0,00" class="input">

            <label class="label">Dia de vencimento</label>
            <input type="number" id="f-day" min="1" max="31" value="1" class="input">

            <label class="label">Recorrência</label>
            <select class="input" disabled><option>Mensal</option></select>

            <button id="f-btn-save" class="btn btn-primary" style="width:100%; padding:13px;">Salvar gasto fixo</button>
        `;

    if (modalState.showCatInput) {
      body.querySelector("#f-cat-custom-box").classList.remove("hidden");
      body.querySelector("#f-trigger-new-cat").classList.add("hidden");
    }

    body.querySelector("#f-trigger-new-cat").addEventListener("click", () => {
      modalState.showCatInput = true;
      render();
    });

    body.querySelector("#f-btn-new-cat-ok").addEventListener("click", () => {
      const val = body.querySelector("#f-input-new-cat").value.trim();
      if (!val) return;
      if (!state.data.categories.includes(val)) {
        state.data.categories.push(val);
        saveState();
      }
      modalState.category = val;
      modalState.showCatInput = false;
      render();
    });

    body.querySelector("#f-btn-save").addEventListener("click", () => {
      const name = body.querySelector("#f-name").value.trim();
      const value = body.querySelector("#f-value").value;
      const day = body.querySelector("#f-day").value;
      const category = body.querySelector("#f-select-cat").value;

      if (!name || !value) return;

      state.data.fixedExpenses.push({
        id: uid(),
        name,
        category,
        value: Number(value),
        day: Number(day || 1),
        recurrence: "mensal",
        month: state.month,
        year: state.year,
        status: "pendente",
      });

      saveState();
      closeModal();
      showNotify("Gasto fixo adicionado!");
      renderApp();
    });
  }
  render();
}

// --- MODAL: COPIAR GASTOS FIXOS ---
function openCopyFixedConfirmation() {
  const body = initModalFrame("Copiar gastos fixos");
  const prevM = state.month === 0 ? 11 : state.month - 1;
  const prevY = state.month === 0 ? state.year - 1 : state.year;

  body.innerHTML = `
        <p style="color: var(--text-secondary); font-size: 14px; margin-bottom: 20px;">
            Deseja copiar todos os gastos fixos do mês anterior para ${MONTHS[state.month]}?
        </p>
        <button id="btn-confirm-copy" class="btn btn-primary" style="width: 100%;">Copiar gastos fixos</button>
    `;

  document.getElementById("btn-confirm-copy").addEventListener("click", () => {
    const prevList = state.data.fixedExpenses.filter(
      (f) => f.month === prevM && f.year === prevY,
    );

    if (!prevList.length) {
      closeModal();
      showNotify("Nenhum gasto fixo no mês anterior.", "warning");
      return;
    }

    const newOnes = prevList.map((f) => ({
      ...f,
      id: uid(),
      month: state.month,
      year: state.year,
      status: "pendente",
    }));

    state.data.fixedExpenses = [...state.data.fixedExpenses, ...newOnes];
    saveState();
    closeModal();
    showNotify(`${prevList.length} gasto(s) fixo(s) copiado(s)!`);
    renderApp();
  });
}

// --- MODAL: CRIAR NOVAS RESERVAS ---
function openReserveModal() {
  const body = initModalFrame("Nova reserva");
  body.innerHTML = `
        <label class="label">Nome *</label>
        <input type="text" id="r-name" placeholder="Ex: Fundo de emergência" class="input">

        <label class="label">Valor inicial</label>
        <input type="number" id="r-initial" placeholder="0,00" class="input">

        <label class="label">Meta (opcional)</label>
        <input type="number" id="r-goal" placeholder="Ex: 5000" class="input" style="margin-bottom:20px;">

        <button id="r-btn-save" class="btn btn-primary" style="width: 100%; padding: 13px;">Criar reserva</button>
    `;

  document.getElementById("r-btn-save").addEventListener("click", () => {
    const name = document.getElementById("r-name").value.trim();
    const initial = document.getElementById("r-initial").value;
    const goal = document.getElementById("r-goal").value;

    if (!name) return;

    state.data.reserves.push({
      id: uid(),
      name,
      goal: goal ? Number(goal) : 0,
      initial: initial ? Number(initial) : 0,
      current: initial ? Number(initial) : 0,
    });

    saveState();
    closeModal();
    showNotify("Reserva criada!");
    renderApp();
  });
}

// ==========================================
// MAQUEAMENTO DE EVENTOS GLOBAIS DE INTERAÇÃO
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  // Inicializa carregamento
  loadState();

  // Eventos de Navegação do Topo (Mês/Ano)
  document.getElementById("btn-prev-month").addEventListener("click", () => {
    if (state.month === 0) {
      state.month = 11;
      state.year--;
    } else {
      state.month--;
    }
    state.inlineAdjustReserveId = null; // reseta estados paralelos
    renderApp();
  });

  document.getElementById("btn-next-month").addEventListener("click", () => {
    if (state.month === 11) {
      state.month = 0;
      state.year++;
    } else {
      state.month++;
    }
    state.inlineAdjustReserveId = null;
    renderApp();
  });

  // Evento dos Menus da Tab Inferior
  document.querySelectorAll(".bottom-nav .nav-item").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const item = e.currentTarget;
      state.tab = item.dataset.tab;
      renderApp();
    });
  });

  // Evento do Botão Dinâmico Lateral FAB
  document.getElementById("global-fab").addEventListener("click", () => {
    if (state.tab === "movements") openMovementModal();
    if (state.tab === "fixed") openFixedModal();
    if (state.tab === "reserves") openReserveModal();
  });

  // Renderiza Tela Inicial padrão
  renderApp();
});
