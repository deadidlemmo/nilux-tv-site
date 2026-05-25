const config = window.NILUX_CONFIG || {};

const plans = {
  mensal: {
    label: "1 mês",
    price: "R$ 25,00",
  },
  trimestral: {
    label: "3 meses",
    price: "R$ 70,00",
  },
  semestral: {
    label: "6 meses",
    price: "R$ 130,00",
  },
  anual: {
    label: "12 meses",
    price: "R$ 220,00",
  },
};

const planTypeLabels = {
  padrao: "Padrão",
  adulto: "Adulto incluso",
};

let selectedPlanId = "mensal";
let selectedPlanType = "padrao";
let toastTimer;

const planCards = document.querySelectorAll(".plan-card");
const planTypeButtons = document.querySelectorAll("[data-plan-type]");
const summaryPlan = document.querySelector("#summary-plan");
const summaryType = document.querySelector("#summary-type");
const summaryPrice = document.querySelector("#summary-price");
const paymentButton = document.querySelector("#payment-button");
const customerName = document.querySelector("#customer-name");
const customerWhatsapp = document.querySelector("#customer-whatsapp");
const customerEmail = document.querySelector("#customer-email");
const mobileSummaryPlan = document.querySelector("#mobile-summary-plan");
const mobileSummaryPrice = document.querySelector("#mobile-summary-price");
const mobilePaymentButton = document.querySelector("#mobile-payment-button");
const toast = document.querySelector("#toast");
const currentYear = document.querySelector("#current-year");
const paymentButtons = [paymentButton, mobilePaymentButton];

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 4200);
}

function getPaymentLink(planId, planType) {
  return config.paymentLinks?.[planId]?.[planType] || "";
}

function getPaymentMode() {
  return config.paymentMode === "api" ? "api" : "links";
}

function getIsPaymentReady() {
  if (getPaymentMode() === "api") {
    return Boolean(config.checkoutApiUrl);
  }

  return Boolean(getPaymentLink(selectedPlanId, selectedPlanType));
}

function updateWhatsappLinks() {
  if (!config.whatsappUrl) return;

  document.querySelectorAll('a[href^="https://wa.me/"]').forEach((link) => {
    link.href = config.whatsappUrl;
  });
}

function updateCheckout() {
  const selectedPlan = plans[selectedPlanId];
  const paymentLink = getPaymentLink(selectedPlanId, selectedPlanType);
  const isPaymentReady = getIsPaymentReady();
  const mode = getPaymentMode();

  summaryPlan.textContent = selectedPlan.label;
  summaryType.textContent = planTypeLabels[selectedPlanType];
  summaryPrice.textContent = selectedPlan.price;
  mobileSummaryPlan.textContent = selectedPlan.label;
  mobileSummaryPrice.textContent = selectedPlan.price;

  paymentButtons.forEach((button) => {
    button.href = mode === "links" && paymentLink ? paymentLink : "#";
    button.dataset.paymentReady = isPaymentReady ? "true" : "false";
    button.dataset.paymentMode = mode;
  });

  planCards.forEach((card) => {
    card.classList.toggle("is-selected", card.dataset.planId === selectedPlanId);
  });

  planTypeButtons.forEach((button) => {
    const isActive = button.dataset.planType === selectedPlanType;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

async function createAutomaticCheckout() {
  const customer = getCustomerData();

  const response = await fetch(config.checkoutApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      planId: selectedPlanId,
      planType: selectedPlanType,
      customer,
    }),
  });

  if (!response.ok) {
    throw new Error("Não foi possível criar o checkout.");
  }

  const data = await response.json();
  const checkoutUrl = data.init_point || data.sandbox_init_point || data.url;

  if (!checkoutUrl) {
    throw new Error("O backend não retornou a URL do Mercado Pago.");
  }

  window.location.href = checkoutUrl;
}

function getCustomerData() {
  return {
    name: customerName.value.trim(),
    whatsapp: customerWhatsapp.value.trim(),
    email: customerEmail.value.trim(),
  };
}

function validateCustomerData() {
  const customer = getCustomerData();

  if (!customer.name || !customer.whatsapp) {
    document.querySelector(".summary-card").scrollIntoView({ behavior: "smooth", block: "start" });
    showToast("Informe nome e WhatsApp para continuar.");
    return false;
  }

  return true;
}

planCards.forEach((card) => {
  card.addEventListener("click", () => {
    selectedPlanId = card.dataset.planId;
    updateCheckout();
  });

  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectedPlanId = card.dataset.planId;
      updateCheckout();
    }
  });
});

planTypeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectedPlanType = button.dataset.planType;
    updateCheckout();
  });
});

paymentButtons.forEach((button) => {
  button.addEventListener("click", async (event) => {
    if (button.dataset.paymentReady !== "true") {
      event.preventDefault();
      showToast("Configure o pagamento deste plano no arquivo config.js antes de publicar.");
      return;
    }

    if (button.dataset.paymentMode === "api") {
      event.preventDefault();

      if (!validateCustomerData()) return;

      button.setAttribute("aria-busy", "true");
      button.textContent = "Abrindo...";

      try {
        await createAutomaticCheckout();
      } catch (error) {
        button.removeAttribute("aria-busy");
        button.textContent = button.id === "mobile-payment-button" ? "Pagar" : "Pagar agora";
        showToast(error.message);
      }
    }
  });
});

currentYear.textContent = new Date().getFullYear();
updateWhatsappLinks();
updateCheckout();
