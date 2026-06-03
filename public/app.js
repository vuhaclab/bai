const state = {
  dashboard: null,
  search: "",
  proxyFilters: {
    status: "",
    protocol: ""
  }
};

const selectors = {
  navItems: document.querySelectorAll(".nav-item"),
  views: document.querySelectorAll(".content-view"),
  sidebar: document.querySelector(".sidebar"),
  sidebarToggle: document.getElementById("sidebarToggle"),
  refreshButton: document.getElementById("refreshButton"),
  globalSearch: document.getElementById("globalSearch"),
  toast: document.getElementById("toast"),
  toolGrid: document.getElementById("toolGrid"),
  activityList: document.getElementById("activityList"),
  apiList: document.getElementById("apiList"),
  proxyList: document.getElementById("proxyList"),
  emailList: document.getElementById("emailList"),
  apiForm: document.getElementById("apiForm"),
  proxyForm: document.getElementById("proxyForm"),
  proxyBulkForm: document.getElementById("proxyBulkForm"),
  proxyQuickCheckForm: document.getElementById("proxyQuickCheckForm"),
  proxyCheckResult: document.getElementById("proxyCheckResult"),
  proxyEditForm: document.getElementById("proxyEditForm"),
  closeProxyEdit: document.getElementById("closeProxyEdit"),
  proxyFileInput: document.getElementById("proxyFileInput"),
  proxyTextInput: document.getElementById("proxyTextInput"),
  proxyStatusFilter: document.getElementById("proxyStatusFilter"),
  proxyProtocolFilter: document.getElementById("proxyProtocolFilter"),
  checkAllProxies: document.getElementById("checkAllProxies"),
  exportProxies: document.getElementById("exportProxies"),
  emailForm: document.getElementById("emailForm"),
  runAllTools: document.getElementById("runAllTools")
};

const iconByTool = {
  Security: "shield-check",
  Utility: "braces",
  Network: "network"
};

function textValue(value) {
  return String(value ?? "");
}

function safeText(value) {
  return textValue(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function className(value) {
  return textValue(value).replace(/[^a-z0-9_-]/gi, "");
}

function formatTime(value) {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(value));
}

function toDateTimeLocal(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function fromDateTimeLocal(value) {
  if (!value) {
    return "";
  }

  return new Date(value).toISOString();
}

function createBadge(text, badgeClass = "") {
  return `<span class="badge ${className(badgeClass)}">${safeText(text)}</span>`;
}

function renderIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function showToast(message) {
  selectors.toast.textContent = message;
  selectors.toast.classList.add("is-visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    selectors.toast.classList.remove("is-visible");
  }, 2500);
}

function matchesSearch(...values) {
  const keyword = state.search.trim().toLowerCase();

  if (!keyword) {
    return true;
  }

  return values.some((value) => textValue(value).toLowerCase().includes(keyword));
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json"
    },
    ...options
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }

  return payload;
}

async function loadDashboard() {
  state.dashboard = await requestJson("/api/dashboard");
  renderDashboard();
}

function renderStats(stats) {
  document.getElementById("statTools").textContent = stats.tools;
  document.getElementById("statRunningTools").textContent = `${stats.runningTools} running`;
  document.getElementById("statApis").textContent = stats.apis;
  document.getElementById("statOnlineApis").textContent = `${stats.onlineApis} online`;
  document.getElementById("statProxies").textContent = stats.proxies;
  document.getElementById("statActiveProxies").textContent = `${stats.activeProxies} active`;
  document.getElementById("statEmailQueue").textContent = stats.queuedEmails;
  document.getElementById("statEmailProfiles").textContent = `${stats.emailProfiles} profile`;
}

function renderActivity(items) {
  selectors.activityList.innerHTML = items
    .map((item) => `
      <article class="activity-item">
        <span class="status-dot ${className(item.level)}"></span>
        <div>
          <h3>${safeText(item.title)}</h3>
          <p>${safeText(item.detail)}</p>
        </div>
        <time>${formatTime(item.time)}</time>
      </article>
    `)
    .join("");
}

function renderTools(items) {
  const filtered = items.filter((item) =>
    matchesSearch(item.name, item.category, item.description, item.status)
  );

  selectors.toolGrid.innerHTML = filtered
    .map((tool) => `
      <article class="tool-card">
        <div class="tool-card-top">
          <div class="tool-icon">
            <i data-lucide="${safeText(iconByTool[tool.category] || "wrench")}"></i>
          </div>
          ${createBadge(tool.status, tool.status)}
        </div>
        <h3>${safeText(tool.name)}</h3>
        <p>${safeText(tool.description)}</p>
        <div class="tool-card-footer">
          ${createBadge(tool.category)}
          <button class="ghost-button" data-run-tool="${safeText(tool.id)}">
            <i data-lucide="play"></i>
            Run
          </button>
        </div>
      </article>
    `)
    .join("");
}

function renderApis(items) {
  const filtered = items.filter((item) =>
    matchesSearch(item.name, item.baseUrl, item.environment, item.owner, item.status)
  );

  selectors.apiList.innerHTML = filtered
    .map((api) => `
      <article class="data-row">
        <div>
          <h3>${safeText(api.name)}</h3>
          <p>${safeText(api.baseUrl)}</p>
        </div>
        <div class="data-meta">
          ${createBadge(api.environment)}
          ${createBadge(`${api.latency} ms`, api.status)}
          ${createBadge(api.status, api.status)}
        </div>
      </article>
    `)
    .join("");
}

function isExpiringSoon(proxy) {
  if (!proxy.expiresAt) {
    return false;
  }

  const expiresAt = new Date(proxy.expiresAt).getTime();
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  return expiresAt >= now && expiresAt <= now + sevenDays;
}

function getProxyEndpoint(proxy) {
  const host = proxy.host.includes(":") && !proxy.host.startsWith("[")
    ? `[${proxy.host}]`
    : proxy.host;
  const auth = proxy.username || proxy.password ? `${proxy.username || ""}:${proxy.password ? "***" : ""}@` : "";
  return `${textValue(proxy.protocol).toLowerCase()}://${auth}${host}:${proxy.port}`;
}

function getFilteredProxies(items) {
  return items.filter((proxy) => {
    const matchesFilter =
      (!state.proxyFilters.status ||
        proxy.status === state.proxyFilters.status ||
        proxy.checkStatus === state.proxyFilters.status) &&
      (!state.proxyFilters.protocol || proxy.protocol === state.proxyFilters.protocol);

    return matchesFilter && matchesSearch(
      proxy.label,
      proxy.host,
      proxy.port,
      proxy.protocol,
      proxy.ipVersion,
      proxy.status,
      proxy.checkStatus,
      proxy.note
    );
  });
}

function renderProxyStats(items) {
  const live = items.filter((proxy) => proxy.checkStatus === "live" || proxy.status === "active").length;
  const dead = items.filter((proxy) => proxy.checkStatus === "dead" || proxy.status === "failed").length;
  const expiring = items.filter(isExpiringSoon).length;

  document.getElementById("proxyStatTotal").textContent = items.length;
  document.getElementById("proxyStatLive").textContent = live;
  document.getElementById("proxyStatDead").textContent = dead;
  document.getElementById("proxyStatExpiring").textContent = expiring;
}

function renderProxies(items) {
  renderProxyStats(items);

  const filtered = getFilteredProxies(items);

  if (!filtered.length) {
    selectors.proxyList.innerHTML = `<div class="empty-state">No proxies found.</div>`;
    return;
  }

  selectors.proxyList.innerHTML = filtered
    .map((proxy) => `
      <article class="data-row proxy-row">
        <div class="proxy-endpoint">
          <div class="data-meta">
            ${createBadge(proxy.protocol)}
            ${createBadge(proxy.ipVersion)}
            ${createBadge(proxy.status, proxy.status)}
            ${createBadge(proxy.checkStatus || "unchecked", proxy.checkStatus || "unchecked")}
          </div>
          <h3>${safeText(proxy.label)}</h3>
          <code>${safeText(getProxyEndpoint(proxy))}</code>
          <p>${safeText(proxy.note || "No note")}</p>
        </div>
        <div class="proxy-detail-grid">
          <span><b>Time add</b>${safeText(formatTime(proxy.addedAt))}</span>
          <span><b>Time exp</b>${safeText(proxy.expiresAt ? formatTime(proxy.expiresAt) : "No expiry")}</span>
          <span><b>Last check</b>${safeText(formatTime(proxy.lastCheckedAt))}</span>
          <span><b>Latency</b>${safeText(proxy.latency ? `${proxy.latency} ms` : "N/A")}</span>
          <span><b>Success</b>${safeText(`${proxy.successRate}%`)}</span>
          <span><b>Traffic</b>${safeText(proxy.traffic)}</span>
        </div>
        <div class="row-actions">
          <button class="icon-button" data-check-proxy="${safeText(proxy.id)}" type="button" aria-label="Check proxy">
            <i data-lucide="radar"></i>
          </button>
          <button class="icon-button" data-edit-proxy="${safeText(proxy.id)}" type="button" aria-label="Edit proxy">
            <i data-lucide="pencil"></i>
          </button>
          <button class="danger-button" data-delete-proxy="${safeText(proxy.id)}" type="button" aria-label="Delete proxy">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      </article>
    `)
    .join("");
}

function renderEmails(items) {
  const filtered = items.filter((item) =>
    matchesSearch(item.name, item.provider, item.status)
  );

  selectors.emailList.innerHTML = filtered
    .map((email) => `
      <article class="data-row">
        <div>
          <h3>${safeText(email.name)}</h3>
          <p>${safeText(email.provider)} - ${safeText(email.sentToday)} sent today</p>
        </div>
        <div class="data-meta">
          ${createBadge(`${email.queue} queue`)}
          ${createBadge(`${email.bounceRate}% bounce`)}
          ${createBadge(email.status, email.status)}
        </div>
      </article>
    `)
    .join("");
}

function renderDashboard() {
  if (!state.dashboard) {
    return;
  }

  renderStats(state.dashboard.stats);
  renderActivity(state.dashboard.activity);
  renderTools(state.dashboard.tools);
  renderApis(state.dashboard.apis);
  renderProxies(state.dashboard.proxies);
  renderEmails(state.dashboard.emails);
  renderIcons();
}

function switchSection(sectionId) {
  selectors.navItems.forEach((item) => {
    item.classList.toggle("is-active", item.dataset.section === sectionId);
  });

  selectors.views.forEach((view) => {
    view.classList.toggle("is-visible", view.id === sectionId);
  });

  selectors.sidebar.classList.remove("is-open");
}

function switchProxyTab(tabId) {
  document.querySelectorAll("[data-proxy-tab]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.proxyTab === tabId);
  });

  document.querySelectorAll(".proxy-tab-panel").forEach((panel) => {
    panel.classList.toggle("is-visible", panel.id === tabId);
  });
}

function formToObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function normalizeFormPayload(payload) {
  if (payload.expiresAt) {
    payload.expiresAt = fromDateTimeLocal(payload.expiresAt);
  }

  return payload;
}

function findProxy(id) {
  return state.dashboard?.proxies.find((proxy) => proxy.id === id);
}

async function handleFormSubmit(event, endpoint, successMessage) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = normalizeFormPayload(formToObject(form));

  await requestJson(endpoint, {
    method: "POST",
    body: JSON.stringify(payload)
  });

  form.reset();
  await loadDashboard();
  showToast(successMessage);
}

async function runTool(toolId, options = {}) {
  const shouldRefresh = options.refresh !== false;
  const shouldNotify = options.notify !== false;

  await requestJson("/api/tools/run", {
    method: "POST",
    body: JSON.stringify({ id: toolId })
  });

  if (shouldRefresh) {
    await loadDashboard();
  }

  if (shouldNotify) {
    showToast("Tool was queued.");
  }
}

async function checkProxy(id) {
  const payload = await requestJson(`/api/proxies/${encodeURIComponent(id)}/check`, {
    method: "POST",
    body: "{}"
  });

  await loadDashboard();
  renderProxyCheckResult(payload.proxy, payload.result);
  switchProxyTab("proxyCheck");
  showToast(`Proxy is ${payload.proxy.checkStatus}.`);
}

function renderProxyCheckResult(proxy, result) {
  selectors.proxyCheckResult.innerHTML = `
    <div class="check-result-card">
      <div class="data-meta">
        ${createBadge(proxy.protocol)}
        ${createBadge(proxy.ipVersion)}
        ${createBadge(proxy.checkStatus, proxy.checkStatus)}
        ${createBadge(proxy.latency ? `${proxy.latency} ms` : "N/A")}
      </div>
      <h3>${safeText(proxy.label)}</h3>
      <code>${safeText(getProxyEndpoint(proxy))}</code>
      <p>${safeText(result?.message || proxy.lastCheckMessage || "Checked")}</p>
      <p>Last check: ${safeText(formatTime(proxy.lastCheckedAt))}</p>
    </div>
  `;
  renderIcons();
}

function openProxyEdit(id) {
  const proxy = findProxy(id);

  if (!proxy) {
    showToast("Proxy not found.");
    return;
  }

  const form = selectors.proxyEditForm;
  form.hidden = false;
  form.elements.id.value = proxy.id;
  form.elements.label.value = proxy.label || "";
  form.elements.host.value = proxy.host || "";
  form.elements.port.value = proxy.port || "";
  form.elements.protocol.value = proxy.protocol || "HTTP";
  form.elements.ipVersion.value = proxy.ipVersion || "IPv4";
  form.elements.status.value = proxy.status || "active";
  form.elements.expiresAt.value = toDateTimeLocal(proxy.expiresAt);
  form.elements.username.value = proxy.username || "";
  form.elements.password.value = proxy.password || "";
  form.elements.note.value = proxy.note || "";
  switchProxyTab("proxyInventory");
}

async function submitProxyEdit(event) {
  event.preventDefault();
  const payload = normalizeFormPayload(formToObject(selectors.proxyEditForm));
  const id = payload.id;
  delete payload.id;

  await requestJson(`/api/proxies/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });

  selectors.proxyEditForm.hidden = true;
  await loadDashboard();
  showToast("Proxy updated.");
}

async function deleteProxy(id) {
  const proxy = findProxy(id);
  const confirmed = window.confirm(`Delete proxy ${proxy?.label || id}?`);

  if (!confirmed) {
    return;
  }

  await requestJson(`/api/proxies/${encodeURIComponent(id)}`, {
    method: "DELETE"
  });

  await loadDashboard();
  showToast("Proxy deleted.");
}

async function importProxyList(event) {
  event.preventDefault();
  const form = selectors.proxyBulkForm;
  const payload = normalizeFormPayload(formToObject(form));

  await requestJson("/api/proxies/import", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  form.reset();
  await loadDashboard();
  switchProxyTab("proxyInventory");
  showToast("Proxy list imported.");
}

async function quickCheckProxy(event) {
  event.preventDefault();
  const form = selectors.proxyQuickCheckForm;
  const payload = formToObject(form);

  const checked = await requestJson("/api/proxies/check-line", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  if (payload.saveAfterCheck === "yes") {
    const imported = await requestJson("/api/proxies/import", {
      method: "POST",
      body: JSON.stringify({ list: payload.proxyLine })
    });
    const proxy = imported.proxies[0];
    await requestJson(`/api/proxies/${encodeURIComponent(proxy.id)}/check`, {
      method: "POST",
      body: "{}"
    });
  }

  await loadDashboard();
  renderProxyCheckResult(checked.proxy, checked.result);
  showToast(payload.saveAfterCheck === "yes" ? "Proxy checked and saved." : "Proxy checked.");
}

async function checkAllProxies() {
  selectors.checkAllProxies.disabled = true;
  selectors.checkAllProxies.textContent = "Checking...";

  try {
    const result = await requestJson("/api/proxies/check-all", {
      method: "POST",
      body: "{}"
    });

    await loadDashboard();
    switchProxyTab("proxyInventory");
    showToast(`Checked ${result.checked}: ${result.live} live, ${result.dead} dead.`);
  } finally {
    selectors.checkAllProxies.disabled = false;
    selectors.checkAllProxies.innerHTML = `<i data-lucide="activity"></i> Check all`;
    renderIcons();
  }
}

function exportProxies() {
  const params = new URLSearchParams();

  if (state.proxyFilters.status) {
    params.set("status", state.proxyFilters.status);
  }

  if (state.proxyFilters.protocol) {
    params.set("protocol", state.proxyFilters.protocol);
  }

  const query = params.toString();
  window.location.href = `/api/proxies/export${query ? `?${query}` : ""}`;
}

function bindEvents() {
  selectors.navItems.forEach((item) => {
    item.addEventListener("click", () => switchSection(item.dataset.section));
  });

  document.querySelectorAll("[data-section-jump]").forEach((item) => {
    item.addEventListener("click", () => switchSection(item.dataset.sectionJump));
  });

  document.querySelectorAll("[data-proxy-tab]").forEach((button) => {
    button.addEventListener("click", () => switchProxyTab(button.dataset.proxyTab));
  });

  selectors.sidebarToggle.addEventListener("click", () => {
    selectors.sidebar.classList.toggle("is-open");
  });

  selectors.refreshButton.addEventListener("click", async () => {
    await loadDashboard();
    showToast("Dashboard refreshed.");
  });

  selectors.globalSearch.addEventListener("input", (event) => {
    state.search = event.target.value;
    renderDashboard();
  });

  selectors.toolGrid.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-run-tool]");
    if (!button) {
      return;
    }

    await runTool(button.dataset.runTool);
  });

  selectors.proxyList.addEventListener("click", async (event) => {
    const checkButton = event.target.closest("[data-check-proxy]");
    const editButton = event.target.closest("[data-edit-proxy]");
    const deleteButton = event.target.closest("[data-delete-proxy]");

    if (checkButton) {
      await checkProxy(checkButton.dataset.checkProxy);
      return;
    }

    if (editButton) {
      openProxyEdit(editButton.dataset.editProxy);
      return;
    }

    if (deleteButton) {
      await deleteProxy(deleteButton.dataset.deleteProxy);
    }
  });

  selectors.runAllTools.addEventListener("click", async () => {
    const toolIds = state.dashboard.tools.map((tool) => tool.id);
    await Promise.all(toolIds.map((toolId) => runTool(toolId, { refresh: false, notify: false })));
    await loadDashboard();
    showToast("All tools were triggered.");
  });

  selectors.apiForm.addEventListener("submit", (event) =>
    handleFormSubmit(event, "/api/apis", "API added.")
  );

  selectors.proxyForm.addEventListener("submit", (event) =>
    handleFormSubmit(event, "/api/proxies", "Proxy added.")
  );

  selectors.proxyBulkForm.addEventListener("submit", importProxyList);
  selectors.proxyQuickCheckForm.addEventListener("submit", quickCheckProxy);
  selectors.proxyEditForm.addEventListener("submit", submitProxyEdit);
  selectors.closeProxyEdit.addEventListener("click", () => {
    selectors.proxyEditForm.hidden = true;
  });

  selectors.proxyFileInput.addEventListener("change", async (event) => {
    const [file] = event.target.files;

    if (!file) {
      return;
    }

    selectors.proxyTextInput.value = await file.text();
    showToast("TXT file loaded.");
  });

  selectors.proxyStatusFilter.addEventListener("change", (event) => {
    state.proxyFilters.status = event.target.value;
    renderDashboard();
  });

  selectors.proxyProtocolFilter.addEventListener("change", (event) => {
    state.proxyFilters.protocol = event.target.value;
    renderDashboard();
  });

  selectors.checkAllProxies.addEventListener("click", checkAllProxies);
  selectors.exportProxies.addEventListener("click", exportProxies);

  selectors.emailForm.addEventListener("submit", (event) =>
    handleFormSubmit(event, "/api/emails", "Email profile added.")
  );
}

bindEvents();
loadDashboard().catch((error) => {
  showToast(error.message);
});
