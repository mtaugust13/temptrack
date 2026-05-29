// ═══════════════════════════════════════════════════════════════════
//  CONFIG  ← update API_URL after deploying the backend to Cloud Run
// ═══════════════════════════════════════════════════════════════════
const CONFIG = {
  API_URL:   "https://temp-tracker-347858381394.asia-east1.run.app",
  API_KEY:   "1qYoGGgL7aYsqjYEk8QNTmIpDoC6VJRd",
  SHEET_URL: "https://docs.google.com/spreadsheets/d/1RGMRPRJqeQuZxEVCrAQHTsmtLaMtOFiRDPafLLTI0jA/edit?gid=0#gid=0",
};

// ═══════════════════════════════════════════════════════════════════
//  State
// ═══════════════════════════════════════════════════════════════════
let appData = { records: [], predictions: {} };

// ═══════════════════════════════════════════════════════════════════
//  API helpers
// ═══════════════════════════════════════════════════════════════════
async function apiRequest(endpoint, method = "GET", body = null) {
  const headers = { "Content-Type": "application/json" };
  if (CONFIG.API_KEY) headers["X-API-Key"] = CONFIG.API_KEY;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(CONFIG.API_URL + endpoint, opts);
  const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

// ═══════════════════════════════════════════════════════════════════
//  Load data
// ═══════════════════════════════════════════════════════════════════
async function loadData() {
  if (CONFIG.API_URL.includes("YOUR-CLOUD-RUN-URL")) {
    document.getElementById("config-warning").classList.remove("hidden");
    document.getElementById("loading-state").classList.add("hidden");
    return;
  }

  setLoading(true);
  hideError();

  try {
    appData = await apiRequest("/api/data");
    document.getElementById("main-content").classList.remove("hidden");
    renderAll();
  } catch (e) {
    showError(e.message);
  } finally {
    setLoading(false);
  }
}

function renderAll() {
  renderPredictions();
  renderCycleInsight();
  renderChart();
  renderTable();
}

// ═══════════════════════════════════════════════════════════════════
//  Cycle insight (fertile window timing)
// ═══════════════════════════════════════════════════════════════════
function renderCycleInsight() {
  const el = document.getElementById("cycle-insight");
  if (!el) return;
  const { records, predictions: p } = appData;
  if (!p || !p.fertile_window_start || !p.fertile_window_end || !records) {
    el.textContent = ""; return;
  }

  const ws = new Date(p.fertile_window_start);
  const we = new Date(p.fertile_window_end);

  // 同房 records that fall within the fertile window
  const hits = records.filter(r => {
    if (r.event !== "同房") return false;
    const d = new Date(r.date);
    return d >= ws && d <= we;
  });

  function fmtShort(str) {
    const [, m, d] = str.split("-");
    return `${parseInt(m)}/${parseInt(d)}`;
  }

  const windowStr = `${fmtShort(p.fertile_window_start)}–${fmtShort(p.fertile_window_end)}`;

  if (hits.length === 0) {
    // Only show if the fertile window is current or upcoming (not past > 3 days)
    const daysSinceEnd = Math.round((new Date() - we) / 86_400_000);
    if (daysSinceEnd > 3) { el.textContent = ""; return; }
    el.innerHTML = `本週期易孕期（${windowStr}）尚無同房記錄`;
  } else {
    const dots = "💑".repeat(Math.min(hits.length, 5));
    el.innerHTML = `易孕期（${windowStr}）內共記錄 ${hits.length} 次&ensp;${dots}`;
  }
}

// ═══════════════════════════════════════════════════════════════════
//  Prediction cards
// ═══════════════════════════════════════════════════════════════════
function renderPredictions() {
  const p = appData.predictions || {};
  const container = document.getElementById("pred-panel") || document.getElementById("pred-grid");

  if (!container) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  function daysUntil(str) {
    if (!str) return null;
    return Math.round((new Date(str) - today) / 86_400_000);
  }

  function daysLabel(str) {
    const d = daysUntil(str);
    if (d === null) return "";
    if (d < 0)  return `已過 ${-d} 天`;
    if (d === 0) return "今天";
    return `還有 ${d} 天`;
  }

  function fmt(str) {
    if (!str) return "—";
    const [, m, d] = str.split("-");
    return `${parseInt(m)}/${parseInt(d)}`;
  }

  const items = [
    {
      icon: "🩸", title: "上次月經",
      value: fmt(p.last_period),
      sub: p.last_period || "尚無記錄",
    },
    {
      icon: "🥚", title: "預計排卵期",
      value: fmt(p.predicted_ovulation),
      sub: daysLabel(p.predicted_ovulation),
    },
    {
      icon: "✨", title: "易孕期",
      value: (p.fertile_window_start && p.fertile_window_end)
        ? `${fmt(p.fertile_window_start)} – ${fmt(p.fertile_window_end)}`
        : "—",
      sub: p.fertile_window_confirmed ? "BBT 確認 ✓" : "排卵前 5 天至排卵日",
    },
    {
      icon: "📅", title: "預計下次月經",
      value: fmt(p.predicted_next_period),
      sub: daysLabel(p.predicted_next_period),
    },
    {
      icon: "📊", title: "平均週期",
      value: p.avg_cycle_length ? `${p.avg_cycle_length} 天` : "—",
      sub: p.data_cycles ? `基於 ${p.data_cycles} 個週期` : "使用預設值 28 天",
    },
  ];

  const colorMap = {
    "上次月經": "#EF4444",
    "預計排卵期": "#10B981",
    "易孕期": "#F59E0B",
    "預計下次月經": "#8B5CF6",
    "平均週期": "#6366F1",
  };

  const rows = items.map(c => `
    <div class="flex items-start justify-between gap-4 py-3 ${c.title !== "上次月經" ? "border-t border-slate-100" : ""}">
      <div class="min-w-0 flex items-start gap-3">
        <div class="text-lg leading-none mt-0.5">${c.icon}</div>
        <div class="min-w-0">
          <div class="text-xs font-medium text-slate-400 mb-0.5">${c.title}</div>
          <div class="font-semibold text-slate-700 break-words" style="color:${colorMap[c.title]}">${c.value}</div>
        </div>
      </div>
      <div class="shrink-0 text-right text-xs text-slate-400 max-w-[44%] leading-relaxed">${c.sub}</div>
    </div>
  `).join("");

  container.innerHTML = `
    <div class="px-4 divide-y divide-slate-100">
      ${rows}
      <div id="cycle-insight" class="py-3 text-xs text-slate-500 leading-relaxed"></div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════════
//  Plotly chart
// ═══════════════════════════════════════════════════════════════════
function renderChart() {
  const { records, predictions: p } = appData;

  const chartEl  = document.getElementById("chart");
  const emptyEl  = document.getElementById("chart-empty");
  const baselineNoteEl = document.getElementById("baseline-note");

  if (!chartEl || !emptyEl) return;

  const shapes      = [];
  const annotations = [];

  // Default view: 30 days back → 12 days forward
  const viewStart = new Date(); viewStart.setDate(viewStart.getDate() - 30);
  const viewEnd   = new Date(); viewEnd.setDate(viewEnd.getDate() + 12);
  const fmt = d => d.toISOString().split("T")[0];
  const isMobile = window.matchMedia("(max-width: 640px)").matches;

  if (!records || records.length === 0) {
    chartEl.style.display = "none";
    emptyEl.classList.remove("hidden");
    if (baselineNoteEl) {
      baselineNoteEl.innerHTML = `
        <div class="font-semibold text-slate-700 mb-1">📌 BBT 讀法</div>
        <div>高溫一直維持到預計月經日後，較像 <strong>可能懷孕</strong>。</div>
        <div>高溫先回落、接近月經日，較像 <strong>未懷孕</strong>。</div>
        <div>基線（coverline）：<strong>排卵日前 5 天加排卵日</strong>，共 6 筆體溫中的最高值；不含升溫當天。</div>
        <div>3 天規則：<strong>連續 3 筆體溫都高於基線</strong>，就算升溫成立。</div>
      `;
    }
    return;
  }
  chartEl.style.display = "block";
  emptyEl.classList.add("hidden");

  const tempRecords = records.filter(r => r.temperature !== null);
  const dates = tempRecords.map(r => r.date);

  if (baselineNoteEl) {
    const coverline = p.bbt_coverline ? `${p.bbt_coverline.toFixed(2)}°C` : "尚未偵測到";
    baselineNoteEl.innerHTML = `
      <div class="font-semibold text-slate-700 mb-1">📌 BBT 讀法</div>
      <div>高溫一直維持到預計月經日後，較像 <strong>可能懷孕</strong>。</div>
      <div>高溫先回落、接近月經日，較像 <strong>未懷孕</strong>。</div>
      <div>基線（coverline）：<strong>排卵日前 5 天加排卵日</strong>，共 6 筆體溫中的最高值；不含升溫當天。</div>
      <div>3 天規則：<strong>連續 3 筆體溫都高於基線</strong>，就算升溫成立。</div>
      <div>目前基線：<strong>${coverline}</strong></div>
    `;
  }
  const temps = tempRecords.map(r => r.temperature);

  // ── Traces ──────────────────────────────────────────────────────
  const EVENT_LABELS = { "月經第一天": "🫘 月經第一天", "排卵期": "🥚 排卵期", "同房": "💑 同房" };

  const traceLine = {
    type: "scatter", mode: "lines+markers",
    x: dates, y: temps,
    name: "基礎體溫",
    line:   { color: "#7C3AED", width: 2 },
    marker: { size: 5, color: "#7C3AED" },
    customdata: tempRecords.map(r => r.event ? `<br>${EVENT_LABELS[r.event] || r.event}` : ""),
    hovertemplate: "<b>%{x}</b><br>體溫：%{y}°C%{customdata}<extra></extra>",
  };

  const traces = [traceLine];

  const periodRecs    = records.filter(r => r.event === "月經第一天" && r.temperature !== null);
  const ovulationRecs = records.filter(r => r.event === "排卵期" && r.temperature !== null);

  if (periodRecs.length) {
    traces.push({
      type: "scatter", mode: "markers",
      x: periodRecs.map(r => r.date),
      y: periodRecs.map(r => r.temperature),
      name: "月經第一天",
      marker: { color: "#EF4444", symbol: "circle",  size: 10, line: { color: "#fff", width: 2 } },
      hoverinfo: "skip",
    });
  }

  if (ovulationRecs.length) {
    traces.push({
      type: "scatter", mode: "markers",
      x: ovulationRecs.map(r => r.date),
      y: ovulationRecs.map(r => r.temperature),
      name: "排卵期",
      marker: { color: "#10B981", symbol: "diamond", size: 10, line: { color: "#fff", width: 2 } },
      hoverinfo: "skip",
    });
  }

  const sexRecs = records.filter(r => r.event === "同房" && r.temperature !== null);
  if (sexRecs.length) {
    traces.push({
      type: "scatter", mode: "markers",
      x: sexRecs.map(r => r.date),
      y: sexRecs.map(r => r.temperature),
      name: "同房",
      marker: { color: "#F59E0B", symbol: "circle", size: 8, line: { color: "#fff", width: 2 } },
      hoverinfo: "skip",
    });
  }

  // 同房 without temperature: vertical amber dotted lines
  records.filter(r => r.event === "同房" && r.temperature === null).forEach(r => {
    shapes.push({
      type: "line",
      x0: r.date, x1: r.date, y0: 0, y1: 1, yref: "paper",
      line: { color: "rgba(245,158,11,0.45)", width: 1.5, dash: "dot" },
    });
    annotations.push({
      x: r.date, y: 0.04, yref: "paper",
      text: "💑", showarrow: false, font: { size: 11 },
    });
  });

  function vline(date, color, dash = "solid") {
    shapes.push({
      type: "line",
      x0: date, x1: date, y0: 0, y1: 1, yref: "paper",
      line: { color, width: 2, dash },
    });
  }

  function label(date, text, color, yPos = 0.97) {
    annotations.push({
      x: date, y: yPos, yref: "paper",
      text,
      showarrow: false,
      font: { color, size: 10 },
      bgcolor: "rgba(255,255,255,.88)",
      bordercolor: color, borderwidth: 1, borderpad: 3,
      xanchor: "center",
    });
  }

  // Actual events — solid lines
  (p.period_starts || []).forEach(d => vline(d, "rgba(239,68,68,.55)"));
  (p.ovulation_days || []).forEach(d => vline(d, "rgba(16,185,129,.55)"));

  // Today marker
  const today = new Date().toISOString().split("T")[0];
  vline(today, "rgba(107,114,128,.45)", "dot");
  label(today, "今天", "#6B7280", 0.90);

  // Fertile window (background rect)
  if (p.fertile_window_start && p.fertile_window_end) {
    shapes.push({
      type: "rect",
      x0: p.fertile_window_start, x1: p.fertile_window_end,
      y0: 0, y1: 1, yref: "paper",
      fillcolor: "rgba(245,158,11,.07)", line: { width: 0 },
    });
  }
  // ── BBT phase shading ───────────────────────────────────────────────
  // Use BBT-detected shift if available, otherwise fall back to predicted ovulation
  if (p.last_period) {
    const divider = p.bbt_shift_date || p.predicted_ovulation;
    const cycleEnd = p.predicted_next_period || fmt(viewEnd);

    // Low-phase tint: period start → ovulation
    if (divider) {
      shapes.push({
        type: "rect",
        x0: p.last_period, x1: divider,
        y0: 0, y1: 1, yref: "paper",
        fillcolor: "rgba(147,197,253,.12)", line: { width: 0 },
      });
      // High-phase tint: ovulation → next period
      shapes.push({
        type: "rect",
        x0: divider, x1: cycleEnd,
        y0: 0, y1: 1, yref: "paper",
        fillcolor: "rgba(252,165,165,.12)", line: { width: 0 },
      });
    }

    // Coverline — only when BBT detection has fired
    if (p.bbt_coverline) {
      shapes.push({
        type: "line",
        x0: p.last_period, x1: cycleEnd,
        y0: p.bbt_coverline, y1: p.bbt_coverline,
        xref: "x", yref: "y",
        line: { color: "rgba(107,114,128,.45)", width: 1.5, dash: "dot" },
      });
      annotations.push({
        x: p.last_period, y: p.bbt_coverline,
        xref: "x", yref: "y",
        text: `基線 ${p.bbt_coverline}°C`,
        showarrow: false,
        font: { color: "#6B7280", size: 9 },
        xanchor: "left", yanchor: "bottom",
      });
    }
  }

  // BBT-detected ovulation marker (only when no manual 排卵期 on that date)
  if (p.bbt_detected_ovulation) {
    const alreadyMarked = (p.ovulation_days || []).includes(p.bbt_detected_ovulation);
    if (!alreadyMarked) {
      shapes.push({
        type: "line",
        x0: p.bbt_detected_ovulation, x1: p.bbt_detected_ovulation,
        y0: 0, y1: 1, yref: "paper",
        line: { color: "rgba(16,185,129,.65)", width: 2, dash: "longdash" },
      });
      annotations.push({
        x: p.bbt_detected_ovulation, y: 0.74, yref: "paper",
        text: "BBT排卵",
        showarrow: false,
        font: { color: "#10B981", size: 10 },
        bgcolor: "rgba(255,255,255,.88)",
        bordercolor: "#10B981", borderwidth: 1, borderpad: 3,
        xanchor: "center",
      });
    }
  }
  // Predicted future cycles — dashed lines
  (p.future_periods || []).forEach((d, i) => {
    vline(d, "rgba(239,68,68,.38)", "dash");
    label(d, i === 0 ? "預計月經" : `預計月經 +${i}`, "#EF4444");
  });

  (p.future_ovulations || []).forEach((d, i) => {
    vline(d, "rgba(16,185,129,.38)", "dash");
    label(d, i === 0 ? "預計排卵" : `預計排卵 +${i}`, "#10B981", 0.83);
  });

  // ── Layout ──────────────────────────────────────────────────────
  const minY = Math.max(35.5, Math.min(...temps) - 0.15);
  const maxY = Math.min(38.5, Math.max(...temps) + 0.25);

  const layout = {
    xaxis: {
      type: "date", tickformat: "%m/%d",
      range: [fmt(viewStart), fmt(viewEnd)],
      showgrid: true, gridcolor: "#F3F4F6",
      title: { text: "" },
      tickfont: { size: isMobile ? 10 : 12 },
    },
    yaxis: {
      title: { text: "體溫 (°C)" },
      range: [minY, maxY],
      showgrid: true, gridcolor: "#F3F4F6",
      dtick: 0.1,
      tickfont: { size: isMobile ? 10 : 12 },
    },
    shapes, annotations,
    legend: {
      orientation: "h",
      y: isMobile ? -0.34 : -0.2,
      x: 0.5,
      xanchor: "center",
      font: { size: isMobile ? 10 : 12 },
    },
    hovermode: "x unified",
    plot_bgcolor:  "#FAFAFA",
    paper_bgcolor: "#FFFFFF",
    margin: { l: isMobile ? 44 : 55, r: 12, t: 12, b: isMobile ? 110 : 60 },
    font: { family: "Noto Sans TC, sans-serif", size: isMobile ? 11 : 12 },
  };

  Plotly.newPlot("chart", traces, layout, { responsive: true, displayModeBar: false });
}

// ═══════════════════════════════════════════════════════════════════
//  Records table
// ═══════════════════════════════════════════════════════════════════
function renderTable() {
  const { records } = appData;
  const tbody  = document.getElementById("records-tbody");
  const empty  = document.getElementById("records-empty");
  const count  = document.getElementById("records-count");

  const rows = [...records].reverse().slice(0, 60);
  count.textContent = `共 ${records.length} 筆`;

  if (rows.length === 0) {
    tbody.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  tbody.innerHTML = rows.map(r => {
    const tag = r.event
      ? `<span class="${r.event === "月經第一天" ? "tag-period" : r.event === "同房" ? "tag-sex" : "tag-ovulation"}">${r.event}</span>`
      : `<span class="text-gray-300 text-xs">—</span>`;

    return `
      <tr class="border-b border-gray-50 hover:bg-gray-50 transition">
        <td class="py-2 text-gray-700">${r.date}</td>
        <td class="py-2 font-mono text-purple-700 font-medium">${r.temperature !== null ? r.temperature.toFixed(2) + '°C' : '<span class="text-gray-300">—</span>'}</td>
        <td class="py-2">${tag}</td>
        <td class="py-2 text-right">
          <button onclick="deleteRecord('${r.date}')"
            class="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded hover:bg-red-50 transition">
            刪除
          </button>
        </td>
      </tr>`;
  }).join("");
}

// ═══════════════════════════════════════════════════════════════════
//  Form submit
// ═══════════════════════════════════════════════════════════════════
async function handleSubmit(e) {
  e.preventDefault();

  const date     = document.getElementById("date-input").value;
  const tempRaw  = document.getElementById("temp-input").value.trim();
  const event    = document.getElementById("event-input").value;
  const btn      = document.getElementById("submit-btn");

  if (!date) { showToast("請填寫日期", "error"); return; }

  const hasTemp  = tempRaw !== "";
  const hasEvent = event !== "";
  if (!hasTemp && !hasEvent) {
    showToast("請填寫體溫或選擇事件", "error");
    return;
  }

  let temperature;
  if (hasTemp) {
    temperature = parseFloat(tempRaw);
    if (isNaN(temperature) || temperature < 35 || temperature > 42) {
      showToast("體溫請輸入 35.0–42.0°C 之間的數値", "error");
      return;
    }
  }

  btn.disabled    = true;
  btn.textContent = "記錄中…";

  try {
    const payload = { date, event };
    if (hasTemp) payload.temperature = temperature;
    const result = await apiRequest("/api/record", "POST", payload);
    const verb     = result.action === "updated" ? "已更新" : "已新增";
    const tempStr  = hasTemp ? `  ${temperature.toFixed(2)}°C` : "";
    showToast(`✓ ${verb}：${date}${tempStr}${event ? "  · " + event : ""}`, "success");
    document.getElementById("temp-input").value  = "";
    document.getElementById("event-input").value = "";
    await loadData();
  } catch (err) {
    showToast(`記錄失敗：${err.message}`, "error");
  } finally {
    btn.disabled    = false;
    btn.textContent = "記錄";
  }
}

// ═══════════════════════════════════════════════════════════════════
//  Delete record
// ═══════════════════════════════════════════════════════════════════
async function deleteRecord(date) {
  if (!confirm(`確定要刪除 ${date} 的記錄嗎？`)) return;
  try {
    await apiRequest("/api/record", "DELETE", { date });
    showToast(`已刪除 ${date}`, "info");
    await loadData();
  } catch (err) {
    showToast(`刪除失敗：${err.message}`, "error");
  }
}

// ═══════════════════════════════════════════════════════════════════
//  UI helpers
// ═══════════════════════════════════════════════════════════════════
function setLoading(show) {
  document.getElementById("loading-state").classList.toggle("hidden", !show);
}

function showError(msg) {
  setLoading(false);
  document.getElementById("error-state").classList.remove("hidden");
  document.getElementById("error-msg").textContent = msg;
}

function hideError() {
  document.getElementById("error-state").classList.add("hidden");
}

let _toastTimer;
function showToast(msg, type = "info") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className   = `toast ${type} show`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove("show"), 3800);
}

// ═══════════════════════════════════════════════════════════════════
//  Init
// ═══════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════
//  PIN lock
// ═══════════════════════════════════════════════════════════════════
function initPin() {
  const overlay = document.getElementById("pin-overlay");

  // Already unlocked this session — skip
  if (sessionStorage.getItem("pinUnlocked") === "1") {
    overlay.remove();
    return;
  }

  const digits = Array.from(document.querySelectorAll(".pin-digit"));
  digits[0].focus();

  digits.forEach((input, i) => {
    input.addEventListener("input", () => {
      // Keep only one digit
      input.value = input.value.slice(-1).replace(/\D/, "");
      if (input.value && i < 3) digits[i + 1].focus();
      if (digits.every(d => d.value !== "")) verifyPin(digits, overlay);
    });

    input.addEventListener("keydown", e => {
      if (e.key === "Backspace" && !input.value && i > 0) {
        digits[i - 1].value = "";
        digits[i - 1].focus();
      }
    });
  });
}

async function verifyPin(digits, overlay) {
  const entered = digits.map(d => d.value).join("");
  try {
    const response = await fetch(`${CONFIG.API_URL}/api/pin/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: entered }),
    });

    if (response.ok) {
      sessionStorage.setItem("pinUnlocked", "1");
      overlay.classList.add("fade-out");
      setTimeout(() => overlay.remove(), 380);
      return;
    }

    const payload = await response.json().catch(() => ({}));
    document.getElementById("pin-error").textContent = payload.error || "PIN 碼錯誤，請再試一次";
  } catch (error) {
    document.getElementById("pin-error").textContent = "無法驗證 PIN，請稍後再試";
  }

  const box = document.querySelector(".pin-box");
  box.classList.add("shake");
  setTimeout(() => {
    box.classList.remove("shake");
    digits.forEach(d => d.value = "");
    document.getElementById("pin-error").textContent = "";
    digits[0].focus();
  }, 480);
}

// ═══════════════════════════════════════════════════════════════════
//  Init
// ═══════════════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
  // PIN gate
  initPin();

  // Default date = today
  document.getElementById("date-input").value = new Date().toISOString().split("T")[0];

  // Form handler
  document.getElementById("record-form").addEventListener("submit", handleSubmit);

  // Kick off data load
  loadData();
});
