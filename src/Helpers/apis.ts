import axios from "axios";

export const AI_AGENT_URL = "https://a3wb4h5l3ao4rvv6yle57zjj.agents.do-ai.run";
const baseURL = "https://api.biddipal.com/biddiPalAPI/v1/";

export const AIagentAPIClientInstance = axios.create({
  baseURL: AI_AGENT_URL,
  withCredentials: false,
  headers: {
    "Content-Type": "application/json",
    ...(import.meta.env.DO_AI_TOKEN
      ? { Authorization: `Bearer ${import.meta.env.DO_AI_TOKEN}` }
      : {}),
  },
});

const ValstineDBAPI
 = axios.create({
  baseURL: baseURL,
  withCredentials: true, // allow sending/receiving auth cookie
});

// Remove Content-Type header for FormData requests so browser sets correct boundary
ValstineDBAPI
.interceptors.request.use((config) => {
  if (
    config.data &&
    (typeof FormData !== 'undefined') &&
    config.data instanceof FormData
  ) {
    if (config.headers && config.headers['Content-Type']) {
      delete config.headers['Content-Type'];
    }
  }
  return config;
});

export const configuration = (_token: string | null) => {
  // If a token is provided, attach it as a Bearer token.
  // This acts as a fallback when cross-site cookies are not available (e.g., some mobile browsers).
  if (_token) {
    ValstineDBAPI
    .defaults.headers.common["Authorization"] = `Bearer ${_token}`;
    AIagentAPIClientInstance.defaults.headers.common["Authorization"] = `Bearer ${_token}`;
  } else {
    delete ValstineDBAPI
    .defaults.headers.common["Authorization"];
    delete AIagentAPIClientInstance.defaults.headers.common["Authorization"];
  }
};

export const resetConfiguration = () => {
  // Remove any default auth header and leave interceptors intact
  delete ValstineDBAPI
  .defaults.headers.common["Authorization"];
  delete AIagentAPIClientInstance.defaults.headers.common["Authorization"];
};

// Response interceptor: on 401, signal that the session has expired.
// The AuthInitializer component listens for this event and handles cleanup + redirect.
ValstineDBAPI
.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error?.response?.status === 401) {
      window.dispatchEvent(new CustomEvent("biddipal:session-expired"));
    }
    return Promise.reject(error);
  }
);

export default ValstineDBAPI
;
