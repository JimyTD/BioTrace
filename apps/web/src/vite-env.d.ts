/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * 天地图「浏览器端」主 key。留空则直接用内置简图。
   * 注意：这是浏览器端 key，后端逆地理需另申请「服务端」key。
   */
  readonly VITE_TIANDITU_KEY?: string;
  /**
   * 天地图「浏览器端」备用 key。主 key 瓦片连续失败时切换。
   * 可逗号分隔多个；服务端 key 不要写在这里。
   */
  readonly VITE_TIANDITU_KEY_FALLBACK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
