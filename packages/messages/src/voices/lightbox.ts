import type { MessageKey } from "../zh.js";

/**
 * 灯箱皮肤的说法：你是随队做记录的人，照片是一卷卷片子，看片要上灯箱。
 * 只覆盖「相册 / 纸页」这类明说纸的句子；含义不变，状态码与功能一律不动。
 */
export const lightboxVoice: Partial<Record<MessageKey, string>> = {
  "auth.lede": "把路上遇见的，一张张上灯箱。",
  "onboard.tripLede": "把这一路上的遇见，收成一卷片子。",
  "trips.lede": "每一次出门，都是新的一卷。",
  "trips.empty": "还没有旅途。写下名字，装上第一卷。",
  "album.lede": "选几张照片上灯箱，我们来认一认。",
  "album.empty": "这一卷还空着。上传照片，开始记录。",
  "settle.backAlbum": "返回这一卷",
  "collection.volumesTitle": "旅行片夹",
  "collection.volumesEmpty": "还没有片夹。",
  "collection.volumeOpen": "打开片夹",
};
