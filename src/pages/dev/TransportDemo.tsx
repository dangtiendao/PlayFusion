/**
 * ==============================================================================
 * TRANG CHẨN ĐOÁN REALTIME TRANSPORT (SRC/PAGES/DEV/TRANSPORTDEMO.TSX)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC & NỢ KỸ THUẬT:
 * 1. TRANG PHỤC VỤ CHẨN ĐOÁN & NGHIỆM THU PHASE P3.1C:
 *    - Cung cấp giao diện trực quan để kiểm chứng kết nối Broadcast & Presence trên 2 thiết bị thật.
 *    - Route: `/dev/transport-demo` (`showInNav: false`).
 * 2. NỢ KỸ THUẬT:
 *    - Trang này là DEMO TẠM THỜI — SẼ GỠ BỎ Ở PHASE P3.3 khi tính năng Phòng Đấu chính thức
 *      hoàn thành.
 * 3. BẰNG CHỨNG MÀN HÌNH CHỦ ĐỘNG BẬT/TẮT:
 *    - Hook `useMatchChannel` nhận cờ `enabled` gắn trực tiếp theo nút "Vào kênh" / "Rời kênh"
 *      và vòng đời mount/unmount của màn hình.
 * ==============================================================================
 */

import React, { useState, useRef, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import {
  useMatchChannel,
  type ChannelStatus,
  type PresenceMember,
  type TransportEnvelope,
} from '@/transport';

interface LoggedMessage {
  readonly id: string;
  readonly type: string;
  readonly senderId: string;
  readonly sentAt: string;
  readonly latencyMs: number;
  readonly payload: unknown;
}

export const TransportDemo: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);

  // State nhập mã kênh (chuẩn hóa 6 ký tự viết hoa)
  const [inputCode, setInputCode] = useState<string>('DEMO01');
  const [activeRoomCode, setActiveRoomCode] = useState<string | null>(null);
  const [messages, setMessages] = useState<LoggedMessage[]>([]);
  const [pingCounter, setPingCounter] = useState<number>(0);
  const [sendError, setSendError] = useState<string | null>(null);

  // Khởi tạo thời điểm tham gia cố định cho phiên
  const joinedAtRef = useRef<string>(new Date().toISOString());

  // Thông tin thành viên hiện tại
  const selfMember = useMemo<PresenceMember>(() => {
    const userId = user?.id || 'anon-local-user';
    const displayName = profile?.displayName || (user?.isAnonymous ? 'Khách' : 'Người chơi');
    return {
      userId,
      displayName,
      joinedAt: joinedAtRef.current,
    };
  }, [user?.id, user?.isAnonymous, profile?.displayName]);

  /**
   * Xử lý nhận thông điệp Envelope hợp lệ từ kênh Broadcast
   */
  const handleMessage = useCallback((envelope: TransportEnvelope) => {
    const now = Date.now();
    const sentTime = new Date(envelope.sentAt).getTime();
    const latencyMs = Number.isNaN(sentTime) ? 0 : Math.max(0, now - sentTime);

    setMessages((prev) => [
      {
        id: `${envelope.sentAt}-${Math.random().toString(36).slice(2, 7)}`,
        type: envelope.type,
        senderId: envelope.senderId,
        sentAt: envelope.sentAt,
        latencyMs,
        payload: envelope.payload,
      },
      ...prev.slice(0, 19), // Giữ trần 20 tin nhắn gần nhất
    ]);
  }, []);

  // Đấu nối hook transport - Enabled gắn chặt với cờ activeRoomCode của màn hình
  const isJoined = Boolean(activeRoomCode);
  const { status, members, send, reconnect } = useMatchChannel({
    matchId: activeRoomCode,
    self: selfMember,
    onMessage: handleMessage,
    enabled: isJoined,
  });

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(trimmed)) {
      setSendError('Mã phòng phải gồm đúng 6 ký tự chữ in hoa hoặc số (A-Z, 0-9).');
      return;
    }
    setSendError(null);
    setActiveRoomCode(trimmed);
  };

  const handleLeave = () => {
    setSendError(null);
    setActiveRoomCode(null);
  };

  const handleSendPing = async () => {
    if (status !== 'connected') return;
    try {
      setSendError(null);
      const nextPing = pingCounter + 1;
      setPingCounter(nextPing);
      await send('ping', { n: nextPing });
    } catch (err) {
      setSendError(err instanceof Error ? err.message : String(err));
    }
  };

  const getStatusBadge = (s: ChannelStatus) => {
    switch (s) {
      case 'connected':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Đã kết nối (connected)
          </span>
        );
      case 'connecting':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            Đang kết nối... (connecting)
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            Lỗi kết nối (error)
          </span>
        );
      case 'closed':
      case 'idle':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20">
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            Đã ngắt kết nối ({s})
          </span>
        );
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* HEADER */}
      <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span>📡</span> Chẩn Đoán Realtime Transport (P3.1c Demo)
          </h1>
          <Link
            to="/"
            className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
          >
            ← Quay lại Trang Chủ
          </Link>
        </div>
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 font-mono">
          [TRANG DEV TẠM THỜI — SẼ GỠ BỎ Ở PHASE P3.3 KHI HOÀN THÀNH PHÒNG ĐẤU CHÍNH THỨC]
        </p>
      </div>

      {/* 1. MÃ PHÒNG & ĐIỀU KHIỂN KẾT NỐI */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          1. Nhập Mã Kênh & Điều Khiển Vòng Đời
        </h2>

        <form onSubmit={handleJoin} className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <input
              type="text"
              maxLength={6}
              disabled={isJoined}
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value.toUpperCase())}
              placeholder="VD: DEMO01"
              className="px-4 py-2 text-lg font-mono tracking-widest font-bold text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
            />
          </div>

          {!isJoined ? (
            <button
              type="submit"
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-medium rounded-lg transition-all shadow-sm"
            >
              Vào kênh (Connect)
            </button>
          ) : (
            <button
              type="button"
              onClick={handleLeave}
              className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-medium rounded-lg transition-all shadow-sm"
            >
              Rời kênh (Disconnect)
            </button>
          )}

          {status === 'error' && (
            <button
              type="button"
              onClick={() => void reconnect()}
              className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-all shadow-sm"
            >
              Thử kết nối lại
            </button>
          )}
        </form>

        {sendError && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-lg text-xs text-rose-600 dark:text-rose-300">
            {sendError}
          </div>
        )}
      </div>

      {/* 2. TRẠNG THÁI KẾT NỐI & PRESENCE */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            2. Trạng Thái Kênh
          </h2>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600 dark:text-slate-300">Kênh hoạt động:</span>
            <span className="font-mono font-bold text-slate-900 dark:text-white">
              {activeRoomCode ? `match:${activeRoomCode}` : '(Chưa vào kênh)'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600 dark:text-slate-300">Trạng thái:</span>
            {getStatusBadge(status)}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              3. Thành Viên Hiện Diện (Presence)
            </h2>
            <span className="text-xs bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full font-bold">
              {members.length} người
            </span>
          </div>

          {members.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500 italic">
              Chưa có thành viên nào (kênh chưa kết nối hoặc chưa track presence).
            </p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {members.map((m) => {
                const isSelf = m.userId === selfMember.userId;
                return (
                  <li
                    key={`${m.userId}-${m.joinedAt}`}
                    className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60"
                  >
                    <span className="font-medium text-slate-900 dark:text-slate-200">
                      {m.displayName}{' '}
                      {isSelf && <span className="text-indigo-500 font-bold">(Bạn)</span>}
                    </span>
                    <span className="text-slate-400 font-mono text-[10px]">
                      {new Date(m.joinedAt).toLocaleTimeString()}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* 3. THAO TÁC PHÁT SÓNG PING */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          4. Thao Tác Phát Sóng (Broadcast Ping)
        </h2>
        <div className="flex items-center gap-4">
          <button
            type="button"
            disabled={status !== 'connected'}
            onClick={() => void handleSendPing()}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-40 disabled:pointer-events-none text-white text-sm font-semibold rounded-lg transition-all shadow-sm flex items-center gap-2"
          >
            <span>📡</span> Gửi Broadcast Ping
          </button>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Đã gửi: <strong className="text-slate-900 dark:text-white">{pingCounter}</strong> lượt
            ping
          </span>
        </div>
      </div>

      {/* 4. NHẬT KÝ THÔNG ĐIỆP GẦN NHẤT */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            5. Nhật Ký 20 Thông Điệp Gần Nhất (Realtime Log)
          </h2>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => setMessages([])}
              className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              Xóa log
            </button>
          )}
        </div>

        {messages.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
            Chưa có thông điệp broadcast nào được nhận. Hãy kết nối 2 thiết bị vào cùng mã kênh và
            bấm &quot;Gửi Broadcast Ping&quot;.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="p-2.5 rounded-l-lg">Loại</th>
                  <th className="p-2.5">Người gửi</th>
                  <th className="p-2.5">Thời gian</th>
                  <th className="p-2.5">Độ trễ</th>
                  <th className="p-2.5 rounded-r-lg">Dữ liệu (Payload)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                {messages.map((msg) => (
                  <tr key={msg.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="p-2.5 font-bold text-indigo-600 dark:text-indigo-400">
                      {msg.type}
                    </td>
                    <td className="p-2.5 text-slate-600 dark:text-slate-300" title={msg.senderId}>
                      {msg.senderId.slice(0, 8)}...
                    </td>
                    <td className="p-2.5 text-slate-500">
                      {new Date(msg.sentAt).toLocaleTimeString()}
                    </td>
                    <td className="p-2.5">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${
                          msg.latencyMs < 100
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                            : msg.latencyMs < 300
                              ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                              : 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                        }`}
                      >
                        {msg.latencyMs} ms
                      </span>
                    </td>
                    <td className="p-2.5 text-slate-700 dark:text-slate-200">
                      {JSON.stringify(msg.payload)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default TransportDemo;
