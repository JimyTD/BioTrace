import { useEffect, useRef } from "react";
import { App } from "@capacitor/app";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";

/**
 * 安卓全面屏从左/右边缘滑 = 系统返回（和实体返回键同一件事）。
 * Capacitor 不听的话：能退历史就乱退，不能退就退出 App。
 * 各页把自己的「返回」登记进来，和点左上角同一条路。
 */
type Entry = { fn: () => boolean; priority: number; id: number };

let seq = 0;
const stack: Entry[] = [];

export function pushBackHandler(fn: () => boolean, priority = 0) {
  const id = ++seq;
  stack.push({ fn, priority, id });
  return () => {
    const i = stack.findIndex((e) => e.id === id);
    if (i >= 0) stack.splice(i, 1);
  };
}

export function consumeBack() {
  const ordered = [...stack].sort((a, b) => b.priority - a.priority || b.id - a.id);
  for (const entry of ordered) {
    if (entry.fn()) return true;
  }
  return false;
}

export function listenAndroidBack() {
  if (!Capacitor.isNativePlatform()) return () => undefined;
  let handle: PluginListenerHandle | undefined;
  let cancelled = false;
  void App.addListener("backButton", () => {
    if (consumeBack()) return;
    void App.minimizeApp();
  }).then((h) => {
    if (cancelled) void h.remove();
    else handle = h;
  });
  return () => {
    cancelled = true;
    void handle?.remove();
  };
}

/** 登记当前页的关闭动作。priority：强更 100，对话框 50，引导 40，页面 0。 */
export function useBackClose(handler: () => void, active = true, priority = 0) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    if (!active) return;
    return pushBackHandler(() => {
      handlerRef.current();
      return true;
    }, priority);
  }, [active, priority]);
}
