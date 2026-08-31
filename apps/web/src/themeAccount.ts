import { api, type User } from "./api";
import { applyTheme, getActiveTheme, resolveStoredTheme, type ThemeId } from "./themes";

/** 登录后立刻盖上账号皮肤（同步，避免第一帧闪错皮）。 */
export function applyUserTheme(user: Pick<User, "theme">): ThemeId {
  const id = resolveStoredTheme(user.theme) ?? getActiveTheme();
  applyTheme(id);
  return id;
}

/**
 * 账号还没存过皮肤时，把本机当前选择写上去。
 * 旧用户只在本机选过的，换端之前对不上；迁一次之后就跟着账号走。
 */
export async function persistThemeIfUnset(user: User): Promise<User> {
  if (resolveStoredTheme(user.theme)) return user;
  const theme = getActiveTheme();
  try {
    const { user: next } = await api.updateMe({ theme, themeIfUnset: true });
    return next;
  } catch {
    return { ...user, theme };
  }
}

/** 回填结果回来时，若这期间已经选过皮肤，不要用过期响应盖掉。 */
export function mergePersistedTheme(current: User | null, fetched: User): User | null {
  if (!current || current.id !== fetched.id) return current;
  if (resolveStoredTheme(current.theme)) return current;
  return { ...current, theme: fetched.theme };
}
