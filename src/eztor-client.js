function summarizePayload(payload) {
  if (payload === null || payload === undefined) {
    return "";
  }

  if (typeof payload === "string") {
    return payload.slice(0, 400);
  }

  return JSON.stringify(payload).slice(0, 400);
}

export class EztorClient {
  constructor({ config, stateStore, logger }) {
    this.config = config;
    this.stateStore = stateStore;
    this.logger = logger;
    this.token = config.token;
  }

  async initialize() {
    const state = await this.stateStore.load();

    if (state.refreshedToken) {
      this.token = state.refreshedToken;
      this.logger.info("Loaded refreshed token from state file.");
    }
  }

  buildHeaders(includeJson = true) {
    const headers = {
      uniqeabc: this.config.uniqeabc,
      Authorization: `Bearer ${this.token}`
    };

    if (includeJson) {
      headers["Content-Type"] = "application/json";
    }

    return headers;
  }

  async request(path, { method = "POST", body, absoluteUrl = null } = {}) {
    const url = absoluteUrl ?? `${this.config.apiBaseUrl}${path}`;
    const response = await fetch(url, {
      method,
      headers: this.buildHeaders(method !== "GET"),
      body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(20_000)
    });

    const refreshedToken = response.headers.get("x-refreshed-token");

    if (refreshedToken && refreshedToken !== this.token) {
      this.token = refreshedToken;
      await this.stateStore.merge({
        refreshedToken,
        refreshedAt: new Date().toISOString()
      });
      this.logger.info("Saved refreshed token from API response.");
    }

    const text = await response.text();
    let payload = text;

    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text;
    }

    if (!response.ok) {
      const error = new Error(`[${response.status}] ${path}: ${summarizePayload(payload)}`);
      error.status = response.status;
      error.path = path;
      error.payload = payload;
      error.isAuthFailure = response.status === 401 || response.status === 403;
      throw error;
    }

    if (
      payload &&
      typeof payload === "object" &&
      typeof payload.message === "string" &&
      /unauthorized|forbidden|invalid token|expired token|jwt/i.test(payload.message)
    ) {
      const error = new Error(`[soft-auth] ${path}: ${payload.message}`);
      error.status = response.status;
      error.path = path;
      error.payload = payload;
      error.isAuthFailure = true;
      throw error;
    }

    return payload;
  }

  getBusinessDetails() {
    const absoluteUrl = `${this.config.publicBaseUrl}/getBDetails?BName=${encodeURIComponent(this.config.uniqeabc)}`;
    return this.request("", { method: "GET", absoluteUrl });
  }

  getEmployeesMetadata() {
    return this.request("/getEmployyessCommentsAndGallery", { method: "GET" });
  }

  getTreatmentCatalog() {
    return this.request("/getAllTreatmentsFilter", { method: "GET" });
  }

  getFutureOrdersById(userId) {
    return this.request("/getFutureOrdersById", {
      body: { _id: userId }
    });
  }

  getTablesOrder(userId = "") {
    return this.request("/getTablesOrder", {
      body: userId ? { user_id: userId } : {}
    });
  }

  getListAvailableTorim(orderDetails) {
    return this.request("/getListAvailableTorim", {
      body: { orderDetails }
    });
  }

  getTheClosestTorim(orderDetailsList) {
    return this.request("/getTheClosestTorim", {
      body: { obj: orderDetailsList }
    });
  }

  finOrderTor(payload) {
    return this.request("/finOrderTor", { body: payload });
  }
}
