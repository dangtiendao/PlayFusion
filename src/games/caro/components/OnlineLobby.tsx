/**
 * ==============================================================================
 * ONLINE LOBBY COMPONENT (SRC/GAMES/CARO/COMPONENTS/ONLINELOBBY.TSX)
 * ==============================================================================
 *
 * GIAO DIỆN SẢNH PHÒNG ĐẤU TRỰC TUYẾN (PHASE P3.3B):
 * 1. Khối Tạo phòng mới (Nút to, sinh mã 6 ký tự).
 * 2. Khối Nhập mã phòng 6 ký tự (Auto-uppercase, validate an toàn, hiển thị lỗi rõ ràng).
 * ==============================================================================
 */

import React, { useState, useCallback } from 'react';
import type { GameShellApi } from '../../types';
import { roomRepository } from '@/repositories/roomRepository';

export interface OnlineLobbyProps {
  /** Chế độ phòng đấu ('online_1v1' hoặc 'online_correspondence') */
  readonly mode?: 'online_1v1' | 'online_correspondence';
  /** Callback quay lại màn hình chọn chế độ */
  readonly onBack: () => void;
  /** Callback khi tạo phòng thành công -> chuyển sang màn hình chờ */
  readonly onRoomCreated: (code: string, expiresAt: string) => void;
  /** Callback khi vào phòng thành công -> chuyển sang màn hình trận đấu */
  readonly onRoomJoined: (matchId: string, mySeat: number, gameId: string, code: string) => void;
  /** Tiện ích âm thanh & xúc giác */
  readonly shellApi?: GameShellApi;
}

export const OnlineLobby: React.FC<OnlineLobbyProps> = ({
  mode = 'online_1v1',
  onBack,
  onRoomCreated,
  onRoomJoined,
  shellApi,
}) => {
  const [inputCode, setInputCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Xử lý tạo phòng mới
  const handleCreateRoom = useCallback(async () => {
    try {
      shellApi?.playSfx('click');
      shellApi?.hapticTap();
      setIsCreating(true);
      setErrorMessage(null);

      const room = await roomRepository.createRoom('caro', mode);
      onRoomCreated(room.code, room.expiresAt);
    } catch (err) {
      const msg = (err as { message?: string })?.message || 'Không thể tạo phòng đấu lúc này.';
      setErrorMessage(msg);
      shellApi?.playSfx('error');
      shellApi?.hapticError();
    } finally {
      setIsCreating(false);
    }
  }, [mode, shellApi, onRoomCreated]);

  // Xử lý thay đổi input mã phòng (auto-uppercase & lọc ký tự an toàn)
  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 6);
    setInputCode(rawVal);
    if (errorMessage) setErrorMessage(null);
  };

  // Xử lý vào phòng bằng mã 6 ký tự
  const handleJoinRoom = useCallback(async () => {
    if (inputCode.length !== 6 || isJoining) return;

    try {
      shellApi?.playSfx('click');
      shellApi?.hapticTap();
      setIsJoining(true);
      setErrorMessage(null);

      const result = await roomRepository.joinRoom(inputCode);
      onRoomJoined(result.matchId, result.mySeat, result.gameId, inputCode);
    } catch (err) {
      const msg = (err as { message?: string })?.message || 'Không thể vào phòng đấu.';
      setErrorMessage(msg);
      shellApi?.playSfx('error');
      shellApi?.hapticError();
    } finally {
      setIsJoining(false);
    }
  }, [inputCode, isJoining, shellApi, onRoomJoined]);

  return (
    <div
      data-testid="online-lobby"
      className="flex flex-col items-center justify-between w-full max-w-md mx-auto p-4 sm:p-6 space-y-6 animate-fade-in"
    >
      {/* Header Sảnh */}
      <div className="w-full flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            shellApi?.playSfx('click');
            shellApi?.hapticTap();
            onBack();
          }}
          className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-200/80 dark:bg-slate-800/80 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95"
        >
          <span>← Quay lại</span>
        </button>

        <div className="flex items-center gap-2">
          <span className="text-xl">{mode === 'online_correspondence' ? '📬' : '🌐'}</span>
          <h2 className="text-base font-black text-slate-900 dark:text-white">
            {mode === 'online_correspondence' ? 'Chơi Theo Lượt (24h/nước)' : 'Đấu 1v1 Online'}
          </h2>
        </div>
      </div>

      {/* Thông báo lỗi nếu có */}
      {errorMessage && (
        <div
          data-testid="lobby-error-msg"
          className="w-full p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-medium flex items-center gap-2.5 animate-shake"
        >
          <span className="text-base">⚠️</span>
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Khối 1: TẠO PHÒNG MỚI */}
      <div className="w-full p-5 rounded-3xl bg-gradient-to-br from-cyan-500/10 via-blue-500/10 to-transparent border border-cyan-500/30 shadow-lg shadow-cyan-500/5 space-y-3 text-center">
        <div className="space-y-1">
          <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center justify-center gap-1.5">
            <span>👑</span> Tạo phòng & mời bạn bè
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {mode === 'online_correspondence'
              ? 'Hệ thống sinh mã 6 ký tự. Mỗi nước có 24h, thoải mái thoát app.'
              : 'Hệ thống sinh mã 6 ký tự chia sẻ qua Zalo/Messenger'}
          </p>
        </div>

        <button
          type="button"
          data-testid="create-room-btn"
          disabled={isCreating}
          onClick={handleCreateRoom}
          className="w-full min-h-[52px] py-3.5 px-6 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-sm shadow-md shadow-cyan-500/25 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {isCreating ? (
            <>
              <span className="animate-spin text-base">⏳</span>
              <span>Đang tạo phòng...</span>
            </>
          ) : (
            <>
              <span>✨</span>
              <span>Tạo phòng mới</span>
            </>
          )}
        </button>
      </div>

      {/* Hoặc phân cách */}
      <div className="w-full flex items-center gap-3">
        <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Hoặc</span>
        <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
      </div>

      {/* Khối 2: NHẬP MÃ PHÒNG */}
      <div className="w-full p-5 rounded-3xl bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 shadow-md space-y-4">
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <span>🔑</span> Nhập mã phòng 6 ký tự
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Nhập mã do bạn bè cung cấp để ghép trận trực tiếp
          </p>
        </div>

        <div className="space-y-3">
          <input
            type="text"
            data-testid="room-code-input"
            value={inputCode}
            onChange={handleCodeChange}
            placeholder="VD: ABC234"
            maxLength={6}
            className="w-full min-h-[52px] text-center text-2xl font-black font-mono tracking-widest uppercase rounded-2xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all"
          />

          <button
            type="button"
            data-testid="join-room-btn"
            disabled={inputCode.length !== 6 || isJoining}
            onClick={handleJoinRoom}
            className="w-full min-h-[52px] py-3.5 px-6 rounded-2xl bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold text-sm shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isJoining ? (
              <>
                <span className="animate-spin text-base">⏳</span>
                <span>Đang vào phòng...</span>
              </>
            ) : (
              <>
                <span>🚀</span>
                <span>Vào phòng đấu</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
