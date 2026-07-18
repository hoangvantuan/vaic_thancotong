"use client";

// Bộ máy trạng thái của trợ lý — nói chuyện với hợp đồng #24 qua bốn tuyến:
//   POST   /api/session   → mở phiên, nhận mã bí mật phiên (chỉ một lần, dạng rõ)
//   POST   /api/turn      → chạy một lượt, trả đúng một trong ba loại kết quả
//   GET    /api/decision  → đọc lại ảnh chụp quyết định cho màn "lý do"
//   DELETE /api/session   → khách tự xoá phiên của mình
//
// KHÔNG có mã truy cập chung: bản trình diễn mở, bấm là chat ngay.
//
// VẪN giữ MÃ BÍ MẬT PHIÊN (#24 mục 9): nó không phải cổng đăng nhập mà là thứ
// chứng minh "phiên này của tôi" — thiếu nó thì chỉ cần biết số phiên là đọc/xoá
// được hội thoại của người khác. Mã lưu trong localStorage, TUYỆT ĐỐI không đưa
// vào đường dẫn và không ghi ra console.

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AssistantError,
  ConversationItem,
  DecisionRecordData,
  TurnResult,
} from "./types";

const SID_KEY = "dmx.demo.sessionId";
const SECRET_KEY = "dmx.demo.sessionSecret";

const SESSION_SECRET_HEADER = "x-session-secret";

/** Lỗi tạm — thử lại được. Còn lại là lỗi không thể tiếp tục an toàn. */
const RETRYABLE = new Set(["data_source_failure", "model_failure", "storage_failure", "network"]);

type Phase = "loading" | "ready" | "error";
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
  /** Mở phiên mới — dùng khi lần mở đầu thất bại. */
  startSession: () => Promise<void>;
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
  const lastTextRef = useRef<string | null>(null);
  const startedRef = useRef(false);

  const authHeaders = useCallback((): HeadersInit => {
    return {
      "content-type": "application/json",
      [SESSION_SECRET_HEADER]: secretRef.current ?? "",
    };
  }, []);

  const startSession = useCallback(async () => {
    setError(null);
    setPhase("loading");
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as WireError;
        setPhase("error");
        setError(classify(body.error?.kind ?? "storage_failure", body.error?.message ?? "Không mở được phiên tư vấn."));
        return;
      }
      const data = (await res.json()) as { sessionId: string; sessionSecret: string };
      secretRef.current = data.sessionSecret;
      try {
        localStorage.setItem(SID_KEY, data.sessionId);
        localStorage.setItem(SECRET_KEY, data.sessionSecret);
      } catch {
        /* storage bị chặn — phiên vẫn dùng được trong tab này */
      }
      setSessionId(data.sessionId);
      setMessages([]);
      setPhase("ready");
    } catch {
      setPhase("error");
      setError(classify("network", "Không kết nối được máy chủ."));
    }
  }, []);

  const resetSession = useCallback(() => {
    try {
      localStorage.removeItem(SID_KEY);
      localStorage.removeItem(SECRET_KEY);
    } catch {
      /* bỏ qua */
    }
    secretRef.current = null;
    setSessionId(null);
    setMessages([]);
    setCanRetry(false);
    setError(null);
  }, []);

  /**
   * Mở phiên mới THAY cho phiên hỏng — giữ nguyên hội thoại đang hiển thị.
   * Trả mã phiên mới, hoặc null nếu không mở được.
   */
  const recoverSession = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { sessionId: string; sessionSecret: string };
      secretRef.current = data.sessionSecret;
      try {
        localStorage.setItem(SID_KEY, data.sessionId);
        localStorage.setItem(SECRET_KEY, data.sessionSecret);
      } catch {
        /* storage bị chặn — phiên vẫn dùng được trong tab này */
      }
      setSessionId(data.sessionId);
      return data.sessionId;
    } catch {
      return null;
    }
  }, []);

  /**
   * Gửi một lượt; nếu phiên hỏng (vd máy chủ khởi động lại làm mất phiên trong
   * RAM) thì mở phiên mới rồi gửi lại đúng một lần — khách không phải làm gì.
   */
  const postTurnWithRecovery = useCallback(
    async (sid: string, text: string): Promise<Response> => {
      const post = (s: string) =>
        fetch("/api/turn", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ sessionId: s, userText: text }),
        });
      const res = await post(sid);
      if (res.ok) return res;
      const peek = (await res.clone().json().catch(() => ({}))) as WireError;
      if (peek.error?.kind !== "forbidden") return res;
      const newSid = await recoverSession();
      if (!newSid) return res;
      return post(newSid);
    },
    [authHeaders, recoverSession]
  );

  const runTurn = useCallback(
    async (text: string) => {
      if (!sessionId) return;
      setStatus("sending");
      setError(null);
      try {
        const res = await postTurnWithRecovery(sessionId, text);
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as WireError;
          const kind = body.error?.kind ?? "storage_failure";
          const message = body.error?.message ?? "Có lỗi khi xử lý lượt này.";
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
    [sessionId, postTurnWithRecovery]
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
    resetSession();
    await startSession(); // mở ngay phiên mới để khách chat tiếp
  }, [sessionId, authHeaders, resetSession, startSession]);

  const dismissError = useCallback(() => setError(null), []);

  // Khôi phục phiên đã lưu; chưa có thì mở phiên mới ngay — không hỏi mã gì cả.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    // localStorage chỉ đọc được sau mount, nên đặt trạng thái trong effect là đúng chỗ.
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      const sid = localStorage.getItem(SID_KEY);
      const secret = localStorage.getItem(SECRET_KEY);
      if (sid && secret) {
        secretRef.current = secret;
        setSessionId(sid);
        setPhase("ready");
        return;
      }
    } catch {
      /* storage bị chặn — coi như chưa có phiên */
    }
    void startSession();
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    phase,
    status,
    sessionId,
    messages,
    error,
    canRetry,
    startSession,
    send,
    retry,
    fetchDecision,
    clearSession,
    dismissError,
  };
}
