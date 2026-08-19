import { createContext, useContext, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";

const AuthContext = createContext(null);
const AUTH_TOKEN_KEY = "auth_token";
const AUTH_ERROR_KEY = "auth_error";

function decodeJwtPayload(token) {
  try {
    const base64Payload = token.split(".")[1];

    if (!base64Payload) {
      return null;
    }

    const normalized = base64Payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const jsonPayload = atob(padded);

    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

function getUserFromPayload(payload) {
  if (!payload) {
    return null;
  }

  return {
    id: payload.id,
    username: payload.username,
    role: payload.role,
    email: payload.email || null,
    nombre_completo: payload.nombre_completo || null,
    avatar_url: payload.avatar_url || null,
  };
}

function restoreAuthState() {
  const storedToken = localStorage.getItem(AUTH_TOKEN_KEY);

  if (!storedToken) {
    return { token: null, user: null };
  }

  const payload = decodeJwtPayload(storedToken);

  if (!payload?.exp) {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    return { token: null, user: null };
  }

  const nowInSeconds = Math.floor(Date.now() / 1000);

  if (payload.exp <= nowInSeconds) {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    sessionStorage.setItem(
      AUTH_ERROR_KEY,
      "Tu sesión expiró. Iniciá sesión nuevamente.",
    );
    return { token: null, user: null };
  }

  return {
    token: storedToken,
    user: getUserFromPayload(payload),
  };
}

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [authState, setAuthState] = useState(() => restoreAuthState());

  const token = authState.token;
  const user = authState.user;

  const applyTokenSession = (authToken, userData) => {
    const payload = decodeJwtPayload(authToken);

    if (!payload?.exp) {
      throw new Error("Token inválido");
    }

    const nowInSeconds = Math.floor(Date.now() / 1000);

    if (payload.exp <= nowInSeconds) {
      throw new Error("Token expirado");
    }

    const normalizedUser = userData || getUserFromPayload(payload);

    localStorage.setItem(AUTH_TOKEN_KEY, authToken);
    setAuthState({ token: authToken, user: normalizedUser });
    sessionStorage.removeItem(AUTH_ERROR_KEY);

    // Backend ya respondió (login exitoso), así que este pedido de warmup
    // llega con el backend despierto y dispara el ping best-effort a pf-ai.
    api.get("/api/warmup").catch(() => {});

    return normalizedUser;
  };

  const login = async (username, password) => {
    try {
      const response = await api.post("/api/auth/login", {
        username,
        password,
      });
      const { token: authToken, user: userData } = response.data;

      return applyTokenSession(authToken, userData);
    } catch (error) {
      throw new Error(error?.message || "No se pudo iniciar sesión");
    }
  };

  const completeOAuthLogin = (authToken) => {
    return applyTokenSession(authToken);
  };

  const logout = () => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    setAuthState({ token: null, user: null });
    navigate("/login", { replace: true });
  };

  const value = useMemo(
    () => ({
      user,
      token,
      login,
      completeOAuthLogin,
      logout,
      isAuthenticated: Boolean(token && user),
    }),
    [user, token],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth debe usarse dentro de AuthProvider");
  }

  return context;
}
