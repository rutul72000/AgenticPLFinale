const socket = io();

// DOM refs
const zonesEl = {
  north: document.getElementById("zone-north"),
  south: document.getElementById("zone-south"),
  east:  document.getElementById("zone-east"),
  west:  document.getElementById("zone-west"),
  vip:   document.getElementById("zone-vip"),
  media: document.getElementById("zone-media"),
};
const gatesEl          = document.getElementById("gates");
const alertsEl         = document.getElementById("alerts");
const tracesEl         = document.getElementById("traces");
const weatherEl        = document.getElementById("weather");
const pendingEl        = document.getElementById("pending");
const pendingContainer = document.getElementById("pendingContainer");
const approveAllBtn    = document.getElementById("approveAllBtn");
const reviewToggle     = document.getElementById("reviewToggle");
const crowdDensityBar  = document.getElementById("crowdDensityBar");
const crowdDensityPct  = document.getElementById("crowdDensityPct");
const crowdLiveView     = document.getElementById("crowdLiveView");
const crowdViewLabel    = document.getElementById("crowdViewLabel");
const happyPathBtn     = document.getElementById("happyPathBtn");
const resetBtn         = document.getElementById("resetBtn");
const fillBtn          = document.getElementById("fillBtn");
const kpiFans          = document.getElementById("kpi-fans");
const kpiCritical      = document.getElementById("kpi-critical");
const kpiTickets       = document.getElementById("kpi-tickets");
const agentBadgesEl    = document.getElementById("agentBadges");
const actionBanner     = document.getElementById("actionBanner");
const actionBannerText = document.getElementById("actionBannerText");
const matchPhasesEl    = document.getElementById("matchPhases");
const clearFilterBtn   = document.getElementById("clearFilterBtn");
const camTotalEl       = document.getElementById("cam-total");
const camStaffEl       = document.getElementById("cam-staff");
const camFansCountEl   = document.getElementById("cam-fans-count");
const camFansBarEl     = document.getElementById("cam-fans-bar");
const camFansPctEl     = document.getElementById("cam-fans-pct");
const camConfidenceEl  = document.getElementById("cameraConfidence");
const agentModal      = document.getElementById("agentModal");
const modalAgentName  = document.getElementById("modalAgentName");
const modalAgentRole  = document.getElementById("modalAgentRole");
const modalAgentBio   = document.getElementById("modalAgentBio");
const modalAgentIcon  = document.getElementById("modalAgentIcon");
const modalAgentStatus = document.getElementById("modalAgentStatus");
const suggestedQuestionsEl = document.getElementById("suggestedQuestions");
const chatHistory     = document.getElementById("chatHistory");
const chatInput       = document.getElementById("chatInput");
const sendQueryBtn    = document.getElementById("sendQuery");
const closeModalBtn   = document.getElementById("closeModal");

let token         = "";
let ticketCount   = 38000;
let bannerTimeout = null;
let isAuthenticated = false;
let selectedAgentFilter = null;
let latestState = null;

// ─── Auth ────────────────────────────────────────────────────────────────────
const api = async (url, options = {}) => {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Request failed");
  }
  return res.json().catch(() => ({}));
};

const login = async () => {
  const result = await api("/api/auth/login", {
    method: "POST",
    body:   JSON.stringify({ username: "security", password: "admin123" })
  });
  token = result.token;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const getStatusColors = (pct) => {
  if (pct >= 85) return { bg: "bg-red-500/20",    border: "border-red-500/50",    text: "text-red-400",    pulse: "pulse-red" };
  if (pct >= 65) return { bg: "bg-yellow-500/20", border: "border-yellow-500/50", text: "text-yellow-400", pulse: "" };
  return              { bg: "bg-green-500/20",   border: "border-green-500/50",   text: "text-green-400",  pulse: "" };
};

const alertBorderColor = (msg) => {
  const m = msg.toLowerCase();
  if (m.includes("fire") || m.includes("critical") || m.includes("evacuate")) return "border-red-500";
  if (m.includes("surge") || m.includes("capacity") || m.includes("reroute")) return "border-orange-400";
  if (m.includes("rain")  || m.includes("weather"))                            return "border-yellow-400";
  if (m.includes("approved") || m.includes("resolved") || m.includes("online")) return "border-green-500";
  return "border-blue-500";
};

const showBanner = (text) => {
  actionBannerText.textContent = text;
  actionBanner.classList.remove("hidden");
  if (bannerTimeout) clearTimeout(bannerTimeout);
  bannerTimeout = setTimeout(() => actionBanner.classList.add("hidden"), 5000);
};

const setControlsEnabled = (enabled) => {
  const ids = ["reviewToggle", "resetBtn", "fillBtn", "happyPathBtn", "approveAllBtn"];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = !enabled;
  });
  document.querySelectorAll("button[data-type]").forEach((btn) => {
    btn.disabled = !enabled;
  });
};

// ─── Match Phase Ticker ───────────────────────────────────────────────────────
const PHASES = ["Pre-Match", "Innings 1", "Drinks Break", "Innings 2", "Post-Match"];
let currentPhase = 0;
const renderPhases = () => {
  matchPhasesEl.innerHTML = PHASES.map((p, i) => {
    let cls = "px-2 py-1 rounded border text-[10px] font-bold uppercase tracking-wider mono ";
    if (i === currentPhase)  cls += "phase-active";
    else if (i < currentPhase) cls += "phase-done";
    else                       cls += "text-slate-600 border-slate-800";
    return `<span class="${cls}">${p}</span>`;
  }).join('<span class="text-slate-700 text-xs">›</span>');
};
renderPhases();
setInterval(() => {
  currentPhase = (currentPhase + 1) % PHASES.length;
  renderPhases();
}, 45000);

// ─── Agent Badges ─────────────────────────────────────────────────────────────
const AGENTS = [
  { 
    name: "Sentinel",           
    desc: "Crowd Density",   
    color: "blue",
    icon: "S",
    bio: "Specializes in real-time computer vision analysis and crowd flow optimization. Monitors zone capacities and initiates dynamic rerouting to prevent bottlenecks."
  },
  { 
    name: "Meteorologist",      
    desc: "Weather Risk",    
    color: "yellow",
    icon: "M",
    bio: "Analyzes atmospheric data and local weather patterns. Predicts rain impact on match play and initiates safety protocols for extreme heat or lightning."
  },
  { 
    name: "Incident Commander", 
    desc: "Emergency Mgmt",  
    color: "red",
    icon: "IC",
    bio: "The primary responder for critical alerts. Coordinates medical teams, fire response, and security personnel during high-severity incidents."
  },
  { 
    name: "Comms Officer",      
    desc: "PA & Broadcast",  
    color: "green",
    icon: "CO",
    bio: "Manages public information channels. Generates calm, clear safety announcements for stadium screens and coordinates with external emergency services."
  },
  { 
    name: "Supervisor",         
    desc: "Oversight",       
    color: "purple",
    icon: "V",
    bio: "Monitors the overall health of the multi-agent system. Tracks operator response times for high-risk approvals and ensures system-wide synchronization."
  },
];

let currentModalAgent = null;

const getSuggestedQuestions = (agentName) => {
  const q = {
    Sentinel: [
      "Which zones are most at risk right now?",
      "Suggest immediate rerouting actions.",
      "What is overall stadium density?"
    ],
    Meteorologist: [
      "Do we need rain protocol in the next 30 minutes?",
      "Any heat risk for spectators?",
      "What is the current weather trend?"
    ],
    "Incident Commander": [
      "What is the immediate response plan?",
      "Which teams should be deployed first?",
      "Any high-risk approvals pending?"
    ],
    "Comms Officer": [
      "Draft a calm public announcement.",
      "What should we show on stadium screens?",
      "How should we message this to fans?"
    ],
    Supervisor: [
      "Give me overall system health.",
      "Any blocked decisions right now?",
      "What should operator prioritize now?"
    ]
  };
  return q[agentName] || ["Give me your current status."];
};

const buildAgentStatusCards = (agentName) => {
  if (!latestState || !modalAgentStatus) return;
  const totalFans = latestState.zones.reduce((s, z) => s + z.currentCount, 0);
  const criticalZones = latestState.zones.filter((z) => (z.currentCount / z.capacity) >= 0.85).length;
  const pendingApprovals = latestState.pendingActions.filter((a) => a.status === "pending").length;
  const latestAlert = latestState.alerts[0] || "No active alerts";
  const aiBudget = latestState.aiBudget || null;

  const cardMap = {
    Sentinel: [
      ["Critical Zones", `${criticalZones}`],
      ["Total Fans", totalFans.toLocaleString()],
      ["North Stand", `${Math.round((latestState.zones.find(z => z.id === "north")?.currentCount || 0) / 10000 * 100)}%`],
      ["Gate B Flow", `${latestState.gates.find(g => g.id === "B")?.flowPerMin || 0}/min`]
    ],
    Meteorologist: [
      ["Temperature", `${Math.round(latestState.weather.temperature)}C`],
      ["Rain Probability", `${Math.round(latestState.weather.rainProbability)}%`],
      ["Wind", `${Math.round(latestState.weather.windKmph)} km/h`],
      ["Protocol", latestState.weather.rainProbability > 60 ? "Rain Standby" : "Normal"]
    ],
    "Incident Commander": [
      ["Open Incidents", `${latestState.incidents.length}`],
      ["Pending Approvals", `${pendingApprovals}`],
      ["Latest Incident", latestState.incidents[0]?.type || "None"],
      ["Severity", latestState.incidents[0]?.severity || "N/A"]
    ],
    "Comms Officer": [
      ["Latest Alert", latestAlert.slice(0, 24) + (latestAlert.length > 24 ? "..." : "")],
      ["PA Queue", `${latestState.alerts.length}`],
      ["Broadcast Mode", "Live"],
      ["Audience", `${totalFans.toLocaleString()} fans`]
    ],
    Supervisor: [
      ["System Health", "Nominal"],
      ["Pending Approvals", `${pendingApprovals}`],
      ["Trace Entries", `${latestState.agentTraces.length}`],
      ["AI Budget", aiBudget ? `${aiBudget.callsRemaining} left` : "N/A"]
    ]
  };

  const cards = cardMap[agentName] || [];
  modalAgentStatus.innerHTML = cards.map(([label, value]) => `
    <div class="bg-slate-900/60 border border-slate-800 rounded-lg p-2">
      <div class="text-[9px] uppercase tracking-widest text-slate-500">${label}</div>
      <div class="text-[12px] font-bold text-slate-200">${value}</div>
    </div>
  `).join("");
};

const renderSuggestedQuestions = (agentName) => {
  if (!suggestedQuestionsEl) return;
  const questions = getSuggestedQuestions(agentName);
  suggestedQuestionsEl.innerHTML = questions.map((q) => `
    <button class="suggestion-chip px-2 py-1 rounded-md border border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-[10px] text-slate-300 transition-all" data-question="${q.replace(/"/g, "&quot;")}">
      ${q}
    </button>
  `).join("");
};

const openAgentModal = (agentName) => {
  const agent = AGENTS.find(a => a.name === agentName);
  if (!agent) return;

  currentModalAgent = agent;
  modalAgentName.textContent = agent.name;
  modalAgentRole.textContent = agent.desc;
  modalAgentBio.textContent = agent.bio;
  
  const colorMap = {
    blue:   "bg-blue-600 text-white",
    yellow: "bg-yellow-500 text-black",
    red:    "bg-red-600 text-white",
    green:  "bg-green-600 text-white",
    purple: "bg-purple-600 text-white",
  };
  modalAgentIcon.className = `w-12 h-12 rounded-2xl flex items-center justify-center text-xl font-bold shadow-lg ${colorMap[agent.color]}`;
  modalAgentIcon.textContent = agent.icon;
  buildAgentStatusCards(agent.name);
  renderSuggestedQuestions(agent.name);

  chatHistory.innerHTML = `<div class="text-slate-500 italic">System: Secure link established with ${agent.name}. How can I assist you?</div>`;
  agentModal.classList.remove("hidden");
  
  // Also set the filter in the background
  setAgentFilter(agentName);
};

const renderAgentBadges = (lastTrace) => {
  const activeAgent = lastTrace ? lastTrace.agent : null;
  agentBadgesEl.innerHTML = AGENTS.map(a => {
    const isActive = a.name === activeAgent;
    const isFiltered = a.name === selectedAgentFilter;
    const colorMap = {
      blue:   { dot: "bg-blue-500",   badge: "bg-blue-500/10   border-blue-500/30   text-blue-300"   },
      yellow: { dot: "bg-yellow-400", badge: "bg-yellow-400/10 border-yellow-400/30 text-yellow-300" },
      red:    { dot: "bg-red-500",    badge: "bg-red-500/10    border-red-500/30    text-red-300"    },
      green:  { dot: "bg-green-500",  badge: "bg-green-500/10  border-green-500/30  text-green-300"  },
      purple: { dot: "bg-purple-500", badge: "bg-purple-500/10 border-purple-500/30 text-purple-300" },
    };
    const c = colorMap[a.color];
    return `
      <div class="flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer hover:bg-white/5 transition-all ${c.badge} ${isActive ? 'ring-1 ring-current' : ''} ${isFiltered ? 'ring-2 ring-white bg-white/10' : ''}" 
           onclick="openAgentModal('${a.name}')">
        <span class="w-2 h-2 rounded-full flex-shrink-0 ${c.dot} ${isActive ? 'animate-pulse' : 'opacity-60'}"></span>
        <div>
          <div class="text-[10px] font-bold">${a.name}</div>
          <div class="text-[9px] opacity-60">${a.desc}</div>
        </div>
      </div>
    `;
  }).join("");
};

const setAgentFilter = (agentName) => {
  selectedAgentFilter = agentName;
  if (clearFilterBtn) clearFilterBtn.classList.remove("hidden");
  
  // Scroll to traces
  const tracesContainer = document.getElementById("traces");
  if (tracesContainer) tracesContainer.scrollTop = 0;
};
window.setAgentFilter = setAgentFilter;
window.openAgentModal = openAgentModal;

if (clearFilterBtn) {
  clearFilterBtn.addEventListener("click", () => {
    selectedAgentFilter = null;
    clearFilterBtn.classList.add("hidden");
    showBanner("Showing reasoning for all agents.");
  });
}

const handleAgentQuery = async () => {
  const query = chatInput.value.trim();
  if (!query || !currentModalAgent) return;

  // Add user message to chat
  const userMsg = document.createElement("div");
  userMsg.className = "text-blue-300 mb-2";
  userMsg.innerHTML = `<span class="font-bold">Operator:</span> ${query}`;
  chatHistory.appendChild(userMsg);
  chatInput.value = "";
  chatHistory.scrollTop = chatHistory.scrollHeight;

  // Show thinking
  const thinkingMsg = document.createElement("div");
  thinkingMsg.className = "text-slate-500 italic mb-2 animate-pulse";
  thinkingMsg.textContent = `${currentModalAgent.name} is analyzing...`;
  chatHistory.appendChild(thinkingMsg);

  try {
    const result = await api(`/api/agents/${encodeURIComponent(currentModalAgent.name)}/query`, {
      method: "POST",
      body: JSON.stringify({ query })
    });
    
    thinkingMsg.remove();
    const agentMsg = document.createElement("div");
    agentMsg.className = "text-white mb-2";
    agentMsg.innerHTML = `<span class="font-bold text-blue-400">${currentModalAgent.name}:</span> ${result.response}`;
    chatHistory.appendChild(agentMsg);
  } catch (err) {
    thinkingMsg.textContent = `Error: ${err.message}`;
    thinkingMsg.classList.remove("animate-pulse");
    thinkingMsg.classList.add("text-red-400");
  }
  
  chatHistory.scrollTop = chatHistory.scrollHeight;
};

if (sendQueryBtn) {
  sendQueryBtn.addEventListener("click", handleAgentQuery);
}
if (chatInput) {
  chatInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") handleAgentQuery();
  });
}
if (suggestedQuestionsEl) {
  suggestedQuestionsEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".suggestion-chip");
    if (!btn || !chatInput) return;
    chatInput.value = btn.dataset.question || "";
    handleAgentQuery();
  });
}
if (closeModalBtn && agentModal) {
  closeModalBtn.addEventListener("click", () => {
    agentModal.classList.add("hidden");
    currentModalAgent = null;
  });
}

// Close on background click
if (agentModal) {
  agentModal.addEventListener("click", (e) => {
    if (e.target === agentModal) {
      agentModal.classList.add("hidden");
      currentModalAgent = null;
    }
  });
}

// ─── Main Render ──────────────────────────────────────────────────────────────
const render = (state) => {
  latestState = state;
  // Weather
  const temp = Math.round(state.weather.temperature);
  const rain = Math.round(state.weather.rainProbability);
  weatherEl.innerHTML = `<span class="text-blue-400">T:</span>${temp}°C &nbsp;
    <span class="text-blue-400">R:</span>${rain}% &nbsp;
    <span class="text-blue-400">W:</span>${Math.round(state.weather.windKmph)}km/h`;

  reviewToggle.checked = state.humanReviewEnabled;

  // KPI: fans total
  const totalFans  = state.zones.reduce((s, z) => s + z.currentCount, 0);
  const totalCap   = state.zones.reduce((s, z) => s + z.capacity, 0);
  const overallPct = Math.round((totalFans / totalCap) * 100);
  kpiFans.textContent = totalFans.toLocaleString();

  // Crowd density bar & image
  if (crowdDensityBar) {
    crowdDensityBar.style.width = `${overallPct}%`;
    crowdDensityBar.className = `h-full rounded-full transition-all duration-1000 ${
      overallPct >= 85 ? "bg-red-400" : overallPct >= 65 ? "bg-yellow-400" : "bg-green-400"
    }`;
  }
  if (crowdDensityPct) crowdDensityPct.textContent = `${overallPct}%`;

  if (crowdLiveView) {
    let newSrc = "/assets/low.jpg";
    let label  = "Sparse / Baseline";
    
    if (overallPct >= 85) {
      newSrc = "/assets/high.jpg";
      label  = "Critical Capacity - North Stand";
    } else if (overallPct >= 45) {
      newSrc = "/assets/med.jpg";
      label  = "Moderate Flow - Gate B";
    }
    
    if (crowdLiveView.getAttribute("src") !== newSrc) {
      crowdLiveView.style.opacity = "0.4";
      setTimeout(() => {
        crowdLiveView.src = newSrc;
        crowdLiveView.style.opacity = "1";
      }, 300);
    }
    if (crowdViewLabel) crowdViewLabel.textContent = label;
  }

  // KPI: critical zones
  const critCount = state.zones.filter(z => (z.currentCount / z.capacity) >= 0.85).length;
  kpiCritical.textContent = `${critCount} / ${state.zones.length}`;
  kpiCritical.className = `text-2xl font-bold mono ${critCount > 0 ? "text-red-400" : "text-green-400"}`;

  // Camera AI Stats
  if (state.cameraStats) {
    if (camTotalEl) camTotalEl.textContent = state.cameraStats.totalDetected.toLocaleString();
    if (camStaffEl) camStaffEl.textContent = state.cameraStats.staffCount.toLocaleString();
    if (camFansCountEl) camFansCountEl.textContent = `${state.cameraStats.seatedFans.toLocaleString()} fans detected`;
    if (camConfidenceEl) camConfidenceEl.textContent = `${state.cameraStats.confidence}% CONF`;
    
    const fansPct = Math.round((state.cameraStats.seatedFans / 50000) * 100);
    if (camFansPctEl) camFansPctEl.textContent = `${fansPct}%`;
    if (camFansBarEl) camFansBarEl.style.width = `${fansPct}%`;
  }

  // KPI: tickets (bumped up by each tick)
  ticketCount += Math.floor(Math.random() * 15 + 3);
  kpiTickets.textContent = ticketCount.toLocaleString();

  // Zones
  state.zones.forEach(zone => {
    const key = zone.id.replace("gate_", "").toLowerCase();
    const el  = zonesEl[key];
    if (!el) return;
    const pct    = Math.round((zone.currentCount / zone.capacity) * 100);
    const colors = getStatusColors(pct);
    const isSmall = key === "vip" || key === "media";

    if (!isSmall) {
      const areaClass = { north: "zone-north", south: "zone-south", east: "zone-east", west: "zone-west" }[key] || "";
      el.className = `${areaClass} glass rounded-xl p-4 flex flex-col justify-center items-center transition-all duration-500 ${colors.bg} ${colors.border} ${colors.pulse}`;
      el.innerHTML = `
        <span class="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-1">${zone.name}</span>
        <span class="text-2xl font-bold ${colors.text}">${pct}%</span>
        <span class="text-[10px] mono text-slate-500">${zone.currentCount.toLocaleString()} / ${zone.capacity.toLocaleString()}</span>
      `;
    } else {
      el.className = `absolute ${key === "vip" ? "top-4" : "bottom-4"} glass px-2 py-1 rounded text-[8px] border transition-all duration-500 ${colors.text} ${colors.border} ${colors.bg}`;
      el.innerHTML = `${key.toUpperCase()}: ${pct}%`;
    }
  });

  // Gates
  gatesEl.innerHTML = state.gates.map(gate => {
    const rerouted = gate.status === "rerouted";
    const closed   = gate.status === "closed";
    const dotColor = closed ? "bg-red-500" : rerouted ? "bg-orange-500 animate-pulse" : "bg-green-500";
    const boxColor = closed ? "border-red-500/40 bg-red-500/10" : rerouted ? "border-orange-500/40 bg-orange-500/10" : "border-slate-700 bg-slate-800/50";
    return `
      <div class="p-3 rounded-lg border ${boxColor}">
        <div class="flex justify-between items-center mb-1">
          <span class="text-xs font-bold text-slate-400">GATE ${gate.id}</span>
          <span class="w-2 h-2 rounded-full ${dotColor}"></span>
        </div>
        <div class="text-lg font-bold mono">${gate.flowPerMin}</div>
        <div class="text-[10px] text-slate-500 uppercase tracking-tighter">${gate.status}</div>
      </div>
    `;
  }).join("");

  // Alerts (color-coded)
  alertsEl.innerHTML = state.alerts.slice(0, 20).map(item => {
    const border = alertBorderColor(item);
    return `<div class="px-2 py-1.5 rounded bg-slate-800/30 border-l-2 ${border} text-xs leading-snug">${item}</div>`;
  }).join("");

  // Agent trace + badges
  const latestTrace = state.agentTraces[0] || null;
  renderAgentBadges(latestTrace);

  const filteredTraces = selectedAgentFilter 
    ? state.agentTraces.filter(t => t.agent === selectedAgentFilter)
    : state.agentTraces;

  tracesEl.innerHTML = filteredTraces.slice(0, 20).map(t => `
    <div class="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1">
      <div class="flex justify-between items-center">
        <span class="text-blue-400 font-bold uppercase tracking-tighter text-[10px]">[${t.agent}]</span>
        <span class="text-slate-600 text-[9px]">${t.at}</span>
      </div>
      <div class="text-slate-400 italic text-[11px]">" ${t.thought} "</div>
      <div class="text-blue-300 font-bold text-[11px]">➔ ${t.action}</div>
    </div>
  `).join("");

  // Pending approvals
  const pending = state.pendingActions.filter(a => a.status === "pending");
  if (pending.length > 0) {
    pendingContainer.classList.remove("hidden");
    if (approveAllBtn) approveAllBtn.classList.remove("hidden");
    pendingEl.innerHTML = pending.map(a => `
      <div class="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30 space-y-3">
        <div class="flex justify-between items-start">
          <span class="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded font-bold uppercase">${a.source}</span>
          <span class="text-[10px] text-blue-400 mono">${new Date(a.createdAt).toLocaleTimeString()}</span>
        </div>
        <p class="text-sm font-medium text-slate-200">${a.action}</p>
        <button data-approve="${a.id}" class="w-full py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-bold transition-all">
          APPROVE ACTION
        </button>
      </div>
    `).join("");
  } else {
    pendingContainer.classList.add("hidden");
    if (approveAllBtn) approveAllBtn.classList.add("hidden");
  }
};

// ─── Event Listeners ──────────────────────────────────────────────────────────
document.querySelectorAll("button[data-type]").forEach(btn => {
  btn.addEventListener("click", async () => {
    if (!isAuthenticated) {
      showBanner("Waiting for secure login token...");
      return;
    }
    const type   = btn.dataset.type;
    const zoneId = type === "weather" ? "gate_a" : "gate_b";
    const label  = { crowd_surge: "Crowd Surge", medical: "Medical Emergency", fire: "Fire Alert", weather: "Rain Protocol" }[type] || type;
    showBanner(`[AGENT ACTION] ${label} triggered — agents activated`);
    try {
      await api("/api/incident", {
        method: "POST",
        body:   JSON.stringify({ type, zoneId, severity: type === "fire" ? "high" : "medium", message: `Simulated: ${label} detected.` })
      });
    } catch (e) { console.error(e); }
  });
});

reviewToggle.addEventListener("change", async () => {
  if (!isAuthenticated) return;
  try {
    await api("/api/toggle-review", { method: "POST", body: JSON.stringify({ enabled: reviewToggle.checked }) });
    showBanner(`Agent oversight ${reviewToggle.checked ? "enabled — high-risk actions need approval" : "disabled — full autonomous mode"}`);
  } catch (e) { console.error(e); }
});

pendingEl.addEventListener("click", async (e) => {
  if (!isAuthenticated) return;
  const btn = e.target.closest("button[data-approve]");
  if (!btn) return;
  btn.disabled    = true;
  btn.textContent = "EXECUTING...";
  try {
    await api(`/api/pending-actions/${btn.dataset.approve}/approve`, { method: "POST" });
    showBanner("[APPROVED] High-risk action executed by operator.");
  } catch (err) {
    showBanner(err.message || "Failed to approve action.");
    btn.disabled    = false;
    btn.textContent = "APPROVE ACTION";
  }
});

if (approveAllBtn) {
  approveAllBtn.addEventListener("click", async () => {
    if (!isAuthenticated) return;
    approveAllBtn.disabled = true;
    approveAllBtn.textContent = "Approving...";
    try {
      const result = await api("/api/pending-actions/approve-all", { method: "POST" });
      showBanner(`[APPROVED] Approved ${result.count} pending high-risk actions.`);
    } catch (err) {
      showBanner(err.message || "Failed to approve all actions.");
    } finally {
      approveAllBtn.disabled = false;
      approveAllBtn.textContent = "Approve All";
    }
  });
}

resetBtn.addEventListener("click", async () => {
  if (!isAuthenticated) return;
  if (!confirm("Reset all zone counts, incidents, and alerts to baseline?")) return;
  resetBtn.disabled    = true;
  resetBtn.textContent = "🔄 Resetting...";
  try {
    await api("/api/reset", { method: "POST" });
    showBanner("[SYSTEM RESET] Stadium cleared. All zones back to baseline.");
  } catch (e) {
    console.error(e);
  } finally {
    resetBtn.disabled    = false;
    resetBtn.textContent = "🔄 Reset System";
  }
});

fillBtn.addEventListener("click", async () => {
  if (!isAuthenticated) return;
  fillBtn.disabled    = true;
  fillBtn.textContent = "📈 Filling...";
  try {
    await api("/api/simulate-inflow", { method: "POST" });
    showBanner("[INFLOW] Sudden crowd increase simulated. Stadium reaching capacity.");
  } catch (e) {
    console.error(e);
  } finally {
    fillBtn.disabled    = false;
    fillBtn.textContent = "📈 Simulate Inflow";
  }
});

happyPathBtn.addEventListener("click", async () => {
  if (!isAuthenticated) return;
  happyPathBtn.disabled    = true;
  happyPathBtn.textContent = "🚀 Running...";
  const steps = [
    { type: "weather",    msg: "Rain front approaching stadium." },
    { type: "crowd_surge", msg: "Gate B density surge detected." },
    { type: "medical",    msg: "Fan collapsed near concourse." }
  ];
  for (const step of steps) {
    showBanner(`[DEMO] Triggering ${step.type.replace("_", " ")}...`);
    try {
      await api("/api/incident", {
        method: "POST",
        body:   JSON.stringify({ type: step.type, zoneId: step.type === "weather" ? "gate_a" : "gate_b", severity: "medium", message: step.msg })
      });
    } catch (e) { console.error(e); }
    await new Promise(r => setTimeout(r, 4000));
  }
  showBanner("[DEMO] Happy Path complete — all agents responded.");
  happyPathBtn.disabled    = false;
  happyPathBtn.textContent = "🚀 Happy Path";
});

socket.on("state:update", render);
setControlsEnabled(false);
login()
  .then(() => {
    isAuthenticated = true;
    setControlsEnabled(true);
    showBanner("Secure operator session established.");
  })
  .catch((err) => {
    console.error(err);
    showBanner("Login failed. Check DEMO_USERNAME / DEMO_PASSWORD.");
  });

// ─── Crowd Image Logic ────────────────────────────────────────────────────────
// (Logic moved into main render function to be density-driven)
