/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * 天地图「浏览器端」key。留空则回落 OpenFreeMap。
   * 注意：这是浏览器端 key，后端逆地理需另申请「服务端」key。
   */
  readonly VITE_TIANDITU_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
