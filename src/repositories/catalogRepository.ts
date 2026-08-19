/**
 * ==============================================================================
 * CATALOG REPOSITORY (TẦNG TRUY VẤN DANH MỤC GAME & MÙA GIẢI)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC:
 * 1. CỔNG THOÁT HIỂM BACKEND:
 *    Toàn bộ truy vấn bảng `games` và `seasons` phải đi qua repository này.
 * 2. TỐI ƯU HÓA FREE TIER & IN-MEMORY CACHING:
 *    Danh mục game và mùa giải là dữ liệu gần như tĩnh (rất hiếm khi thay đổi).
 *    Repository duy trì bộ đệm In-memory với TTL 5 phút để tiết kiệm tối đa lượt gọi
 *    request tới Supabase Database.
 * 3. HÀM INVALIDATE CACHE:
 *    Hàm `invalidateCatalogCache()` được xuất bản để xóa cache phục vụ kiểm thử
 *    hoặc khi có thông báo cập nhật danh mục từ realtime/admin trong tương lai.
 * ==============================================================================
 */

import { supabase } from './supabaseClient';
import type { GameCatalogItem, Season } from './types';

interface DbGameRow {
  id: string;
  name: string;
  category: string;
  ranked: boolean;
  rating_system: string;
  scoring: string;
  min_players: number;
  max_players: number;
  is_enabled: boolean;
  ranked_enabled: boolean;
}

interface DbSeasonRow {
  id: number;
  name: string;
  start_at: string;
  end_at: string | null;
  is_active: boolean;
}

/** Cấu hình TTL cho Cache In-Memory (5 phút) */
export const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry<T> {
  data: T;
  cachedAt: number;
}

let cachedGames: CacheEntry<GameCatalogItem[]> | null = null;
let cachedActiveSeason: CacheEntry<Season | null> | null = null;

/**
 * Xóa sạch toàn bộ Cache In-Memory của danh mục game và mùa giải.
 */
export function invalidateCatalogCache(): void {
  cachedGames = null;
  cachedActiveSeason = null;
}

/**
 * Chuyển đổi bản ghi DB bảng `games` sang kiểu Domain `GameCatalogItem`.
 */
function mapDbRowToGameItem(row: DbGameRow): GameCatalogItem {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    ranked: row.ranked,
    ratingSystem: row.rating_system,
    scoring: row.scoring,
    minPlayers: row.min_players,
    maxPlayers: row.max_players,
    isEnabled: row.is_enabled,
    rankedEnabled: row.ranked_enabled,
  };
}

/**
 * Chuyển đổi bản ghi DB bảng `seasons` sang kiểu Domain `Season`.
 */
function mapDbRowToSeason(row: DbSeasonRow): Season {
  return {
    id: row.id,
    name: row.name,
    startedAt: row.start_at,
    endedAt: row.end_at,
    isActive: row.is_active,
  };
}

/**
 * Lấy danh sách toàn bộ các trò chơi đang kích hoạt (`is_enabled = true`) trên hệ thống.
 * Có hỗ trợ bộ đệm In-Memory TTL 5 phút.
 *
 * @returns Mảng danh sách các trò chơi khả dụng.
 */
export async function getGames(): Promise<GameCatalogItem[]> {
  const now = Date.now();
  if (cachedGames && now - cachedGames.cachedAt < CATALOG_CACHE_TTL_MS) {
    return cachedGames.data;
  }

  try {
    const { data, error } = await supabase
      .from('games')
      .select(
        'id, name, category, ranked, rating_system, scoring, min_players, max_players, is_enabled, ranked_enabled',
      )
      .eq('is_enabled', true)
      .order('id', { ascending: true });

    if (error) {
      throw new Error(`Không thể tải danh mục trò chơi: ${error.message}`);
    }

    const games = (data as DbGameRow[]).map(mapDbRowToGameItem);
    cachedGames = { data: games, cachedAt: now };
    return games;
  } catch (err: unknown) {
    if (err instanceof Error) {
      throw err;
    }
    throw new Error('Lỗi không xác định khi truy vấn danh mục trò chơi.');
  }
}

/**
 * Lấy thông tin mùa giải hiện tại đang hoạt động (`is_active = true`).
 * Có hỗ trợ bộ đệm In-Memory TTL 5 phút.
 *
 * @returns Mùa giải đang mở hoặc `null` nếu chưa có mùa giải nào kích hoạt.
 */
export async function getActiveSeason(): Promise<Season | null> {
  const now = Date.now();
  if (cachedActiveSeason && now - cachedActiveSeason.cachedAt < CATALOG_CACHE_TTL_MS) {
    return cachedActiveSeason.data;
  }

  try {
    const { data, error } = await supabase
      .from('seasons')
      .select('id, name, start_at, end_at, is_active')
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      throw new Error(`Không thể tải thông tin mùa giải: ${error.message}`);
    }

    const season = data ? mapDbRowToSeason(data as DbSeasonRow) : null;
    cachedActiveSeason = { data: season, cachedAt: now };
    return season;
  } catch (err: unknown) {
    if (err instanceof Error) {
      throw err;
    }
    throw new Error('Lỗi không xác định khi truy vấn mùa giải.');
  }
}
