/**
 * ==============================================================================
 * DEEP LINK ROOM JOIN PAGE (SRC/PAGES/ROOMJOINPAGE.TSX)
 * ==============================================================================
 *
 * MÀN HÌNH TIẾP NHẬN DEEP LINK (/room/:code - PHASE P3.3B):
 * 1. Tự động chờ authStore khởi tạo (đăng nhập ẩn danh nếu chưa có phiên).
 * 2. Đọc metadata phòng qua roomRepository.getRoomInfo(code).
 * 3. Hiển thị Card xác nhận mời vào phòng hoặc thông báo lỗi nếu phòng không hợp lệ.
 * 4. Khi bấm "Vào trận" -> joinRoom -> broadcast 'room_matched' -> điều hướng vào trận.
 * ==============================================================================
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { roomRepository, type RoomInfoDto } from '@/repositories/roomRepository';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export const RoomJoinPage: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();

  const isInitialized = useAuthStore((s) => s.isInitialized);
  const init = useAuthStore((s) => s.init);

  const [loading, setLoading] = useState(true);
  const [roomInfo, setRoomInfo] = useState<RoomInfoDto | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);

  const normalizedCode = (code ?? '').trim().toUpperCase();

  // 1. TỰ ĐỘNG KHỞI TẠO AUTH NẾU CHƯA CÓ
  useEffect(() => {
    if (!isInitialized) {
      void init();
    }
  }, [isInitialized, init]);

  // 2. TẢI THÔNG TIN PHÒNG
  const loadRoomInfo = useCallback(async () => {
    if (!normalizedCode || normalizedCode.length !== 6) {
      setErrorMessage('Mã phòng không hợp lệ (phải gồm 6 ký tự).');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);
      const info = await roomRepository.getRoomInfo(normalizedCode);

      if (!info) {
        setErrorMessage('Không tìm thấy phòng đấu. Mã phòng có thể không đúng hoặc đã bị xóa.');
        return;
      }

      if (info.status !== 'waiting') {
        setErrorMessage('Phòng đấu này không còn khả dụng (đã ghép hoặc đã bị hủy).');
        return;
      }

      if (new Date(info.expiresAt).getTime() <= Date.now()) {
        setErrorMessage('Phòng đấu đã hết hạn (quá 30 phút).');
        return;
      }

      setRoomInfo(info);
    } catch (err) {
      const msg = (err as { message?: string })?.message || 'Không thể tải thông tin phòng đấu.';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  }, [normalizedCode]);

  useEffect(() => {
    if (isInitialized) {
      void loadRoomInfo();
    }
  }, [isInitialized, loadRoomInfo]);

  // 3. XỬ LÝ VÀO PHÒNG VÀ PHÁT SÓNG REALTIME
  const handleJoin = async () => {
    if (!normalizedCode || isJoining) return;

    try {
      setIsJoining(true);
      setErrorMessage(null);

      const result = await roomRepository.joinRoom(normalizedCode);

      // Gửi Broadcast 'room_matched' lên kênh room để báo cho Host
      await roomRepository.notifyRoomMatched(normalizedCode, result.matchId, 1 - result.mySeat);

      // Điều hướng vào màn hình trận đấu
      navigate(`/game/${result.gameId}/online/${result.matchId}`, {
        state: {
          mySeat: result.mySeat,
          roomCode: normalizedCode,
          gameId: result.gameId,
        },
      });
    } catch (err) {
      const msg = (err as { message?: string })?.message || 'Không thể vào phòng đấu.';
      setErrorMessage(msg);
    } finally {
      setIsJoining(false);
    }
  };

  if (loading || !isInitialized) {
    return <LoadingSpinner message="Đang kiểm tra phòng đấu..." />;
  }

  return (
    <div
      data-testid="room-join-page"
      className="flex flex-col items-center justify-center min-h-[70vh] p-4 max-w-md mx-auto animate-fade-in"
    >
      {/* Khi có lỗi phòng không hợp lệ */}
      {errorMessage ? (
        <div className="w-full p-6 rounded-3xl bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-center space-y-4 shadow-xl">
          <div className="text-4xl">⚠️</div>
          <div className="space-y-1">
            <h2 className="text-base font-black text-slate-900 dark:text-white">
              Không thể tham gia phòng
            </h2>
            <p
              data-testid="room-join-error"
              className="text-xs text-rose-600 dark:text-rose-400 font-medium"
            >
              {errorMessage}
            </p>
          </div>

          <button
            type="button"
            data-testid="back-home-btn"
            onClick={() => navigate('/')}
            className="w-full py-3 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold text-xs shadow-md active:scale-95 transition-all"
          >
            Về Sảnh trò chơi
          </button>
        </div>
      ) : roomInfo ? (
        /* Khi phòng hợp lệ -> Hiển thị Card xác nhận */
        <div className="w-full p-6 rounded-3xl bg-gradient-to-b from-slate-100 to-slate-200/90 dark:from-slate-800/90 dark:to-slate-900/90 border border-slate-300 dark:border-slate-700 text-center space-y-5 shadow-2xl">
          <div className="space-y-1">
            <span className="text-2xl">⚔️</span>
            <h2 className="text-base font-black text-slate-900 dark:text-white">
              Lời mời thách đấu trực tuyến
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Bạn nhận được lời mời tham gia phòng đấu
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Mã phòng đấu
            </div>
            <div
              data-testid="room-code-badge"
              className="text-3xl font-black font-mono tracking-widest text-cyan-600 dark:text-cyan-400"
            >
              {roomInfo.code}
            </div>
            <div className="text-xs font-bold text-slate-600 dark:text-slate-300">
              Trò chơi: <span className="text-cyan-600 dark:text-cyan-400 uppercase">Cờ Caro</span>
            </div>
          </div>

          <div className="space-y-2.5 pt-2">
            <button
              type="button"
              data-testid="confirm-join-btn"
              disabled={isJoining}
              onClick={handleJoin}
              className="w-full min-h-[52px] py-3.5 px-6 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-sm shadow-lg shadow-cyan-500/25 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isJoining ? (
                <>
                  <span className="animate-spin">⏳</span>
                  <span>Đang kết nối vào trận...</span>
                </>
              ) : (
                <>
                  <span>🚀</span>
                  <span>Tham gia trận đấu ngay</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => navigate('/')}
              className="w-full py-2.5 rounded-xl text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 text-xs font-bold transition-all"
            >
              Để sau, về trang chủ
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default RoomJoinPage;
