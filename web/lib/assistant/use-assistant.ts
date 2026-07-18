"use client";

// Bộ máy trạng thái của trợ lý — nói chuyện với hợp đồng #24 qua ba tuyến:
//   POST /api/session   → mở phiên, nhận mã bí mật phiên (chỉ một lần, dạng rõ)
//   POST /api/turn      → chạy một lượt, trả đúng một trong ba loại kết quả
//   GET  /api/decision  → đọc lại ảnh chụp quyết định cho màn "lý do"
//   DELETE /api/session → khách tự xoá phiên của mình
//
// Quy tắc sở hữu (#24 mục 9): mọi thao tác chạm phiên gửi CẢ mã truy cập chung LẪN
// mã bí mật phiên qua header. Mã bí mật lưu trong localStorage của trình duyệt, và
// TUYỆT ĐỐI không đưa vào đường dẫn, không ghi ra console.
//
// "Bỏ cổng" cho demo: nếu đặt NEXT_PUBLIC_DEMO_ACCESS_CODE thì trợ lý TỰ mở phiên
// bằng mã đó — bấm launcher là vào chat ngay, khỏi màn nhập mã. Không đặt biến này
// thì màn nhập mã (AccessGate) trở lại làm cổng như #28 yêu cầu.

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AssistantError,
  ConversationItem,
  DecisionRecordData,
  TurnResult,
} from "./types";

const SID_KEY = "dmx.demo.sessionId";
const SECRET_KEY = "dmx.demo.sessionSecret";
const AC_KEY = "dmx.demo.accessCode";

const ACCESS_CODE_HEADER = "x-demo-access-code";
const SESSION_SECRET_HEADER = "x-session-secret";

/** Lỗi tạm — thử lại được. Còn lại là lỗi không thể tiếp tục an toàn. */
const RETRYABLE = new Set(["data_source_failure", "model_failure", "storage_failure", "network"]);

type Phase = "loading" | "locked" | "ready";
type Status = "idle" | "sending";

interface TurnResponse {
  turnId: string;
  result: TurnResult;
}

interface WireError {
  error?: { kind?: string; message?: string };
}

function classify(kind: string, message: string): AssistantError {
  return { kind, message, retryable: RETRYABLE.has(kind) };
}

let idSeq = 0;
const nextId = () => `it_${Date.now().toString(36)}_${(idSeq++).toString(36)}`;

export interface Assistant {
  phase: Phase;
  status: Status;
  sessionId: string | null;
  messages: ConversationItem[];
  error: AssistantError | null;
  canRetry: boolean;
  unlock: (accessCode: string) => Promise<void>;
  send: (text: string) => Promise<void>;
  retry: () => Promise<void>;
  fetchDecision: (turnId: string) => Promise<DecisionRecordData>;
  clearSession: () => Promise<void>;
  dismissError: () => void;
}

export function useAssistant(): Assistant {
  const [phase, setPhase] = useState<Phase>("loading");
  const [status, setStatus] = useState<Status>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationItem[]>([]);
  const [error, setError] = useState<AssistantError | null>(null);
  const [canRetry, setCanRetry] = useState(false);

  // Giữ ngoài render: mã bí mật (không cho lọt vào cây React/log) và text lần gửi lỗi.
  const secretRef = useRef<string | null>(null);
  const accessRef = useRef<string | null>(null);
  const lastTextRef = useRef<string | null>(null);
  const autoTried = useRef(false);

  const demoCode = process.env.NEXT_PUBLIC_DEMO_ACCESS_CODE?.trim() || null;

  const authHeaders = useCallback((): HeadersInit => {
    return {
      "content-type": "application/json",
      [ACCESS_CODE_HEADER]: accessRef.current ?? "",
      [SESSION_SECRET_HEADER]: secretRef.current ?? "",
    };
  }, []);

  const resetToLocked = useCallback((message: string) => {
    try {
      localStorage.removeItem(SID_KEY);
      localStorage.removeItem(SECRET_KEY);
      sessionStorage.removeItem(AC_KEY);
    } catch {
      /* bỏ qua */
    }
    secretRef.current = null;
    accessRef.current = null;
    autoTried.current = false; // cho phép tự mở lại phiên (chế độ bỏ cổng)
    setSessionId(null);
    setMessages([]);
    setCanRetry(false);
    setPhase("locked");
    setError(message ? classify("forbidden", message) : null);
  }, []);

  const unlock = useCallback(async (accessCode: string) => {
    setError(null);
    const code = accessCode.trim();
    if (!code) {
      setPhase("locked");
      setError(classify("invalid_input", "Mời nhập mã truy cập."));
      return;
    }
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "content-type": "application/json", [ACCESS_CODE_HEADER]: code },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as WireError;
        setPhase("locked");
        setError(classify(body.error?.kind ?? "forbidden", body.error?.message ?? "Mã truy cập không hợp lệ."));
        return;
      }
      const data = (await res.json()) as { sessionId: string; sessionSecret: string };
      secretRef.current = data.sessionSecret;
      accessRef.current = code;
      try {
        localStorage.setItem(SID_KEY, data.sessionId);
        localStorage.setItem(SECRET_KEY, data.sessionSecret);
        sessionStorage.setItem(AC_KEY, code);
      } catch {
        /* storage bị chặn — phiên vẫn dùng được trong tab này */
      }
      setSessionId(data.sessionId);
      setMessages([]);
      setError(null);
      setPhase("ready");
    } catch {
      setPhase("locked");
      setError(classify("network", "Không kết nối được máy chủ. Thử lại giúp em nhé."));
    }
  }, []);

  const runTurn = useCallback(
    async (text: string) => {
      if (!sessionId) return;
      setStatus("sending");
      setError(null);
      try {
        const res = await fetch("/api/turn", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ sessionId, userText: text }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as WireError;
          const kind = body.error?.kind ?? "storage_failure";
          const message = body.error?.message ?? "Có lỗi khi xử lý lượt này.";
          if (kind === "forbidden") {
            resetToLocked("Phiên không còn hợp lệ. Đang mở phiên mới…");
            return;
          }
          setError(classify(kind, message));
          setCanRetry(RETRYABLE.has(kind));
          lastTextRef.current = RETRYABLE.has(kind) ? text : null;
          return;
        }
        const data = (await res.json()) as TurnResponse;
        setMessages((prev) => [
          ...prev,
          { id: nextId(), sender: "assistant", turnId: data.turnId, result: data.result },
        ]);
        setCanRetry(false);
        lastTextRef.current = null;
      } catch {
        setError(classify("network", "Mất kết nối khi gửi. Anh/chị thử lại giúp em nhé."));
        setCanRetry(true);
        lastTextRef.current = text;
      } finally {
        setStatus("idle");
      }
    },
    [sessionId, authHeaders, resetToLocked]
  );

  const send = useCallback(
    async (text: string) => {
      const t = text.trim();
      if (!t || status === "sending" || phase !== "ready") return;
      setMessages((prev) => [...prev, { id: nextId(), sender: "user", text: t }]);
      await runTurn(t);
    },
    [status, phase, runTurn]
  );

  const retry = useCallback(async () => {
    const t = lastTextRef.current;
    if (!t || status === "sending") return;
    await runTurn(t);
  }, [status, runTurn]);

  const fetchDecision = useCallback(
    async (turnId: string): Promise<DecisionRecordData> => {
      const res = await fetch(`/api/decision?turnId=${encodeURIComponent(turnId)}`, {
        headers: authHeaders(),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as WireError;
        throw new Error(body.error?.message ?? "Không đọc được lý do quyết định.");
      }
      const data = (await res.json()) as { decision: DecisionRecordData };
      return data.decision;
    },
    [authHeaders]
  );

  const clearSession = useCallback(async () => {
    if (!sessionId) return;
    try {
      await fetch(`/api/session?sessionId=${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
    } catch {
      /* dù mạng lỗi vẫn xoá phía client để không giữ lại dấu vết phiên */
    }
    resetToLocked(""); // chế độ bỏ cổng: sẽ tự mở phiên mới ngay
  }, [sessionId, authHeaders, resetToLocked]);

  const dismissError = useCallback(() => setError(null), []);

  // Nạp lại phiên đã lưu; nếu chưa có thì (chế độ bỏ cổng) tự mở phiên, hoặc hiện gate.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      const sid = localStorage.getItem(SID_KEY);
      const secret = localStorage.getItem(SECRET_KEY);
      const ac = sessionStorage.getItem(AC_KEY);
      if (sid && secret && ac) {
        secretRef.current = secret;
        accessRef.current = ac;
        setSessionId(sid);
        setPhase("ready");
        return;
      }
    } catch {
      /* storage bị chặn — coi như chưa có phiên */
    }
    if (demoCode) {
      autoTried.current = true;
      void unlock(demoCode); // giữ phase "loading" tới khi mở xong → không chớp gate
      return;
    }
    setPhase("locked");
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tự mở lại phiên sau khi xoá/hết hạn (chỉ khi bật chế độ bỏ cổng).
  useEffect(() => {
    if (phase === "locked" && demoCode && !autoTried.current) {
      autoTried.current = true;
      setPhase("loading");
      void unlock(demoCode);
    }
  }, [phase, demoCode, unlock]);

  return {
    phase,
    status,
    sessionId,
    messages,
    error,
    canRetry,
    unlock,
    send,
    retry,
    fetchDecision,
    clearSession,
    dismissError,
  };
}
