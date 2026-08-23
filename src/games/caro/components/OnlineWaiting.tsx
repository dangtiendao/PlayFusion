/**
 * ==============================================================================
 * ONLINE WAITING ROOM COMPONENT (SRC/GAMES/CARO/COMPONENTS/ONLINEWAITING.TSX)
 * ==============================================================================
 *
 * GIAO DIỆN MÀN HÌNH CHỜ ĐỐI THỦ (PHASE P3.3B):
 * 1. Hiển thị mã phòng 6 ký tự TO, font monospace.
 * 2. Nút Sao chép mã & Nút Chia sẻ (Web Share API + Fallback copy deep link).
 * 3. Đồng hồ đếm ngược hết hạn (TTL 30 phút).
 * 4. Nút Hủy phòng.
 * 5. 2 Đường phát hiện ghép phòng thành công (Realtime Broadcast + Polling Fallback 5s).
 * ==============================================================================
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { GameShellApi } from '../../types';
import { roomRepository } from '@/repositories/roomRepository';
import { useMatchChannel, type PresenceMember } from '@/transport';
import { useAuthStore } from '@/stores/authStore';

export interface OnlineWaitingProps {
  /** Mã phòng 6 ký tự */
  readonly code: string;
  /** Thời điểm hết hạn phòng (ISO string) */
  readonly expiresAt: string;
  /** Callback khi phát hiện ván đấu đã ghép thành công -> điều hướng vào trận */
  readonly onMatchFound: (matchId: string, mySeat: number) => void;
  /** Callback khi hủy phòng -> quay về sảnh */
  readonly onCancel: () => void;
  /** Tiện ích âm thanh & xúc giác */
  readonly shellApi?: GameShellApi;
}

export const OnlineWaiting: React.FC<OnlineWaitingProps> = ({
  code,
  expiresAt,
  onMatchFound,
  onCancel,
  shellApi,
}) => {
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const joinedAtRef = useRef<string>(new Date().toISOString());

  const selfMember = useMemo<PresenceMember>(() => {
    return {
      userId: user?.id || 'host-user',
      displayName: profile?.displayName || (user?.isAnonymous ? 'Khách' : 'Chủ phòng'),
      joinedAt: joinedAtRef.current,
    };
  }, [user?.id, user?.isAnonymous, profile?.displayName]);

  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [remainingSec, setRemainingSec] = useState<number>(() => {
    const diff = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
    return Math.max(0, diff);
  });

  const matchedHandledRef = useRef(false);

  // Xử lý khi phát hiện ván đấu đã ghép thành công (Host)
  const handleMatched = useCallback(
    (matchId: string, mySeat: number) => {
      if (matchedHandledRef.current) return;
      matchedHandledRef.current = true;
      shellApi?.playSfx('success');
      shellApi?.hapticSuccess();
      onMatchFound(matchId, mySeat);
    },
    [shellApi, onMatchFound],
  );

  // 1. ĐƯỜNG 1: REALTIME BROADCAST & PRESENCE QUA USEMATCHCHANNEL
  const { members } = useMatchChannel({
    matchId: code,
    self: selfMember,
    enabled: true,
    onMessage: (msg) => {
      // Khi Guest vào phòng sẽ phát sóng type: 'room_matched'
      if (msg.type === 'room_matched') {
        const payload = msg.payload as { matchId?: string; hostSeat?: number };
        if (payload?.matchId) {
          handleMatched(payload.matchId, payload.hostSeat ?? 0);
        }
      }
    },
  });

  // 2. ĐƯỜNG 2: POLLING FALLBACK 5 GIÂY (PHÒNG KHI MẤT GÓI TIN REALTIME)
  useEffect(() => {
    const timer = setInterval(async () => {
      if (matchedHandledRef.current) return;
      try {
        const res = await roomRepository.getRoomStatus(code);
        if (res.status === 'matched' && res.matchId) {
          handleMatched(res.matchId, res.mySeat);
        }
      } catch {
        // Bỏ qua lỗi polling mạng tạm thời
      }
    }, 5000);

    return () => clearInterval(timer);
  }, [code, handleMatched]);

  // 3. ĐẾM NGƯỢC HẾT HẠN PHÒNG
  useEffect(() => {
    const interval = setInterval(() => {
      const diff = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
      setRemainingSec(Math.max(0, diff));
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt]);

  // Xử lý sao chép mã phòng
  const handleCopyCode = async () => {
    try {
      shellApi?.playSfx('click');
      shellApi?.hapticTap();
      await navigator.clipboard.writeText(code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // Fallback
    }
  };

  // Xử lý chia sẻ link mời (Web Share API + Fallback copy link)
  const handleShare = async () => {
    shellApi?.playSfx('click');
    shellApi?.hapticTap();

    const shareUrl = `${window.location.origin}/room/${code}`;
    const shareData = {
      title: 'Vào chơi Cờ Caro với tôi!',
      text: `Vào phòng đấu Cờ Caro mã ${code}:`,
      url: shareUrl,
    };

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // Người dùng hủy share hoặc không hỗ trợ -> tiếp tục fallback copy link
      }
    }

    // Fallback copy link
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // Fallback
    }
  };

  // Xử lý hủy phòng
  const handleCancelRoom = async () => {
    try {
      shellApi?.playSfx('click');
      shellApi?.hapticTap();
      setIsCancelling(true);
      await roomRepository.cancelRoom(code);
      onCancel();
    } catch {
      onCancel();
    } finally {
      setIsCancelling(false);
    }
  };

  // Định dạng thời gian đếm ngược mm:ss
  const formatCountdown = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const isExpired = remainingSec <= 0;

  return (
    <div
      data-testid="online-waiting"
      className="flex flex-col items-center justify-between w-full max-w-md mx-auto p-4 sm:p-6 space-y-6 animate-fade-in text-center"
    >
      {/* Header */}
      <div className="w-full flex items-center justify-between">
        <button
          type="button"
          onClick={handleCancelRoom}
          disabled={isCancelling}
          className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-200/80 dark:bg-slate-800/80 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
        >
          <span>✕ Hủy phòng</span>
        </button>

        <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30">
          ⏳ Hết hạn sau: {formatCountdown(remainingSec)}
        </span>
      </div>

      {/* Thông báo sao chép link thành công */}
      {copiedLink && (
        <div
          data-testid="copy-link-toast"
          className="w-full p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-bold animate-fade-in flex items-center justify-center gap-2"
        >
          <span>✅</span>
          <span>Đã sao chép link mời phòng! Bạn có thể dán vào Zalo/Messenger.</span>
        </div>
      )}

      {/* Khối chính hiển thị Mã Phòng TO */}
      <div className="w-full p-6 rounded-3xl bg-gradient-to-b from-slate-100/90 to-slate-200/90 dark:from-slate-800/90 dark:to-slate-900/90 border border-slate-300 dark:border-slate-700 shadow-xl space-y-4">
        <div className="space-y-1">
          <span className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
            Mã phòng của bạn
          </span>
          <div
            data-testid="room-code-display"
            className="text-4xl sm:text-5xl font-black font-mono tracking-widest text-cyan-600 dark:text-cyan-400 py-2 select-all drop-shadow-sm"
          >
            {code}
          </div>
        </div>

        {/* Nút Copy mã & Share link */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <button
            type="button"
            data-testid="copy-code-btn"
            onClick={handleCopyCode}
            className="min-h-[48px] py-2.5 px-4 rounded-2xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-200 font-bold text-xs shadow-sm active:scale-95 transition-all flex items-center justify-center gap-1.5"
          >
            <span>{copiedCode ? '✅' : '📋'}</span>
            <span>{copiedCode ? 'Đã chép' : 'Chép mã'}</span>
          </button>

          <button
            type="button"
            data-testid="share-room-btn"
            onClick={handleShare}
            className="min-h-[48px] py-2.5 px-4 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-white font-bold text-xs shadow-md shadow-cyan-500/20 active:scale-95 transition-all flex items-center justify-center gap-1.5"
          >
            <span>📤</span>
            <span>Chia sẻ link</span>
          </button>
        </div>
      </div>

      {/* Trạng thái Presence & Chờ đợi */}
      <div className="w-full p-4 rounded-2xl bg-slate-100/60 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-center justify-center gap-3">
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500" />
        </span>
        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
          {members.length > 1
            ? 'Đối thủ đã vào phòng! Đang chuẩn bị bàn cờ...'
            : isExpired
              ? 'Phòng đấu đã hết thời gian chờ.'
              : 'Đang chờ đối thủ tham gia...'}
        </span>
      </div>

      {/* Cảnh báo hết hạn */}
      {isExpired && (
        <div className="w-full p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-bold space-y-3">
          <p>Phòng đấu đã hết hạn 30 phút. Vui lòng tạo phòng mới.</p>
          <button
            type="button"
            onClick={onCancel}
            className="w-full py-2.5 rounded-xl bg-rose-600 text-white font-bold text-xs"
          >
            Quay lại Sảnh
          </button>
        </div>
      )}
    </div>
  );
};
