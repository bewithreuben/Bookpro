const money = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0
});

const state = {
  user: null,
  professionals: [],
  selectedService: "All",
  selectedLocation: "All",
  selectedPro: null,
  selectedSlot: null,
  lastBooking: null,
  paystackPublicKey: "pk_test_bookpro_demo",
  token: ""
};

const API_PORT = "5177";
const localStaticPorts = new Set(["3000", "5173", "5500", "8080"]);
const isLocalHost = ["localhost", "127.0.0.1", ""].includes(window.location.hostname);
const isStaticPreview = window.location.protocol === "file:" || (isLocalHost && localStaticPorts.has(window.location.port));
const API_BASE = isStaticPreview ? `http://127.0.0.1:${API_PORT}` : "";

const proList = document.querySelector("#proList");
const resultCount = document.querySelector("#resultCount");
const bookingCard = document.querySelector("#bookingCard");
const serviceSelect = document.querySelector("#serviceSelect");
const locationSelect = document.querySelector("#locationSelect");
const bookingSearch = document.querySelector("#bookingSearch");
const categoryButtons = document.querySelectorAll(".category");
const navTriggers = document.querySelectorAll("[data-view]");
const sessionStatus = document.querySelector("#sessionStatus");
const menuButton = document.querySelector("#menuButton");
const menuWrapper = document.querySelector(".menu-wrapper");

async function api(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const hasBody = options.body !== undefined && options.body !== null;
  const isFormData = options.body instanceof FormData;
  
  const defaultHeaders = {
    ...(hasBody && !isFormData ? { "Content-Type": "application/json" } : {}),
    ...(state?.token ? { "Authorization": `Bearer ${state.token}` } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    method,
    headers: defaultHeaders
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown Error');
    throw new Error(`API Error ${response.status}: ${errorBody || response.statusText}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

async function bootstrap() {
  try {
    // 1. Safe layout checking before firing listener setup
    setupDashboardDelegations();

    const data = await api("/api/bootstrap").catch(() => ({ paystackPublicKey: "pk_test_bookpro_demo" }));
    state.paystackPublicKey = data.paystackPublicKey;
    
    await loadProfessionals();

    if (state.token) {
      await refreshProtectedData();
    } else {
      renderUnauthenticatedStates();
    }
  } catch (error) {
    if (proList) {
      proList.innerHTML = `<div class="empty-state"><h3>Backend unavailable</h3><p>${error.message}</p></div>`;
    }
  }
}

function renderUnauthenticatedStates() {
  const history = document.querySelector("#serviceHistory");
  const queue = document.querySelector("#jobQueue");
  const verification = document.querySelector("#verificationQueue");

  if (history) history.innerHTML = `<article class="empty-state"><h3>Log in to see service history</h3><p>Your records appear here.</p></article>`;
  if (queue) queue.innerHTML = `<article class="empty-state"><h3>Professional login required</h3><p>Sign in to manage jobs.</p></article>`;
  if (verification) verification.innerHTML = `<article class="empty-state"><h3>Admin login required</h3></article>`;
}

async function loadProfessionals() {
  const params = new URLSearchParams({
    service: state.selectedService,
    location: state.selectedLocation
  });
  try {
    const data = await api(`/api/professionals?${params}`);
    state.professionals = data.professionals || [];
    renderPros();
  } catch (e) {
    state.professionals = [];
    renderPros();
  }
}

function renderPros() {
  if (!proList) return;
  if (resultCount) resultCount.textContent = `${state.professionals.length} available`;
  proList.innerHTML = "";

  if (!state.professionals.length) {
    proList.innerHTML = `<div class="empty-state"><h3>No instant matches</h3><p>Try another location or service category.</p></div>`;
    if (bookingCard) bookingCard.innerHTML = `<p class="eyebrow">Book appointment</p><h2>No worker selected</h2>`;
    return;
  }

  state.professionals.forEach((pro, index) => {
    const card = document.createElement("article");
    card.className = `pro-card${index === 0 ? " selected" : ""}`;
    
    const skillsHTML = (pro.skills || []).map(skill => {
      const span = document.createElement('span');
      span.textContent = skill;
      return span.outerHTML;
    }).join("");

    card.innerHTML = `
      <div class="pro-avatar" style="--avatar-a:${pro.colors?.[0] || "#0f766e"}; --avatar-b:${pro.colors?.[1] || "#457b9d"}">${pro.initials || ''}</div>
      <div class="pro-details">
        <div class="pro-title">
          <h3>${pro.name}</h3>
          <span class="verified" title="Verified professional">OK</span>
          <span>${pro.service}</span>
        </div>
        <div>${pro.title || ''}</div>
        <div class="pro-meta">
          <span>Rating ${pro.rating || 0} (${pro.reviews || 0})</span>
          <span>${pro.location}</span>
          <span>${pro.distance || 0} km</span>
          <span>${pro.eta || ''}</span>
          <span>${pro.jobs || 0} jobs</span>
        </div>
        <div class="pro-skills">${skillsHTML}</div>
      </div>
      <div class="price-block">
        <strong>${money.format(pro.price || 0)}</strong>
        <button class="book-button" type="button">Book</button>
      </div>
    `;
    card.querySelector(".book-button").addEventListener("click", () => selectPro(pro, card));
    card.addEventListener("click", (event) => {
      if (!event.target.closest("button")) selectPro(pro, card);
    });
    proList.appendChild(card);
  });

  selectPro(state.professionals[0], proList.querySelector(".pro-card"));
}

function selectPro(pro, card) {
  if (!pro || !bookingCard) return;
  state.selectedPro = pro;
  state.selectedSlot = pro.slots?.[0] || "Today";
  document.querySelectorAll(".pro-card").forEach((item) => item.classList.remove("selected"));
  if (card) card.classList.add("selected");

  bookingCard.innerHTML = `
    <p class="eyebrow">Book appointment</p>
    <h2>${pro.name}</h2>
    <p>${pro.title || ''}. Verified for identity and history.</p>
    <div class="slot-list">
      ${(pro.slots || ["Today"]).map((slot, index) => `<button class="${index === 0 ? "selected" : ""}" type="button" data-slot="${slot}">${slot}</button>`).join("")}
    </div>
    <div class="button-row">
      <button class="primary-button compact" id="reserveButton" type="button">Reserve ${money.format(pro.price || 0)}</button>
      <button class="ghost-button dark" type="button">Chat</button>
      <button class="ghost-button dark" type="button">Call</button>
    </div>
    <p class="form-status" id="bookingStatus"></p>
  `;

  bookingCard.querySelectorAll(".slot-list button").forEach((button) => {
    button.addEventListener("click", () => {
      bookingCard.querySelectorAll(".slot-list button").forEach((slot) => slot.classList.remove("selected"));
      button.classList.add("selected");
      state.selectedSlot = button.dataset.slot;
    });
  });

  const reserveBtn = bookingCard.querySelector("#reserveButton");
  if (reserveBtn) reserveBtn.addEventListener("click", createBooking);
}

async function createBooking() {
  if (!state.user) {
    const modal = document.querySelector("#loginModal");
    if (modal) modal.showModal();
    return;
  }

  const status = document.querySelector("#bookingStatus");
  if (status) status.textContent = "Creating booking request...";
  try {
    const data = await api("/api/bookings", {
      method: "POST",
      body: JSON.stringify({
        professionalId: state.selectedPro.id,
        slot: state.selectedSlot,
        location: state.selectedLocation === "All" ? state.selectedPro.location : state.selectedLocation,
        customerId: state.user.id
      })
    });
    state.lastBooking = data.booking;
    if (status) status.textContent = `Booking ${data.booking.status}. Payment reference ${data.booking.reference}.`;
    await initializePaystack(data.booking.id, status);
    await refreshProtectedData();
  } catch (error) {
    if (status) status.textContent = error.message;
  }
}

async function initializePaystack(bookingId, statusElement) {
  try {
    const data = await api("/api/payments/paystack/initialize", {
      method: "POST",
      body: JSON.stringify({ bookingId, channel: "card" })
    });
    if (statusElement) {
      statusElement.textContent = `Paystack initialized in demo mode. ${data.payment.reference} is authorized for ${money.format(data.payment.amount)}.`;
    }
  } catch (err) {
    if (statusElement) statusElement.textContent = err.message;
  }
}

function setupDashboardDelegations() {
  // Added safe existence guard checks around structural action elements
  const jobQueue = document.querySelector("#jobQueue");
  if (jobQueue) {
    jobQueue.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-job-action]");
      if (!btn) return;
      await api(`/api/professional/jobs/${btn.dataset.booking}/${btn.dataset.jobAction}`, { method: "POST" });
      await refreshProtectedData();
    });
  }

  const verificationQueue = document.querySelector("#verificationQueue");
  if (verificationQueue) {
    verificationQueue.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-verify]");
      if (!btn) return;
      await api(`/api/admin/verify/${btn.dataset.verify}`, { method: "POST" });
      await refreshProtectedData();
    });
  }

  // Globally delegate the dynamic demo button to stay safe from runtime structural wipes
  document.addEventListener("click", async (e) => {
    const targetButton = e.target.closest("#paymentDemoButton");
    if (!targetButton) return;
    
    const bookingId = state.lastBooking?.id || "book_1";
    targetButton.textContent = "Initializing...";
    await initializePaystack(bookingId, targetButton);
  });
}

async function loadHistory() {
  if (!state.token) return;
  const target = document.querySelector("#serviceHistory");
  if (!target) return;
  const data = await api("/api/customer/history");
  target.innerHTML = (data.bookings || [])
    .map(booking => `
        <article class="timeline-item">
          <span class="status-dot"></span>
          <div><strong>${booking.service}</strong><div class="pro-meta"><span>${booking.professionalName}</span><span>${money.format(booking.amount)}</span><span>${booking.slot}</span></div></div>
          <span class="pill">${booking.status}</span>
        </article>
      `).join("");
}

async function loadProfessionalDashboard() {
  if (!state.token) return;
  const target = document.querySelector("#jobQueue");
  if (!target) return;
  const data = await api("/api/professional/dashboard");
  const jobs = (data.jobs || []).filter((job) => job.status === "requested" || job.status === "confirmed");
  target.innerHTML = jobs
    .map(job => `
        <article class="job-card">
          <div><strong>${job.service}</strong><div class="pro-meta"><span>${job.location}</span><span>${job.slot}</span><span>${money.format(job.amount)}</span><span>${job.status}</span></div></div>
          <div class="button-row">
            <button class="primary-button compact" type="button" data-job-action="accept" data-booking="${job.id}">Accept</button>
            <button class="ghost-button" type="button" data-job-action="reject" data-booking="${job.id}">Reject</button>
          </div>
        </article>
      `).join("");
}

async function loadAdminDashboard() {
  if (!state.token) return;
  const vQueue = document.querySelector("#verificationQueue");
  const dList = document.querySelector("#disputeList");

  const data = await api("/api/admin/dashboard");
  
  if (vQueue) {
    vQueue.innerHTML = (data.verificationQueue || [])
      .map(item => `
          <article class="admin-row">
            <div><strong>${item.name}</strong><div class="pro-meta"><span>${item.trade}</span><span>${item.docs}</span><span>${item.status}</span></div></div>
            <button class="primary-button compact" type="button" data-verify="${item.id}">Verify</button>
          </article>
        `).join("");
  }

  if (dList) {
    dList.innerHTML = (data.disputes || [])
      .map(item => `
          <article class="admin-row">
            <div><strong>${item.id}</strong><p>${item.issue}</p><div class="pro-meta"><span>${item.status}</span><span>${money.format(item.amountHeld)} held</span></div></div>
            <button class="ghost-button" type="button">Open</button>
          </article>
        `).join("");
  }
}

function setActiveView(viewId) {
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === viewId));
  navTriggers.forEach((trigger) => trigger.classList.toggle("active", trigger.dataset.view === viewId));
  closeMenu();
}

function closeMenu() {
  if (!menuWrapper || !menuButton) return;
  menuWrapper.classList.remove("open");
  menuButton.setAttribute("aria-expanded", "false");
}

function toggleMenu() {
  if (!menuWrapper || !menuButton) return;
  const isOpen = menuWrapper.classList.toggle("open");
  menuButton.setAttribute("aria-expanded", String(isOpen));
}

function setUser(user) {
  state.user = user;
  if (sessionStatus) sessionStatus.textContent = `${user.name} - ${user.role}`;
}

async function refreshProtectedData() {
  await Promise.all([
    loadHistory(),
    loadProfessionalDashboard(),
    loadAdminDashboard()
  ]);
}

if (bookingSearch) {
  bookingSearch.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (serviceSelect) state.selectedService = serviceSelect.value;
    if (locationSelect) state.selectedLocation = locationSelect.value;
    categoryButtons.forEach((button) => button.classList.toggle("active", button.dataset.service === state.selectedService));
    await loadProfessionals();
  });
}

categoryButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    state.selectedService = button.dataset.service;
    if (serviceSelect) serviceSelect.value = state.selectedService;
    categoryButtons.forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    await loadProfessionals();
  });
});

navTriggers.forEach((trigger) => {
  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    setActiveView(trigger.dataset.view);
  });
});

document.querySelectorAll("[data-modal]").forEach((button) => {
  button.addEventListener("click", () => {
    closeMenu();
    const modal = document.querySelector(`#${button.dataset.modal}`);
    if (modal && typeof modal.showModal === "function") modal.showModal();
  });
});

if (menuButton) {
  menuButton.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleMenu();
  });
}

document.addEventListener("click", (event) => {
  if (!menuWrapper || !menuWrapper.classList.contains("open")) return;
  if (!event.target.closest(".menu-wrapper")) closeMenu();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeMenu();
});

document.querySelectorAll("[data-close-modal]").forEach((button) => {
  button.addEventListener("click", () => {
    button.closest("dialog")?.close();
  });
});

const loginForm = document.querySelector("#loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = document.querySelector("#loginStatus");
    const form = new FormData(event.currentTarget);
    if (status) status.textContent = "Signing in...";
    try {
      const data = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") })
      });
      state.token = data.token;
      setUser(data.user);
      await refreshProtectedData();
      if (status) status.textContent = "Signed in.";
      event.target.reset();
      document.querySelector("#loginModal")?.close();
    } catch (error) {
      if (status) status.textContent = error.message;
    }
  });
}

const signupForm = document.querySelector("#signupForm");
if (signupForm) {
  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = document.querySelector("#signupStatus");
    const form = new FormData(event.currentTarget);
    if (status) status.textContent = "Creating account...";
    try {
      const data = await api("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({
          role: form.get("role"),
          name: form.get("name"),
          email: form.get("email"),
          phone: form.get("phone"),
          password: form.get("password")
        })
      });
      state.token = data.token;
      setUser(data.user);
      await refreshProtectedData();
      if (status) status.textContent = "Account created.";
      event.target.reset();
      document.querySelector("#signupModal")?.close();
    } catch (error) {
      if (status) status.textContent = error.message;
    }
  });
}

document.querySelectorAll(".availability-grid button").forEach((button) => {
  button.addEventListener("click", () => button.classList.toggle("selected"));
});

// Run application
bootstrap();
